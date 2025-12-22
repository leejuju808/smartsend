-- Daily aggregates for a campaign (based on outbound logs)
create or replace view v_campaign_daily as
select
  cl.campaign_id,
  date_trunc('day', cl.created_at)::date as day,
  count(*)::int as sent,
  coalesce(sum(case when cl.opens_count > 0 then 1 else 0 end),0)::int as unique_openers, -- per message
  coalesce(sum(case when cl.clicks_count > 0 then 1 else 0 end),0)::int as unique_clickers,
  coalesce(sum(cl.opens_count),0)::int as opens,
  coalesce(sum(cl.clicks_count),0)::int as clicks
from campaign_logs cl
group by cl.campaign_id, day;

-- Provider split for a campaign
create or replace view v_campaign_provider_split as
select
  campaign_id,
  provider,
  count(*)::int as sent,
  coalesce(sum(cl.opens_count),0)::int as opens,
  coalesce(sum(cl.clicks_count),0)::int as clicks
from campaign_logs cl
group by campaign_id, provider;