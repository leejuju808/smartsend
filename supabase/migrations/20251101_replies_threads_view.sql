-- Latest message per thread, per team

create or replace view email_threads as
with ranked as (
  select
    team_id,
    coalesce(thread_id, message_id) as thread_id, -- fall back if provider has no thread id
    campaign_id,
    lead_id,
    max(received_at) as last_message_at
  from email_messages
  group by 1,2,3,4
),
latest as (
  select em.*
  from email_messages em
  join ranked r
    on r.team_id = em.team_id
   and coalesce(r.thread_id, r.message_id) = coalesce(em.thread_id, em.message_id)
   and r.last_message_at = em.received_at
)
select
  l.team_id,
  coalesce(l.thread_id, l.message_id) as thread_id,
  l.campaign_id,
  l.lead_id,
  l.subject,
  left(coalesce(l.body_text, ''), 180) as preview,
  l.classification_label,
  l.human_reply,
  l.from_email,
  l.to_email,
  l.received_at as last_message_at
from latest l;

-- Make it selectable under RLS via the base table policy
-- (Views inherit the policies of underlying tables; ensure email_messages SELECT already guarded by is_team_member)

