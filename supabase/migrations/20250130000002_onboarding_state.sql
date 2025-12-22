-- Block 21675 — SmartSend Roofing Onboarding Flow v1
-- Onboarding State Table for tracking user progress through onboarding

create table if not exists onboarding_state (
  user_id uuid primary key references profiles(id) on delete cascade,
  current_step text not null default 'welcome',
  completed boolean not null default false,
  updated_at timestamptz default now()
);

-- Create index for faster lookups
create index if not exists idx_onboarding_state_user_id on onboarding_state(user_id);
create index if not exists idx_onboarding_state_completed on onboarding_state(completed);

-- Enable RLS
alter table onboarding_state enable row level security;

-- RLS policies: users can read and update their own onboarding state
create policy "onboarding_state_select_own" on onboarding_state
  for select using (auth.uid() = user_id);

create policy "onboarding_state_update_own" on onboarding_state
  for update using (auth.uid() = user_id);

create policy "onboarding_state_insert_own" on onboarding_state
  for insert with check (auth.uid() = user_id);

-- Function to update updated_at timestamp
create or replace function update_onboarding_state_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to auto-update updated_at
create trigger trg_onboarding_state_updated_at
before update on onboarding_state
for each row
execute function update_onboarding_state_updated_at();














































