-- 1) SQL — history view (idempotent)

create or replace view public.v_nudge_history as
select
  na.thread_id,
  na.queue_id,
  na.variant_id,
  v.name as variant_name,
  v.scenario,
  v.tone,
  v.subject,
  v.body,
  q.created_at as queued_at,
  q.sent_at,                  -- if you track this on send_queue; else null
  q.status as queue_status,   -- 'draft' | 'queued' | 'sent' | 'failed' | ...
  de.event_type as delivery_event,      -- 'delivered','bounced','opened','clicked',...
  de.event_at  as delivery_event_at,
  rcv.ai_label as reply_label,          -- from normalized_messages, your AI label
  rcv.sent_at  as reply_at,             -- time of the first qualifying inbound
  rcv.id       as reply_message_id
from public.nudge_assignments na
join public.send_queue q on q.id = na.queue_id
left join public.nudge_variants v on v.id = na.variant_id
left join lateral (
  select d.event_type, d.event_at
  from public.delivery_events d
  where d.queue_id = na.queue_id
  order by d.event_at desc
  limit 1
) de on true
left join lateral (
  select nm.id, nm.sent_at, nm.ai_label
  from public.normalized_messages nm
  where nm.linked_thread_id = na.thread_id
    and nm.direction = 'inbound'
    and nm.sent_at > coalesce(q.sent_at, q.created_at)
    and coalesce(nm.ai_label, '') in ('human_reply','question','positive','neutral','routing')
  order by nm.sent_at asc
  limit 1
) rcv on true;

create index if not exists idx_v_nudge_history_thread on public.nudge_assignments(thread_id);

-- 2) RPC — fetch history for one thread (idempotent)

create or replace function public.nudge_history_for_thread(p_thread_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'queue_id', queue_id,
        'variant_id', variant_id,
        'variant_name', variant_name,
        'scenario', scenario,
        'tone', tone,
        'subject', subject,
        'queued_at', queued_at,
        'sent_at', sent_at,
        'queue_status', queue_status,
        'delivery_event', delivery_event,
        'delivery_event_at', delivery_event_at,
        'reply_label', reply_label,
        'reply_at', reply_at
      )
      order by queued_at desc nulls last
    ),
    '[]'::jsonb
  )
  from public.v_nudge_history
  where thread_id = p_thread_id
$$;

