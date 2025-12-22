-- Block 182: Global Send Queue Optimizer
-- Creates unified global queue for cross-campaign priority, collision prevention, and fair distribution

-- 1. Global Send Queue Table
create table if not exists public.global_send_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  scheduled_at timestamptz not null,

  account_id uuid not null, -- workspace_id or account_id depending on schema

  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,

  sender_id uuid, -- future multi-sender support (references connected_accounts or similar)

  priority int default 0, -- AI-computed priority score
  attempts int default 0, -- retry attempts

  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed','skipped')),

  -- Metadata for tracking
  last_error text,
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 2. Performance Indexes
create index if not exists idx_global_queue_account on public.global_send_queue(account_id);
create index if not exists idx_global_queue_schedule on public.global_send_queue(scheduled_at);
create index if not exists idx_global_queue_status on public.global_send_queue(status);
create index if not exists idx_global_queue_priority on public.global_send_queue(priority desc, scheduled_at asc) where status = 'pending';
create index if not exists idx_global_queue_campaign on public.global_send_queue(campaign_id);
create index if not exists idx_global_queue_lead on public.global_send_queue(lead_id);
create index if not exists idx_global_queue_sender on public.global_send_queue(sender_id) where sender_id is not null;

-- 3. Update timestamp trigger
create or replace function update_global_send_queue_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_global_send_queue_updated_at on public.global_send_queue;
create trigger trg_global_send_queue_updated_at
  before update on public.global_send_queue
  for each row
  execute function update_global_send_queue_updated_at();

-- 4. Helper view for ready-to-process items (prioritized)
create or replace view public.v_global_queue_ready as
select *
from public.global_send_queue
where status = 'pending'
  and scheduled_at <= now()
order by priority desc, scheduled_at asc;

-- 5. Function to check collision (48-hour window)
create or replace function check_lead_collision(p_lead_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  v_recent_count int;
begin
  -- Check if lead has been sent to in last 48 hours
  -- Check both email_logs and send_logs tables
  select count(*) into v_recent_count
  from (
    select 1 from public.email_logs
    where lead_id = p_lead_id
      and created_at >= now() - interval '48 hours'
      and status = 'sent'
    union
    select 1 from public.send_logs
    where lead_id = p_lead_id
      and sent_at >= now() - interval '48 hours'
      and status = 'sent'
  ) as recent_sends;
  
  return v_recent_count > 0;
end;
$$;

-- 6. Function to insert into global queue with collision check
create or replace function enqueue_global_send(
  p_account_id uuid,
  p_campaign_id uuid,
  p_lead_id uuid,
  p_scheduled_at timestamptz,
  p_priority int default 0,
  p_sender_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_queue_id uuid;
  v_has_collision boolean;
begin
  -- Check for collision
  select check_lead_collision(p_lead_id) into v_has_collision;
  
  if v_has_collision then
    -- Skip this lead (could also insert with status='skipped' or schedule for later)
    return null;
  end if;
  
  -- Insert into global queue
  insert into public.global_send_queue (
    account_id,
    campaign_id,
    lead_id,
    scheduled_at,
    priority,
    sender_id,
    status
  ) values (
    p_account_id,
    p_campaign_id,
    p_lead_id,
    p_scheduled_at,
    p_priority,
    p_sender_id,
    'pending'
  )
  returning id into v_queue_id;
  
  return v_queue_id;
end;
$$;

-- 7. Function to requeue failed items with exponential backoff
create or replace function requeue_with_backoff(p_queue_id uuid)
returns void
language plpgsql
as $$
declare
  v_attempts int;
  v_backoff_minutes int;
begin
  -- Get current attempts
  select attempts into v_attempts
  from public.global_send_queue
  where id = p_queue_id;
  
  -- Calculate exponential backoff: 2^attempts minutes (max 24 hours)
  v_backoff_minutes := least(power(2, coalesce(v_attempts, 0))::int, 1440);
  
  -- Update with new scheduled time and increment attempts
  update public.global_send_queue
  set 
    status = 'pending',
    attempts = attempts + 1,
    scheduled_at = now() + (v_backoff_minutes || ' minutes')::interval,
    updated_at = now()
  where id = p_queue_id;
end;
$$;

-- 8. Function to get reputation score for account
create or replace function get_account_reputation(p_account_id uuid)
returns int
language plpgsql
stable
as $$
declare
  v_reputation int;
begin
  -- Get average reputation score from deliverability_stats
  -- If multiple domains, use the lowest (most conservative)
  select coalesce(min(reputation_score), 100) into v_reputation
  from public.deliverability_stats
  where account_id = p_account_id;
  
  return coalesce(v_reputation, 100);
end;
$$;

-- 9. RLS Policies
alter table public.global_send_queue enable row level security;

-- Service role has full access
create policy "service_role_full_access_global_queue" on public.global_send_queue
  for all to service_role using (true) with check (true);

-- Authenticated users can read their workspace's queue items
create policy "users_read_own_global_queue" on public.global_send_queue
  for select to authenticated using (
    account_id in (
      select id from public.workspaces where owner_id = auth.uid()
      union
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

-- 10. Helper function to pause all campaigns for an account (back-pressure)
create or replace function pause_all_campaigns(p_account_id uuid)
returns void
language plpgsql
as $$
begin
  -- Update campaigns where workspace_id matches account_id
  update public.campaigns
  set is_paused = true
  where workspace_id = p_account_id
    and (is_paused = false or is_paused is null);
  
  -- Also handle if account_id maps to user_id
  update public.campaigns
  set is_paused = true
  where user_id = p_account_id
    and (is_paused = false or is_paused is null);
end;
$$;

