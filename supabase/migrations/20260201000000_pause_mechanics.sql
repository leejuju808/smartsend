-- Pause mechanics: campaign-level and per-lead controls
-- Allows manual pause/resume and auto-pause on failures

-- Campaign-level controls
alter table public.campaigns
  add column if not exists is_paused boolean not null default false,
  add column if not exists pause_reason text,
  add column if not exists pause_on_spike boolean not null default false,
  add column if not exists auto_pause_threshold int not null default 3;

-- Per-lead controls (scoped by campaign via campaign_leads)
alter table public.campaign_leads
  add column if not exists paused_at timestamptz,
  add column if not exists paused_by uuid references auth.users(id) on delete set null,
  add column if not exists pause_reason text;

-- Helpful indexes
create index if not exists idx_campaigns_paused on public.campaigns(is_paused);
create index if not exists idx_cleads_paused on public.campaign_leads(campaign_id, paused_at);

-- Update activity_logs to support new event types
alter table public.activity_logs
  drop constraint if exists activity_logs_event_type_check;

alter table public.activity_logs
  add constraint activity_logs_event_type_check
  check (event_type in (
    'campaign_launched','email_sent','email_failed','reply_detected','member_invited','member_role_changed',
    'campaign_paused','campaign_resumed','campaign_spike_autopause_toggled','lead_paused','lead_resumed'
  ));

-- RLS already handled by existing policies

