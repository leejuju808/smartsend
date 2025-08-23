-- Add onboarding column to profiles table
alter table public.profiles
  add column if not exists onboarding jsonb default '{}'::jsonb;

-- Create index for better performance on onboarding queries
create index if not exists idx_profiles_onboarding on public.profiles using gin (onboarding); 