-- Block 190 — New Account Onboarding Flow
-- Creates onboarding_state table to track user onboarding progress

create table if not exists public.onboarding_state (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,

  step text not null default 'start'
    check (
      step in (
        'start',
        'workspace',
        'email_connect',
        'import_leads',
        'create_segment',
        'create_smartlist',
        'create_campaign',
        'review',
        'complete'
      )
    ),

  completed boolean default false,
  meta jsonb default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  
  unique(user_id)
);

-- Create index for faster lookups
create index if not exists idx_onboarding_state_user on public.onboarding_state(user_id);
create index if not exists idx_onboarding_state_account on public.onboarding_state(account_id);

-- Create updated_at trigger
create or replace function public.set_onboarding_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_onboarding_state_updated_at
before update on public.onboarding_state
for each row
execute function public.set_onboarding_updated_at();

-- Enable RLS
alter table public.onboarding_state enable row level security;

-- RLS policies
create policy "Users can read their own onboarding state"
  on public.onboarding_state
  for select
  using (user_id = auth.uid());

create policy "Users can update their own onboarding state"
  on public.onboarding_state
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Add comment for documentation
comment on table public.onboarding_state is 'Tracks user onboarding progress through the guided setup wizard';
comment on column public.onboarding_state.step is 'Current step in the onboarding flow';
comment on column public.onboarding_state.meta is 'Additional metadata stored as JSON (e.g., workspace_id, segment_id, etc.)';












