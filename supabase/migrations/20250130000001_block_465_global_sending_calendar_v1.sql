-- Block 465 — Global Sending Calendar v1
-- Workspace-Level Sending Windows • Inbox-Level Overrides • Holiday Blocking • Region-Based Timing • Smart Pacing • Global Throttle Rules
-- This block creates the GLOBAL brain for WHEN SmartSend sends, controlling time at the entire workspace level.

-- ============================================
-- 1) Global Sending Rules Table (Throttle Rules)
-- ============================================
create table if not exists public.global_sending_rules (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  
  -- Throttle limits
  max_sends_per_minute int default null,
  max_sends_per_hour int default null,
  max_sends_per_inbox_per_hour int default null,
  max_simultaneous_sends int default null,
  
  -- Auto-pause triggers
  auto_slowdown_bounce_threshold numeric default 0.03, -- 3% bounce rate triggers slowdown
  auto_slowdown_percentage numeric default 0.5, -- Slowdown to 50% capacity
  auto_pause_spam_threshold numeric default 0.005, -- 0.5% spam complaints triggers pause
  auto_pause_duration_hours int default 24, -- Pause for 24 hours
  
  -- Midnight safety reset
  midnight_reset_enabled boolean default true,
  reset_timezone text default 'America/Los_Angeles',
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_global_sending_rules_workspace on public.global_sending_rules(workspace_id);

-- ============================================
-- 2) Workspace Sending Calendar Table (Enhanced from Block 427)
-- ============================================
create table if not exists public.workspace_sending_calendar (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  
  -- Allowed sending days (1=Monday, 7=Sunday)
  allowed_days int[] not null default array[1,2,3,4,5]::int[],
  
  -- Allowed time windows (can have multiple windows per day)
  -- JSONB array: [{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "17:00"}]
  allowed_time_windows jsonb not null default '[{"start": "09:00", "end": "17:00"}]'::jsonb,
  
  -- Timezone for windows
  timezone text not null default 'America/Los_Angeles',
  
  -- Smart pacing settings
  pacing_enabled boolean default true,
  pacing_strategy text default 'even' check (pacing_strategy in ('even', 'front_loaded', 'back_loaded', 'prediction_based')),
  
  -- Region-based timing
  region_based_timing_enabled boolean default true,
  default_region_timezone text default 'America/Los_Angeles',
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_workspace_sending_calendar_workspace on public.workspace_sending_calendar(workspace_id);

-- ============================================
-- 3) Inbox Sending Calendar Table (Inbox-Level Overrides)
-- ============================================
create table if not exists public.inbox_sending_calendar (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.sender_inboxes(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  
  -- Override enabled flag
  override_enabled boolean default false,
  
  -- Allowed sending days (overrides workspace if set)
  allowed_days int[],
  
  -- Allowed time windows (overrides workspace if set)
  allowed_time_windows jsonb,
  
  -- Timezone override
  timezone text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique(inbox_id)
);

create index if not exists idx_inbox_sending_calendar_inbox on public.inbox_sending_calendar(inbox_id);
create index if not exists idx_inbox_sending_calendar_workspace on public.inbox_sending_calendar(workspace_id);

-- ============================================
-- 4) Sending Calendar Holidays Table
-- ============================================
create table if not exists public.sending_calendar_holidays (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  
  -- Holiday type: 'us_federal', 'custom', 'regional'
  holiday_type text not null default 'custom' check (holiday_type in ('us_federal', 'custom', 'regional')),
  
  -- Holiday name
  name text not null,
  
  -- Date range (for multi-day holidays)
  start_date date not null,
  end_date date not null,
  
  -- Recurring holidays (e.g., "Thanksgiving - 4th Thursday of November")
  is_recurring boolean default false,
  recurrence_rule text, -- e.g., "4th Thursday of November"
  
  -- Region/Country code (ISO 3166-1 alpha-2)
  region_code text default 'US',
  
  -- Auto-block enabled
  auto_block_enabled boolean default true,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sending_calendar_holidays_workspace on public.sending_calendar_holidays(workspace_id);
create index if not exists idx_sending_calendar_holidays_dates on public.sending_calendar_holidays(start_date, end_date);
create index if not exists idx_sending_calendar_holidays_type on public.sending_calendar_holidays(holiday_type);

-- Insert default US federal holidays
insert into public.sending_calendar_holidays (workspace_id, holiday_type, name, start_date, end_date, region_code, auto_block_enabled)
select 
  null as workspace_id, -- Global defaults
  'us_federal' as holiday_type,
  name,
  start_date,
  end_date,
  'US' as region_code,
  true as auto_block_enabled
from (
  values
    ('New Year''s Day', '2024-01-01'::date, '2024-01-01'::date),
    ('Martin Luther King Jr. Day', '2024-01-15'::date, '2024-01-15'::date),
    ('Presidents Day', '2024-02-19'::date, '2024-02-19'::date),
    ('Memorial Day', '2024-05-27'::date, '2024-05-27'::date),
    ('Independence Day', '2024-07-04'::date, '2024-07-04'::date),
    ('Labor Day', '2024-09-02'::date, '2024-09-02'::date),
    ('Thanksgiving', '2024-11-28'::date, '2024-11-28'::date),
    ('Christmas', '2024-12-25'::date, '2024-12-25'::date)
) as holidays(name, start_date, end_date)
on conflict do nothing;

-- ============================================
-- 5) Sending Calendar Activity Log Table
-- ============================================
create table if not exists public.sending_calendar_activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  inbox_id uuid references public.sender_inboxes(id) on delete set null,
  
  -- Event type
  event_type text not null check (event_type in (
    'holiday_block_applied',
    'window_conflict',
    'throttle_applied',
    'pacing_adjusted',
    'region_timing_applied',
    'inbox_paused',
    'inbox_resumed',
    'prediction_optimization',
    'inspector_pause',
    'midnight_reset'
  )),
  
  -- Event description
  description text not null,
  
  -- Metadata (JSONB for flexible data)
  metadata jsonb default '{}'::jsonb,
  
  created_at timestamptz default now()
);

create index if not exists idx_sending_calendar_activity_workspace on public.sending_calendar_activity_log(workspace_id, created_at desc);
create index if not exists idx_sending_calendar_activity_inbox on public.sending_calendar_activity_log(inbox_id, created_at desc);
create index if not exists idx_sending_calendar_activity_type on public.sending_calendar_activity_log(event_type);

-- ============================================
-- 6) Helper Function: Check if Time is Within Sending Window
-- ============================================
create or replace function public.is_within_global_sending_window(
  p_workspace_id uuid,
  p_inbox_id uuid default null,
  p_check_time timestamptz default now(),
  p_lead_timezone text default null,
  p_lead_country text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_calendar record;
  v_inbox_calendar record;
  v_allowed_days int[];
  v_time_windows jsonb;
  v_timezone text;
  v_local_time timestamptz;
  v_day_of_week int;
  v_current_time time;
  v_window jsonb;
  v_window_start time;
  v_window_end time;
  v_in_window boolean := false;
  v_holiday_blocked boolean := false;
begin
  -- Get inbox calendar if inbox_id provided and override enabled
  if p_inbox_id is not null then
    select * into v_inbox_calendar
    from public.inbox_sending_calendar
    where inbox_id = p_inbox_id
      and override_enabled = true;
  end if;
  
  -- Get workspace calendar
  select * into v_workspace_calendar
  from public.workspace_sending_calendar
  where workspace_id = p_workspace_id;
  
  -- If no calendar configured, allow all times (backward compatible)
  if v_workspace_calendar is null then
    return true;
  end if;
  
  -- Use inbox override if available, otherwise workspace settings
  if v_inbox_calendar is not null and v_inbox_calendar.override_enabled then
    v_allowed_days := coalesce(v_inbox_calendar.allowed_days, v_workspace_calendar.allowed_days);
    v_time_windows := coalesce(v_inbox_calendar.allowed_time_windows, v_workspace_calendar.allowed_time_windows);
    v_timezone := coalesce(v_inbox_calendar.timezone, v_workspace_calendar.timezone);
  else
    v_allowed_days := v_workspace_calendar.allowed_days;
    v_time_windows := v_workspace_calendar.allowed_time_windows;
    v_timezone := v_workspace_calendar.timezone;
  end if;
  
  -- Apply region-based timing if enabled and lead timezone provided
  if v_workspace_calendar.region_based_timing_enabled and p_lead_timezone is not null then
    v_timezone := p_lead_timezone;
  end if;
  
  -- Convert check time to appropriate timezone
  v_local_time := timezone(v_timezone, p_check_time);
  
  -- Get day of week (1=Monday, 7=Sunday)
  v_day_of_week := extract(dow from v_local_time)::int;
  -- PostgreSQL dow: 0=Sunday, 1=Monday, ..., 6=Saturday
  -- Convert to 1=Monday, 7=Sunday
  if v_day_of_week = 0 then
    v_day_of_week := 7;
  end if;
  
  -- Check if day is allowed
  if not (v_day_of_week = any(v_allowed_days)) then
    return false;
  end if;
  
  -- Get current time
  v_current_time := v_local_time::time;
  
  -- Check each time window
  for v_window in select * from jsonb_array_elements(v_time_windows)
  loop
    v_window_start := (v_window->>'start')::time;
    v_window_end := (v_window->>'end')::time;
    
    -- Handle overnight windows (e.g., 20:00 to 04:00)
    if v_window_end < v_window_start then
      if v_current_time >= v_window_start or v_current_time < v_window_end then
        v_in_window := true;
        exit;
      end if;
    else
      if v_current_time >= v_window_start and v_current_time < v_window_end then
        v_in_window := true;
        exit;
      end if;
    end if;
  end loop;
  
  if not v_in_window then
    return false;
  end if;
  
  -- Check holiday blocking
  select exists(
    select 1
    from public.sending_calendar_holidays
    where (workspace_id = p_workspace_id or workspace_id is null)
      and auto_block_enabled = true
      and v_local_time::date >= start_date
      and v_local_time::date <= end_date
      and (p_lead_country is null or region_code = p_lead_country or region_code = 'US')
  ) into v_holiday_blocked;
  
  if v_holiday_blocked then
    return false;
  end if;
  
  return true;
end;
$$;

-- ============================================
-- 7) Helper Function: Get Next Valid Send Time
-- ============================================
create or replace function public.get_next_valid_send_time_global(
  p_workspace_id uuid,
  p_inbox_id uuid default null,
  p_current_time timestamptz default now(),
  p_lead_timezone text default null,
  p_lead_country text default null
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_calendar record;
  v_inbox_calendar record;
  v_allowed_days int[];
  v_time_windows jsonb;
  v_timezone text;
  v_local_time timestamptz;
  v_candidate timestamptz;
  v_days_ahead int := 0;
  v_found boolean := false;
  v_window jsonb;
  v_window_start time;
begin
  -- Get calendars (same logic as is_within_global_sending_window)
  if p_inbox_id is not null then
    select * into v_inbox_calendar
    from public.inbox_sending_calendar
    where inbox_id = p_inbox_id
      and override_enabled = true;
  end if;
  
  select * into v_workspace_calendar
  from public.workspace_sending_calendar
  where workspace_id = p_workspace_id;
  
  if v_workspace_calendar is null then
    return p_current_time;
  end if;
  
  if v_inbox_calendar is not null and v_inbox_calendar.override_enabled then
    v_allowed_days := coalesce(v_inbox_calendar.allowed_days, v_workspace_calendar.allowed_days);
    v_time_windows := coalesce(v_inbox_calendar.allowed_time_windows, v_workspace_calendar.allowed_time_windows);
    v_timezone := coalesce(v_inbox_calendar.timezone, v_workspace_calendar.timezone);
  else
    v_allowed_days := v_workspace_calendar.allowed_days;
    v_time_windows := v_workspace_calendar.allowed_time_windows;
    v_timezone := v_workspace_calendar.timezone;
  end if;
  
  if v_workspace_calendar.region_based_timing_enabled and p_lead_timezone is not null then
    v_timezone := p_lead_timezone;
  end if;
  
  v_local_time := timezone(v_timezone, p_current_time);
  
  -- Try up to 14 days ahead
  while v_days_ahead <= 14 and not v_found loop
    v_candidate := v_local_time + (v_days_ahead || ' days')::interval;
    
    -- Check if this day is allowed and not a holiday
    if (extract(dow from v_candidate)::int = any(v_allowed_days) or 
        (extract(dow from v_candidate)::int = 0 and 7 = any(v_allowed_days))) then
      
      -- Check if not a holiday
      if not exists(
        select 1
        from public.sending_calendar_holidays
        where (workspace_id = p_workspace_id or workspace_id is null)
          and auto_block_enabled = true
          and v_candidate::date >= start_date
          and v_candidate::date <= end_date
          and (p_lead_country is null or region_code = p_lead_country or region_code = 'US')
      ) then
        -- Get first window start time
        v_window := v_time_windows->0;
        if v_window is not null then
          v_window_start := (v_window->>'start')::time;
          
          -- Set to window start
          v_candidate := date_trunc('day', v_candidate) + v_window_start;
          
          -- If today and before current time, move to next day
          if v_days_ahead = 0 and v_candidate < v_local_time then
            v_days_ahead := 1;
            continue;
          end if;
          
          -- Convert back to UTC
          v_candidate := timezone('UTC', v_candidate);
          v_found := true;
        end if;
      end if;
    end if;
    
    v_days_ahead := v_days_ahead + 1;
  end loop;
  
  if v_found then
    return v_candidate;
  else
    -- Fallback: return current time + 1 day
    return p_current_time + interval '1 day';
  end if;
end;
$$;

-- ============================================
-- 8) Helper Function: Calculate Smart Pacing
-- ============================================
create or replace function public.calculate_smart_pacing(
  p_workspace_id uuid,
  p_inbox_id uuid,
  p_daily_cap int,
  p_strategy text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_calendar record;
  v_strategy text;
  v_windows jsonb;
  v_total_hours numeric;
  v_sends_per_hour numeric;
  v_pacing_plan jsonb := '[]'::jsonb;
  v_window jsonb;
  v_window_start time;
  v_window_end time;
  v_window_hours numeric;
  v_window_sends int;
  v_hourly_distribution jsonb := '[]'::jsonb;
begin
  -- Get workspace calendar
  select * into v_calendar
  from public.workspace_sending_calendar
  where workspace_id = p_workspace_id;
  
  if v_calendar is null or not v_calendar.pacing_enabled then
    -- No pacing: return empty plan (sends can happen anytime)
    return jsonb_build_object('pacing_enabled', false);
  end if;
  
  v_strategy := coalesce(p_strategy, v_calendar.pacing_strategy, 'even');
  
  -- Get inbox calendar if exists
  declare
    v_inbox_calendar record;
  begin
    select * into v_inbox_calendar
    from public.inbox_sending_calendar
    where inbox_id = p_inbox_id
      and override_enabled = true;
    
    if v_inbox_calendar is not null then
      v_windows := v_inbox_calendar.allowed_time_windows;
    else
      v_windows := v_calendar.allowed_time_windows;
    end if;
  end;
  
  -- Calculate total hours in windows
  v_total_hours := 0;
  for v_window in select * from jsonb_array_elements(v_windows)
  loop
    v_window_start := (v_window->>'start')::time;
    v_window_end := (v_window->>'end')::time;
    
    if v_window_end < v_window_start then
      -- Overnight window
      v_window_hours := extract(epoch from (v_window_end + interval '1 day' - v_window_start)) / 3600;
    else
      v_window_hours := extract(epoch from (v_window_end - v_window_start)) / 3600;
    end if;
    
    v_total_hours := v_total_hours + v_window_hours;
  end loop;
  
  if v_total_hours = 0 then
    return jsonb_build_object('pacing_enabled', false, 'error', 'No valid windows');
  end if;
  
  -- Calculate sends per hour
  v_sends_per_hour := p_daily_cap / v_total_hours;
  
  -- Build hourly distribution based on strategy
  if v_strategy = 'even' then
    -- Even distribution across all hours
    for v_window in select * from jsonb_array_elements(v_windows)
    loop
      v_window_start := (v_window->>'start')::time;
      v_window_end := (v_window->>'end')::time;
      
      -- Distribute evenly across window
      -- (Simplified: just return sends_per_hour)
      v_hourly_distribution := v_hourly_distribution || jsonb_build_object(
        'window_start', v_window->>'start',
        'window_end', v_window->>'end',
        'sends_per_hour', round(v_sends_per_hour)
      );
    end loop;
  elsif v_strategy = 'prediction_based' then
    -- Use predictions to optimize (simplified for now)
    -- In full implementation, would query predictions table
    v_hourly_distribution := v_hourly_distribution || jsonb_build_object(
      'strategy', 'prediction_based',
      'note', 'Full prediction-based pacing requires predictions v1 integration'
    );
  end if;
  
  return jsonb_build_object(
    'pacing_enabled', true,
    'strategy', v_strategy,
    'daily_cap', p_daily_cap,
    'total_hours', v_total_hours,
    'sends_per_hour', round(v_sends_per_hour),
    'hourly_distribution', v_hourly_distribution
  );
end;
$$;

-- ============================================
-- 9) Helper Function: Check Global Throttle Rules
-- ============================================
create or replace function public.check_global_throttle_rules(
  p_workspace_id uuid,
  p_inbox_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rules record;
  v_sends_last_minute int;
  v_sends_last_hour int;
  v_inbox_sends_last_hour int;
  v_result jsonb;
  v_allowed boolean := true;
  v_reason text;
begin
  -- Get global rules
  select * into v_rules
  from public.global_sending_rules
  where workspace_id = p_workspace_id;
  
  if v_rules is null then
    -- No rules configured: allow
    return jsonb_build_object('allowed', true);
  end if;
  
  -- Check per-minute limit
  if v_rules.max_sends_per_minute is not null then
    select count(*) into v_sends_last_minute
    from public.send_logs
    where workspace_id = p_workspace_id
      and created_at > now() - interval '1 minute'
      and status = 'sent';
    
    if v_sends_last_minute >= v_rules.max_sends_per_minute then
      v_allowed := false;
      v_reason := format('Per-minute limit exceeded: %s/%s', v_sends_last_minute, v_rules.max_sends_per_minute);
    end if;
  end if;
  
  -- Check per-hour limit
  if v_allowed and v_rules.max_sends_per_hour is not null then
    select count(*) into v_sends_last_hour
    from public.send_logs
    where workspace_id = p_workspace_id
      and created_at > now() - interval '1 hour'
      and status = 'sent';
    
    if v_sends_last_hour >= v_rules.max_sends_per_hour then
      v_allowed := false;
      v_reason := format('Per-hour limit exceeded: %s/%s', v_sends_last_hour, v_rules.max_sends_per_hour);
    end if;
  end if;
  
  -- Check per-inbox per-hour limit
  if v_allowed and p_inbox_id is not null and v_rules.max_sends_per_inbox_per_hour is not null then
    select count(*) into v_inbox_sends_last_hour
    from public.send_logs
    where from_inbox_id = p_inbox_id
      and created_at > now() - interval '1 hour'
      and status = 'sent';
    
    if v_inbox_sends_last_hour >= v_rules.max_sends_per_inbox_per_hour then
      v_allowed := false;
      v_reason := format('Per-inbox per-hour limit exceeded: %s/%s', v_inbox_sends_last_hour, v_rules.max_sends_per_inbox_per_hour);
    end if;
  end if;
  
  return jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'limits', jsonb_build_object(
      'max_per_minute', v_rules.max_sends_per_minute,
      'max_per_hour', v_rules.max_sends_per_hour,
      'max_per_inbox_per_hour', v_rules.max_sends_per_inbox_per_hour
    )
  );
end;
$$;

-- ============================================
-- 10) Helper Function: Log Calendar Activity
-- ============================================
create or replace function public.log_sending_calendar_activity(
  p_workspace_id uuid,
  p_event_type text,
  p_description text,
  p_inbox_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sending_calendar_activity_log (
    workspace_id,
    inbox_id,
    event_type,
    description,
    metadata
  ) values (
    p_workspace_id,
    p_inbox_id,
    p_event_type,
    p_description,
    p_metadata
  );
end;
$$;

-- ============================================
-- 11) Integration: Inbox Inspector Auto-Pause
-- ============================================
create or replace function public.check_inbox_inspector_pause(
  p_inbox_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report record;
  v_has_dns_issues boolean := false;
begin
  -- Get latest inspector report
  select * into v_report
  from public.inbox_inspector_reports
  where inbox_id = p_inbox_id
  order by checked_at desc
  limit 1;
  
  if v_report is null then
    return false;
  end if;
  
  -- Check for DNS issues
  if not v_report.dns_spf_valid or 
     not v_report.dns_dkim_valid or 
     not v_report.dns_dmarc_valid then
    v_has_dns_issues := true;
  end if;
  
  -- Check for domain blacklist
  if v_report.blacklist_status::text like '%listed%' then
    v_has_dns_issues := true;
  end if;
  
  if v_has_dns_issues then
    -- Log activity
    declare
      v_workspace_id uuid;
    begin
      select workspace_id into v_workspace_id
      from public.sender_inboxes
      where id = p_inbox_id;
      
      if v_workspace_id is not null then
        perform public.log_sending_calendar_activity(
          v_workspace_id,
          'inspector_pause',
          format('Inbox %s paused due to DNS issues detected by Inbox Inspector', p_inbox_id),
          p_inbox_id,
          jsonb_build_object(
            'dns_spf_valid', v_report.dns_spf_valid,
            'dns_dkim_valid', v_report.dns_dkim_valid,
            'dns_dmarc_valid', v_report.dns_dmarc_valid,
            'blacklist_status', v_report.blacklist_status
          )
        );
      end if;
    end;
  end if;
  
  return v_has_dns_issues;
end;
$$;

-- ============================================
-- 12) RLS Policies
-- ============================================

-- Global sending rules
alter table public.global_sending_rules enable row level security;

create policy "global_sending_rules_select_workspace_member"
  on public.global_sending_rules
  for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = global_sending_rules.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "global_sending_rules_update_workspace_admin"
  on public.global_sending_rules
  for update
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = global_sending_rules.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Workspace sending calendar
alter table public.workspace_sending_calendar enable row level security;

create policy "workspace_sending_calendar_select_workspace_member"
  on public.workspace_sending_calendar
  for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_sending_calendar.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "workspace_sending_calendar_update_workspace_admin"
  on public.workspace_sending_calendar
  for update
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_sending_calendar.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Inbox sending calendar
alter table public.inbox_sending_calendar enable row level security;

create policy "inbox_sending_calendar_select_workspace_member"
  on public.inbox_sending_calendar
  for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = inbox_sending_calendar.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "inbox_sending_calendar_update_workspace_admin"
  on public.inbox_sending_calendar
  for update
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = inbox_sending_calendar.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Holidays
alter table public.sending_calendar_holidays enable row level security;

create policy "sending_calendar_holidays_select_workspace_member"
  on public.sending_calendar_holidays
  for select
  using (
    workspace_id is null or
    exists (
      select 1 from public.workspace_members
      where workspace_id = sending_calendar_holidays.workspace_id
        and user_id = auth.uid()
    )
  );

create policy "sending_calendar_holidays_insert_workspace_admin"
  on public.sending_calendar_holidays
  for insert
  with check (
    workspace_id is null or
    exists (
      select 1 from public.workspace_members
      where workspace_id = sending_calendar_holidays.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Activity log
alter table public.sending_calendar_activity_log enable row level security;

create policy "sending_calendar_activity_log_select_workspace_member"
  on public.sending_calendar_activity_log
  for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = sending_calendar_activity_log.workspace_id
        and user_id = auth.uid()
    )
  );

-- ============================================
-- 13) Triggers for updated_at
-- ============================================

create trigger trg_global_sending_rules_updated_at
before update on public.global_sending_rules
for each row
execute function public.set_updated_at();

create trigger trg_workspace_sending_calendar_updated_at
before update on public.workspace_sending_calendar
for each row
execute function public.set_updated_at();

create trigger trg_inbox_sending_calendar_updated_at
before update on public.inbox_sending_calendar
for each row
execute function public.set_updated_at();

create trigger trg_sending_calendar_holidays_updated_at
before update on public.sending_calendar_holidays
for each row
execute function public.set_updated_at();

-- ============================================
-- 14) Comments
-- ============================================

comment on table public.global_sending_rules is 'Global throttle rules for workspace-level sending limits and auto-pause triggers';
comment on table public.workspace_sending_calendar is 'Workspace-level sending calendar with allowed days, time windows, and pacing settings';
comment on table public.inbox_sending_calendar is 'Inbox-level sending calendar overrides (can override workspace settings)';
comment on table public.sending_calendar_holidays is 'Holiday blocking configuration (US federal holidays + custom workspace holidays)';
comment on table public.sending_calendar_activity_log is 'Activity log for all sending calendar events (holiday blocks, window conflicts, etc.)';



