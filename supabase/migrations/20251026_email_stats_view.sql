-- Email Stats View by Campaign
-- Provides fast aggregated statistics for campaign email activity

create or replace view email_stats_by_campaign as
select
  campaign_id,
  count(*)                           as total_events,
  count(*) filter (where status='sent')      as sent,
  count(*) filter (where status='delivered') as delivered,
  count(*) filter (where status='opened')    as opened,
  count(*) filter (where status='replied')   as replied,
  date_trunc('day', coalesce(timestamp, created_at)) as day
from email_logs
where campaign_id is not null
group by campaign_id, date_trunc('day', coalesce(timestamp, created_at));

-- Add index for better performance
create index if not exists email_logs_campaign_timestamp_idx 
  on email_logs(campaign_id, coalesce(timestamp, created_at))
  where campaign_id is not null; 