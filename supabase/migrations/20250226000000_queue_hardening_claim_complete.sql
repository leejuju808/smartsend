-- Queue Hardening: Status, Locking, Rate Limits, Claim & Complete RPCs
-- Implements idempotent queue hardening with SKIP LOCKED, advisory locks, and rate/concurrency caps

-- A) Queue hardening (idempotent)
-- First, drop existing status constraint if it exists with different values
do $$
begin
  -- Drop existing status check constraints
  if exists (
    select 1 from pg_constraint c
    join pg_class cl on c.conrelid = cl.oid
    join pg_namespace n on cl.relnamespace = n.oid
    where n.nspname = 'public'
      and cl.relname = 'send_queue'
      and c.contype = 'c'
      and c.conname like '%status%'
  ) then
    alter table public.send_queue drop constraint if exists send_queue_status_check;
    -- Also try other common constraint names
    alter table public.send_queue drop constraint if exists send_queue_status_chk;
  end if;
end $$;

alter table public.send_queue
  add column if not exists status text not null default 'pending';
  
-- Add the constraint after column creation/update
alter table public.send_queue
  drop constraint if exists send_queue_status_check;
alter table public.send_queue
  add constraint send_queue_status_check check (status in ('pending','sending','sent','canceled','failed'));

alter table public.send_queue
  add column if not exists scheduled_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists attempt_count int not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists error text,
  add column if not exists account_id uuid references public.connected_accounts(id) on delete set null,
  add column if not exists step_no int;

-- Update existing status if it exists with different values
do $$
begin
  -- Normalize existing status values to match our new constraint
  -- Only update rows that don't already match the new status values
  update public.send_queue
  set status = case
    when status in ('queued', 'scheduled', 'retrying') then 'pending'
    when status in ('picked', 'reserved') then 'sending'
    when status in ('error', 'errored') then 'failed'
    when status = 'cancelled' then 'canceled'
    else status
  end
  where status not in ('pending','sending','sent','canceled','failed');
  
  -- If any rows still have invalid status, set them to pending as fallback
  update public.send_queue
  set status = 'pending'
  where status not in ('pending','sending','sent','canceled','failed');
end $$;

create index if not exists idx_sq_due on public.send_queue(campaign_id, status, scheduled_at);
create index if not exists idx_sq_locked on public.send_queue(campaign_id, status, locked_at);

-- Helpful on logs
create index if not exists idx_send_logs_campaign_created on public.send_logs(campaign_id, created_at desc);
create index if not exists idx_send_logs_status on public.send_logs(thread_id, lead_id, campaign_id);

-- B) Per-campaign throttles (defaults)
alter table public.campaigns
  add column if not exists per_min_rate int not null default 60,  -- max sends per minute
  add column if not exists max_concurrent int not null default 3; -- in-flight 'sending' rows

-- C) Helper: advisory lock key for a campaign
create or replace function public._advisory_key_campaign(p_campaign uuid)
returns bigint language sql immutable as $$
  select ('x' || substr(encode(digest(p_campaign::text, 'sha256'), 'hex'), 1, 16))::bit(64)::bigint;
$$;

-- D) RPC: claim due queue rows (rate-limited, skip-locked)
-- RETURNS a batch the worker can attempt to send now.
create or replace function public.claim_due_queue(
  p_campaign uuid,
  p_worker text,
  p_now timestamptz default now(),
  p_max int default 25
) returns table(
  id uuid,
  lead_id uuid,
  account_id uuid,
  step_no int,
  scheduled_at timestamptz
)
language plpgsql
security definer
as $$
declare
  v_cap_minute int;
  v_used_minute int;
  v_remaining_minute int;
  v_inflight int;
  v_allowed int;
  v_claim_count int;
  v_key bigint := public._advisory_key_campaign(p_campaign);
begin
  -- Only editors/owners can run claims (API key path should be verified before calling)
  -- Note: When called from service role (API key path), auth.uid() is null, so we skip this check
  -- The API layer should verify campaign key before calling this RPC
  if auth.role() != 'service_role' and not public.can_edit_campaign(p_campaign) then
    raise exception 'Forbidden';
  end if;

  -- Soft campaign-wide lock to serialize rate calc
  perform pg_advisory_lock(v_key);

  -- Current limits
  select per_min_rate, max_concurrent
  into v_cap_minute, v_allowed
  from public.campaigns
  where id = p_campaign;

  -- Consumption in the last 60 seconds
  select count(*) into v_used_minute
  from public.send_logs
  where campaign_id = p_campaign
    and created_at >= (p_now - interval '60 seconds');

  v_remaining_minute := greatest(v_cap_minute - v_used_minute, 0);

  -- In-flight sending
  select count(*) into v_inflight
  from public.send_queue
  where campaign_id = p_campaign
    and status = 'sending';

  -- Remaining concurrency capacity
  v_allowed := greatest(v_allowed - v_inflight, 0);

  -- Batch size = min(limit, remaining minute, remaining concurrency)
  v_claim_count := least(coalesce(p_max,25), v_remaining_minute, v_allowed);
  if v_claim_count <= 0 then
    perform pg_advisory_unlock(v_key);
    return;
  end if;

  -- Claim oldest due rows -> flip to 'sending' and lock metadata
  with due as (
    select id
    from public.send_queue
    where campaign_id = p_campaign
      and status = 'pending'
      and scheduled_at is not null
      and scheduled_at <= p_now
    order by scheduled_at asc
    for update skip locked
    limit v_claim_count
  )
  update public.send_queue q
     set status = 'sending',
         locked_at = p_now,
         locked_by = coalesce(p_worker, 'scheduler'),
         attempt_count = q.attempt_count + 1,
         last_attempt_at = p_now
    from due
   where q.id = due.id;

  -- Unlock campaign
  perform pg_advisory_unlock(v_key);

  -- Return all updated rows
  return query
  select q.id, q.lead_id, q.account_id, q.step_no, q.scheduled_at
  from public.send_queue q
  where q.campaign_id = p_campaign
    and q.status = 'sending'
    and q.locked_by = coalesce(p_worker, 'scheduler')
    and q.locked_at = p_now;
end;
$$;

-- E) RPC: finalize a queue item (success or failure) + write send_logs
create or replace function public.complete_queue_item(
  p_queue uuid,
  p_campaign uuid,
  p_success boolean,
  p_message_id text default null,
  p_thread_id uuid default null,
  p_error text default null
) returns void
language plpgsql
security definer
as $$
declare
  v_row record;
begin
  -- Gate: caller must be able to edit this campaign
  -- Note: When called from service role (API key path), auth.uid() is null, so we skip this check
  -- The API layer should verify campaign key before calling this RPC
  if auth.role() != 'service_role' and not public.can_edit_campaign(p_campaign) then
    raise exception 'Forbidden';
  end if;

  select * into v_row from public.send_queue where id = p_queue and campaign_id = p_campaign;
  if not found then
    raise exception 'Queue row not found';
  end if;

  -- Insert log first (one log per attempt)
  -- Note: send_logs thread_id is uuid in most recent migrations
  insert into public.send_logs (queue_id, campaign_id, account_id, thread_id, lead_id, created_at, updated_at, provider_message_id)
  values (
    v_row.id, 
    v_row.campaign_id, 
    v_row.account_id, 
    p_thread_id, 
    v_row.lead_id, 
    now(), 
    now(),
    p_message_id
  );

  -- Update queue status
  if p_success then
    update public.send_queue
    set status = 'sent',
        error = null
    where id = v_row.id;
  else
    update public.send_queue
    set status = 'failed',
        error = left(coalesce(p_error, 'send_failed'), 4000)
    where id = v_row.id;
  end if;
end;
$$;

-- F) RPC: abandon stale 'sending' locks (e.g., worker crash)
create or replace function public.requeue_stale_sending(
  p_campaign uuid,
  p_older_than interval default interval '5 minutes'
) returns int
language plpgsql
security definer
as $$
declare v_count int;
begin
  -- Note: When called from service role (API key path), auth.uid() is null, so we skip this check
  -- The API layer should verify campaign key before calling this RPC
  if auth.role() != 'service_role' and not public.can_edit_campaign(p_campaign) then
    raise exception 'Forbidden';
  end if;

  update public.send_queue
  set status = 'pending',
      locked_at = null,
      locked_by = null
  where campaign_id = p_campaign
    and status = 'sending'
    and locked_at < (now() - p_older_than);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  return v_count;
end;
$$;

-- Grant execute permissions
grant execute on function public.claim_due_queue(uuid, text, timestamptz, int) to service_role;
grant execute on function public.complete_queue_item(uuid, uuid, boolean, text, uuid, text) to service_role;
grant execute on function public.requeue_stale_sending(uuid, interval) to service_role;

