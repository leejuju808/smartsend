-- Seed Test Data for MB/100 Analytics
-- This script creates sample data to test the analytics feature

-- Step 1: Get a profile_id to use for testing
-- Uncomment and run this first to see available profiles:
-- SELECT id, email FROM profiles LIMIT 5;

-- Step 2: Replace 'YOUR_PROFILE_ID' below with an actual profile_id from step 1
-- For example: '11111111-1111-1111-1111-111111111111'

DO $$
DECLARE
  test_profile_id uuid;
BEGIN
  -- Option A: Use the first profile from your profiles table
  SELECT id INTO test_profile_id FROM profiles LIMIT 1;
  
  -- Option B: Or specify a specific profile (uncomment and set):
  -- test_profile_id := 'YOUR_PROFILE_ID'::uuid;
  
  IF test_profile_id IS NULL THEN
    RAISE NOTICE 'No profiles found. Please create a profile first.';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Using profile_id: %', test_profile_id;
  
  -- Insert test messages (inbound = replies)
  -- This creates 20 replies over the last 20 days
  FOR i IN 1..20 LOOP
    INSERT INTO messages (id, profile_id, direction, created_at)
    VALUES (
      gen_random_uuid(),
      test_profile_id,
      'inbound',
      now() - (i || ' days')::interval
    );
  END LOOP;
  
  -- Insert some outbound messages too (for realism)
  FOR i IN 1..30 LOOP
    INSERT INTO messages (id, profile_id, direction, created_at)
    VALUES (
      gen_random_uuid(),
      test_profile_id,
      'outbound',
      now() - (i || ' days')::interval
    );
  END LOOP;
  
  -- Insert test meetings
  -- 5 meetings = 25% conversion rate (5/20 * 100 = 25 MB/100)
  INSERT INTO meetings (id, profile_id, invite_status, created_at)
  VALUES
    (gen_random_uuid(), test_profile_id, 'sent', now() - interval '2 days'),
    (gen_random_uuid(), test_profile_id, 'booked', now() - interval '5 days'),
    (gen_random_uuid(), test_profile_id, 'sent', now() - interval '8 days'),
    (gen_random_uuid(), test_profile_id, 'booked', now() - interval '12 days'),
    (gen_random_uuid(), test_profile_id, 'sent', now() - interval '15 days');
  
  -- Also add some meetings with other statuses (should NOT count in MB/100)
  INSERT INTO meetings (id, profile_id, invite_status, created_at)
  VALUES
    (gen_random_uuid(), test_profile_id, 'pending', now() - interval '1 days'),
    (gen_random_uuid(), test_profile_id, 'failed', now() - interval '3 days');
  
  RAISE NOTICE 'Test data created successfully!';
  RAISE NOTICE 'Replies (inbound messages): 20';
  RAISE NOTICE 'Meetings (sent/booked): 5';
  RAISE NOTICE 'Expected MB/100: 25.00';
  RAISE NOTICE 'Other meetings (pending/failed): 2 (should not count)';
  
END $$;

-- Step 3: Verify the data
SELECT 
  'Data Summary' as info,
  (SELECT COUNT(*) FROM messages WHERE direction = 'inbound' AND created_at >= now() - interval '30 days') as total_replies,
  (SELECT COUNT(*) FROM meetings WHERE invite_status IN ('sent', 'booked') AND created_at >= now() - interval '30 days') as total_meetings,
  ROUND(
    (SELECT COUNT(*) FROM meetings WHERE invite_status IN ('sent', 'booked') AND created_at >= now() - interval '30 days')::numeric /
    NULLIF((SELECT COUNT(*) FROM messages WHERE direction = 'inbound' AND created_at >= now() - interval '30 days'), 0)::numeric * 100,
    2
  ) as calculated_mb100;

-- Step 4: Check the views
SELECT * FROM analytics_totals_30d ORDER BY profile_id LIMIT 5;
SELECT * FROM analytics_sender_health_30d ORDER BY profile_id LIMIT 5;

-- Step 5: Check daily breakdown
SELECT 
  day,
  SUM(replies_count) as total_replies,
  SUM(meetings_count) as total_meetings
FROM analytics_daily
WHERE day >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC
LIMIT 10;
