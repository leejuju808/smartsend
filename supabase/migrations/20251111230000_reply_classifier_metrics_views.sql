create or replace view public.v_daily_replies as
select
  date_trunc('day', created_at) as day,
  count(*)::int as replies_total,
  sum(case when meta ->> 'label' = 'out_of_office' then 1 else 0 end)::int as ooo_count,
  sum(case when meta ->> 'label' = 'human' then 1 else 0 end)::int as human_count
from public.delivery_events
where type = 'inbound_reply'
group by 1
order by 1 desc;

create or replace view public.v_review_corrections as
select
  date_trunc('day', r.decided_at) as day,
  count(*)::int as reviewed,
  sum(case when r.proposed_label <> r.decided_label then 1 else 0 end)::int as corrected,
  sum(
    case
      when r.proposed_label = 'out_of_office' and r.decided_label = 'human'
        then 1 else 0 end
  )::int as fp_ooo,
  sum(
    case
      when r.proposed_label = 'human' and r.decided_label = 'out_of_office'
        then 1 else 0 end
  )::int as fn_ooo
from public.reply_review_items r
where r.status = 'resolved'
group by 1
order by 1 desc;

create or replace view public.v_review_backlog as
select
  count(*)::int as open_count
from public.reply_review_items
where status = 'open';

create or replace view public.v_kpi_ooo_capture as
with win as (
  select *
  from public.delivery_events
  where type = 'inbound_reply'
    and created_at >= now() - interval '7 days'
)
select
  count(*)::int as replies_7d,
  sum(case when meta ->> 'label' = 'out_of_office' then 1 else 0 end)::int as ooo_7d,
  round(
    100.0 * nullif(
      sum(case when meta ->> 'label' = 'out_of_office' then 1 else 0 end),
      0
    ) / nullif(count(*), 0),
    1
  ) as ooo_pct_7d
from win;

create or replace view public.v_kpi_fp_rate as
with win as (
  select *
  from public.reply_review_items
  where status = 'resolved'
    and decided_at >= now() - interval '30 days'
)
select
  count(*)::int as reviewed_30d,
  sum(
    case
      when proposed_label = 'out_of_office' and decided_label = 'human'
        then 1 else 0 end
  )::int as fp_ooo_30d,
  round(
    100.0 * nullif(
      sum(
        case
          when proposed_label = 'out_of_office' and decided_label = 'human'
            then 1 else 0 end
      ),
      0
    ) / nullif(count(*), 0),
    1
  ) as fp_pct_30d
from win;






