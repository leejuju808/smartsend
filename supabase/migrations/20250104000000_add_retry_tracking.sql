-- Add retry tracking columns to campaign_send_queue
-- Track lineage + retry attempts for failed items

alter table campaign_send_queue
  add column if not exists retried_from uuid references campaign_send_queue(id) on delete set null,
  add column if not exists retry_count int not null default 0;

create index if not exists idx_send_queue_failed_campaign
  on campaign_send_queue (campaign_id, status)
  where status = 'failed';

-- Add metadata column for retry info (if not exists)
alter table campaign_send_queue
  add column if not exists metadata jsonb default '{}';
