-- =========================================================
-- Block 8450 — Lead Timeline View
-- =========================================================
-- Unified view of outbound emails + inbound replies for a lead
-- Allows roofers to see all email activity in chronological order

-- View: lead_timeline_events
-- Unifies outbound_emails + inbound_replies into one normalized timeline

create or replace view public.lead_timeline_events as
-- Outbound emails: join through contacts to get lead_id
select
  oe.id::text                         as id,
  l.id::uuid                          as lead_id,
  'outbound'::text                    as direction,
  'email_sent'::text                  as event_type,
  oe.subject                          as subject,
  oe.subject                          as event_title,
  coalesce(oe.body, '')              as event_body,
  left(coalesce(oe.body, ''), 240)   as body_preview,
  coalesce(oe.sent_at, oe.send_at, oe.created_at) as event_time,
  null::text                          as intent,
  false                               as is_hot
from public.outbound_emails oe
join public.contacts c on c.id = oe.contact_id
join public.leads l on l.contact_id = c.id

union all

-- Inbound replies: use inbound_replies table (has lead_id directly)
select
  ir.id::text                         as id,
  ir.lead_id::uuid                    as lead_id,
  'inbound'::text                     as direction,
  'reply_received'::text              as event_type,
  ir.subject                          as subject,
  coalesce(ir.subject, 'Reply received') as event_title,
  coalesce(ir.body_text, '')         as event_body,
  left(coalesce(ir.body_text, ''), 240) as body_preview,
  ir.created_at                       as event_time,
  case 
    when ir.is_human_reply then 'hot'
    else null
  end::text                           as intent,
  ir.is_human_reply                   as is_hot
from public.inbound_replies ir
where ir.lead_id is not null

union all

-- Also include replies table if it exists (alternative inbound source)
select
  r.id::text                          as id,
  r.lead_id::uuid                     as lead_id,
  'inbound'::text                     as direction,
  'reply_received'::text              as event_type,
  r.subject                           as subject,
  coalesce(r.subject, 'Reply received') as event_title,
  coalesce(r.body, '')               as event_body,
  left(coalesce(r.body, ''), 240)    as body_preview,
  coalesce(r.received_at, r.created_at) as event_time,
  r.detected_intent::text             as intent,
  (r.detected_intent = 'positive')    as is_hot
from public.replies r
where r.lead_id is not null
  and not exists (
    -- Avoid duplicates if inbound_replies already has this
    select 1 from public.inbound_replies ir2 
    where ir2.lead_id = r.lead_id 
      and abs(extract(epoch from (ir2.created_at - coalesce(r.received_at, r.created_at)))) < 60
  );

-- Add index hint comment (views don't support indexes, but this helps with query planning)
comment on view public.lead_timeline_events is 'Unified timeline of outbound emails and inbound replies for leads. Query by lead_id and order by event_time.';

-- Grant access to authenticated users
grant select on public.lead_timeline_events to authenticated;

