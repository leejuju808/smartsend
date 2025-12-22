-- Send orchestration queue, locks, outcomes, and helper functions.
-- Run in Supabase SQL.

create extension if not exists citext;

-- A) Send queue
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  sender_email citext not null,
  recipient_email citext not null,
  subject text not null,
  body_html text not null,
  lane text not null default 'normal' check (lane in ('urgent','normal','low')),
  priority int not null default 100,
  planned_at timestamptz not null default now(),
  try_count int not null default 0,
  max_retries int not null default 5,
  last_error text,
  state text not null default 'queued' check (state in ('queued','inflight','sent','failed','canceled','skipped')),
  dedupe_key text,
  meta jsonb
);

create index if not exists idx_sq_sched on public.send_queue(state, planned_at);
create index if not exists idx_sq_account on public.send_queue(account_id, state, planned_at);
create index if not exists idx_sq_sender on public.send_queue(sender_email, state);
create index if not exists idx_sq_lane on public.send_queue(lane, priority, planned_at);
create unique index if not exists uidx_sq_dedupe on public.send_queue(dedupe_key) where dedupe_key is not null;

-- B) Lightweight distributed locks
create table if not exists public.send_locks (
  key text primary key,
  holder uuid not null,
  until timestamptz not null
);

-- C) Outcomes (immutable)
create table if not exists public.send_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  queue_id uuid references public.send_queue(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  sender_email citext,
  recipient_email citext,
  kind text not null check (kind in ('sent','soft_bounce','hard_bounce','rejected','throttled','skipped','canceled')),
  provider_id text,
  details jsonb
);

create index if not exists idx_sendevents_account on public.send_events(account_id, created_at desc);

-- Policy overrides
create table if not exists public.send_orchestrator_policies (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  per_sender_concurrency int not null default 2,
  per_domain_concurrency int not null default 4,
  global_concurrency int not null default 20,
  retry_minutes int[] not null default '{5,15,45,120,360}'
);

-- Helper RPC for domain inflight count
create or replace function public.count_inflight_by_domain(p_domain text)
returns int
language sql
security definer
set search_path=public
as $$
  select count(*)::int
  from public.send_queue
  where state = 'inflight'
    and split_part(sender_email,'@',2) = p_domain;
$$;

grant execute on function public.count_inflight_by_domain(text) to authenticated;

-- Aging helper
create or replace function public.age_queue()
returns void
language sql
as $$
  update public.send_queue
     set priority = greatest(0, priority - 5)
   where state = 'queued'
     and planned_at <= now() - interval '10 minutes';
$$;

-- Schedule the aging cron if pg_cron enabled; ignored otherwise.
select cron.schedule(
  'age-queue',
  '*/10 * * * *',
  $$select public.age_queue();$$
) where exists (select 1 from pg_extension where extname = 'pg_cron');





