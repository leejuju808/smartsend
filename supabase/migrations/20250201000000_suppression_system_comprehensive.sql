-- Comprehensive Suppression System (Idempotent)
-- Owner-scoped suppression list with email/domain support, global and campaign-level

-- A) Owner-scoped suppression list (email or domain)
create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('global','campaign')),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  kind text not null check (kind in ('email','domain')),
  value citext not null,
  reason text not null check (reason in ('unsubscribe','bounce','manual','complaint')),
  source text default 'system',      -- 'system','link','reply','import','api'
  notes text,
  expires_at timestamptz,
  created_at timestamptz default now(),
  unique (owner_id, scope, campaign_id, kind, value)
);

create index if not exists idx_suppress_owner_kind_val on public.suppression_list(owner_id, kind, value);
create index if not exists idx_suppress_campaign on public.suppression_list(campaign_id) where scope='campaign';

-- B) Enable RLS (owner can read their own; shared users read via campaign)
alter table public.suppression_list enable row level security;

drop policy if exists "suppression by owner" on public.suppression_list;
create policy "suppression by owner"
on public.suppression_list
for select using (owner_id = auth.uid());

drop policy if exists "suppression insert by owner" on public.suppression_list;
create policy "suppression insert by owner"
on public.suppression_list
for insert with check (owner_id = auth.uid());

drop policy if exists "suppression delete by owner" on public.suppression_list;
create policy "suppression delete by owner"
on public.suppression_list
for delete using (owner_id = auth.uid());

-- C) Helper: get owner_id from campaign
create or replace function public.campaign_owner(p_campaign uuid)
returns uuid language sql stable as $$
  select coalesce(c.owner_id, c.user_id) from public.campaigns c where c.id = p_campaign
$$;

-- D) Helper: compute email + domain for a lead
create or replace function public.lead_email_domain(p_lead uuid)
returns table(email citext, domain citext)
language sql stable as $$
  select email::citext, split_part(email,'@',2)::citext from public.leads where id = p_lead
$$;

-- E) Is suppressed for (campaign, lead)?
create or replace function public.is_suppressed_for_campaign(p_campaign uuid, p_lead uuid)
returns boolean
language sql stable as $$
with o as (select public.campaign_owner(p_campaign) as owner_id),
ld as (select * from public.lead_email_domain(p_lead)),
nowz as (select now() as n)
select exists (
  select 1
  from public.suppression_list s, o, ld, nowz
  where s.owner_id = o.owner_id
    and (s.expires_at is null or s.expires_at > nowz.n)
    and (
      (s.scope='global' and (
         (s.kind='email' and s.value = ld.email) or
         (s.kind='domain' and s.value = ld.domain)
      ))
      or
      (s.scope='campaign' and s.campaign_id = p_campaign and (
         (s.kind='email' and s.value = ld.email) or
         (s.kind='domain' and s.value = ld.domain)
      ))
    )
);
$$;

-- F) Upsert suppression rows (email + its domain)
create or replace function public.suppress_lead(
  p_campaign uuid,
  p_lead uuid,
  p_reason text,
  p_scope text default 'global',
  p_source text default 'system',
  p_expires_at timestamptz default null
) returns int
language plpgsql security definer
as $$
declare
  v_owner uuid;
  v_email citext;
  v_domain citext;
  v_count int := 0;
begin
  select public.campaign_owner(p_campaign) into v_owner;
  select email, split_part(email,'@',2)::citext into v_email, v_domain from public.leads where id = p_lead;

  if v_owner is null or v_email is null then
    return 0;
  end if;

  insert into public.suppression_list(owner_id, scope, campaign_id, kind, value, reason, source, expires_at)
  values (v_owner, p_scope, case when p_scope='campaign' then p_campaign else null end, 'email', v_email, p_reason, p_source, p_expires_at)
  on conflict (owner_id, scope, campaign_id, kind, value) do update set reason=excluded.reason, source=excluded.source, expires_at=excluded.expires_at;
  v_count := v_count + 1;

  insert into public.suppression_list(owner_id, scope, campaign_id, kind, value, reason, source, expires_at)
  values (v_owner, p_scope, case when p_scope='campaign' then p_campaign else null end, 'domain', v_domain, p_reason, p_source, p_expires_at)
  on conflict (owner_id, scope, campaign_id, kind, value) do update set reason=excluded.reason, source=excluded.source, expires_at=excluded.expires_at;
  v_count := v_count + 1;

  return v_count;
end $$;

-- G) Auto-suppress on inbound unsubscribe/bounce (and stop thread)
create or replace function public.on_inbound_classified_after()
returns trigger
language plpgsql security definer
as $$
declare
  v_thread uuid;
  v_campaign uuid;
  v_lead uuid;
begin
  if NEW.direction <> 'inbound' then return NEW; end if;

  select t.id, t.campaign_id, t.lead_id into v_thread, v_campaign, v_lead
  from public.inbox_threads t where t.id = NEW.thread_id;

  if NEW.ai_label in ('unsubscribe','bounce') then
    perform public.suppress_lead(v_campaign, v_lead, case when NEW.ai_label='unsubscribe' then 'unsubscribe' else 'bounce' end, 'global', 'reply', null);

    update public.inbox_threads
       set stopped_by_reply = true, updated_at = now()
     where id = v_thread;

    perform public.cancel_future_queue_for_thread(v_thread);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_on_inbound_classified_after on public.inbox_messages;
create trigger trg_on_inbound_classified_after
after insert or update of ai_label on public.inbox_messages
for each row execute function public.on_inbound_classified_after();

-- H) Filter leads before enqueue (drop suppressed)
create or replace function public.filter_unsuppressed_leads(p_campaign uuid, p_leads uuid[])
returns uuid[] language sql stable as $$
  select coalesce(array_agg(lid), '{}') from (
    select unnest(p_leads) as lid
  ) x
  where not public.is_suppressed_for_campaign(p_campaign, x.lid)
$$;

-- I) Use filter in the enqueue helper
create or replace function public.enqueue_step1_for_leads_with_rules(
  p_campaign uuid,
  p_step_no int,
  p_leads uuid[],
  p_base timestamptz default now(),
  p_include_jitter boolean default true
) returns int
language plpgsql security definer as $$
declare
  allowed uuid[];
  r record; inserted int := 0;
begin
  select public.filter_unsuppressed_leads(p_campaign, p_leads) into allowed;
  for r in
    select * from public.preview_next_send_for_step_many(p_campaign, p_step_no, allowed, p_base, p_include_jitter)
  loop
    insert into public.send_queue (campaign_id, lead_id, step_no, scheduled_for, status)
    values (r.campaign_id, r.lead_id, r.step_no, r.scheduled_at, 'queued')
    on conflict do nothing;
    inserted := inserted + 1;
  end loop;
  return inserted;
end $$;

-- Grant execute permissions
grant execute on function public.campaign_owner(uuid) to authenticated, service_role;
grant execute on function public.lead_email_domain(uuid) to authenticated, service_role;
grant execute on function public.is_suppressed_for_campaign(uuid, uuid) to authenticated, service_role;
grant execute on function public.suppress_lead(uuid, uuid, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.filter_unsuppressed_leads(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.enqueue_step1_for_leads_with_rules(uuid, int, uuid[], timestamptz, boolean) to authenticated, service_role;

