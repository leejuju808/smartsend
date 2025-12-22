-- Update inbox_threads view to include lead_status for replied badge/filter

create or replace view public.inbox_threads as
with latest as (
  select em.thread_id, max(em.sent_at) as last_at
  from public.email_messages em
  group by em.thread_id
),
last_msg as (
  select distinct on (em.thread_id)
    em.thread_id, em.id as last_message_id, em.body_text, em.subject,
    em.direction, em.sent_at, em.lead_id
  from public.email_messages em
  order by em.thread_id, em.sent_at desc
),
unread as (
  select thread_id, count(*)::int as unread_count
  from public.email_messages
  where direction='in' and is_read=false
  group by thread_id
)
select
  l.thread_id,
  l.last_at,
  coalesce(u.unread_count, 0) as unread_count,
  lm.last_message_id,
  left(coalesce(lm.body_text, lm.subject, ''), 140) as last_snippet,
  lm.direction as last_direction,
  ld.id as lead_id,
  ld.email as lead_email,
  ld.first_name,
  ld.last_name,
  ld.company,
  ld.status as lead_status
from latest l
join last_msg lm on lm.thread_id = l.thread_id
join public.leads ld on ld.id = lm.lead_id
left join unread u on u.thread_id = l.thread_id
order by l.last_at desc;

