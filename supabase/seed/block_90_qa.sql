-- Block 90 QA seeds
-- Creates a sample DSN message for bounce intel testing

insert into public.messages (
  id,
  account_id,
  thread_id,
  lead_id,
  direction,
  from_email,
  to_email,
  subject,
  body_text,
  received_at,
  provider
)
values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  gen_random_uuid(),
  gen_random_uuid(),
  'inbound',
  'mailer-daemon@googlemail.com',
  'sales@acme.com',
  'Delivery Status Notification (Failure)',
  '550 5.1.1 The email account that you tried to reach does not exist. Please try double-checking the recipient''s email address.',
  now(),
  'gmail'
)
on conflict do nothing;

