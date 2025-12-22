-- Campaign Metrics Helpers (Idempotent)
-- Run in Supabase SQL

-- 1A) 7-day metrics (compute on the fly; falls back to raw if daily table empty)
create or replace function public.campaign_metrics_last_7d(p_campaign uuid)
returns table(
  day date,
  sent int,
  opens int,
  clicks int,
  unsubscribes int,
  replies int
) language sql stable as $$
with days as (
  select generate_series((now() - interval '6 days')::date, now()::date, '1 day')::date as day
),
roll as (
  -- if you already have campaign_metrics_daily populated, use it
  select m.day, m.sent, m.opens, m.clicks, m.unsubscribes, m.replies
  from public.campaign_metrics_daily m
  where m.campaign_id = p_campaign
    and m.day between (now() - interval '6 days')::date and now()::date
),
raw as (
  select
    d.day,
    (select count(*) from public.send_logs l
      where l.campaign_id = p_campaign and l.created_at::date = d.day) as sent,
    (select count(*) from public.tracking_events te
      where te.campaign_id = p_campaign and te.kind='open' and te.created_at::date = d.day) as opens,
    (select count(*) from public.tracking_events te
      where te.campaign_id = p_campaign and te.kind='click' and te.created_at::date = d.day) as clicks,
    (select count(*) from public.tracking_events te
      where te.campaign_id = p_campaign and te.kind='unsubscribe' and te.created_at::date = d.day) as unsubscribes,
    (select count(*) from public.inbox_threads th
      where th.campaign_id = p_campaign and th.replied_at is not null and th.replied_at::date = d.day) as replies
  from days d
)
select d.day,
       coalesce(roll.sent, raw.sent, 0) as sent,
       coalesce(roll.opens, raw.opens, 0) as opens,
       coalesce(roll.clicks, raw.clicks, 0) as clicks,
       coalesce(roll.unsubscribes, raw.unsubscribes, 0) as unsubscribes,
       coalesce(roll.replies, raw.replies, 0) as replies
from days d
left join roll on roll.day = d.day
left join raw on raw.day = d.day
order by d.day;
$$;

-- 1B) 24h counters (Opens / Clicks / Unsubs / Sent / Replies)
create or replace function public.campaign_counters_24h(p_campaign uuid)
returns table(
  sent_24h int,
  opens_24h int,
  clicks_24h int,
  unsubs_24h int,
  replies_24h int
) language sql stable as $$
select
  (select count(*) from public.send_logs l
    where l.campaign_id = p_campaign and l.created_at >= now() - interval '24 hours') as sent_24h,
  (select count(*) from public.tracking_events te
    where te.campaign_id = p_campaign and te.kind='open' and te.created_at >= now() - interval '24 hours') as opens_24h,
  (select count(*) from public.tracking_events te
    where te.campaign_id = p_campaign and te.kind='click' and te.created_at >= now() - interval '24 hours') as clicks_24h,
  (select count(*) from public.tracking_events te
    where te.campaign_id = p_campaign and te.kind='unsubscribe' and te.created_at >= now() - interval '24 hours') as unsubs_24h,
  (select count(*) from public.inbox_threads th
    where th.campaign_id = p_campaign and th.replied_at is not null and th.replied_at >= now() - interval '24 hours') as replies_24h;
$$;

-- 1C) Top links (last 7 days)
create or replace function public.campaign_top_links_7d(p_campaign uuid, p_limit int default 10)
returns table(
  url text,
  clicks int
) language sql stable as $$
select te.url, count(*)::int as clicks
from public.tracking_events te
where te.campaign_id = p_campaign
  and te.kind = 'click'
  and te.created_at >= now() - interval '7 days'
  and te.url is not null
group by te.url
order by clicks desc
limit greatest(p_limit, 1);
$$;

-- Grant execute permissions (RLS note: these functions run under caller; 
-- your existing can_view_campaign(campaign_id) policy on tracking_events 
-- and thread access should allow reads for campaign members)
grant execute on function public.campaign_metrics_last_7d(uuid) to authenticated, service_role;
grant execute on function public.campaign_counters_24h(uuid) to authenticated, service_role;
grant execute on function public.campaign_top_links_7d(uuid, int) to authenticated, service_role;

