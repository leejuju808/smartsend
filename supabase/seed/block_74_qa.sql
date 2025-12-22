-- Block 74 QA smoke test

-- inbound positive
insert into public.messages (id, account_id, thread_id, lead_id, direction, subject, body_text, received_at)
values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  gen_random_uuid(),
  gen_random_uuid(),
  'inbound',
  'Re: intro',
  'Yes, let us talk this week. Wed 2pm PT works. Here is my Zoom: https://zoom.us/j/123',
  now()
);

-- POST /api/replies/classify with that message_id → expect meeting_intent ~0.9, thread paused ~7d

