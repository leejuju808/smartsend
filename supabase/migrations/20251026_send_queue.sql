-- /supabase/migrations/20251026_send_queue.sql
-- Campaign messages queue with atomic claiming and rate limiting

-- Status enum
do $$ begin
  create type send_status as enum ('queued','scheduled','sending','sent','failed','throttled','paused','bounced','replied');
exception when duplicate_object then null; 
end $$;

-- Campaign send queue (not template messages)
create table if not exists campaign_send_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null,
  to_email text not null,
  subject text not null,
  body text not null,
  provider text not null default 'gmail', -- 'gmail' | 'outlook'
  status send_status not null default 'queued',
  error text,
  try_count int not null default 0,
  last_try_at timestamptz,
  scheduled_at timestamptz default now(),
  claimed_by text,                 -- worker id
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists csq_workspace_status_idx on campaign_send_queue(workspace_id, status);
create index if not exists csq_scheduled_idx on campaign_send_queue(scheduled_at);
create index if not exists csq_claimed_idx on campaign_send_queue(claimed_by) where claimed_by is not null;

-- Per-workspace send limits (MVP)
create table if not exists send_limits (
  workspace_id uuid primary key,
  per_minute int not null default 20,
  per_day int not null default 300,
  timezone text not null default 'UTC',
  updated_at timestamptz default now()
);

-- Rolling counters materialized by worker (simple MVP table)
create table if not exists send_counters (
  workspace_id uuid not null,
  window text not null,   -- 'minute:YYYYMMDDHHmm', 'day:YYYYMMDD'
  count int not null default 0,
  primary key(workspace_id, window)
);

-- Atomic claim function (SKIP LOCKED pattern)
create or replace function claim_queue_batch(p_workspace uuid, p_batch int, p_worker text)
returns setof campaign_send_queue
language plpgsql
as $$
begin
  return query
  with cte as (
    select id
    from campaign_send_queue
    where workspace_id = p_workspace
      and status in ('queued','scheduled','throttled')
      and (scheduled_at is null or scheduled_at <= now())
      and (claimed_by is null or claimed_at < now() - interval '5 minutes')
    order by scheduled_at nulls first, created_at
    limit p_batch
    for update skip locked
  )
  update campaign_send_queue cm
     set status = 'sending',
         claimed_by = p_worker,
         claimed_at = now(),
         last_try_at = now(),
         try_count = cm.try_count + 1
  where cm.id in (select id from cte)
  returning cm.*;
end $$;
