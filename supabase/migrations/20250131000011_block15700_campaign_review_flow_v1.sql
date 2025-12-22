-- Block 15700 — Campaign Review & Send Flow v1
-- Adds activity_type column to campaign_activity for tracking campaign lifecycle events

-- Add activity_type column to campaign_activity table
alter table public.campaign_activity
  add column if not exists activity_type text check (
    activity_type in (
      'created',
      'edited',
      'reviewed',
      'scheduled',
      'sent',
      'paused',
      'completed'
    )
  );

-- Create index for faster queries by activity_type
create index if not exists idx_campaign_activity_type 
  on public.campaign_activity(campaign_id, activity_type);

comment on column public.campaign_activity.activity_type is 'Type of activity: created, edited, reviewed, scheduled, sent, paused, completed (Block 15700)';



























































