-- Deliverability events normalization, suppression automation, and dashboards (idempotent)

-- Ensure required extensions
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

-- Backfill existing guard-oriented table structure to support normalized provider events
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deliverability_events'
      and column_name = 'metrics'
  ) then
    execute 'alter table public.deliverability_events rename column metrics to meta';
  end if;
exception
  when duplicate_column then
    null;
end;
$$;

alter table if exists public.deliverability_events
  add column if not exists provider text,
  add column if not exists account_id uuid references public.mail_accounts(id) on delete set null,
  add column if not exists message_id uuid,
  add column if not exists ext_message_id text,
  add column if not exists event_type text,
  add column if not exists subtype text,
  add column if not exists rcpt_email text,
  add column if not exists rcpt_domain text generated always as (split_part(lower(coalesce(rcpt_email, '')), '@', 2)) stored,
  alter column reason drop not null;

update public.deliverability_events
set provider = coalesce(provider, 'guard'),
    event_type = coalesce(event_type, 'guard'),
    meta = coalesce(meta, '{}'::jsonb)
where provider is null
   or event_type is null
   or meta is null;

alter table if exists public.deliverability_events
  alter column provider set default 'guard',
  alter column provider set not null,
  alter column event_type set default 'guard',
  alter column event_type set not null,
  alter column meta set default '{}'::jsonb,
  alter column meta set not null;

alter table if exists public.send_queue
  add column if not exists ext_message_id text;

create index if not exists idx_deliverability_events_type
  on public.deliverability_events(event_type);

create index if not exists idx_deliverability_events_rcpt
  on public.deliverability_events(rcpt_email);

create index if not exists idx_deliverability_events_domain
  on public.deliverability_events(rcpt_domain);

-- Domain suppression table -----------------------------------------------------
create table if not exists public.domain_suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  domain text not null,
  reason text not null,
  expires_at timestamptz,
  unique (domain)
);

create index if not exists idx_domain_suppressions_active
  on public.domain_suppressions(domain)
  where expires_at is null or expires_at > now();

-- Lead suppression helper ------------------------------------------------------
create or replace function public.suppress_lead(
  p_email text,
  p_reason text,
  p_ttl_hours int default null
)
returns void
language plpgsql
as $$
declare
  v_lead uuid;
begin
  select id
    into v_lead
  from public.leads
  where lower(email) = lower(p_email)
  limit 1;

  if v_lead is null then
    return;
  end if;

  insert into public.lead_suppressions(lead_id, reason, expires_at)
  values (
    v_lead,
    p_reason,
    case when p_ttl_hours is null then null else now() + (p_ttl_hours || ' hours')::interval end
  )
  on conflict (lead_id)
  do update set
    reason = excluded.reason,
    expires_at = excluded.expires_at;

  update public.send_queue
  set status = 'canceled',
      canceled_reason = 'suppressed_' || p_reason
  where lead_id = v_lead
    and status = 'pending';
end;
$$;

-- Domain suppression helper ----------------------------------------------------
create or replace function public.suppress_domain(
  p_domain text,
  p_reason text,
  p_ttl_hours int default null
)
returns void
language plpgsql
as $$
begin
  if p_domain is null then
    return;
  end if;

  insert into public.domain_suppressions(domain, reason, expires_at)
  values (
    lower(p_domain),
    p_reason,
    case when p_ttl_hours is null then null else now() + (p_ttl_hours || ' hours')::interval end
  )
  on conflict (domain)
  do update set
    reason = excluded.reason,
    expires_at = excluded.expires_at;

  update public.send_queue q
  set status = 'canceled',
      canceled_reason = 'domain_suppressed_' || p_reason
  from public.leads l
  where q.lead_id = l.id
    and q.status = 'pending'
    and split_part(lower(l.email), '@', 2) = lower(p_domain);
end;
$$;

-- Deliverability reaction trigger ---------------------------------------------
create or replace function public.react_to_deliverability()
returns trigger
language plpgsql
as $$
declare
  d text := new.rcpt_domain;
begin
  if new.event_type = 'bounce'
     and (
       coalesce(new.subtype, '') ilike 'hard%'
       or coalesce(new.subtype, '') in ('invalid', 'permanent')
       or coalesce(new.reason, '') ilike '%5.__%'
     )
  then
    perform public.suppress_lead(new.rcpt_email, 'hard_bounce', null);
  end if;

  if new.event_type = 'complaint' then
    perform public.suppress_lead(new.rcpt_email, 'complaint', null);
    perform public.suppress_domain(d, 'complaint', 24 * 30);
  end if;

  if new.event_type = 'bounce' and d is not null then
    if (
      select count(*)
      from public.deliverability_events e
      where e.event_type = 'bounce'
        and (
          coalesce(e.subtype, '') in ('hard', 'invalid', 'permanent')
          or coalesce(e.reason, '') ilike '%5.__%'
        )
        and e.rcpt_domain = d
        and e.created_at >= now() - interval '24 hours'
    ) >= 5 then
      perform public.suppress_domain(d, 'hard_bounce_threshold', 48);
    end if;
  end if;

  if new.event_type = 'unsubscribe' then
    perform public.suppress_lead(new.rcpt_email, 'unsubscribe', null);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_react_to_deliverability on public.deliverability_events;

create trigger trg_react_to_deliverability
after insert on public.deliverability_events
for each row
when (new.event_type != 'guard')
execute function public.react_to_deliverability();

-- Domain suppression guard helper ---------------------------------------------
create or replace function public.domain_is_suppressed(p_domain text)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.domain_suppressions
    where domain = lower(p_domain)
      and (expires_at is null or expires_at > now())
  );
$$;

-- 7-day aggregate view ---------------------------------------------------------
create or replace view public.v_deliverability_7d as
with windowed as (
  select *
  from public.deliverability_events
  where created_at >= now() - interval '7 days'
)
select
  account_id,
  sum(case when event_type = 'delivered' then 1 else 0 end) as delivered,
  sum(case when event_type = 'open' then 1 else 0 end) as opens,
  sum(case when event_type = 'click' then 1 else 0 end) as clicks,
  sum(case when event_type = 'bounce' then 1 else 0 end) as bounces,
  sum(case when event_type = 'complaint' then 1 else 0 end) as complaints,
  sum(case when event_type = 'unsubscribe' then 1 else 0 end) as unsubscribes
from windowed
group by account_id;

grant select on public.v_deliverability_7d to service_role, authenticated;

-- Safety guard function and scheduler -----------------------------------------
create or replace function public.deliverability_guard()
returns void
language plpgsql
as $$
declare
  r record;
  pct numeric;
begin
  for r in
    select
      account_id,
      sum(case when event_type = 'delivered' then 1 else 0 end) as delivered,
      sum(case when event_type = 'complaint' then 1 else 0 end) as complaints,
      sum(case when event_type = 'bounce' then 1 else 0 end) as bounces
    from public.deliverability_events
    where created_at >= now() - interval '24 hours'
    group by account_id
  loop
    if coalesce(r.complaints, 0) >= 1 then
      update public.send_limits
      set daily_cap = 0
      where account_id = r.account_id;
    end if;

    pct := case when r.delivered > 0 then (r.bounces::numeric / r.delivered) * 100 else 0 end;

    if pct > 5 then
      update public.send_limits
      set daily_cap = greatest(daily_cap / 2, 10)
      where account_id = r.account_id;
    end if;
  end loop;
end;
$$;

select cron.schedule(
  'deliverability-guard-hourly',
  '0 * * * *',
  $$select public.deliverability_guard();$$
)
on conflict do nothing;


