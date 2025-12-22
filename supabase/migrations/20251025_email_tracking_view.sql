create or replace view public.email_message_stats as
select
  m.id as message_id,
  m.campaign_id,
  m.lead_id,
  count(*) filter (where e.type = 'open') as opens,
  count(*) filter (where e.type = 'click') as clicks,
  min(e.created_at) filter (where e.type = 'open') as first_open_at,
  min(e.created_at) filter (where e.type = 'click') as first_click_at
from public.email_messages m
left join public.email_events e on e.message_id = m.id
group by m.id;