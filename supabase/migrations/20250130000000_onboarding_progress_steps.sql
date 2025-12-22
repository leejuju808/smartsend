-- Onboarding progress tracker with step-based approach
create table if not exists onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  step text not null check (step in ('import_leads', 'create_campaign', 'send_first')),
  completed boolean not null default false,
  created_at timestamptz default now()
);

-- Create unique index (which also enforces uniqueness)
create unique index if not exists idx_onboarding_user_step
  on onboarding_progress(user_id, step);

alter table onboarding_progress enable row level security;

drop policy if exists "Users can view own onboarding progress" on onboarding_progress;
create policy "Users can view own onboarding progress" on onboarding_progress
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can manage own onboarding progress" on onboarding_progress;
create policy "Users can manage own onboarding progress" on onboarding_progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

