-- 1) Suppression registry (idempotent)
create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'account' check (scope in ('account','campaign')),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  email citext not null,
  reason text not null default 'unsubscribe',
  source text not null default 'inbound',
  notes text,
  unique (account_id, scope, coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid), email)
);

create index if not exists idx_suppression_email on public.suppression_list(email);
create index if not exists idx_suppression_account on public.suppression_list(account_id);
create index if not exists idx_suppression_campaign on public.suppression_list(campaign_id);

-- maintain updated_at via trigger
create or replace function public.tg_suppression_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_suppression_touch_updated_at on public.suppression_list;
create trigger trg_suppression_touch_updated_at
before update on public.suppression_list
for each row
execute function public.tg_suppression_touch_updated_at();

-- 2) View for suppressed lookups
create or replace view public.v_suppressed as
select s.account_id, s.scope, s.campaign_id, s.email
from public.suppression_list s;

alter view public.v_suppressed owner to postgres;

-- 3) RPC helpers: suppress by email or lead
create or replace function public.suppress_email(
  p_account_id uuid,
  p_email text,
  p_reason text default 'unsubscribe',
  p_scope text default 'account',
  p_campaign_id uuid default null,
  p_source text default 'manual',
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.suppression_list(account_id, scope, campaign_id, email, reason, source, notes)
  values (
    p_account_id,
    coalesce(p_scope, 'account'),
    case when coalesce(p_scope, 'account') = 'campaign' then p_campaign_id else null end,
    lower(p_email),
    coalesce(p_reason, 'unsubscribe'),
    coalesce(p_source, 'manual'),
    p_notes
  )
  on conflict (account_id, scope, coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid), email)
  do update set
    reason = excluded.reason,
    source = excluded.source,
    notes = excluded.notes,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.suppress_lead(
  p_lead_id uuid,
  p_reason text default 'unsubscribe',
  p_scope text default 'account',
  p_campaign_id uuid default null,
  p_source text default 'inbound',
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_account uuid;
  v_campaign uuid;
begin
  select l.email, c.owner_id, l.campaign_id
    into v_email, v_account, v_campaign
  from public.leads l
  join public.campaigns c on c.id = l.campaign_id
  where l.id = p_lead_id;

  if v_email is null or v_account is null then
    raise exception 'lead or account not found';
  end if;

  return public.suppress_email(
    v_account,
    v_email,
    p_reason,
    p_scope,
    coalesce(p_campaign_id, case when coalesce(p_scope, 'account') = 'campaign' then v_campaign else null end),
    p_source,
    p_notes
  );
end;
$$;

-- 4) Inbox thread suppression flags
alter table public.inbox_threads
  add column if not exists is_suppressed boolean not null default false,
  add column if not exists suppressed_at timestamptz,
  add column if not exists suppressed_reason text;

-- 5) Guard function for outbound checks
create or replace function public.is_suppressed(
  p_campaign_id uuid,
  p_account_id uuid,
  p_email text
) returns boolean
language sql
stable
as $$
  with q as (
    select 1
    from public.v_suppressed v
    where v.email = lower(p_email)
      and (
        (v.scope = 'account' and v.account_id = p_account_id)
        or (v.scope = 'campaign' and v.campaign_id = p_campaign_id)
      )
    limit 1
  )
  select exists(select 1 from q);
$$;

-- 6) v_inbox_threads view enriched with suppression columns
create or replace view public.v_inbox_threads as
select
  t.*,
  coalesce(t.ai_intent, 'unknown') as ai_intent_safe,
  coalesce(t.ai_confidence, 0.0) as ai_confidence_safe,
  (t.snoozed_until is not null and t.snoozed_until > now()) as is_snoozed,
  exists (
    select 1
    from public.followup_tasks f
    where f.lead_id = t.lead_id
      and f.done = false
      and coalesce(f.paused, false) = true
  ) as is_paused
from public.inbox_threads t;

alter view public.v_inbox_threads set (security_invoker = on);
alter view public.v_inbox_threads owner to postgres;

-- 7) Send log safety columns
alter table public.send_logs
  add column if not exists to_email citext,
  add column if not exists reason text;

-- 8) RLS for suppression table
alter table public.suppression_list enable row level security;

drop policy if exists "svc read write" on public.suppression_list;
create policy "svc read write"
on public.suppression_list
for all
to service_role
using (true)
with check (true);

grant usage on schema public to service_role;
grant all privileges on public.suppression_list to service_role;
grant select on public.v_suppressed to service_role;
grant execute on function public.suppress_email(uuid, text, text, text, uuid, text, text) to service_role, authenticated;
grant execute on function public.suppress_lead(uuid, text, text, uuid, text, text) to service_role, authenticated;
grant execute on function public.is_suppressed(uuid, uuid, text) to service_role, authenticated;

