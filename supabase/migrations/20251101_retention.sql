-- Block 17: Retention Levers (NPS, Churn Guard, Win-back)
-- This migration creates tables and views for customer retention

-- ============================================================================
-- 1. NPS System
-- ============================================================================

-- NPS responses table
create table if not exists public.nps_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score int not null check (score between 0 and 10),
  feedback text,
  context jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  response_date date generated always as (created_at::date) stored -- Computed date column
);

-- One response per day per org
create unique index if not exists nps_responses_org_date_uidx 
  on public.nps_responses(org_id, response_date);

create index if not exists idx_nps_org_created on public.nps_responses(org_id, created_at desc);
create index if not exists idx_nps_user_created on public.nps_responses(user_id, created_at desc);

-- Enable RLS
alter table public.nps_responses enable row level security;

create policy "Users can view own NPS responses"
  on public.nps_responses
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own NPS responses"
  on public.nps_responses
  for insert
  with check (auth.uid() = user_id);

-- ============================================================================
-- 2. Churn Guard Events (Audit Table)
-- ============================================================================

-- Churn guard audit events
create table if not exists public.churn_guard_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  event_type text not null,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_churn_guard_org on public.churn_guard_events(org_id, created_at desc);
create index if not exists idx_churn_guard_type on public.churn_guard_events(event_type);

-- Enable RLS
alter table public.churn_guard_events enable row level security;

create policy "Users can view events for their orgs"
  on public.churn_guard_events
  for select
  using (
    exists (
      select 1 from public.orgs
      where orgs.id = churn_guard_events.org_id
      and orgs.owner_id = auth.uid()
    )
  );

-- Service role can insert events (from webhooks/cron)
create policy "Service role can insert events"
  on public.churn_guard_events
  for insert
  with check (true);

revoke insert on public.churn_guard_events from authenticated;

-- ============================================================================
-- 3. Win-Back Queue
-- ============================================================================

-- Win-back queue for drip campaigns
create table if not exists public.winback_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  stage int not null check (stage in (1, 2, 3)), -- 7, 21, 45 days
  scheduled_for date not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_winback_scheduled on public.winback_queue(scheduled_for, sent_at) 
  where sent_at is null;

-- Enable RLS
alter table public.winback_queue enable row level security;

create policy "Service role can manage winback queue"
  on public.winback_queue
  for all
  using (true);

revoke all on public.winback_queue from authenticated, anon;

-- ============================================================================
-- 4. Retention Metrics View
-- ============================================================================

create or replace view public.view_retention_metrics as
select
  orgs.id as org_id,
  orgs.name as org_name,
  
  -- NPS metrics
  (select avg(score) from public.nps_responses where org_id = orgs.id) as nps_avg_score,
  (select score from public.nps_responses where org_id = orgs.id order by created_at desc limit 1) as nps_latest_score,
  (select count(*) from public.nps_responses where org_id = orgs.id) as nps_response_count,
  
  -- Churn risk indicators
  (select count(*) from public.churn_guard_events 
   where org_id = orgs.id 
   and event_type = 'churn_risk_high') as churn_risk_count,
  (select count(*) from public.churn_guard_events 
   where org_id = orgs.id 
   and event_type = 'winback_sent') as winback_sent_count,
  
  -- Recent activity
  (select max(created_at) from public.churn_guard_events where org_id = orgs.id) as last_churn_event_at,
  
  orgs.created_at as org_created_at

from public.orgs;

grant select on public.view_retention_metrics to authenticated, service_role;

-- ============================================================================
-- 5. Helper Functions
-- ============================================================================

-- Function to check if NPS should be shown
create or replace function public.fn_should_show_nps(p_org_id uuid)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  has_recent_response boolean;
  is_active boolean;
begin
  -- Check if user has responded in last 30 days
  select exists (
    select 1 from public.nps_responses
    where org_id = p_org_id
    and created_at > now() - interval '30 days'
  ) into has_recent_response;
  
  -- Check if org is active (has activity in last 7 days)
  -- This assumes you have a way to track activity
  select exists (
    select 1 from public.orgs
    where id = p_org_id
    and created_at > now() - interval '7 days'
  ) into is_active;
  
  -- Show if no recent response AND org is active
  return not has_recent_response and is_active;
end;
$$;

grant execute on function public.fn_should_show_nps(uuid) to authenticated, service_role;

-- Function to insert NPS response
create or replace function public.fn_submit_nps(
  p_org_id uuid,
  p_score int,
  p_feedback text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  response_id uuid;
begin
  -- Insert response
  insert into public.nps_responses (org_id, user_id, score, feedback)
  values (p_org_id, auth.uid(), p_score, p_feedback)
  returning id into response_id;
  
  -- Record churn guard event
  insert into public.churn_guard_events (org_id, event_type, payload)
  values (
    p_org_id,
    'nps_submitted',
    jsonb_build_object('score', p_score)
  );
  
  return response_id;
end;
$$;

grant execute on function public.fn_submit_nps(uuid, int, text) to authenticated;

-- Function to classify NPS scores
create or replace function public.fn_classify_nps(p_score int)
returns text
language sql
immutable
as $$
  select case
    when p_score >= 9 then 'promoter'
    when p_score >= 7 then 'passive'
    else 'detractor'
  end;
$$;

grant execute on function public.fn_classify_nps(int) to authenticated;

-- ============================================================================
-- 6. Auto-calculate NPS metric
-- ============================================================================

-- Update retention metrics view with NPS classification
create or replace view public.view_retention_metrics as
select
  orgs.id as org_id,
  orgs.name as org_name,
  
  -- NPS metrics
  (select avg(score) from public.nps_responses where org_id = orgs.id) as nps_avg_score,
  (select score from public.nps_responses where org_id = orgs.id order by created_at desc limit 1) as nps_latest_score,
  (select count(*) from public.nps_responses where org_id = orgs.id) as nps_response_count,
  
  -- NPS classification
  (select count(*) from public.nps_responses where org_id = orgs.id and score >= 9) as promoters,
  (select count(*) from public.nps_responses where org_id = orgs.id and score >= 7 and score <= 8) as passives,
  (select count(*) from public.nps_responses where org_id = orgs.id and score < 7) as detractors,
  
  -- Churn risk indicators
  (select count(*) from public.churn_guard_events 
   where org_id = orgs.id 
   and event_type = 'churn_risk_high') as churn_risk_count,
  (select count(*) from public.churn_guard_events 
   where org_id = orgs.id 
   and event_type = 'winback_sent') as winback_sent_count,
  
  -- Recent activity
  (select max(created_at) from public.churn_guard_events where org_id = orgs.id) as last_churn_event_at,
  
  orgs.created_at as org_created_at

from public.orgs;

comment on view public.view_retention_metrics is 'Retention metrics including NPS, churn risk, and winback activity';

