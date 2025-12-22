-- =========================================================
-- Block 16800 — SmartSend Trials & Onboarding v2
-- (The High-Conversion Roofer Onboarding Flow)
-- =========================================================

-- 1. Onboarding Progress Table
-- Tracks the 5-step onboarding flow progress
create table if not exists public.onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid, -- billing_account_id or workspace_id depending on your system
  
  -- Step tracking (1-5)
  current_step int not null default 1 check (current_step between 1 and 5),
  step_1_company_setup boolean default false,
  step_2_email_connected boolean default false,
  step_3_list_imported boolean default false,
  step_4_campaign_sent boolean default false,
  step_5_inspection_booked boolean default false,
  
  -- Completion tracking
  completed boolean default false,
  completed_at timestamptz,
  
  -- Progress metadata
  company_name text,
  company_city text,
  service_areas text[],
  logo_url text,
  owner_name text,
  
  -- Wins tracking (the 6 wins system)
  win_1_email_connected boolean default false,
  win_2_list_imported boolean default false,
  win_3_campaign_sent boolean default false,
  win_4_email_opened boolean default false,
  win_5_first_reply boolean default false,
  win_6_first_booking boolean default false,
  
  -- Checklist completion percentage
  checklist_percent int default 0 check (checklist_percent between 0 and 100),
  
  -- Metadata
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  unique(user_id)
);

create index if not exists idx_onboarding_progress_user on public.onboarding_progress(user_id);
create index if not exists idx_onboarding_progress_account on public.onboarding_progress(account_id);
create index if not exists idx_onboarding_progress_completed on public.onboarding_progress(completed);

-- Updated_at trigger
create or replace function public.set_onboarding_progress_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_onboarding_progress_updated_at
before update on public.onboarding_progress
for each row
execute function public.set_onboarding_progress_updated_at();

-- Function to calculate checklist_percent
create or replace function public.calculate_onboarding_checklist_percent()
returns trigger as $$
declare
  completed_count int := 0;
  total_steps int := 5;
begin
  if new.step_1_company_setup then completed_count := completed_count + 1; end if;
  if new.step_2_email_connected then completed_count := completed_count + 1; end if;
  if new.step_3_list_imported then completed_count := completed_count + 1; end if;
  if new.step_4_campaign_sent then completed_count := completed_count + 1; end if;
  if new.step_5_inspection_booked then completed_count := completed_count + 1; end if;
  
  new.checklist_percent := (completed_count * 100) / total_steps;
  
  -- Mark as completed if all steps done
  if completed_count = total_steps and not new.completed then
    new.completed := true;
    new.completed_at := now();
  end if;
  
  return new;
end;
$$ language plpgsql;

create trigger trg_calculate_onboarding_checklist_percent
before insert or update on public.onboarding_progress
for each row
execute function public.calculate_onboarding_checklist_percent();

-- 2. Trial Events Table
-- Tracks key events during trial to trigger conversion nudges
create table if not exists public.trial_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  
  event_type text not null check (
    event_type in (
      'email_connected',
      'list_imported',
      'campaign_sent',
      'email_opened',
      'email_replied',
      'inspection_booked',
      'logo_added',
      'domain_connected',
      'template_used',
      'first_48h_win'
    )
  ),
  
  event_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_trial_events_user on public.trial_events(user_id);
create index if not exists idx_trial_events_account on public.trial_events(account_id);
create index if not exists idx_trial_events_type on public.trial_events(event_type);
create index if not exists idx_trial_events_created on public.trial_events(created_at);

-- 3. Milestones Table
-- Tracks milestone achievements (the 6 wins)
create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  
  milestone_type text not null check (
    milestone_type in (
      'win_1_email_connected',
      'win_2_list_imported',
      'win_3_campaign_sent',
      'win_4_email_opened',
      'win_5_first_reply',
      'win_6_first_booking'
    )
  ),
  
  achieved_at timestamptz not null default now(),
  metadata jsonb default '{}'::jsonb,
  
  unique(user_id, milestone_type)
);

create index if not exists idx_milestones_user on public.milestones(user_id);
create index if not exists idx_milestones_account on public.milestones(account_id);
create index if not exists idx_milestones_type on public.milestones(milestone_type);

-- 4. Onboarding Recommendations Table
-- Stores AI-powered recommendations for templates, campaigns, etc.
create table if not exists public.onboarding_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  
  recommendation_type text not null check (
    recommendation_type in (
      'storm_campaign',
      'old_quote_revival',
      'neighborhood_outreach',
      'insurance_claim_prep',
      'template_suggestion',
      'list_suggestion',
      'timing_suggestion'
    )
  ),
  
  title text not null,
  description text,
  action_url text,
  template_id uuid,
  campaign_id uuid,
  
  -- Personalization data
  personalization_data jsonb default '{}'::jsonb,
  
  -- Priority and status
  priority int default 0,
  shown boolean default false,
  clicked boolean default false,
  dismissed boolean default false,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_onboarding_recommendations_user on public.onboarding_recommendations(user_id);
create index if not exists idx_onboarding_recommendations_account on public.onboarding_recommendations(account_id);
create index if not exists idx_onboarding_recommendations_type on public.onboarding_recommendations(recommendation_type);
create index if not exists idx_onboarding_recommendations_shown on public.onboarding_recommendations(shown, dismissed);

-- Updated_at trigger for recommendations
create trigger trg_onboarding_recommendations_updated_at
before update on public.onboarding_recommendations
for each row
execute function public.set_onboarding_progress_updated_at();

-- 5. Trial Nudges Table
-- Tracks automated nudges sent during trial
create table if not exists public.trial_nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  
  nudge_type text not null check (
    nudge_type in (
      'day_1_first_campaign',
      'day_2_storm_list_ready',
      'day_3_warm_leads',
      'day_4_scheduler_connect',
      'day_5_first_booking',
      'day_6_upgrade_reminder',
      'day_7_trial_ending'
    )
  ),
  
  sent_at timestamptz,
  sent_via text check (sent_via in ('in_app', 'email', 'both')),
  clicked boolean default false,
  converted boolean default false,
  
  created_at timestamptz not null default now()
);

create index if not exists idx_trial_nudges_user on public.trial_nudges(user_id);
create index if not exists idx_trial_nudges_account on public.trial_nudges(account_id);
create index if not exists idx_trial_nudges_type on public.trial_nudges(nudge_type);
create index if not exists idx_trial_nudges_sent on public.trial_nudges(sent_at);

-- Enable RLS
alter table public.onboarding_progress enable row level security;
alter table public.trial_events enable row level security;
alter table public.milestones enable row level security;
alter table public.onboarding_recommendations enable row level security;
alter table public.trial_nudges enable row level security;

-- RLS Policies
create policy "Users can read their own onboarding progress"
  on public.onboarding_progress
  for select
  using (user_id = auth.uid());

create policy "Users can update their own onboarding progress"
  on public.onboarding_progress
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can read their own trial events"
  on public.trial_events
  for select
  using (user_id = auth.uid());

create policy "Users can insert their own trial events"
  on public.trial_events
  for insert
  with check (user_id = auth.uid());

create policy "Users can read their own milestones"
  on public.milestones
  for select
  using (user_id = auth.uid());

create policy "Users can insert their own milestones"
  on public.milestones
  for insert
  with check (user_id = auth.uid());

create policy "Users can read their own recommendations"
  on public.onboarding_recommendations
  for select
  using (user_id = auth.uid());

create policy "Users can update their own recommendations"
  on public.onboarding_recommendations
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can read their own trial nudges"
  on public.trial_nudges
  for select
  using (user_id = auth.uid());

create policy "Users can update their own trial nudges"
  on public.trial_nudges
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Comments
comment on table public.onboarding_progress is 'Tracks 5-step onboarding flow progress and 6 wins system';
comment on table public.trial_events is 'Tracks key events during trial to trigger conversion nudges';
comment on table public.milestones is 'Tracks milestone achievements (the 6 wins)';
comment on table public.onboarding_recommendations is 'AI-powered recommendations for templates, campaigns, etc.';
comment on table public.trial_nudges is 'Tracks automated nudges sent during trial';





















































