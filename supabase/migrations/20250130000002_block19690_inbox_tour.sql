-- =========================================================
-- Block 19690 — Owner Inbox Tour & First-Login Setup v1
-- (Guided Tour, Sample Data, "Your Inbox Is Now Live" Experience)
-- =========================================================

-- Add tour tracking fields to profiles table
alter table public.profiles 
  add column if not exists has_seen_inbox_tour boolean default false,
  add column if not exists inbox_demo_dismissed boolean default false;

-- Add comments for documentation
comment on column public.profiles.has_seen_inbox_tour is 'Whether the user has completed the inbox guided tour';
comment on column public.profiles.inbox_demo_dismissed is 'Whether the user has dismissed the demo/sample data view';



















































