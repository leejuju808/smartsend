-- Block 427 — Custom Sending Windows v1
-- Set Exact Hours/Days SmartSend Is Allowed to Send • Global + Per-Campaign Settings

-- ============================================
-- 1) Workspace Sending Windows Table
-- ============================================
create table if not exists public.workspace_sending_windows (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  timezone text not null default 'America/Los_Angeles',
  allowed_days text[] not null default array['mon','tue','wed','thu','fri']::text[],
  start_time text not null default '08:00', -- HH:MM format
  end_time text not null default '17:00',    -- HH:MM format
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_sending_windows_workspace on public.workspace_sending_windows(workspace_id);

-- ============================================
-- 2) Campaign-Level Overrides
-- ============================================
alter table public.campaigns
  add column if not exists custom_sending_window jsonb;

-- JSONB structure:
-- {
--   "enabled": boolean,
--   "allowed_days": ["mon", "tue", ...],
--   "start_time": "09:00",
--   "end_time": "16:00",
--   "timezone": "America/New_York"
-- }

create index if not exists idx_campaigns_custom_sending_window on public.campaigns using gin(custom_sending_window);

-- ============================================
-- 3) Helper Functions
-- ============================================

-- Check if a given time is within the sending window
create or replace function public.is_within_sending_window(
  p_workspace_id uuid,
  p_campaign_id uuid,
  p_check_time timestamptz default now()
)
returns boolean
language plpgsql
stable
as $$
declare
  v_window jsonb;
  v_workspace_window jsonb;
  v_allowed_days text[];
  v_start_time text;
  v_end_time text;
  v_timezone text;
  v_check_day text;
  v_check_hour int;
  v_check_minute int;
  v_start_hour int;
  v_start_minute int;
  v_end_hour int;
  v_end_minute int;
  v_local_time timestamptz;
begin
  -- Get campaign override if exists
  select custom_sending_window into v_window
  from public.campaigns
  where id = p_campaign_id;

  -- If campaign has override and it's enabled, use it
  if v_window is not null and (v_window->>'enabled')::boolean = true then
    v_allowed_days := array(select jsonb_array_elements_text(v_window->'allowed_days'));
    v_start_time := v_window->>'start_time';
    v_end_time := v_window->>'end_time';
    v_timezone := coalesce(v_window->>'timezone', 'America/Los_Angeles');
  else
    -- Use workspace default
    select 
      jsonb_build_object(
        'allowed_days', allowed_days,
        'start_time', start_time,
        'end_time', end_time,
        'timezone', timezone
      )
    into v_workspace_window
    from public.workspace_sending_windows
    where workspace_id = p_workspace_id;

    -- If no workspace window configured, allow all times (backward compatible)
    if v_workspace_window is null then
      return true;
    end if;

    v_allowed_days := array(select jsonb_array_elements_text(v_workspace_window->'allowed_days'));
    v_start_time := v_workspace_window->>'start_time';
    v_end_time := v_workspace_window->>'end_time';
    v_timezone := coalesce(v_workspace_window->>'timezone', 'America/Los_Angeles');
  end if;

  -- Convert check time to window timezone
  v_local_time := timezone(v_timezone, p_check_time);

  -- Get day of week abbreviation (Mon, Tue, Wed, etc.)
  v_check_day := lower(to_char(v_local_time, 'Dy'));

  -- Check if day is allowed
  if not (v_check_day = any(v_allowed_days)) then
    return false;
  end if;

  -- Parse time components
  v_check_hour := extract(hour from v_local_time)::int;
  v_check_minute := extract(minute from v_local_time)::int;
  
  v_start_hour := split_part(v_start_time, ':', 1)::int;
  v_start_minute := split_part(v_start_time, ':', 2)::int;
  v_end_hour := split_part(v_end_time, ':', 1)::int;
  v_end_minute := split_part(v_end_time, ':', 2)::int;

  -- Convert to minutes since midnight for comparison
  declare
    check_minutes int := v_check_hour * 60 + v_check_minute;
    start_minutes int := v_start_hour * 60 + v_start_minute;
    end_minutes int := v_end_hour * 60 + v_end_minute;
  begin
    -- Handle overnight windows (e.g., 20:00 to 04:00)
    if end_minutes < start_minutes then
      return check_minutes >= start_minutes or check_minutes < end_minutes;
    else
      return check_minutes >= start_minutes and check_minutes < end_minutes;
    end if;
  end;
end;
$$;

-- Get the next valid send time within the sending window
create or replace function public.get_next_valid_send_time(
  p_workspace_id uuid,
  p_campaign_id uuid,
  p_current_time timestamptz default now()
)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_window jsonb;
  v_workspace_window jsonb;
  v_allowed_days text[];
  v_start_time text;
  v_end_time text;
  v_timezone text;
  v_local_time timestamptz;
  v_current_day text;
  v_start_hour int;
  v_start_minute int;
  v_next_time timestamptz;
  v_days_ahead int := 0;
  v_found boolean := false;
begin
  -- Get campaign override if exists
  select custom_sending_window into v_window
  from public.campaigns
  where id = p_campaign_id;

  -- If campaign has override and it's enabled, use it
  if v_window is not null and (v_window->>'enabled')::boolean = true then
    v_allowed_days := array(select jsonb_array_elements_text(v_window->'allowed_days'));
    v_start_time := v_window->>'start_time';
    v_end_time := v_window->>'end_time';
    v_timezone := coalesce(v_window->>'timezone', 'America/Los_Angeles');
  else
    -- Use workspace default
    select 
      jsonb_build_object(
        'allowed_days', allowed_days,
        'start_time', start_time,
        'end_time', end_time,
        'timezone', timezone
      )
    into v_workspace_window
    from public.workspace_sending_windows
    where workspace_id = p_workspace_id;

    -- If no workspace window configured, return current time (backward compatible)
    if v_workspace_window is null then
      return p_current_time;
    end if;

    v_allowed_days := array(select jsonb_array_elements_text(v_workspace_window->'allowed_days'));
    v_start_time := v_workspace_window->>'start_time';
    v_end_time := v_workspace_window->>'end_time';
    v_timezone := coalesce(v_workspace_window->>'timezone', 'America/Los_Angeles');
  end if;

  -- Convert current time to window timezone
  v_local_time := timezone(v_timezone, p_current_time);
  v_start_hour := split_part(v_start_time, ':', 1)::int;
  v_start_minute := split_part(v_start_time, ':', 2)::int;

  -- Try to find next valid time (check up to 7 days ahead)
  while v_days_ahead <= 7 and not v_found loop
    declare
      candidate timestamptz;
      candidate_day text;
      candidate_hour int;
      candidate_minute int;
      check_minutes int;
      start_minutes int;
      end_minutes int;
      end_hour int;
      end_minute int;
    begin
      candidate := v_local_time + (v_days_ahead || ' days')::interval;
      candidate_day := lower(to_char(candidate, 'Dy'));
      
      -- Check if this day is allowed
      if candidate_day = any(v_allowed_days) then
        candidate_hour := extract(hour from candidate)::int;
        candidate_minute := extract(minute from candidate)::int;
        check_minutes := candidate_hour * 60 + candidate_minute;
        start_minutes := v_start_hour * 60 + v_start_minute;
        
        end_hour := split_part(v_end_time, ':', 1)::int;
        end_minute := split_part(v_end_time, ':', 2)::int;
        end_minutes := end_hour * 60 + end_minute;

        -- If we're before start time today, use start time today
        if v_days_ahead = 0 and check_minutes < start_minutes then
          v_next_time := date_trunc('day', candidate) + 
                         (v_start_hour || ' hours')::interval + 
                         (v_start_minute || ' minutes')::interval;
          v_found := true;
        -- If we're within window today, use current time
        elsif v_days_ahead = 0 then
          if end_minutes < start_minutes then
            -- Overnight window
            if check_minutes >= start_minutes or check_minutes < end_minutes then
              v_next_time := candidate;
              v_found := true;
            end if;
          else
            -- Normal window
            if check_minutes >= start_minutes and check_minutes < end_minutes then
              v_next_time := candidate;
              v_found := true;
            end if;
          end if;
        end if;

        -- If not found yet and this is an allowed day, use start time
        if not v_found then
          v_next_time := date_trunc('day', candidate) + 
                         (v_start_hour || ' hours')::interval + 
                         (v_start_minute || ' minutes')::interval;
          v_found := true;
        end if;
      end if;
    end;

    v_days_ahead := v_days_ahead + 1;
  end loop;

  -- Convert back to UTC
  if v_found then
    return timezone('UTC', v_next_time);
  else
    -- Fallback: return current time + 1 day
    return p_current_time + interval '1 day';
  end if;
end;
$$;

-- ============================================
-- 4) RLS Policies
-- ============================================
alter table public.workspace_sending_windows enable row level security;

-- Users can read sending windows for workspaces they're members of
create policy "workspace_sending_windows_select"
  on public.workspace_sending_windows
  for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_sending_windows.workspace_id
        and user_id = auth.uid()
    )
  );

-- Users can update sending windows for workspaces they're admins/owners of
create policy "workspace_sending_windows_update"
  on public.workspace_sending_windows
  for update
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_sending_windows.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_sending_windows.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Users can insert sending windows for workspaces they're admins/owners of
create policy "workspace_sending_windows_insert"
  on public.workspace_sending_windows
  for insert
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_sending_windows.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- ============================================
-- 5) Trigger for updated_at
-- ============================================
create or replace function public.set_workspace_sending_windows_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_workspace_sending_windows_updated_at on public.workspace_sending_windows;
create trigger trg_workspace_sending_windows_updated_at
  before update on public.workspace_sending_windows
  for each row
  execute function public.set_workspace_sending_windows_updated_at();

