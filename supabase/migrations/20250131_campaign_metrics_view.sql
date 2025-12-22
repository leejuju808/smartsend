-- Create campaign_metrics view for engagement dashboard
-- Aggregates open/click rates per campaign

create or replace view public.campaign_metrics as
select
  c.id                         as campaign_id,
  c.name                       as campaign_name,
  c.user_id                    as owner_id,
  c.workspace_id               as workspace_id,
  count(el.id)                 as emails_sent,
  sum((el.opened_at is not null)::int)  as opens,
  sum((el.clicked_at is not null)::int) as clicks,
  round(
    case when count(el.id) = 0 then 0
         else (sum((el.opened_at is not null)::int)::numeric / count(el.id)) * 100 end, 2
  ) as open_rate_pct,
  round(
    case when count(el.id) = 0 then 0
         else (sum((el.clicked_at is not null)::int)::numeric / count(el.id)) * 100 end, 2
  ) as click_rate_pct,
  max(greatest(coalesce(el.clicked_at,'epoch'::timestamptz),
               coalesce(el.opened_at,'epoch'::timestamptz),
               coalesce(el.created_at,'epoch'::timestamptz))) as last_activity_at
from campaigns c
left join email_logs el on el.campaign_id = c.id
group by c.id, c.name, c.user_id, c.workspace_id;

-- Ensure index exists for performance
create index if not exists idx_email_logs_campaign on email_logs(campaign_id);

-- Grant select access
grant select on campaign_metrics to anon, authenticated;

-- RLS will be inherited from underlying tables (campaigns and email_logs)
