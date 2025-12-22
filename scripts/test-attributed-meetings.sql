-- Test script for meeting attribution
-- Run this in Supabase SQL editor after applying attributed_meetings.sql

-- Set test user context
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);

-- Create a campaign + contact + message
insert into public.campaigns (id, profile_id, name)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111','Attribution Test')
on conflict do nothing;

insert into public.contacts (id, profile_id, email)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111','alice@example.com')
on conflict do nothing;

insert into public.messages (profile_id,campaign_id,contact_id,to_email,status,created_at)
values ('11111111-1111-1111-1111-111111111111','cccccccc-cccc-cccc-cccc-cccccccccccc','dddddddd-dddd-dddd-dddd-dddddddddddd','alice@example.com','sent',now());

-- Insert a meeting for alice (no campaign_id yet)
insert into public.meetings (profile_id,contact_id,source,created_at)
values ('11111111-1111-1111-1111-111111111111','dddddddd-dddd-dddd-dddd-dddddddddddd','calendly',now());

-- Check initial state
select 'Initial state:' as info;
select id, contact_id, campaign_id from public.meetings where profile_id = '11111111-1111-1111-1111-111111111111';

-- Trigger attribution
select 'Running attribution...' as info;
select public.attribute_meeting_campaigns('11111111-1111-1111-1111-111111111111');

-- Check final state
select 'After attribution:' as info;
select id, contact_id, campaign_id from public.meetings where profile_id = '11111111-1111-1111-1111-111111111111';

-- Check the view
select 'View results:' as info;
select * from public.meetings_by_campaign where profile_id = '11111111-1111-1111-1111-111111111111'; 