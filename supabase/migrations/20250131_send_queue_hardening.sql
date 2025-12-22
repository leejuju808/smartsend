-- Send Queue Hardening: Add operational columns and atomic claim function
-- Adds retry tracking and processing timestamp support for worker coordination

-- Add operational columns (idempotent)
alter table public.send_queue
  add column if not exists last_error text,
  add column if not exists processing_started_at timestamptz;

-- Note: send_queue already has error and attempts columns

-- Helpful indexes
create index if not exists idx_send_queue_status_sched
  on public.send_queue (status, scheduled_at);

-- Atomic job claim function (SKIP LOCKED pattern)
-- This function atomically flips eligible jobs to 'sending' and returns them
create or replace function public.claim_send_jobs(batch_size int default 50)
returns table (
  job_id uuid,
  workspace_id uuid,
  campaign_id uuid,
  lead_id uuid,
  subject text,
  body text
)
language plpgsql
as $$
begin
  return query
  with cte as (
    select id
    from public.send_queue
    where status = 'pending'
      and coalesce(scheduled_at, now()) <= now()
    order by scheduled_at
    limit batch_size
    for update skip locked
  )
  update public.send_queue q
     set status = 'sending',
         processing_started_at = now(),
         last_attempt_at = now()
  from cte
  where q.id = cte.id
  returning q.id as job_id, q.workspace_id, q.campaign_id, q.lead_id, q.subject, q.body;
end;
$$;

-- Grant execute permission to service role
grant execute on function public.claim_send_jobs(int) to service_role;
