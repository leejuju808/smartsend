-- Seed data for Block 82 signature parser QA
insert into public.messages (id, account_id, lead_id, direction, subject, body_text, received_at)
values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  gen_random_uuid(),
  'inbound',
  'Re: Quick chat',
  'Thanks Julian—
   Alex Johnson
   VP, Operations at Acme Robotics
   alex.johnson@acme.com | https://acme.com
   (206) 555-1234
   Seattle, WA (PST)',
  now()
);

