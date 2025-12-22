-- Block 78 QA seed: minimal sends and events

-- Create two sends across default preset variants
insert into public.email_sends (id, account_id, campaign_id, lead_id, preset_key, variant_id, subject, to_email, status)
select
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  null,
  gen_random_uuid(),
  p.key,
  v.id,
  'Test Subject',
  'test@example.com',
  'sent'
from public.nudge_presets p
join public.nudge_variants v on v.preset_id = p.id
where p.key = 'default'
limit 2;

-- Attach events: first send gets open + reply, second gets open
with sends as (
  select id, account_id
  from public.email_sends
  order by created_at asc
)
insert into public.email_events (account_id, send_id, type)
select account_id, id, 'open'
from sends;

with first_send as (
  select id, account_id
  from public.email_sends
  order by created_at asc
  limit 1
)
insert into public.email_events (account_id, send_id, type)
select account_id, id, 'reply'
from first_send;

