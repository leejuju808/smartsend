-- Block 475 — AI SDR Lead Console (Threads Inbox + Timeline View)
-- Read views for fast UI queries

-- ============================================================================
-- 1️⃣ ai_sdr_thread_overview (list page)
-- ============================================================================

create or replace view ai_sdr_thread_overview as
select
  t.id as thread_id,
  t.lead_id,
  t.campaign_id,
  t.status,
  t.last_message_from,
  t.last_message_at,
  t.next_action_at,

  l.email as lead_email,
  coalesce(l.first_name || ' ' || l.last_name, l.first_name, l.last_name, l.email) as lead_name,
  c.name as campaign_name,

  -- last AI SDR event
  (
    select e.event_type
    from ai_sdr_events e
    where e.thread_id = t.id
    order by e.created_at desc
    limit 1
  ) as last_ai_event_type,
  (
    select e.created_at
    from ai_sdr_events e
    where e.thread_id = t.id
    order by e.created_at desc
    limit 1
  ) as last_ai_event_at

from ai_sdr_threads t
join leads l on l.id = t.lead_id
left join campaigns c on c.id = t.campaign_id;

comment on view ai_sdr_thread_overview is 'Overview of AI SDR threads with lead and campaign info for list page';

-- ============================================================================
-- 2️⃣ ai_sdr_timeline_items (detail page timeline)
-- ============================================================================

create or replace view ai_sdr_timeline_items as
-- Emails (outbound/inbound)
select
  'email'::text as item_type,
  e.id as item_id,
  t.id as thread_id,
  e.created_at,
  case 
    when e.is_incoming = true then 'inbound'::text
    else 'outbound'::text
  end as direction,
  e.subject,
  coalesce(e.body_text, e.body_html, '') as content,
  null::text as event_type,
  null::jsonb as details
from ai_sdr_threads t
join emails e on e.lead_id = t.lead_id
where (t.campaign_id is null or e.campaign_id = t.campaign_id)

union all

-- AI SDR events
select
  'ai_event'::text as item_type,
  ev.id as item_id,
  ev.thread_id,
  ev.created_at,
  null::text as direction,
  null::text as subject,
  null::text as content,
  ev.event_type,
  ev.details
from ai_sdr_events ev

union all

-- Meetings linked by lead
select
  'meeting'::text as item_type,
  m.id as item_id,
  t.id as thread_id,
  coalesce(m.start_at, m.start_time, m.created_at) as created_at,
  null::text as direction,
  coalesce(m.title, m.meeting_title, 'Meeting') as subject,
  coalesce(m.notes, m.meeting_notes, '') as content,
  null::text as event_type,
  jsonb_build_object(
    'status', coalesce(m.status, 'scheduled'),
    'start_at', coalesce(m.start_at, m.start_time),
    'end_at', coalesce(m.end_at, m.end_time),
    'location', coalesce(m.location, m.meeting_link)
  ) as details
from ai_sdr_threads t
join meetings m on m.lead_id = t.lead_id;

comment on view ai_sdr_timeline_items is 'Unified timeline of emails, AI events, and meetings for a thread';

-- Note: Views inherit RLS from base tables (ai_sdr_threads, leads, campaigns, emails, ai_sdr_events, meetings)


