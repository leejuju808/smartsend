-- Block 79 QA seeds – bounce flow smoke test

-- Fake hard bounce (5.1.1)
select public.rpc_record_bounce(
  '00000000-0000-0000-0000-000000000001',  -- account
  null,                                    -- send_id
  gen_random_uuid(),                       -- lead_id
  'bad@nodomain.example',                  -- email
  '550',                                   -- smtp
  '5.1.1',                                 -- dsn
  'tester',                                -- provider
  '{}'::jsonb
);

-- Fake soft bounce (mailbox full)
select public.rpc_record_bounce(
  '00000000-0000-0000-0000-000000000001',
  null,
  gen_random_uuid(),
  'mbfull@example.com',
  '552',
  '5.2.2',
  'tester',
  '{}'::jsonb
);

