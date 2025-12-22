-- Cross-Channel Analytics Dashboard
-- Creates views for aggregating performance metrics across Email, LinkedIn, WhatsApp, SMS

-- Add campaign_id to channel_messages if it doesn't exist
alter table channel_messages 
  add column if not exists campaign_id uuid;

-- Create index for campaign_id if it doesn't exist
create index if not exists idx_channel_messages_campaign 
  on channel_messages(campaign_id);

-- Channel Performance View
-- Aggregates sent, replies, and reply rate by channel
create or replace view channel_performance as
select
  channel,
  count(*) filter (where direction = 'outbound') as sent,
  count(*) filter (where direction = 'inbound') as replies,
  round(
    count(*) filter (where direction = 'inbound')::numeric /
    nullif(count(*) filter (where direction = 'outbound'),0) * 100, 2
  ) as reply_rate
from channel_messages
group by channel;

-- Campaign Performance View
-- Aggregates sent and replies by campaign and channel
create or replace view campaign_performance as
select
  c.id as campaign_id,
  c.name,
  cm.channel,
  count(cm.id) filter (where cm.direction='outbound') as sent,
  count(cm.id) filter (where cm.direction='inbound') as replies
from campaigns c
left join channel_messages cm on c.id = cm.campaign_id
group by c.id, c.name, cm.channel;

-- Grant access to authenticated users
grant select on channel_performance to authenticated;
grant select on campaign_performance to authenticated;

