create or replace view public.v_nudge_variant_metrics as
with variants as (
  select
    v.id as variant_id,
    v.campaign_id,
    v.scenario,
    v.tone,
    v.name,
    v.subject,
    v.weight,
    v.is_active
  from public.nudge_variants v
),
assignments as (
  select
    na.variant_id,
    count(*)::bigint as total_sent
  from public.nudge_assignments na
  group by na.variant_id
),
delivery_stats as (
  select
    na.variant_id,
    count(*) filter (where de.event_type = 'delivered')::bigint as delivered_count,
    count(*) filter (where de.event_type = 'bounced')::bigint as bounced_count
  from public.nudge_assignments na
  join public.send_queue q on q.id = na.queue_id
  join public.delivery_events de on de.queue_id = q.id
  group by na.variant_id
),
reply_stats as (
  select
    na.variant_id,
    count(distinct nm.id) filter (
      where nm.direction = 'inbound'
        and nm.ai_label in ('human_reply','question','positive','neutral','routing')
    )::bigint as total_replies,
    count(distinct nm.id) filter (
      where nm.direction = 'inbound'
        and nm.ai_label = 'positive'
    )::bigint as positive_replies
  from public.nudge_assignments na
  join public.normalized_messages nm on nm.linked_thread_id = na.thread_id
  group by na.variant_id
)
select
  v.variant_id,
  v.campaign_id,
  v.scenario,
  v.tone,
  v.name,
  v.subject,
  v.weight,
  v.is_active,
  coalesce(a.total_sent, 0)::bigint as total_sent,
  coalesce(d.delivered_count, 0)::bigint as delivered_count,
  coalesce(d.bounced_count, 0)::bigint as bounced_count,
  coalesce(r.total_replies, 0)::bigint as total_replies,
  coalesce(r.positive_replies, 0)::bigint as positive_replies,
  case
    when coalesce(a.total_sent, 0) > 0
      then round(100.0 * coalesce(r.total_replies, 0) / coalesce(a.total_sent, 0), 2)
    else 0
  end as reply_rate,
  case
    when coalesce(a.total_sent, 0) > 0
      then round(100.0 * coalesce(r.positive_replies, 0) / coalesce(a.total_sent, 0), 2)
    else 0
  end as positive_rate,
  case
    when (coalesce(d.delivered_count, 0) + coalesce(d.bounced_count, 0)) > 0
      then round(
        100.0 * coalesce(d.delivered_count, 0) /
        (coalesce(d.delivered_count, 0) + coalesce(d.bounced_count, 0)),
        2
      )
    else 0
  end as delivery_rate
from variants v
left join assignments a on a.variant_id = v.variant_id
left join delivery_stats d on d.variant_id = v.variant_id
left join reply_stats r on r.variant_id = v.variant_id;


create or replace function public.nudge_variant_metrics_for_campaign(p_campaign_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'variant_id', variant_id,
        'scenario', scenario,
        'tone', tone,
        'name', name,
        'subject', subject,
        'weight', weight,
        'is_active', is_active,
        'total_sent', total_sent,
        'reply_rate', reply_rate,
        'positive_rate', positive_rate,
        'delivery_rate', delivery_rate
      )
      order by scenario, tone, name
    ),
    '[]'::jsonb
  )
  from public.v_nudge_variant_metrics
  where campaign_id = p_campaign_id
$$;

