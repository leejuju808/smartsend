-- Block 360 — Campaign Usage Breakdown v1
-- Top campaigns by sends/replies in last 30 days
-- Aggregates sends + replies per campaign over last 30 days

create or replace view campaign_usage_30d as
with sends as (
  select
    workspace_id,
    campaign_id,
    count(*)::integer as sends_30d
  from send_logs
  where sent_at >= (now() - interval '30 days')
    and workspace_id is not null
    and campaign_id is not null
  group by workspace_id, campaign_id
),
replies as (
  select
    workspace_id,
    campaign_id,
    count(*)::integer as replies_30d
  from reply_logs
  where coalesce(received_at, created_at) >= (now() - interval '30 days')
    and workspace_id is not null
    and campaign_id is not null
  group by workspace_id, campaign_id
)
select
  coalesce(s.workspace_id, r.workspace_id) as workspace_id,
  coalesce(s.campaign_id, r.campaign_id) as campaign_id,
  coalesce(s.sends_30d, 0)::integer as sends_30d,
  coalesce(r.replies_30d, 0)::integer as replies_30d
from sends s
full outer join replies r
  on s.workspace_id = r.workspace_id
  and s.campaign_id = r.campaign_id;

-- Grant access
grant select on campaign_usage_30d to service_role;
grant select on campaign_usage_30d to authenticated;





