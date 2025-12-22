-- Atomic claimers (idempotent) for send queue
-- Provides FOR UPDATE SKIP LOCKED pattern for safe concurrent processing

-- Speed helpers
create index if not exists idx_send_queue_pending on public.send_queue (status, created_at) where status = 'pending';

create index if not exists idx_send_queue_due_retry on public.send_queue (status, next_attempt_at) where status in ('failed','retry_scheduled');

-- Atomic batch claim for primary dispatcher (pending → sending + lock)
create or replace function public.claim_send_batch(p_limit int default 100)
returns setof public.send_queue
language sql
security definer
as $$
  with grabbed as (
    select id
    from public.send_queue
    where status = 'pending'
      and locked_at is null
    order by created_at
    for update skip locked
    limit p_limit
  ), upd as (
    update public.send_queue q
    set status = 'sending',
        locked_at = now()
    where q.id in (select id from grabbed)
    returning q.*
  )
  select * from upd;
$$;

-- Atomic batch claim for retry worker (failed/retry_scheduled due → retry_scheduled + lock)
create or replace function public.claim_retry_batch(p_limit int default 100)
returns setof public.send_queue
language sql
security definer
as $$
  with due as (
    select id
    from public.send_queue
    where status in ('failed','retry_scheduled')
      and coalesce(next_attempt_at, now()) <= now()
      and locked_at is null
    order by next_attempt_at nulls first
    for update skip locked
    limit p_limit
  ), upd as (
    update public.send_queue q
    set status = 'retry_scheduled',
        locked_at = now()
    where q.id in (select id from due)
    returning q.*
  )
  select * from upd;
$$;

-- Minimal health metrics (optional)
create table if not exists public.worker_heartbeats (
  id bigserial primary key,
  worker text not null,                -- e.g., 'dispatcher' | 'retry'
  observed_at timestamptz not null default now(),
  claimed int not null default 0,
  sent int not null default 0,
  failed int not null default 0
);

create index if not exists idx_worker_heartbeats_worker_observed on public.worker_heartbeats(worker, observed_at desc);















