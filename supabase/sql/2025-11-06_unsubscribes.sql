-- =============================================================
-- 1) Campaign-level unsubscribe storage + helper functions
--    Run in Supabase SQL editor (idempotent statements)
-- =============================================================

-- Ensure supporting columns exist on campaign_suppressions
alter table if exists public.campaign_suppressions
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists kind text,
  add column if not exists meta jsonb default '{}'::jsonb;

-- Ensure kind column is constrained + defaulted
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_suppressions'::regclass
      and conname = 'campaign_suppressions_kind_check'
  ) then
    alter table public.campaign_suppressions
      add constraint campaign_suppressions_kind_check
      check (kind in ('unsubscribe','manual','bounce','reply','provider','other'));
  end if;
end$$;

alter table if exists public.campaign_suppressions
  alter column kind set default 'manual';

update public.campaign_suppressions set kind = 'manual'
where kind is null;

alter table if exists public.campaign_suppressions
  alter column kind set not null;

-- Align unique constraint with (campaign_id, email, kind)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_suppressions'::regclass
      and contype = 'u'
      and conname = 'campaign_suppressions_campaign_id_email_key'
  ) then
    alter table public.campaign_suppressions
      drop constraint campaign_suppressions_campaign_id_email_key;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_suppressions'::regclass
      and contype = 'u'
      and conname = 'campaign_suppressions_campaign_id_email_kind_key'
  ) then
    alter table public.campaign_suppressions
      add constraint campaign_suppressions_campaign_id_email_kind_key
      unique (campaign_id, email, kind);
  end if;
end$$;

create index if not exists idx_campaign_suppressions_campaign_email_kind
  on public.campaign_suppressions(campaign_id, email, kind);

create table if not exists public.campaign_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  email citext not null,
  source text not null default 'link' check (source in ('link','reply','manual','provider','api')),
  reason text,
  details text,
  provider text,
  provider_message_id text,
  unique (campaign_id, email)
);

create index if not exists idx_campaign_unsubs_campaign_email
  on public.campaign_unsubscribes(campaign_id, email);

create index if not exists idx_campaign_unsubs_lead
  on public.campaign_unsubscribes(lead_id);

create index if not exists idx_campaign_unsubs_campaign_time
  on public.campaign_unsubscribes(campaign_id, created_at desc);

alter table if exists public.campaign_unsubscribes
  add column if not exists details text;

alter table if exists public.campaign_unsubscribes
  alter column source set default 'link';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_unsubscribes'::regclass
      and conname = 'campaign_unsubscribes_source_check'
  ) then
    alter table public.campaign_unsubscribes
      drop constraint campaign_unsubscribes_source_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_unsubscribes'::regclass
      and conname = 'campaign_unsubscribes_source_check'
  ) then
    alter table public.campaign_unsubscribes
      add constraint campaign_unsubscribes_source_check
      check (source in ('link','reply','manual','provider','api'));
  end if;
end$$;

-- B) Resolve lead helper
create or replace function public.resolve_lead_for_campaign(
  p_campaign uuid,
  p_email citext
) returns uuid
language sql
stable
as $$
  select l.id
  from public.leads l
  join public.campaign_leads cl
    on cl.lead_id = l.id
   and cl.campaign_id = p_campaign
  where l.email = p_email
  order by cl.created_at desc nulls last
  limit 1
$$;

grant execute on function public.resolve_lead_for_campaign(uuid, citext) to service_role;

-- C) Cancel queued sends helper
create or replace function public.cancel_future_queue_for_lead(
  p_campaign uuid,
  p_lead uuid default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  if p_lead is null then
    return 0;
  end if;

  update public.send_queue
     set status = 'canceled',
         last_error = 'unsubscribe',
         updated_at = now()
   where campaign_id = p_campaign
     and lead_id = p_lead
     and status in ('queued','sending');

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.cancel_future_queue_for_lead(uuid, uuid) to service_role;

-- D) Upsert unsubscribe + mirror suppression
create or replace function public.upsert_unsubscribe(
  p_campaign uuid,
  p_email citext,
  p_source text,
  p_reason text default null,
  p_provider text default null,
  p_provider_message_id text default null,
  p_lead uuid default null,
  p_details text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_lead uuid;
begin
  if p_campaign is null or p_email is null then
    raise exception 'campaign and email required';
  end if;

  if p_source not in ('link','reply','manual','provider') then
    raise exception 'invalid source %', p_source;
  end if;

  select coalesce(p_lead, public.resolve_lead_for_campaign(p_campaign, p_email)) into v_lead;

  insert into public.campaign_unsubscribes(
    campaign_id, lead_id, email, source, reason, details, provider, provider_message_id
  ) values (
    p_campaign, v_lead, p_email, p_source, p_reason, p_details, p_provider, p_provider_message_id
  )
  on conflict (campaign_id, email) do update
    set lead_id = coalesce(excluded.lead_id, public.campaign_unsubscribes.lead_id),
        source = excluded.source,
        reason = coalesce(excluded.reason, public.campaign_unsubscribes.reason),
        details = coalesce(excluded.details, public.campaign_unsubscribes.details),
        provider = coalesce(excluded.provider, public.campaign_unsubscribes.provider),
        provider_message_id = coalesce(excluded.provider_message_id, public.campaign_unsubscribes.provider_message_id)
  returning id into v_id;

  insert into public.campaign_suppressions(
    campaign_id, lead_id, email, kind, meta
  ) values (
    p_campaign, v_lead, p_email, 'unsubscribe', jsonb_build_object(
      'source', p_source,
      'reason', p_reason,
      'details', p_details,
      'provider', p_provider,
      'provider_message_id', p_provider_message_id
    )
  )
  on conflict (campaign_id, email, kind) do update
    set lead_id = coalesce(excluded.lead_id, public.campaign_suppressions.lead_id),
        meta = public.campaign_suppressions.meta || excluded.meta;

  perform public.cancel_future_queue_for_lead(p_campaign, v_lead);

  return v_id;
end;
$$;

grant execute on function public.upsert_unsubscribe(
  uuid, citext, text, text, text, text, uuid, text
) to service_role;

-- E) Tokenized unsubscribe links
create table if not exists public.unsubscribe_tokens (
  token text primary key,
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  send_log_id uuid references public.send_logs(id) on delete set null,
  email citext not null,
  expires_at timestamptz
);

create index if not exists idx_ut_campaign_email
  on public.unsubscribe_tokens(campaign_id, email);

-- F) Helper: mint unsubscribe token
create or replace function public.mint_unsubscribe_token(
  p_campaign uuid,
  p_lead uuid,
  p_send_log uuid,
  p_email citext,
  p_ttl_minutes int default 0
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := encode(gen_random_bytes(16), 'hex');
  v_exp timestamptz := case
    when coalesce(p_ttl_minutes, 0) > 0 then now() + make_interval(mins => p_ttl_minutes)
    else null
  end;
begin
  if p_campaign is null or p_email is null then
    raise exception 'campaign and email required';
  end if;

  insert into public.unsubscribe_tokens(token, campaign_id, lead_id, send_log_id, email, expires_at)
  values (v_token, p_campaign, p_lead, p_send_log, p_email, v_exp);

  return v_token;
end;
$$;

grant execute on function public.mint_unsubscribe_token(uuid, uuid, uuid, citext, int) to service_role;

-- G) Helper: record unsubscribe via token
create or replace function public.record_unsubscribe(
  p_token text,
  p_reason text default null,
  p_details text default null,
  p_promote_global boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.unsubscribe_tokens%rowtype;
  v_id uuid;
  v_thread uuid;
  v_owner uuid;
begin
  select * into t from public.unsubscribe_tokens where token = p_token;

  if not found then
    raise exception 'invalid_token';
  end if;

  if t.expires_at is not null and t.expires_at < now() then
    raise exception 'expired_token';
  end if;

  v_id := public.upsert_unsubscribe(
    p_campaign => t.campaign_id,
    p_email => t.email,
    p_source => 'link',
    p_reason => p_reason,
    p_lead => t.lead_id,
    p_details => p_details
  );

  if t.send_log_id is not null then
    select thread_id into v_thread from public.send_logs where id = t.send_log_id;

    if v_thread is not null then
      perform public.cancel_future_queue_for_thread(v_thread);
    end if;
  end if;

  if p_promote_global then
    select user_id into v_owner from public.campaigns where id = t.campaign_id;

    if v_owner is not null then
      insert into public.global_suppressions(user_id, email, kind, reason)
      values (v_owner, t.email, 'manual', coalesce(p_reason, 'unsubscribe'))
      on conflict (user_id, email, kind) do update set reason = excluded.reason;
    end if;
  end if;

  return v_id;
end;
$$;

grant execute on function public.record_unsubscribe(text, text, text, boolean) to service_role;

-- H) Metrics view for unsubscribe counts
create or replace view public.v_campaign_kpis as
select
  c.id as campaign_id,
  count(sl.id) filter (where sl.id is not null) as sent,
  count(distinct te.lead_id) filter (where te.type = 'open') as unique_opens,
  count(distinct te.lead_id) filter (where te.type = 'click') as unique_clicks,
  count(u.id) as unsubscribes,
  case when count(sl.id) > 0
    then round((count(u.id)::numeric / count(sl.id)) * 100, 2)
    else 0
  end as unsub_rate_pct
from public.campaigns c
left join public.send_logs sl on sl.campaign_id = c.id
left join public.tracking_events te on te.campaign_id = c.id
left join public.campaign_unsubscribes u on u.campaign_id = c.id
group by 1;

-- I) Trigger: auto-handle AI-labeled unsubscribe replies
create or replace function public.trg_on_ai_label_unsubscribe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_email citext;
  v_lead uuid;
begin
  if new.ai_label <> 'unsubscribe' then
    return new;
  end if;

  select t.campaign_id,
         coalesce(new.from_email, l.email)::citext,
         l.id
    into v_campaign, v_email, v_lead
  from public.inbox_threads t
  left join public.leads l on l.id = t.lead_id
  where t.id = new.thread_id;

  if v_campaign is null or v_email is null then
    return new;
  end if;

  perform public.upsert_unsubscribe(
    p_campaign => v_campaign,
    p_email => v_email,
    p_source => 'reply',
    p_reason => 'reply-intent:unsubscribe',
    p_provider => new.provider,
    p_provider_message_id => new.provider_message_id,
    p_lead => v_lead
  );

  return new;
end;
$$;

drop trigger if exists trg_ai_unsub on public.inbox_messages;

create trigger trg_ai_unsub
after insert or update of ai_label on public.inbox_messages
for each row execute function public.trg_on_ai_label_unsubscribe();


