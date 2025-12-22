-- Block 15600 — Roofer Fast-Start Onboarding v1
-- Profile → Contacts → First Campaign Live
-- "First win in under 30 minutes" block

-- 1. Add onboarding_state and onboarding_completed_at columns to workspaces table
alter table workspaces
  add column if not exists onboarding_state jsonb,
  add column if not exists onboarding_completed_at timestamptz;

-- 2. Set default onboarding_state for existing workspaces
update workspaces
set onboarding_state = '{"profile_done": false, "contacts_done": false, "first_campaign_done": false}'::jsonb
where onboarding_state is null;

-- 3. Create index for faster queries
create index if not exists idx_workspaces_onboarding_completed_at 
  on workspaces(onboarding_completed_at) 
  where onboarding_completed_at is null;



























































