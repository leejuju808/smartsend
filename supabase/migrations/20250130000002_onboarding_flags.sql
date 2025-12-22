-- Block 8780 — First-Time Roofing Onboarding Flow
-- Add onboarding flags to profiles table

alter table public.profiles
add column if not exists onboarding_email_connected boolean default false,
add column if not exists onboarding_contact_set boolean default false,
add column if not exists onboarding_campaign_created boolean default false,
add column if not exists onboarding_leads_imported boolean default false,
add column if not exists onboarding_campaign_queued boolean default false;

-- Create index for better performance on onboarding queries
create index if not exists idx_profiles_onboarding_flags on public.profiles (
  onboarding_email_connected,
  onboarding_contact_set,
  onboarding_campaign_created,
  onboarding_leads_imported,
  onboarding_campaign_queued
);

























































