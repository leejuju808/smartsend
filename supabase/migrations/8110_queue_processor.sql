-- 8110 - Queue processor locking + retry

-- Extend send_status enum if needed (add 'pending', 'retry', 'processing')
do $$ 
begin
  if not exists (select 1 from pg_enum where enumlabel = 'pending' and enumtypid = (select oid from pg_type where typname = 'send_status')) then
    alter type send_status add value 'pending';
  end if;
  if not exists (select 1 from pg_enum where enumlabel = 'retry' and enumtypid = (select oid from pg_type where typname = 'send_status')) then
    alter type send_status add value 'retry';
  end if;
  if not exists (select 1 from pg_enum where enumlabel = 'processing' and enumtypid = (select oid from pg_type where typname = 'send_status')) then
    alter type send_status add value 'processing';
  end if;
exception when others then
  -- Enum might not exist yet, or values already exist - that's ok
  null;
end $$;

-- Core queue metadata
alter table public.campaign_send_queue
  add column if not exists attempts integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists locked_at timestamptz,
  add column if not exists worker_id uuid,
  add column if not exists last_error text,
  add column if not exists sent_at timestamptz;

-- Optional provider tracking (if not already added)
alter table public.campaign_send_queue
  add column if not exists provider varchar(32),
  add column if not exists provider_message_id text;

-- Add body_html and body_text columns if needed (for email content)
alter table public.campaign_send_queue
  add column if not exists body_html text,
  add column if not exists body_text text;

-- Status index for fast batch selection
-- Note: handles both enum values ('queued', 'scheduled') and new values ('pending', 'retry')
create index if not exists idx_campaign_send_queue_ready
  on public.campaign_send_queue (status, scheduled_at)
  where status in ('pending', 'retry', 'queued', 'scheduled');

-- Concurrency-safe batch locker
-- Handles both old status values ('queued', 'scheduled') and new ones ('pending', 'retry')
-- Note: skipped_suppressed is automatically excluded since it's not in the status filter list
create or replace function public.lock_send_queue_batch(
  p_worker_id uuid,
  p_limit integer default 25
)
returns setof public.campaign_send_queue
language sql
as $$
  update public.campaign_send_queue q
  set
    status    = 'processing',
    locked_at = now(),
    worker_id = p_worker_id,
    attempts  = coalesce(q.attempts, 0) + 1
  where q.id in (
    select id
    from public.campaign_send_queue
    where status in ('pending', 'retry', 'queued', 'scheduled', 'throttled')
      and (scheduled_at is null or scheduled_at <= now())
      and coalesce(attempts, 0) < coalesce(max_attempts, 3)
    order by scheduled_at nulls first, created_at
    for update skip locked
    limit p_limit
  )
  returning *;
$$;

