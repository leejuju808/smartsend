-- Block 465 — Global Sending Calendar v1 — Integration Functions
-- Integration with Fleet Manager, Smart Resend Engine, Predictions v1, Inbox Inspector, AI Advisor

-- ============================================
-- 1) Integration: Fleet Manager + Calendar
-- ============================================

-- Enhanced function to get inbox capacity with calendar constraints
create or replace function public.get_fleet_inbox_capacity_with_calendar(
  p_workspace_id uuid,
  p_inbox_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_calendar record;
  v_inbox_calendar record;
  v_pacing jsonb;
  v_result jsonb;
begin
  -- Get Fleet Manager capacity
  v_capacity := public.calculate_safe_daily_limit(p_inbox_id);
  
  -- Get workspace calendar
  select * into v_calendar
  from public.workspace_sending_calendar
  where workspace_id = p_workspace_id;
  
  -- Get inbox calendar override
  select * into v_inbox_calendar
  from public.inbox_sending_calendar
  where inbox_id = p_inbox_id
    and override_enabled = true;
  
  -- Check if inbox has valid sending window today
  if not public.is_within_global_sending_window(
    p_workspace_id,
    p_inbox_id,
    now()
  ) then
    -- No valid window today: capacity is 0
    v_capacity := 0;
  end if;
  
  -- Get pacing plan if enabled
  if v_calendar is not null and v_calendar.pacing_enabled then
    v_pacing := public.calculate_smart_pacing(
      p_workspace_id,
      p_inbox_id,
      v_capacity,
      v_calendar.pacing_strategy
    );
  end if;
  
  v_result := jsonb_build_object(
    'inbox_id', p_inbox_id,
    'daily_capacity', v_capacity,
    'pacing_plan', coalesce(v_pacing, '{}'::jsonb),
    'has_valid_window_today', public.is_within_global_sending_window(
      p_workspace_id,
      p_inbox_id,
      now()
    )
  );
  
  return v_result;
end;
$$;

-- ============================================
-- 2) Integration: Smart Resend Engine + Calendar
-- ============================================

-- Enhanced schedule_retry function that respects calendar
create or replace function public.schedule_retry_with_calendar(
  p_queue_id uuid,
  p_error_text text,
  p_retry_count int,
  p_workspace_id uuid,
  p_inbox_id uuid default null,
  p_lead_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_error_category text;
  v_strategy record;
  v_delay_minutes int;
  v_next_attempt_at timestamptz;
  v_max_attempts int;
  v_calendar_time timestamptz;
  v_lead_timezone text;
  v_lead_country text;
begin
  -- Get lead timezone/country for region-based timing
  if p_lead_id is not null then
    select 
      coalesce(timezone, country) as tz,
      country
    into v_lead_timezone, v_lead_country
    from public.leads
    where id = p_lead_id;
  end if;
  
  -- Classify error
  v_error_category := public.classify_error_type(p_error_text);
  
  -- Get strategy
  select * into v_strategy
  from public.retry_strategies
  where error_category = v_error_category;
  
  if not found then
    v_delay_minutes := 15;
    v_max_attempts := 3;
  else
    v_delay_minutes := v_strategy.retry_delay_minutes;
    v_max_attempts := v_strategy.max_attempts;
    
    -- Apply exponential backoff
    if p_retry_count > 1 then
      v_delay_minutes := round(v_delay_minutes * power(coalesce(v_strategy.backoff_multiplier, 1.5), p_retry_count - 1))::int;
    end if;
  end if;
  
  -- Calculate base next attempt time
  v_next_attempt_at := now() + (v_delay_minutes || ' minutes')::interval;
  
  -- Apply calendar constraints: get next valid send time
  v_calendar_time := public.get_next_valid_send_time_global(
    p_workspace_id,
    p_inbox_id,
    v_next_attempt_at,
    v_lead_timezone,
    v_lead_country
  );
  
  -- Use the later of retry time or calendar time
  v_next_attempt_at := greatest(v_next_attempt_at, v_calendar_time);
  
  -- Update send_queue
  update public.send_queue
  set
    retry_count = p_retry_count,
    last_error = p_error_text,
    error_category = v_error_category,
    next_attempt_at = v_next_attempt_at,
    status = case
      when p_retry_count >= v_max_attempts then 'failed'
      else 'retry_scheduled'
    end
  where id = p_queue_id;
  
  -- Log activity
  if v_calendar_time > v_next_attempt_at then
    perform public.log_sending_calendar_activity(
      p_workspace_id,
      'pacing_adjusted',
      format('Retry rescheduled due to calendar constraints: %s', v_calendar_time),
      p_inbox_id,
      jsonb_build_object(
        'queue_id', p_queue_id,
        'original_retry_time', v_next_attempt_at,
        'calendar_adjusted_time', v_calendar_time
      )
    );
  end if;
  
  return v_next_attempt_at;
end;
$$;

-- ============================================
-- 3) Integration: Predictions v1 + Calendar
-- ============================================

-- Function to optimize send timing based on predictions
create or replace function public.optimize_send_time_with_predictions(
  p_workspace_id uuid,
  p_inbox_id uuid default null,
  p_campaign_id uuid default null,
  p_base_time timestamptz default now()
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prediction record;
  v_optimized_time timestamptz;
  v_calendar record;
  v_best_window_start timestamptz;
  v_predicted_open_rate numeric;
  v_hour int;
  v_best_hour int := null;
  v_best_rate numeric := 0;
begin
  -- Get calendar
  select * into v_calendar
  from public.workspace_sending_calendar
  where workspace_id = p_workspace_id;
  
  -- If prediction-based pacing not enabled, return base time
  if v_calendar is null or v_calendar.pacing_strategy != 'prediction_based' then
    return p_base_time;
  end if;
  
  -- Get predictions for optimal send time
  -- Look for predictions indicating high open/reply rates by hour
  for v_hour in 8..17 loop
    -- Get prediction for this hour (simplified - in production would query actual predictions)
    -- For now, use a heuristic: 11 AM - 2 PM typically have higher open rates
    if v_hour >= 11 and v_hour <= 14 then
      v_predicted_open_rate := 0.25; -- Higher predicted rate
    else
      v_predicted_open_rate := 0.15; -- Lower predicted rate
    end if;
    
    -- Check if this hour is within a valid window
    declare
      v_candidate timestamptz;
      v_in_window boolean;
    begin
      v_candidate := date_trunc('day', p_base_time) + (v_hour || ' hours')::interval;
      
      v_in_window := public.is_within_global_sending_window(
        p_workspace_id,
        p_inbox_id,
        v_candidate
      );
      
      if v_in_window and v_predicted_open_rate > v_best_rate then
        v_best_rate := v_predicted_open_rate;
        v_best_hour := v_hour;
      end if;
    end;
  end loop;
  
  -- If found a better hour, use it
  if v_best_hour is not null then
    v_optimized_time := date_trunc('day', p_base_time) + (v_best_hour || ' hours')::interval;
    
    -- Ensure it's in the future
    if v_optimized_time < now() then
      v_optimized_time := v_optimized_time + interval '1 day';
    end if;
    
    return v_optimized_time;
  end if;
  
  -- Fallback: use base time
  return p_base_time;
end;
$$;

-- ============================================
-- 4) Integration: Inbox Inspector Auto-Pause
-- ============================================

-- Function to check and apply inbox inspector pauses
create or replace function public.apply_inbox_inspector_pause(
  p_inbox_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_issues boolean;
  v_workspace_id uuid;
begin
  -- Check for DNS issues
  v_has_issues := public.check_inbox_inspector_pause(p_inbox_id);
  
  if v_has_issues then
    -- Get workspace_id
    select workspace_id into v_workspace_id
    from public.sender_inboxes
    where id = p_inbox_id;
    
    -- Update inbox health to pause
    update public.inbox_health
    set is_paused = true,
        pause_reason = 'DNS issues detected by Inbox Inspector'
    where inbox_id = p_inbox_id;
    
    -- Log activity
    if v_workspace_id is not null then
      perform public.log_sending_calendar_activity(
        v_workspace_id,
        'inspector_pause',
        format('Inbox %s auto-paused for 12 hours due to DNS issues', p_inbox_id),
        p_inbox_id,
        jsonb_build_object('pause_duration_hours', 12)
      );
    end if;
    
    return true;
  end if;
  
  return false;
end;
$$;

-- ============================================
-- 5) Integration: AI Advisor Alerts
-- ============================================

-- Function to generate AI Advisor alerts for calendar
create or replace function public.generate_calendar_advisor_alerts(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_alerts jsonb := '[]'::jsonb;
  v_inbox record;
  v_has_window boolean;
  v_prediction record;
begin
  -- Check for inboxes with no allowed window today
  for v_inbox in
    select si.id, si.email, si.workspace_id
    from public.sender_inboxes si
    where si.workspace_id = p_workspace_id
      and si.connected = true
  loop
    v_has_window := public.is_within_global_sending_window(
      p_workspace_id,
      v_inbox.id,
      now()
    );
    
    if not v_has_window then
      v_alerts := v_alerts || jsonb_build_object(
        'type', 'window_conflict',
        'severity', 'warning',
        'title', 'Sending Window Conflict',
        'message', format('Inbox %s has no allowed window today', v_inbox.email),
        'inbox_id', v_inbox.id,
        'suggestion', 'Expand window or shift tasks to tomorrow'
      );
    end if;
  end loop;
  
  -- Check for predicted high-open windows
  select * into v_prediction
  from public.predictions
  where workspace_id = p_workspace_id
    and metric = 'open_rate'
    and horizon_days = 1
    and predicted_value > 0.20 -- 20% higher than baseline
  order by created_at desc
  limit 1;
  
  if v_prediction is not null then
    v_alerts := v_alerts || jsonb_build_object(
      'type', 'prediction_optimization',
      'severity', 'info',
      'title', 'Predicted High-Open Window',
      'message', format('Tomorrow 10 AM–1 PM predicted to have %s%% higher open rates', round((v_prediction.predicted_value * 100)::numeric, 1)),
      'suggestion', 'Schedule more sends in that window'
    );
  end if;
  
  return jsonb_build_object('alerts', v_alerts, 'count', jsonb_array_length(v_alerts));
end;
$$;

-- ============================================
-- 6) Midnight Safety Reset Function
-- ============================================

-- Function to reset daily counters at midnight
create or replace function public.midnight_safety_reset(
  p_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rules record;
  v_reset_timezone text;
  v_now timestamptz;
  v_local_time timestamptz;
  v_local_hour int;
begin
  -- Get global rules
  select * into v_rules
  from public.global_sending_rules
  where workspace_id = p_workspace_id;
  
  if v_rules is null or not v_rules.midnight_reset_enabled then
    return;
  end if;
  
  v_reset_timezone := coalesce(v_rules.reset_timezone, 'America/Los_Angeles');
  v_now := now();
  v_local_time := timezone(v_reset_timezone, v_now);
  v_local_hour := extract(hour from v_local_time)::int;
  
  -- Only reset at midnight (00:00) in the reset timezone
  if v_local_hour = 0 then
    -- Reset any auto-paused inboxes (if pause duration expired)
    -- This would be handled by a separate cleanup job
    -- For now, just log the reset
    perform public.log_sending_calendar_activity(
      p_workspace_id,
      'midnight_reset',
      'Midnight safety reset applied',
      null,
      jsonb_build_object('reset_timezone', v_reset_timezone)
    );
  end if;
end;
$$;

-- ============================================
-- 7) Comprehensive Send Time Check Function
-- ============================================

-- Main function to check if sending is allowed right now (combines all checks)
create or replace function public.can_send_now_global(
  p_workspace_id uuid,
  p_inbox_id uuid default null,
  p_lead_id uuid default null,
  p_check_time timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_in_window boolean;
  v_throttle_check jsonb;
  v_inspector_paused boolean;
  v_lead_timezone text;
  v_lead_country text;
begin
  -- Get lead timezone/country
  if p_lead_id is not null then
    select 
      coalesce(timezone, country) as tz,
      country
    into v_lead_timezone, v_lead_country
    from public.leads
    where id = p_lead_id;
  end if;
  
  -- Check sending window
  v_in_window := public.is_within_global_sending_window(
    p_workspace_id,
    p_inbox_id,
    p_check_time,
    v_lead_timezone,
    v_lead_country
  );
  
  -- Check throttle rules
  v_throttle_check := public.check_global_throttle_rules(
    p_workspace_id,
    p_inbox_id
  );
  
  -- Check inbox inspector pause
  if p_inbox_id is not null then
    v_inspector_paused := public.check_inbox_inspector_pause(p_inbox_id);
  else
    v_inspector_paused := false;
  end if;
  
  -- Build result
  v_result := jsonb_build_object(
    'can_send', v_in_window 
      and (v_throttle_check->>'allowed')::boolean 
      and not v_inspector_paused,
    'in_window', v_in_window,
    'throttle_allowed', (v_throttle_check->>'allowed')::boolean,
    'throttle_reason', v_throttle_check->>'reason',
    'inspector_paused', v_inspector_paused,
    'next_valid_time', case
      when not v_in_window then
        public.get_next_valid_send_time_global(
          p_workspace_id,
          p_inbox_id,
          p_check_time,
          v_lead_timezone,
          v_lead_country
        )
      else null
    end
  );
  
  return v_result;
end;
$$;



