-- Create a comprehensive reporting view for analytics
create or replace view public.report_events as
select
  'campaign' as source_type,
  c.id as campaign_id,
  null::uuid as sequence_id,
  null::uuid as sequence_step_id,
  cr.email as recipient_email,
  ee.type,
  ee.created_at,
  c.title as campaign_title,
  c.user_id,
  c.status as campaign_status
from email_events ee
join campaign_recipients cr on ee.recipient_id = cr.id
join campaigns c on ee.campaign_id = c.id

union all

select
  'sequence' as source_type,
  null::uuid as campaign_id,
  s.id as sequence_id,
  ss.id as sequence_step_id,
  se.email as recipient_email,
  'sent' as type,
  se.last_sent as created_at,
  s.name as campaign_title,
  s.created_by as user_id,
  'active' as campaign_status
from sequence_enrollments se
join sequences s on se.sequence_id = s.id
join sequence_steps ss on s.id = ss.sequence_id and ss.step_order = se.current_step
where se.last_sent is not null

union all

select
  'reply' as source_type,
  null::uuid as campaign_id,
  null::uuid as sequence_id,
  null::uuid as sequence_step_id,
  e.recipient_email,
  'reply' as type,
  e.created_at,
  'Reply' as campaign_title,
  e.user_id,
  'completed' as campaign_status
from events e
where e.event = 'reply' and e.meta->>'type' = 'email';

-- Create indexes for better performance
create index if not exists idx_report_events_user_date on public.report_events(user_id, created_at);
create index if not exists idx_report_events_type_date on public.report_events(type, created_at);
create index if not exists idx_report_events_source_date on public.report_events(source_type, created_at);

-- Grant access to authenticated users
grant select on public.report_events to authenticated; 