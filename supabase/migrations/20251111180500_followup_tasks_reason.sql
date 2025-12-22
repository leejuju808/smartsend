-- Add reason column for tracking automated pauses on follow-up tasks
alter table public.followup_tasks
  add column if not exists reason text;






