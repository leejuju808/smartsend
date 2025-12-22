-- Test script for sender health metrics
-- Run this in Supabase SQL Editor after applying sender_health.sql

-- Set test user (replace with actual user ID)
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

-- Ensure a campaign exists (reuse prior or create)
insert into public.campaigns (id, profile_id, name)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Health Test')
on conflict (id) do nothing;

-- Insert a few messages in the last week
insert into public.messages (profile_id, campaign_id, contact_id, to_email, status, created_at)
values
('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', gen_random_uuid(),'alice@example.com','sent', now() - interval '2 days'),
('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', gen_random_uuid(),'bob@example.com','failed', now() - interval '1 day'),
('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', gen_random_uuid(),'cara@example.com','replied', now() - interval '1 day');

-- One booked meeting
insert into public.meetings (profile_id, campaign_id, contact_id, source, created_at)
values ('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null, 'calendly', now() - interval '12 hours');

-- A send audit (as if enqueue logged)
insert into public.send_audits (profile_id, campaign_id, inserted_count, skipped_suppressed, skipped_duplicates, created_at)
values ('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 25, 3, 2, now() - interval '3 hours');

-- Test the compute_sender_health function
select * from public.compute_sender_health('11111111-1111-1111-1111-111111111111', 7);
select * from public.compute_sender_health('11111111-1111-1111-1111-111111111111', 30);

-- Test enqueue function (should log to send_audits)
select * from public.enqueue_campaign_safely('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Verify send_audits was updated
select * from public.send_audits where profile_id = '11111111-1111-1111-1111-111111111111' order by created_at desc; 