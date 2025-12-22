-- Block 191.1 — Add onboarding_step column to workspaces table

alter table public.workspaces
add column if not exists onboarding_step text default 'welcome';

-- Add check constraint for valid values
alter table public.workspaces
drop constraint if exists workspaces_onboarding_step_check;

alter table public.workspaces
add constraint workspaces_onboarding_step_check
check (onboarding_step in ('welcome', 'connect_email', 'first_upload', 'map_columns', 'import_preview', 'finished'));

-- Create index for faster lookups
create index if not exists idx_workspaces_onboarding_step on public.workspaces(onboarding_step);











