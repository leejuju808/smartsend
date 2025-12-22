-- OOO with weekday
insert into public.messages (id, account_id, lead_id, direction, subject, body_text, received_at)
values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  null,
  'inbound',
  'Automatic reply: OOO',
  'I am out of office and will be back on Tuesday. For urgent matters...',
  now()
);

-- OOO with date
insert into public.messages (id, account_id, lead_id, direction, subject, body_text, received_at)
values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  null,
  'inbound',
  'OOO',
  'Thanks for your email. Returning on 11/14. Please contact...',
  now()
);


