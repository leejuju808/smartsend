-- Add last_step_sent to campaign_contacts for per-step analytics
alter table if exists campaign_contacts
  add column if not exists last_step_sent int default 1;

