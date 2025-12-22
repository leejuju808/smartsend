-- Block 24140 — SmartSend Advanced Scheduler v2
-- Human-Like Sending • Deliverability Protection • Load Balancing • Intelligent Timing

-- ============================================================================
-- 1. WAVE-BASED SENDING SYSTEM (Drip System)
-- ============================================================================

-- Track sending waves for human-like spacing
create table if not exists public.send_waves (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  wave_number int not null,
  batch_size int not null default 50, -- 30-50 emails per wave
  pause_duration_seconds int not null default 300, -- 5 minutes default pause
  started_at timestamptz,
  completed_at timestamptz,
  emails_sent int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_send_waves_workspace on public.send_waves(workspace_id, created_at desc);
create index if not exists idx_send_waves_active on public.send_waves(workspace_id) where completed_at is null;

-- Add wave tracking to send_queue
alter table public.send_queue
  add column if not exists wave_id uuid references public.send_waves(id) on delete set null,
  add column if not exists wave_position int; -- position within wave (for ordering)

create index if not exists idx_send_queue_wave on public.send_queue(wave_id, wave_position);

-- ============================================================================
-- 2. AI TIMING WINDOWS (Homeowner Behavior Tracking)
-- ============================================================================

-- Track homeowner engagement patterns by city/timezone
create table if not exists public.homeowner_timing_patterns (
  id uuid primary key default gen_random_uuid(),
  city text,
  state text,
  timezone text not null,
  peak_window_start time not null, -- e.g., '07:30'
  peak_window_end time not null,   -- e.g., '09:30'
  window_type text not null check (window_type in ('morning', 'midday', 'evening', 'storm_spike')),
  engagement_score numeric(5,2) not null default 0.0, -- 0-100, higher = more engagement
  sample_size int not null default 0,
  last_updated timestamptz not null default now()
);

create unique index if not exists idx_timing_patterns_unique 
  on public.homeowner_timing_patterns(city, state, timezone, window_type);

create index if not exists idx_timing_patterns_city on public.homeowner_timing_patterns(city, state);

-- Default AI timing windows (will be updated by actual behavior)
insert into public.homeowner_timing_patterns (city, state, timezone, peak_window_start, peak_window_end, window_type, engagement_score, sample_size)
values
  -- Morning window (7:30-9:30 AM)
  (null, null, 'America/Los_Angeles', '07:30', '09:30', 'morning', 75.0, 0),
  (null, null, 'America/New_York', '07:30', '09:30', 'morning', 75.0, 0),
  (null, null, 'America/Chicago', '07:30', '09:30', 'morning', 75.0, 0),
  -- Midday window (11:00 AM-1:00 PM)
  (null, null, 'America/Los_Angeles', '11:00', '13:00', 'midday', 65.0, 0),
  (null, null, 'America/New_York', '11:00', '13:00', 'midday', 65.0, 0),
  (null, null, 'America/Chicago', '11:00', '13:00', 'midday', 65.0, 0),
  -- Evening window (4:30-7:30 PM)
  (null, null, 'America/Los_Angeles', '16:30', '19:30', 'evening', 80.0, 0),
  (null, null, 'America/New_York', '16:30', '19:30', 'evening', 80.0, 0),
  (null, null, 'America/Chicago', '16:30', '19:30', 'evening', 80.0, 0)
on conflict do nothing;

-- Track email opens/replies by time to learn patterns
create table if not exists public.email_engagement_timing (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  email_sent_at timestamptz not null,
  opened_at timestamptz,
  replied_at timestamptz,
  city text,
  state text,
  timezone text,
  hour_of_day int, -- 0-23
  day_of_week int, -- 0-6 (Sunday = 0)
  created_at timestamptz not null default now()
);

create index if not exists idx_engagement_timing_city on public.email_engagement_timing(city, state, timezone, hour_of_day);
create index if not exists idx_engagement_timing_sent on public.email_engagement_timing(email_sent_at);

-- ============================================================================
-- 3. LIST QUALITY DETECTION (Automatic Throttling)
-- ============================================================================

-- Track list quality metrics per campaign/workspace
create table if not exists public.list_quality_metrics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  metric_date date not null default current_date,
  bounce_rate numeric(5,2) not null default 0.0, -- percentage
  open_rate numeric(5,2) not null default 0.0,
  reply_rate numeric(5,2) not null default 0.0,
  complaint_rate numeric(5,2) not null default 0.0,
  unengaged_count int not null default 0, -- opens without replies
  old_leads_count int not null default 0, -- leads older than 90 days
  quality_score numeric(5,2) not null default 100.0, -- 0-100, lower = worse quality
  throttle_level text not null default 'normal' check (throttle_level in ('normal', 'limited', 'repair_mode', 'paused')),
  auto_throttled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_list_quality_unique 
  on public.list_quality_metrics(workspace_id, campaign_id, metric_date);

create index if not exists idx_list_quality_workspace on public.list_quality_metrics(workspace_id, metric_date desc);
create index if not exists idx_list_quality_throttle on public.list_quality_metrics(workspace_id) where throttle_level != 'normal';

-- Add list quality alerts
create table if not exists public.list_quality_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  alert_type text not null check (alert_type in ('high_bounce', 'low_engagement', 'old_leads', 'spam_complaints')),
  message text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_list_quality_alerts_workspace on public.list_quality_alerts(workspace_id, created_at desc);
create index if not exists idx_list_quality_alerts_unacknowledged on public.list_quality_alerts(workspace_id) where acknowledged_at is null;

-- ============================================================================
-- 4. SEND QUEUE PRIORITIZATION (High ROI First)
-- ============================================================================

-- Campaign type priority mapping (higher = sent first)
-- Storm = 1000, Revival = 800, Follow-Up = 600, Free Estimate = 400, Low-ROI = 200

-- Add campaign_type to campaigns if not exists
alter table public.campaigns
  add column if not exists campaign_type text check (campaign_type in ('storm', 'revival', 'followup', 'free_estimate', 'repair', 'seasonal', 'other')),
  add column if not exists campaign_priority int not null default 100; -- will be set based on type

-- Function to calculate campaign priority based on type
create or replace function public.get_campaign_priority(p_campaign_type text)
returns int as $$
begin
  return case p_campaign_type
    when 'storm' then 1000
    when 'revival' then 800
    when 'followup' then 600
    when 'free_estimate' then 400
    when 'repair' then 500
    when 'seasonal' then 300
    else 200
  end;
end;
$$ language plpgsql immutable;

-- Update existing campaigns with priority based on type
update public.campaigns
set campaign_priority = public.get_campaign_priority(campaign_type)
where campaign_type is not null;

-- Update send_queue priority to match campaign priority
create or replace function public.update_queue_priority_from_campaign()
returns trigger as $$
begin
  update public.send_queue
  set priority = (
    select campaign_priority 
    from public.campaigns 
    where id = new.campaign_id
  )
  where campaign_id = new.id and status = 'pending';
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_update_queue_priority on public.campaigns;
create trigger trg_update_queue_priority
after insert or update of campaign_type, campaign_priority on public.campaigns
for each row
execute function public.update_queue_priority_from_campaign();

-- Update send_queue to use campaign priority
create or replace function public.sync_queue_priority()
returns void as $$
begin
  update public.send_queue sq
  set priority = c.campaign_priority
  from public.campaigns c
  where sq.campaign_id = c.id
    and sq.status = 'pending'
    and sq.priority != c.campaign_priority;
end;
$$ language plpgsql;

-- ============================================================================
-- 5. DELIVERABILITY SAFEGUARDS (Auto-Protection)
-- ============================================================================

-- Track deliverability health per workspace/domain
create table if not exists public.deliverability_health (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  domain text,
  inbox_id uuid, -- sender_inboxes.id if tracking per inbox
  health_score numeric(5,2) not null default 100.0, -- 0-100
  bounce_rate numeric(5,2) not null default 0.0,
  complaint_rate numeric(5,2) not null default 0.0,
  spam_score numeric(5,2) not null default 0.0, -- from spam filters
  reputation_status text not null default 'good' check (reputation_status in ('excellent', 'good', 'fair', 'poor', 'critical')),
  ip_pool_rotation_enabled boolean not null default false,
  last_rotation_at timestamptz,
  auto_adjustments_enabled boolean not null default true,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_deliverability_health_unique 
  on public.deliverability_health(workspace_id, coalesce(domain, ''), coalesce(inbox_id::text, ''));

create index if not exists idx_deliverability_health_workspace on public.deliverability_health(workspace_id, last_checked_at desc);
create index if not exists idx_deliverability_health_status on public.deliverability_health(workspace_id) where reputation_status in ('poor', 'critical');

-- Deliverability alerts and auto-adjustments
create table if not exists public.deliverability_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  domain text,
  inbox_id uuid,
  event_type text not null check (event_type in ('health_drop', 'bounce_spike', 'complaint_spike', 'auto_throttle', 'auto_pause', 'ip_rotation', 'subject_replacement')),
  event_message text not null,
  adjustment_applied jsonb, -- what SmartSend did automatically
  created_at timestamptz not null default now()
);

create index if not exists idx_deliverability_events_workspace on public.deliverability_events(workspace_id, created_at desc);

-- ============================================================================
-- 6. MULTI-CAMPAIGN LOAD BALANCING
-- ============================================================================

-- Track active campaigns per workspace for load balancing
create table if not exists public.campaign_load_balance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  daily_send_allocation int not null default 0, -- how many emails this campaign can send today
  sends_today int not null default 0,
  priority_weight numeric(5,2) not null default 1.0, -- multiplier for allocation
  last_balanced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_campaign_load_balance_unique 
  on public.campaign_load_balance(workspace_id, campaign_id, date(last_balanced_at));

create index if not exists idx_campaign_load_balance_workspace on public.campaign_load_balance(workspace_id, last_balanced_at desc);

-- ============================================================================
-- 7. DASHBOARD METRICS (Internal View)
-- ============================================================================

-- View for scheduler dashboard metrics
create or replace view public.v_scheduler_dashboard as
select 
  w.id as workspace_id,
  -- Emails in Queue
  (select count(*) from public.send_queue sq 
   join public.campaigns c on c.id = sq.campaign_id 
   where c.workspace_id = w.id and sq.status = 'pending') as emails_in_queue,
  
  -- Next Wave Scheduled At
  (select min(sq.scheduled_at) from public.send_queue sq
   join public.campaigns c on c.id = sq.campaign_id
   where c.workspace_id = w.id and sq.status = 'pending') as next_wave_scheduled_at,
  
  -- Throttle Status
  coalesce(
    (select throttle_level from public.list_quality_metrics lqm
     where lqm.workspace_id = w.id
     order by metric_date desc limit 1),
    'normal'
  ) as throttle_status,
  
  -- Deliverability Score
  coalesce(
    (select health_score from public.deliverability_health dh
     where dh.workspace_id = w.id
     order by last_checked_at desc limit 1),
    100.0
  ) as deliverability_score,
  
  -- Engagement Trend (last 7 days vs previous 7 days)
  (
    select 
      case 
        when count(*) = 0 then 0
        else round(
          (count(*) filter (where e.replied_at is not null)::numeric / count(*)::numeric * 100)::numeric, 
          2
        )
      end
    from public.email_engagement_timing e
    join public.leads l on l.id = e.lead_id
    where l.workspace_id = w.id
      and e.email_sent_at >= now() - interval '7 days'
  ) as engagement_trend_7d,
  
  -- Storm Priority Active
  case 
    when exists (
      select 1 from public.campaigns c
      where c.workspace_id = w.id
        and c.campaign_type = 'storm'
        and c.status in ('active', 'running')
    ) then true
    else false
  end as storm_priority_active,
  
  -- List Quality Rating
  coalesce(
    (select quality_score from public.list_quality_metrics lqm
     where lqm.workspace_id = w.id
     order by metric_date desc limit 1),
    100.0
  ) as list_quality_rating

from public.workspaces w;

-- ============================================================================
-- 8. AUTOPILOT RULES (Roofing Best Practices)
-- ============================================================================

-- Store autopilot rule configurations
create table if not exists public.scheduler_autopilot_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid, -- null = global rule
  rule_name text not null,
  rule_type text not null check (rule_type in ('rate_limit', 'spacing', 'warmup', 'pause_condition', 'auto_remove')),
  rule_config jsonb not null, -- flexible config per rule type
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_autopilot_rules_workspace on public.scheduler_autopilot_rules(workspace_id);
create index if not exists idx_autopilot_rules_enabled on public.scheduler_autopilot_rules(workspace_id) where enabled = true;

-- Insert default roofing best practices rules
insert into public.scheduler_autopilot_rules (workspace_id, rule_name, rule_type, rule_config, enabled)
values
  -- Never send more than 250 emails/hour/domain
  (null, 'max_emails_per_hour_per_domain', 'rate_limit', 
   '{"max_per_hour": 250, "per_domain": true}'::jsonb, true),
  
  -- Never send more than 2 emails/day/homeowner
  (null, 'max_emails_per_day_per_homeowner', 'rate_limit',
   '{"max_per_day": 2, "per_contact": true}'::jsonb, true),
  
  -- Add spacing between follow-ups
  (null, 'followup_spacing', 'spacing',
   '{"min_hours_between": 24}'::jsonb, true),
  
  -- Warm new domains slowly (50, 100, 200...)
  (null, 'domain_warmup', 'warmup',
   '{"day_1_7": 50, "day_8_14": 100, "day_15_21": 200, "day_22_plus": "unlimited"}'::jsonb, true),
  
  -- Pause sending if bounce rate >5%
  (null, 'pause_on_high_bounce', 'pause_condition',
   '{"bounce_rate_threshold": 5.0, "check_window_hours": 24}'::jsonb, true),
  
  -- Auto-remove inactive contacts
  (null, 'auto_remove_inactive', 'auto_remove',
   '{"days_inactive": 90, "no_opens": true, "no_replies": true}'::jsonb, true),
  
  -- Auto-scan for spammy text
  (null, 'spam_text_detection', 'pause_condition',
   '{"enabled": true, "block_on_detection": true}'::jsonb, true)
on conflict do nothing;

-- ============================================================================
-- 9. HELPER FUNCTIONS
-- ============================================================================

-- Function to get next AI timing window for a lead
create or replace function public.get_next_timing_window(
  p_lead_id uuid,
  p_preferred_window text default null -- 'morning', 'midday', 'evening', or null for best
)
returns timestamptz as $$
declare
  v_lead_timezone text;
  v_lead_city text;
  v_lead_state text;
  v_window_start time;
  v_window_end time;
  v_next_window timestamptz;
  v_now timestamptz;
begin
  -- Get lead timezone/city
  select timezone, city, state into v_lead_timezone, v_lead_city, v_lead_state
  from public.leads
  where id = p_lead_id;
  
  if v_lead_timezone is null then
    v_lead_timezone := 'America/Los_Angeles'; -- default
  end if;
  
  v_now := now() at time zone v_lead_timezone;
  
  -- Find best timing window (highest engagement score)
  select peak_window_start, peak_window_end into v_window_start, v_window_end
  from public.homeowner_timing_patterns
  where (city = v_lead_city or city is null)
    and (state = v_lead_state or state is null)
    and timezone = v_lead_timezone
    and (p_preferred_window is null or window_type = p_preferred_window)
  order by engagement_score desc, sample_size desc
  limit 1;
  
  if v_window_start is null then
    -- Fallback to default evening window
    v_window_start := '16:30';
    v_window_end := '19:30';
  end if;
  
  -- Calculate next occurrence of this window
  v_next_window := (date(v_now) || ' ' || v_window_start::text)::timestamptz;
  v_next_window := v_next_window at time zone v_lead_timezone;
  
  -- If window already passed today, move to tomorrow
  if v_next_window <= v_now then
    v_next_window := v_next_window + interval '1 day';
  end if;
  
  -- Convert back to UTC
  return v_next_window at time zone 'UTC';
end;
$$ language plpgsql;

-- Function to check and update list quality metrics
create or replace function public.update_list_quality_metrics(
  p_workspace_id uuid,
  p_campaign_id uuid default null,
  p_check_date date default current_date
)
returns void as $$
declare
  v_bounce_rate numeric;
  v_open_rate numeric;
  v_reply_rate numeric;
  v_complaint_rate numeric;
  v_quality_score numeric;
  v_throttle_level text;
begin
  -- Calculate metrics (simplified - adjust based on your email_logs schema)
  -- This is a placeholder - adjust based on your actual email tracking tables
  
  select 
    coalesce(
      (select count(*)::numeric * 100.0 / nullif((select count(*) from public.send_queue sq join public.campaigns c on c.id = sq.campaign_id where c.workspace_id = p_workspace_id and sq.status = 'sent' and date(sq.sent_at) = p_check_date), 0), 0),
      0
    ) into v_bounce_rate;
  
  -- Set throttle level based on bounce rate
  v_throttle_level := case
    when v_bounce_rate > 5.0 then 'paused'
    when v_bounce_rate > 3.0 then 'repair_mode'
    when v_bounce_rate > 1.5 then 'limited'
    else 'normal'
  end;
  
  -- Calculate quality score (0-100)
  v_quality_score := greatest(0, 100 - (v_bounce_rate * 10) - (v_complaint_rate * 20));
  
  -- Upsert metrics
  insert into public.list_quality_metrics (
    workspace_id, campaign_id, metric_date,
    bounce_rate, open_rate, reply_rate, complaint_rate,
    quality_score, throttle_level, updated_at
  )
  values (
    p_workspace_id, p_campaign_id, p_check_date,
    v_bounce_rate, v_open_rate, v_reply_rate, v_complaint_rate,
    v_quality_score, v_throttle_level, now()
  )
  on conflict (workspace_id, coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid), metric_date)
  do update set
    bounce_rate = excluded.bounce_rate,
    open_rate = excluded.open_rate,
    reply_rate = excluded.reply_rate,
    complaint_rate = excluded.complaint_rate,
    quality_score = excluded.quality_score,
    throttle_level = excluded.throttle_level,
    updated_at = excluded.updated_at,
    auto_throttled_at = case when excluded.throttle_level != 'normal' then now() else list_quality_metrics.auto_throttled_at end;
  
  -- Create alert if quality dropped
  if v_throttle_level != 'normal' then
    insert into public.list_quality_alerts (
      workspace_id, campaign_id, alert_type, message, severity
    )
    values (
      p_workspace_id, p_campaign_id,
      case 
        when v_bounce_rate > 5.0 then 'high_bounce'
        when v_open_rate < 20.0 then 'low_engagement'
        else 'high_bounce'
      end,
      format('Your list quality dropped (bounce rate: %.1f%%) — SmartSend is adjusting your sequence automatically.', v_bounce_rate),
      case when v_bounce_rate > 5.0 then 'critical' else 'warning' end
    );
  end if;
end;
$$ language plpgsql;

-- ============================================================================
-- 10. RLS POLICIES
-- ============================================================================

alter table public.send_waves enable row level security;
alter table public.homeowner_timing_patterns enable row level security;
alter table public.email_engagement_timing enable row level security;
alter table public.list_quality_metrics enable row level security;
alter table public.list_quality_alerts enable row level security;
alter table public.deliverability_health enable row level security;
alter table public.deliverability_events enable row level security;
alter table public.campaign_load_balance enable row level security;
alter table public.scheduler_autopilot_rules enable row level security;

-- Service role has full access
create policy "service_role_full_access" on public.send_waves for all to service_role using (true) with check (true);
create policy "service_role_full_access" on public.homeowner_timing_patterns for all to service_role using (true) with check (true);
create policy "service_role_full_access" on public.email_engagement_timing for all to service_role using (true) with check (true);
create policy "service_role_full_access" on public.list_quality_metrics for all to service_role using (true) with check (true);
create policy "service_role_full_access" on public.list_quality_alerts for all to service_role using (true) with check (true);
create policy "service_role_full_access" on public.deliverability_health for all to service_role using (true) with check (true);
create policy "service_role_full_access" on public.deliverability_events for all to service_role using (true) with check (true);
create policy "service_role_full_access" on public.campaign_load_balance for all to service_role using (true) with check (true);
create policy "service_role_full_access" on public.scheduler_autopilot_rules for all to service_role using (true) with check (true);

-- Workspace members can read their own data
create policy "workspace_read_send_waves" on public.send_waves for select using (
  exists (select 1 from public.workspace_members wm where wm.workspace_id = send_waves.workspace_id and wm.user_id = auth.uid())
);
create policy "workspace_read_timing_patterns" on public.homeowner_timing_patterns for select using (true); -- public read
create policy "workspace_read_engagement_timing" on public.email_engagement_timing for select using (
  exists (select 1 from public.leads l join public.workspace_members wm on wm.workspace_id = l.workspace_id 
          where l.id = email_engagement_timing.lead_id and wm.user_id = auth.uid())
);
create policy "workspace_read_quality_metrics" on public.list_quality_metrics for select using (
  exists (select 1 from public.workspace_members wm where wm.workspace_id = list_quality_metrics.workspace_id and wm.user_id = auth.uid())
);
create policy "workspace_read_quality_alerts" on public.list_quality_alerts for select using (
  exists (select 1 from public.workspace_members wm where wm.workspace_id = list_quality_alerts.workspace_id and wm.user_id = auth.uid())
);
create policy "workspace_read_deliverability_health" on public.deliverability_health for select using (
  exists (select 1 from public.workspace_members wm where wm.workspace_id = deliverability_health.workspace_id and wm.user_id = auth.uid())
);
create policy "workspace_read_deliverability_events" on public.deliverability_events for select using (
  exists (select 1 from public.workspace_members wm where wm.workspace_id = deliverability_events.workspace_id and wm.user_id = auth.uid())
);
create policy "workspace_read_load_balance" on public.campaign_load_balance for select using (
  exists (select 1 from public.workspace_members wm where wm.workspace_id = campaign_load_balance.workspace_id and wm.user_id = auth.uid())
);
create policy "workspace_read_autopilot_rules" on public.scheduler_autopilot_rules for select using (
  workspace_id is null or exists (select 1 from public.workspace_members wm where wm.workspace_id = scheduler_autopilot_rules.workspace_id and wm.user_id = auth.uid())
);

-- ============================================================================
-- 11. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Additional indexes for common queries
create index if not exists idx_send_queue_priority_status on public.send_queue(priority desc, status, scheduled_at) where status = 'pending';
create index if not exists idx_campaigns_type_status on public.campaigns(campaign_type, status) where status in ('active', 'running');
create index if not exists idx_leads_timezone_city on public.leads(timezone, city, state);






































