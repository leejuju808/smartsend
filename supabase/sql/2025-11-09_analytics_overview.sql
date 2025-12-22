-- Helper view for campaign display names
create or replace view public.v_campaign_names as
select
  id as campaign_id,
  coalesce(name, ('Campaign ' || left(id::text, 8))) as campaign_name
from public.campaigns;

-- Org-wide KPIs with WoW deltas (membership-aware via underlying tables)
create or replace function public.get_overview_kpis(p_days int default 7)
returns table(
  sends int,
  replies int,
  reply_rate numeric,
  opens int,
  bounces int,
  send_delta int,
  reply_delta int,
  open_delta int,
  bounce_delta int,
  reply_rate_delta numeric
) language sql stable as $$
  with cur as (
    select
      (select count(*) from public.v_sends s
         where s.d >= now()::date - (p_days::int - 1)
           and public.is_campaign_viewer(s.campaign_id)) as sends,
      (select count(*) from public.v_inbound_replies r
         where r.d >= now()::date - (p_days::int - 1)
           and public.is_campaign_viewer(r.campaign_id)) as replies,
      (select count(*) from public.v_bounces b
         where b.d >= now()::date - (p_days::int - 1)
           and public.is_campaign_viewer(b.campaign_id)) as bounces,
      (select count(*) from public.v_opens o
         where o.d >= now()::date - (p_days::int - 1)
           and public.is_campaign_viewer(o.campaign_id)) as opens
  ),
  prev as (
    select
      (select count(*) from public.v_sends s
         where s.d between (now()::date - (p_days::int * 2 - 1)) and (now()::date - p_days::int)
           and public.is_campaign_viewer(s.campaign_id)) as sends,
      (select count(*) from public.v_inbound_replies r
         where r.d between (now()::date - (p_days::int * 2 - 1)) and (now()::date - p_days::int)
           and public.is_campaign_viewer(r.campaign_id)) as replies,
      (select count(*) from public.v_bounces b
         where b.d between (now()::date - (p_days::int * 2 - 1)) and (now()::date - p_days::int)
           and public.is_campaign_viewer(b.campaign_id)) as bounces,
      (select count(*) from public.v_opens o
         where o.d between (now()::date - (p_days::int * 2 - 1)) and (now()::date - p_days::int)
           and public.is_campaign_viewer(o.campaign_id)) as opens
  )
  select
    cur.sends,
    cur.replies,
    case when cur.sends > 0 then round((cur.replies::numeric / cur.sends) * 100, 2) else 0 end as reply_rate,
    cur.opens,
    cur.bounces,
    (cur.sends - prev.sends) as send_delta,
    (cur.replies - prev.replies) as reply_delta,
    (cur.opens - prev.opens) as open_delta,
    (cur.bounces - prev.bounces) as bounce_delta,
    (
      case when cur.sends > 0 then (cur.replies::numeric / cur.sends) else 0 end
      -
      case when prev.sends > 0 then (prev.replies::numeric / prev.sends) else 0 end
    ) * 100 as reply_rate_delta
  from cur, prev;
$$;

-- Per-campaign table with WoW deltas + last-active date (for sorting)
create or replace function public.get_overview_campaigns(p_days int default 7)
returns table(
  campaign_id uuid,
  campaign_name text,
  sends int,
  replies int,
  reply_rate numeric,
  opens int,
  bounces int,
  send_delta int,
  reply_delta int,
  reply_rate_delta numeric,
  last_activity date
) language sql stable as $$
  with cur as (
    select c.id as campaign_id,
           count(s.id)::int as sends,
           coalesce(sum(case when r.thread_id is not null then 1 else 0 end), 0)::int as replies,
           coalesce(sum(case when o.thread_id is not null then 1 else 0 end), 0)::int as opens,
           coalesce(sum(case when b.thread_id is not null then 1 else 0 end), 0)::int as bounces,
           max(greatest(s.d, r.d, o.d, b.d)) as last_activity
    from public.campaigns c
    left join public.v_sends s on s.campaign_id = c.id and s.d >= now()::date - (p_days::int - 1)
    left join public.v_inbound_replies r on r.campaign_id = c.id and r.d >= now()::date - (p_days::int - 1)
    left join public.v_opens o on o.campaign_id = c.id and o.d >= now()::date - (p_days::int - 1)
    left join public.v_bounces b on b.campaign_id = c.id and b.d >= now()::date - (p_days::int - 1)
    where public.is_campaign_viewer(c.id)
    group by 1
  ),
  prev as (
    select c.id as campaign_id,
           count(s.id)::int as sends,
           coalesce(sum(case when r.thread_id is not null then 1 else 0 end), 0)::int as replies
    from public.campaigns c
    left join public.v_sends s on s.campaign_id = c.id
       and s.d between (now()::date - (p_days::int * 2 - 1)) and (now()::date - p_days::int)
    left join public.v_inbound_replies r on r.campaign_id = c.id
       and r.d between (now()::date - (p_days::int * 2 - 1)) and (now()::date - p_days::int)
    where public.is_campaign_viewer(c.id)
    group by 1
  )
  select
    cur.campaign_id,
    n.campaign_name,
    cur.sends,
    cur.replies,
    case when cur.sends > 0 then round((cur.replies::numeric / cur.sends) * 100, 2) else 0 end as reply_rate,
    cur.opens,
    cur.bounces,
    (cur.sends - coalesce(prev.sends, 0)) as send_delta,
    (cur.replies - coalesce(prev.replies, 0)) as reply_delta,
    (
      (case when cur.sends > 0 then cur.replies::numeric / cur.sends else 0 end)
      -
      (case when coalesce(prev.sends, 0) > 0 then prev.replies::numeric / prev.sends else 0 end)
    ) * 100 as reply_rate_delta,
    cur.last_activity::date
  from cur
  left join prev using (campaign_id)
  left join public.v_campaign_names n using (campaign_id)
  order by reply_rate desc nulls last, sends desc nulls last;
$$;

-- 14-day mini series for sparklines (sends + replies)
create or replace function public.get_campaign_series_mini(p_campaign uuid, p_days int default 14)
returns table(
  d date,
  sends int,
  replies int
) language sql stable as $$
  with dates as (
    select generate_series((now()::date - (p_days::int - 1)), now()::date, interval '1 day')::date as d
  ),
  s as (
    select d, count(*)::int c
    from public.v_sends
    where campaign_id = p_campaign
    group by 1
  ),
  r as (
    select d, count(*)::int c
    from public.v_inbound_replies
    where campaign_id = p_campaign
    group by 1
  )
  select
    dates.d,
    coalesce(s.c, 0) as sends,
    coalesce(r.c, 0) as replies
  from dates
  left join s on s.d = dates.d
  left join r on r.d = dates.d
  order by dates.d asc;
$$;

