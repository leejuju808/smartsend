-- Email Logs Campaign Link Migration
-- Links email_logs to campaign_recipients for tracking

-- 03_email_logs_link.sql
-- Link queue to existing email_logs used by dashboard badges
alter table public.email_logs
add column if not exists campaign_recipient_id uuid references public.campaign_recipients(id) on delete set null;

-- Add index for campaign_recipient_id lookups
create index if not exists email_logs_campaign_recipient_idx on public.email_logs (campaign_recipient_id);