-- Block 96 QA seed — demonstrate saved view filters end-to-end

-- Ensure demo leads have HubSpot in their tech stack
update public.leads
set tech_stack = coalesce(tech_stack, '{}'::jsonb) || '{"hubspot": true}'::jsonb
where email ilike '%@acme.com';

-- Mark industry and employee count for ICP fit
update public.leads
set industry = 'SaaS',
    employee_count = 120
where email ilike '%@acme.com';

-- Insert a hot inbound reply from yesterday to drive scoring
insert into public.messages (
  id,
  account_id,
  thread_id,
  lead_id,
  direction,
  label,
  subject,
  body_text,
  received_at
)
select
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  t.id,
  t.lead_id,
  'inbound',
  'positive',
  coalesce(t.last_subject, 'Re: quick intro'),
  'Let’s talk this week',
  now() - interval '1 day'
from public.threads t
join public.leads l on l.id = t.lead_id
where l.email ilike '%@acme.com'
limit 1;


