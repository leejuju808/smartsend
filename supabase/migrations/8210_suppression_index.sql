-- 8210 - Index for campaign/email/status suppression updates

create index if not exists idx_campaign_send_queue_campaign_email_status
  on public.campaign_send_queue (campaign_id, to_email, status);







