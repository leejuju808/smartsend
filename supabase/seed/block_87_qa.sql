-- Fake inbound OOO
insert into public.messages (id, account_id, thread_id, lead_id, direction, from_email, to_email, subject, body_text, received_at)
values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  gen_random_uuid(),
  gen_random_uuid(),
  'inbound',
  'alex@acme.com','me@smartsend.ai',
  'Re: quick question',
  'I am out of office until 11/18. Please contact ops@acme.com.',
  now()
);

-- Fake meeting intent
insert into public.messages (id, account_id, thread_id, lead_id, direction, from_email, to_email, subject, body_text, received_at)
values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  gen_random_uuid(),
  gen_random_uuid(),
  'inbound',
  'maria@brickco.com','me@smartsend.ai',
  'Re: intro',
  'Thanks Julian. Let''s schedule a 30-min call Thursday at 2pm PST.',
  now()
);

