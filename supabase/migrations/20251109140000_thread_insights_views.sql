-- Thread insights rollups and timeline views
create or replace view public.v_thread_stats as
with
  sends as (
    select
      linked_thread_id as thread_id,
      count(*) as sent_count,
      max(sent_at) as last_sent_at
    from public.normalized_messages
    where direction = 'outbound'
    group by 1
  ),
  inbounds as (
    select
      linked_thread_id as thread_id,
      count(*) as inbound_count,
      count(*) filter (
        where coalesce(ai_label, '') in ('human_reply', 'question', 'positive', 'neutral', 'routing')
      ) as replies_count,
      max(sent_at) filter (where direction = 'inbound') as last_inbound_at
    from public.normalized_messages
    group by 1
  ),
  opens as (
    select
      t.thread_id,
      count(*) as opens,
      max(e.created_at) as last_open_at
    from public.tracking_events e
    join public.outbox_requests t on t.id = e.outbox_id
    where e.kind = 'opened'
    group by 1
  ),
  clicks as (
    select
      t.thread_id,
      count(*) as clicks,
      max(e.created_at) as last_click_at
    from public.tracking_events e
    join public.outbox_requests t on t.id = e.outbox_id
    where e.kind = 'clicked'
    group by 1
  ),
  nudges as (
    select
      thread_id,
      count(*) filter (where status in ('drafted', 'sent')) as nudges_done,
      max(created_at) as last_nudge_at
    from public.followup_tasks
    group by 1
  ),
  bounces as (
    select
      linked_thread_id as thread_id,
      count(*) as bounces
    from public.normalized_messages
    where direction = 'outbound'
      and coalesce(ai_label, '') = 'bounce'
    group by 1
  )
select
  th.id as thread_id,
  th.campaign_id,
  th.lead_id,
  coalesce(s.sent_count, 0) as sent_count,
  coalesce(i.inbound_count, 0) as inbound_count,
  coalesce(i.replies_count, 0) as replies_count,
  coalesce(o.opens, 0) as opens,
  coalesce(c.clicks, 0) as clicks,
  coalesce(n.nudges_done, 0) as nudges_done,
  coalesce(b.bounces, 0) as bounces,
  s.last_sent_at,
  i.last_inbound_at,
  o.last_open_at,
  c.last_click_at,
  n.last_nudge_at
from public.inbox_threads th
left join sends s on s.thread_id = th.id
left join inbounds i on i.thread_id = th.id
left join opens o on o.thread_id = th.id
left join clicks c on c.thread_id = th.id
left join nudges n on n.thread_id = th.id
left join bounces b on b.thread_id = th.id;

create or replace view public.v_thread_timeline as
select
  nm.linked_thread_id as thread_id,
  nm.sent_at as occurred_at,
  case
    when nm.direction = 'outbound' then 'message_out'
    else 'message_in'
  end as kind,
  jsonb_build_object(
    'message_id', nm.id,
    'direction', nm.direction,
    'subject', nm.subject,
    'snippet', left(coalesce(nm.body, ''), 280),
    'ai_label', nm.ai_label,
    'sender', nm.sender_email,
    'recipient', nm.recipient_email
  ) as payload
from public.normalized_messages nm
union all
select
  de.thread_id,
  de.created_at as occurred_at,
  'delivery' as kind,
  jsonb_build_object(
    'event', de.event,
    'provider', de.provider,
    'provider_message_id', de.provider_message_id,
    'meta', coalesce(de.meta, '{}'::jsonb)
  ) as payload
from public.delivery_events de
union all
select
  e.thread_id,
  e.created_at as occurred_at,
  case
    when e.kind = 'opened' then 'open'
    else 'click'
  end as kind,
  jsonb_build_object(
    'link_id', e.link_id,
    'outbox_id', e.outbox_id,
    'ua', e.ua,
    'ip', e.ip,
    'meta', coalesce(e.meta, '{}'::jsonb)
  ) as payload
from public.tracking_events e
union all
select
  t.thread_id,
  t.created_at as occurred_at,
  'nudge_task' as kind,
  jsonb_build_object(
    'status', t.status,
    'reason', t.reason,
    'draft_id', t.draft_id,
    'message_id', t.message_id
  ) as payload
from public.followup_tasks t;




