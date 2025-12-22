create or replace view public.v_daily_replies as
select
  date_trunc('day', created_at) as day,
  count(*)::int as replies_total,
  coalesce(
    sum(case when coalesce(meta->>'label', '') = 'out_of_office' then 1 else 0 end),
    0
  )::int as ooo_count,
  coalesce(
    sum(case when coalesce(meta->>'label', '') = 'human' then 1 else 0 end),
    0
  )::int as human_count
from public.delivery_events
where type = 'inbound_reply'
group by 1;


create or replace view public.v_review_corrections as
select
  date_trunc('day', r.decided_at) as day,
  count(*)::int as reviewed,
  coalesce(
    sum(case when r.proposed_label <> r.decided_label then 1 else 0 end),
    0
  )::int as corrected,
  coalesce(
    sum(
      case
        when r.proposed_label = 'out_of_office' and r.decided_label = 'human' then 1
        else 0
      end
    ),
    0
  )::int as fp_ooo,
  coalesce(
    sum(
      case
        when r.proposed_label = 'human' and r.decided_label = 'out_of_office' then 1
        else 0
      end
    ),
    0
  )::int as fn_ooo
from public.reply_review_items r
where r.status = 'resolved'
group by 1;


create or replace view public.v_review_backlog as
select
  count(*)::int as open_count
from public.reply_review_items
where status = 'open';


create or replace view public.v_kpi_ooo_capture as
with win as (
  select *
  from public.delivery_events
  where
    type = 'inbound_reply'
    and created_at >= now() - interval '7 days'
),
agg as (
  select
    count(*)::int as replies_7d,
    coalesce(
      sum(case when coalesce(meta->>'label', '') = 'out_of_office' then 1 else 0 end),
      0
    )::int as ooo_7d
  from win
)
select
  replies_7d,
  ooo_7d,
  case
    when replies_7d > 0
      then round((ooo_7d::numeric / replies_7d) * 100, 1)
    else null
  end as ooo_pct_7d
from agg;


create or replace view public.v_kpi_fp_rate as
with win as (
  select *
  from public.reply_review_items
  where
    status = 'resolved'
    and decided_at >= now() - interval '30 days'
),
agg as (
  select
    count(*)::int as reviewed_30d,
    coalesce(
      sum(
        case
          when proposed_label = 'out_of_office' and decided_label = 'human' then 1
          else 0
        end
      ),
      0
    )::int as fp_ooo_30d
  from win
)
select
  reviewed_30d,
  fp_ooo_30d,
  case
    when reviewed_30d > 0
      then round((fp_ooo_30d::numeric / reviewed_30d) * 100, 1)
    else null
  end as fp_pct_30d
from agg;

