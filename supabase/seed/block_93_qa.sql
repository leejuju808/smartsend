-- Block 93 QA: signature parsing

-- Inbound with signature footer
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
  'maria@brickco.com',
  'me@smartsend.ai',
  'Re: intro',
  'Best,
Maria Lopez
Director, Operations @ BrickCo
Austin, TX
maria@brickco.com | (512) 555-0188
linkedin.com/in/marialopez
https://brickco.com',
  now()
);

-- POST to SIGNATURE_PARSE_URL with that message_id
-- Expect signature_facts row and leads enriched after rpc_merge_signature_into_lead.

