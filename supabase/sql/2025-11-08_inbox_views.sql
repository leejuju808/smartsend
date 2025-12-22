create or replace view public.v_thread_summaries as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  max(m.sent_at) as last_message_at,
  max(m.id) filter (where m.direction = 'inbound') as last_inbound_id,
  max(m.id) filter (where m.direction = 'outbound') as last_outbound_id,
  bool_or(
    m.direction = 'inbound'
    and coalesce(m.ai_label, '') in ('human_reply', 'question', 'positive', 'neutral', 'routing')
  ) as has_reply
from public.inbox_threads t
left join public.normalized_messages m on m.linked_thread_id = t.id
group by t.id, t.campaign_id, t.lead_id;

create or replace view public.v_inbox_ui as
select
  v.thread_id,
  v.campaign_id,
  v.lead_id,
  l.email,
  l.first_name,
  l.last_name,
  v.last_message_at,
  v.has_reply,
  t.needs_reply,
  t.replied_at,
  case
    when v.has_reply and t.needs_reply then 'needs_review'
    when v.has_reply then 'auto_paused'
    when not v.has_reply and not t.needs_reply then 'idle'
    else 'active'
  end as state
from public.v_thread_summaries v
join public.inbox_threads t on t.id = v.thread_id
left join public.leads l on l.id = v.lead_id;


