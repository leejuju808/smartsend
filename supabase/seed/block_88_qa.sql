-- Block 88 QA seed
-- Fake “meetingy” inbound
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
  received_at
)
values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  gen_random_uuid(),
  gen_random_uuid(),
  'inbound',
  'alex@acme.com',
  'me@smartsend.ai',
  'Re: intro',
  'Thursday 2pm PST works. 30 min on Google Meet is fine.',
  now()
);

