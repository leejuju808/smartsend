-- =========================================================
-- Block 8510 — Campaign Performance View (Which Campaign Is Making Money?)
-- =========================================================
-- This view shows which campaigns are actually working:
-- - Replies received
-- - Leads generated  
-- - Estimated job value
-- =========================================================

create or replace view public.campaign_performance as
with sends as (
  select
    campaign_id,
    count(*) as total_sends
  from public.outbound_emails
  where status = 'sent'
  group by campaign_id
),
replies as (
  select
    campaign_id,
    count(*) as total_replies,
    sum(case when intent_label = 'hot' then 1 else 0 end) as hot_replies
  from public.inbound_replies
  group by campaign_id
),
lead_agg as (
  select
    campaign_id,
    count(*) as total_leads,
    coalesce(sum(estimated_job_value), 0) as total_estimated_value
  from public.leads
  where status in ('open', 'in_progress')
    and campaign_id is not null
  group by campaign_id
)
select
  c.id::uuid                             as campaign_id,
  c.name                                 as campaign_name,
  c.created_at                           as created_at,
  coalesce(s.total_sends, 0)             as total_sends,
  coalesce(r.total_replies, 0)           as total_replies,
  coalesce(r.hot_replies, 0)             as hot_replies,
  coalesce(l.total_leads, 0)             as total_leads,
  coalesce(l.total_estimated_value, 0)   as open_pipeline_value
from public.campaigns c
left join sends s on s.campaign_id = c.id
left join replies r on r.campaign_id = c.id
left join lead_agg l on l.campaign_id = c.id;

-- Grant access
grant select on public.campaign_performance to authenticated, anon;

-- Add comment
comment on view public.campaign_performance is 
  'Campaign performance metrics: sends, replies, hot replies, leads, and open pipeline value';

























































