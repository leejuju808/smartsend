-- SQL views fix + safety
-- Re-create normalized weights to order by created_at for stability

create or replace function public.normalized_variant_weights(p_campaign uuid, p_step int)
returns table(variant_id uuid, weight numeric)
language sql stable as $$
  with v as (
    select id, weight, created_at
    from public.campaign_step_variants
    where campaign_id = p_campaign and step_no = p_step and enabled
    order by created_at asc
  ), s as (select sum(weight) as sw from v)
  select id as variant_id,
         case when s.sw = 0
           then 1.0 / nullif(count(*) over (),0)
           else weight / s.sw
         end as weight
  from v, s
$$;

-- v_variant_funnel: ensure left joins all the way so zeros don't disappear
create or replace view public.v_variant_funnel as
with s as (
  select sl.id, sl.campaign_id, sl.step_no, sl.variant_id
  from public.send_logs sl
),
e as (
  select send_log_id,
         min(created_at) filter (where type='open')  as first_open_at,
         min(created_at) filter (where type='click') as first_click_at
  from public.tracking_events
  group by 1
),
r as (
  select sl.id as send_log_id,
         min(m.created_at) as first_reply_at
  from public.send_logs sl
  join public.inbox_threads t on t.campaign_id = sl.campaign_id and t.lead_id = sl.lead_id
  join public.inbox_messages m on m.thread_id = t.id and m.direction='inbound'
  where m.created_at >= sl.created_at
  group by 1
)
select
  s.campaign_id, s.step_no, s.variant_id,
  count(*)                                        as sent,
  count(*) filter (where e.first_open_at  is not null) as opens,
  count(*) filter (where e.first_click_at is not null) as clicks,
  count(*) filter (where r.first_reply_at is not null) as replies
from s
left join e on e.send_log_id = s.id
left join r on r.send_log_id = s.id
group by 1,2,3
order by 1,2;

