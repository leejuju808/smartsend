-- Analytics Indices + Optional Seed
-- Helpful indices for time-ranged and owner-scoped queries on inbound_messages and meetings

-- Create indices for efficient analytics queries
create index if not exists inbound_messages_owner_created_idx
on public.inbound_messages (owner_user_id, created_at desc);

create index if not exists meetings_owner_created_idx
on public.meetings (owner_user_id, created_at desc);

-- Optional: quick seed to verify charts
-- Replace 00000000-0000-0000-0000-000000000000 with your auth.users.id
-- Seeds 6 replies and 3 meetings spread over recent days
-- Uncomment the block below to seed test data:

/*
do $$
declare
  u uuid := '00000000-0000-0000-0000-000000000000'; -- REPLACE WITH YOUR USER ID
begin
  -- replies (inbound_messages)
  insert into public.inbound_messages (provider, owner_user_id, message_id, sender_email, subject, body_text, processed_status, detector_status, created_at)
  values
    ('postmark', u, 'm1', 'lead1@example.com', 'Call', 'Yes this week', 'forwarded', 'booked', now() - interval '5 days'),
    ('postmark', u, 'm2', 'lead2@example.com', 'Question', 'Maybe later', 'forwarded', 'no_meeting', now() - interval '4 days'),
    ('sendgrid', u, 'm3', 'lead3@example.com', 'Schedule', 'Let us do Friday', 'forwarded', 'booked', now() - interval '3 days'),
    ('mailgun', u, 'm4', 'lead4@example.com', 'Info', 'No thanks', 'forwarded', 'no_meeting', now() - interval '2 days'),
    ('mailgun', u, 'm5', 'lead5@example.com', 'Hello', 'What''s the price?', 'forwarded', 'no_meeting', now() - interval '1 days'),
    ('mailgun', u, 'm6', 'lead6@example.com', 'Booking', 'Yes, send your link', 'forwarded', 'booked', now());

  -- meetings (2 booked + 1 no_meeting)
  insert into public.meetings (owner_user_id, sender_email, subject, intent, status, calendly_link, ics_file, created_at)
  values
    (u, 'lead1@example.com', 'Call', 'positive_meeting_intent', 'booked', 'https://calendly.com/YOU', null, now() - interval '5 days'),
    (u, 'lead3@example.com', 'Schedule', 'positive_meeting_intent', 'booked', 'https://calendly.com/YOU', null, now() - interval '3 days'),
    (u, 'lead4@example.com', 'Info', 'negative', 'no_meeting', null, null, now() - interval '2 days');
end $$;
*/
