-- Fast aggregates for list view
-- Creates lead_activity view with latest event + counters per lead

-- View: latest event + counters per lead
-- Note: This assumes email_events uses 'event_type' column
-- If your table uses 'type' instead, update accordingly
create or replace view lead_activity as
select
  l.id as lead_id,
  max(e.created_at) as last_event_at,
  (array_agg(e.event_type order by e.created_at desc))[1] as last_event_type,
  count(*) filter (where e.event_type = 'opened') as opens,
  count(*) filter (where e.event_type = 'clicked') as clicks,
  bool_or(e.event_type = 'replied') as replied
from leads l
left join email_events e on e.lead_id = l.id
group by l.id;

-- Helpful index on email_events if not present
create index if not exists idx_email_events_lead_time on email_events(lead_id, created_at desc);

-- Grant access
grant select on lead_activity to authenticated, service_role;

