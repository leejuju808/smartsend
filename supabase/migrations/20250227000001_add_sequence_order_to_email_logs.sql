-- Add sequence_order to email_logs to track which sequence email was sent
-- This allows the auto-followup engine to know which email in the sequence was last sent

alter table public.email_logs
  add column if not exists sequence_order int default 1;

-- Create index for efficient queries
create index if not exists idx_email_logs_lead_campaign_sequence 
  on public.email_logs(lead_id, campaign_id, sequence_order);

