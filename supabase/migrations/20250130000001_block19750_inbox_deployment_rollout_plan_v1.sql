-- =========================================================
-- Block 19750 — Inbox Deployment & Rollout Plan v1
-- (Beta Release Timeline, User Access Control, Limited Trials, Safety Deployment Strategy)
-- =========================================================

-- PART 1: Feature Flags & Access Control
-- =========================================================

-- Add inbox feature flags to profiles table
alter table public.profiles
  add column if not exists inbox_enabled boolean default false,
  add column if not exists beta_access_level text check (beta_access_level in ('internal', 'alpha', 'beta', 'founders', 'public')) default 'public';

-- Create index for fast access level queries
create index if not exists idx_profiles_beta_access on public.profiles(beta_access_level, inbox_enabled);

-- Set default: Only internal users have inbox enabled initially
-- (You'll manually enable others during rollout)
update public.profiles 
set inbox_enabled = false, beta_access_level = 'public'
where inbox_enabled is null or beta_access_level is null;

-- PART 2: Rollout Tracking & Metrics
-- =========================================================

-- Track which users are in which rollout phase
create table if not exists public.inbox_rollout_tracking (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phase text not null check (phase in ('internal', 'alpha', 'beta', 'founders', 'public')),
  enrolled_at timestamptz not null default now(),
  enrolled_by uuid references auth.users(id), -- Who enabled them
  notes text, -- Manual notes about this tester
  onboarding_completed_at timestamptz,
  first_inbox_open_at timestamptz,
  first_reply_captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, phase)
);

create index if not exists idx_rollout_user on public.inbox_rollout_tracking(user_id);
create index if not exists idx_rollout_phase on public.inbox_rollout_tracking(phase, enrolled_at);

-- PART 3: Inbox Metrics Tracking
-- =========================================================

-- Daily metrics per user for inbox performance
create table if not exists public.inbox_rollout_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  
  -- Stability metrics
  replies_captured int not null default 0,
  orphaned_replies int not null default 0, -- Replies that couldn't be matched to threads
  ai_failures int not null default 0, -- AI classification failures
  thread_mismatches int not null default 0, -- Wrong thread assignment
  notification_failures int not null default 0,
  
  -- Speed metrics
  avg_inbox_load_ms numeric(10,2), -- Average inbox page load time
  avg_detail_load_ms numeric(10,2), -- Average thread detail load time
  realtime_lag_ms numeric(10,2), -- Average realtime update lag
  
  -- Usage metrics
  threads_opened int not null default 0,
  calls_from_inbox int not null default 0,
  estimates_booked int not null default 0,
  tasks_created int not null default 0,
  
  -- Sentiment (manual entry during check-ins)
  sentiment_score int check (sentiment_score between 1 and 5), -- 1=terrible, 5=excellent
  sentiment_notes text,
  
  -- Churn signals
  inbox_sessions int not null default 0,
  unopened_sessions int not null default 0, -- Sessions where inbox was never opened
  no_response_to_replies int not null default 0, -- User didn't respond to any replies
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists idx_metrics_user_date on public.inbox_rollout_metrics(user_id, date desc);
create index if not exists idx_metrics_date on public.inbox_rollout_metrics(date desc);

-- PART 4: Issue Response & Incident Logging
-- =========================================================

-- Track issues during rollout
create table if not exists public.inbox_rollout_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null, -- null = system-wide issue
  severity text not null check (severity in ('severity_1', 'severity_2', 'severity_3')),
  issue_type text not null check (issue_type in ('lead_missing', 'ui_bug', 'cosmetic', 'performance', 'ai_failure', 'integration_failure', 'other')),
  title text not null,
  description text not null,
  reported_at timestamptz not null default now(),
  reported_by uuid references auth.users(id),
  
  -- Resolution tracking
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'closed')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolution_notes text,
  root_cause text,
  fix_applied_at timestamptz,
  
  -- Impact
  affected_users_count int,
  fallback_triggered boolean default false,
  manual_recovery_required boolean default false,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_issues_status on public.inbox_rollout_issues(status, severity, reported_at desc);
create index if not exists idx_issues_user on public.inbox_rollout_issues(user_id, reported_at desc);
create index if not exists idx_issues_type on public.inbox_rollout_issues(issue_type, status);

-- PART 5: Inbox Event Logging (for monitoring dashboard)
-- =========================================================

-- Log all inbound events for monitoring
create table if not exists public.inbox_inbound_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('reply_received', 'thread_created', 'ai_classified', 'notification_sent', 'webhook_received', 'processing_error')),
  event_data jsonb not null default '{}'::jsonb,
  success boolean not null default true,
  error_message text,
  processing_time_ms int,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_user_time on public.inbox_inbound_events(user_id, created_at desc);
create index if not exists idx_events_type_time on public.inbox_inbound_events(event_type, created_at desc);
create index if not exists idx_events_success on public.inbox_inbound_events(success, created_at desc);

-- PART 6: Helper Functions
-- =========================================================

-- Function to check if user has inbox access
create or replace function public.has_inbox_access(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
security definer
as $$
declare
  v_access_level text;
  v_enabled boolean;
begin
  select beta_access_level, inbox_enabled
  into v_access_level, v_enabled
  from public.profiles
  where id = p_user_id;
  
  -- Must have inbox enabled AND be in an allowed access level
  if not v_enabled then
    return false;
  end if;
  
  -- Only internal, alpha, beta, and founders can access during rollout
  -- Public users will get access later
  return v_access_level in ('internal', 'alpha', 'beta', 'founders');
end;
$$;

-- Function to enroll user in a rollout phase
create or replace function public.enroll_inbox_beta(
  p_user_id uuid,
  p_phase text,
  p_enrolled_by uuid default auth.uid(),
  p_notes text default null
)
returns void
language plpgsql
security definer
as $$
begin
  -- Update profile
  update public.profiles
  set inbox_enabled = true,
      beta_access_level = p_phase
  where id = p_user_id;
  
  -- Track enrollment
  insert into public.inbox_rollout_tracking (user_id, phase, enrolled_by, notes)
  values (p_user_id, p_phase, p_enrolled_by, p_notes)
  on conflict (user_id, phase) do update
  set enrolled_by = excluded.enrolled_by,
      notes = excluded.notes,
      updated_at = now();
end;
$$;

-- Function to record inbox metrics
create or replace function public.record_inbox_metric(
  p_user_id uuid,
  p_metric_name text,
  p_value numeric default 1,
  p_date date default current_date
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.inbox_rollout_metrics (user_id, date, replies_captured)
  values (p_user_id, p_date, p_value::int)
  on conflict (user_id, date) do update
  set replies_captured = inbox_rollout_metrics.replies_captured + p_value::int,
      updated_at = now();
  
  -- Handle other metric types (simplified - you can expand this)
  case p_metric_name
    when 'threads_opened' then
      update public.inbox_rollout_metrics
      set threads_opened = threads_opened + p_value::int
      where user_id = p_user_id and date = p_date;
    when 'calls_from_inbox' then
      update public.inbox_rollout_metrics
      set calls_from_inbox = calls_from_inbox + p_value::int
      where user_id = p_user_id and date = p_date;
    when 'estimates_booked' then
      update public.inbox_rollout_metrics
      set estimates_booked = estimates_booked + p_value::int
      where user_id = p_user_id and date = p_date;
    when 'tasks_created' then
      update public.inbox_rollout_metrics
      set tasks_created = tasks_created + p_value::int
      where user_id = p_user_id and date = p_date;
  end case;
end;
$$;

-- Function to log inbound events
create or replace function public.log_inbox_event(
  p_user_id uuid,
  p_event_type text,
  p_event_data jsonb default '{}'::jsonb,
  p_success boolean default true,
  p_error_message text default null,
  p_processing_time_ms int default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_event_id uuid;
begin
  insert into public.inbox_inbound_events (
    user_id, event_type, event_data, success, error_message, processing_time_ms
  )
  values (
    p_user_id, p_event_type, p_event_data, p_success, p_error_message, p_processing_time_ms
  )
  returning id into v_event_id;
  
  return v_event_id;
end;
$$;

-- PART 7: Views for Monitoring Dashboard
-- =========================================================

-- View: Last 24 hours summary
create or replace view public.v_inbox_rollout_last_24h as
select
  count(distinct user_id) as active_users,
  count(*) filter (where event_type = 'reply_received') as replies_received,
  count(*) filter (where event_type = 'thread_created') as threads_created,
  count(*) filter (where success = false) as failures,
  avg(processing_time_ms) filter (where processing_time_ms is not null) as avg_processing_ms
from public.inbox_inbound_events
where created_at >= now() - interval '24 hours';

-- View: Hot leads captured today
create or replace view public.v_inbox_hot_leads_today as
select
  e.user_id,
  p.email,
  count(*) as hot_leads_count,
  max(e.created_at) as latest_capture
from public.inbox_inbound_events e
join public.profiles p on p.id = e.user_id
where e.event_type = 'reply_received'
  and e.event_data->>'lead_score'::text >= '80'
  and e.created_at >= current_date
group by e.user_id, p.email;

-- View: User-by-user breakdown
create or replace view public.v_inbox_rollout_user_summary as
select
  p.id as user_id,
  p.email,
  p.beta_access_level,
  rt.phase,
  rt.enrolled_at,
  rt.onboarding_completed_at,
  rt.first_inbox_open_at,
  rt.first_reply_captured_at,
  coalesce(m.replies_captured, 0) as total_replies,
  coalesce(m.threads_opened, 0) as total_threads_opened,
  coalesce(m.calls_from_inbox, 0) as total_calls,
  coalesce(m.estimates_booked, 0) as total_booked,
  coalesce(m.sentiment_score, 0) as sentiment_score,
  count(distinct i.id) filter (where i.status = 'open') as open_issues
from public.profiles p
left join public.inbox_rollout_tracking rt on rt.user_id = p.id
left join lateral (
  select * from public.inbox_rollout_metrics
  where user_id = p.id
  order by date desc
  limit 1
) m on true
left join public.inbox_rollout_issues i on i.user_id = p.id
where p.inbox_enabled = true
group by p.id, p.email, p.beta_access_level, rt.phase, rt.enrolled_at, 
         rt.onboarding_completed_at, rt.first_inbox_open_at, rt.first_reply_captured_at,
         m.replies_captured, m.threads_opened, m.calls_from_inbox, m.estimates_booked,
         m.sentiment_score;

-- PART 8: RLS Policies
-- =========================================================

-- Enable RLS on all new tables
alter table public.inbox_rollout_tracking enable row level security;
alter table public.inbox_rollout_metrics enable row level security;
alter table public.inbox_rollout_issues enable row level security;
alter table public.inbox_inbound_events enable row level security;

-- Users can only see their own rollout tracking
create policy "users_view_own_rollout_tracking" on public.inbox_rollout_tracking
  for select using (auth.uid() = user_id);

-- Users can only see their own metrics
create policy "users_view_own_metrics" on public.inbox_rollout_metrics
  for select using (auth.uid() = user_id);

-- Users can only see their own issues
create policy "users_view_own_issues" on public.inbox_rollout_issues
  for select using (auth.uid() = user_id or user_id is null); -- null = system-wide issues visible to all

-- Users can only see their own events
create policy "users_view_own_events" on public.inbox_inbound_events
  for select using (auth.uid() = user_id);

-- Service role can do everything (for internal monitoring)
-- (Service role bypasses RLS by default, so no policy needed)

-- Comments
comment on column public.profiles.inbox_enabled is 'Feature flag: Is inbox feature enabled for this user?';
comment on column public.profiles.beta_access_level is 'Beta access level: internal, alpha, beta, founders, or public';
comment on table public.inbox_rollout_tracking is 'Tracks which users are enrolled in which rollout phase';
comment on table public.inbox_rollout_metrics is 'Daily metrics per user for inbox performance during rollout';
comment on table public.inbox_rollout_issues is 'Issue tracking and incident response log';
comment on table public.inbox_inbound_events is 'Event log for monitoring dashboard - all inbound events';



















































