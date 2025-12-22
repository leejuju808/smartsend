-- Add resume_on_reply toggle to campaigns table
-- When enabled, leads will automatically unpause when a reply is detected

alter table public.campaigns
  add column if not exists resume_on_reply boolean not null default true;

-- Update activity_logs constraint to include lead_resumed event type
alter table public.activity_logs
  drop constraint if exists activity_logs_event_type_check;

alter table public.activity_logs
  add constraint activity_logs_event_type_check
  check (event_type in (
    'campaign_launched','email_sent','email_failed','reply_detected','member_invited','member_role_changed',
    'campaign_paused','campaign_resumed','campaign_spike_autopause_toggled','lead_paused','lead_resumed',
    'campaign_resume_on_reply_toggled'
  ));

