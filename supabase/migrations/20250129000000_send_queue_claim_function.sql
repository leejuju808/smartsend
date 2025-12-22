-- Atomic Send Queue Claiming Function
-- This migration adds the necessary columns and functions for safe job claiming

-- Add locking columns if they don't exist
alter table public.send_queue 
  add column if not exists lock_token uuid,
  add column if not exists locked_at timestamptz;

-- Helper index for due-time lookups
create index if not exists idx_send_queue_due
  on public.send_queue (status, scheduled_for);

-- Atomic claim function: marks a batch as 'sending' and locks them to this worker
create or replace function public.claim_send_queue(
  batch_size int, 
  lock_ttl_seconds int, 
  worker_id uuid
)
returns setof public.send_queue
language sql
as $$
  with candidates as (
    select id
    from public.send_queue
    where status = 'pending'
      and scheduled_for <= now()
      and (
        locked_at is null
        or now() - locked_at > (lock_ttl_seconds || ' seconds')::interval
      )
    order by scheduled_for asc
    limit batch_size
    for update skip locked
  ),
  claimed as (
    update public.send_queue sq
       set status = 'sending',
           lock_token = worker_id,
           locked_at = now()
    from candidates c
    where sq.id = c.id
    returning sq.*
  )
  select * from claimed;
$$;

-- Index for lookups by lock token
create index if not exists idx_send_queue_lock_token on public.send_queue(lock_token); 