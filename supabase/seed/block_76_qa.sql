++ 0
-- QA seed for Meeting Bridge (Block 76)

-- Create a meeting_intent without ICS
insert into public.meeting_intents (
  id,
  thread_id,
  account_id,
  campaign_id,
  lead_id,
  message_id,
  source_message_id,
  organizer_name,
  organizer_email,
  start_ts,
  end_ts,
  timezone,
  location_url,
  location_label,
  raw
)
values (
  gen_random_uuid(),
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  gen_random_uuid(),
  null,
  gen_random_uuid(),
  gen_random_uuid(),
  'Alex Buyer',
  'alex@buyer.com',
  now() + interval '2 days',
  now() + interval '2 days 30 minutes',
  'America/Los_Angeles',
  'https://meet.google.com/abc-defg-hij',
  'Google Meet',
  '{}'::jsonb
);

-- After calling rpc_finalize_meeting_intent and the push endpoint, expect:
-- ics_text not null, push_status in ('drafted' or 'sent'), external_event_id present if provider connected.


