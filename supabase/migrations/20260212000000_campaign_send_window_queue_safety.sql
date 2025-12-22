-- Campaign send window + queue safety migration
-- Adds send window controls, pacing, and queue management columns

-- =====================================================
-- 1. Campaign send window + pacing columns
-- =====================================================

-- Note: Some columns may already exist from previous migrations, using IF NOT EXISTS
-- Convert existing smallint hours to time type if needed, otherwise add as new columns
do $$
begin
  -- Add send_window_start as time (convert from smallint if exists)
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'send_window_start'
    and data_type = 'smallint'
  ) then
    -- Convert existing smallint to time
    alter table public.campaigns
      add column if not exists send_window_start_time time;
    update public.campaigns
      set send_window_start_time = (send_window_start || ':00')::time
      where send_window_start_time is null;
    alter table public.campaigns
      drop column if exists send_window_start;
    alter table public.campaigns
      rename column send_window_start_time to send_window_start;
  else
    -- Add as new time column if doesn't exist
    alter table public.campaigns
      add column if not exists send_window_start time default '09:00';
  end if;

  -- Add send_window_end as time (convert from smallint if exists)
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'send_window_end'
    and data_type = 'smallint'
  ) then
    alter table public.campaigns
      add column if not exists send_window_end_time time;
    update public.campaigns
      set send_window_end_time = (send_window_end || ':00')::time
      where send_window_end_time is null;
    alter table public.campaigns
      drop column if exists send_window_end;
    alter table public.campaigns
      rename column send_window_end_time to send_window_end;
  else
    alter table public.campaigns
      add column if not exists send_window_end time default '16:30';
  end if;
end $$;

-- Ensure timezone, pacing, and cooldown columns exist
alter table public.campaigns
  add column if not exists timezone text default 'America/Los_Angeles',
  add column if not exists per_lead_cooldown_days int default 14,
  add column if not exists pace_seconds_low int default 45,
  add column if not exists pace_seconds_high int default 90;

-- =====================================================
-- 2. Send queue columns and constraints
-- =====================================================

-- Ensure send_queue has required columns
alter table public.send_queue
  add column if not exists scheduled_at timestamptz,
  add column if not exists error text,
  add column if not exists recipient_email text,
  add column if not exists variant_id uuid,
  add column if not exists account_id uuid references public.connected_accounts(id);

-- Copy to_email to recipient_email if recipient_email is null and to_email exists
update public.send_queue
set recipient_email = to_email
where recipient_email is null and to_email is not null;

-- Update scheduled_at default if null (use created_at or now())
update public.send_queue
set scheduled_at = coalesce(created_at, now())
where scheduled_at is null;

-- Ensure status has proper constraint (allow both 'pending' and 'queued')
do $$
declare
  constraint_name_var text;
begin
  -- Drop existing constraint if it exists with different values
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'send_queue_status_check'
    and table_name = 'send_queue'
  ) then
    alter table public.send_queue drop constraint send_queue_status_check;
  end if;
  
  -- Also check for other possible status check constraint names
  for constraint_name_var in
    select constraint_name
    from information_schema.table_constraints
    where constraint_name like '%status%check%'
    and table_name = 'send_queue'
    and constraint_type = 'CHECK'
  loop
    execute format('alter table public.send_queue drop constraint %I', constraint_name_var);
  end loop;
end $$;

-- Add/update status constraint to allow both 'pending' and 'queued'
alter table public.send_queue
  add constraint send_queue_status_check 
  check (status in ('pending','sent','failed','cancelled','queued','sending'));

-- =====================================================
-- 3. Indexes for send_queue
-- =====================================================

create index if not exists idx_send_queue_due 
  on public.send_queue(status, scheduled_at)
  where status in ('pending', 'queued', 'sending');

create index if not exists idx_send_queue_account 
  on public.send_queue(account_id, scheduled_at)
  where account_id is not null;

create index if not exists idx_send_queue_campaign_lead 
  on public.send_queue(campaign_id, lead_id)
  where status = 'pending';

-- =====================================================
-- 4. RLS Policies for send_queue (if not already set)
-- =====================================================

alter table public.send_queue enable row level security;

-- Ensure own-queue policy exists
drop policy if exists "own-queue" on public.send_queue;
create policy "own-queue" on public.send_queue
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =====================================================
-- 5. RPC: get_mailbox_budget_today
-- =====================================================

create or replace function public.get_mailbox_budget_today(acct_id uuid)
returns int 
language sql 
stable 
as $$
  with a as (
    select * from public.get_mailbox_allowance(acct_id) -- (allowed_today, sent_today, hard_cap)
  )
  select greatest(0, least((select allowed_today from a), (select hard_cap from a)) - (select sent_today from a));
$$;

grant execute on function public.get_mailbox_budget_today(uuid) to authenticated, service_role;

-- =====================================================
-- 6. RPC: clamp_to_send_window
-- =====================================================

create or replace function public.clamp_to_send_window(
  desired timestamptz,
  tz text,
  win_start time,
  win_end time
) 
returns timestamptz 
language sql 
stable 
as $$
  with z as (
    select desired at time zone tz as local_dt
  ),
  c as (
    select
      case
        when (z.local_dt::time) < win_start 
          then date_trunc('day', z.local_dt) + win_start
        when (z.local_dt::time) > win_end   
          then (date_trunc('day', z.local_dt) + interval '1 day') + win_start
        else z.local_dt
      end as clamped_local
    from z
  )
  select (clamped_local at time zone tz) from c;
$$;

grant execute on function public.clamp_to_send_window(timestamptz, text, time, time) to authenticated, service_role;

