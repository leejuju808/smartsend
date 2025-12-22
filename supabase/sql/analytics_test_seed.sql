-- Analytics Test Data Seed
-- Instructions: 
-- 1. Replace YOUR_PROFILE_ID with your actual profile UUID
-- 2. Run this in Supabase SQL Editor to create test data

-- Set your profile_id here
DO $$
DECLARE
  v_profile_id uuid := 'YOUR_PROFILE_ID'; -- CHANGE THIS!
  v_campaign_id uuid;
  v_msg_id uuid;
BEGIN
  -- Create a test campaign
  INSERT INTO public.campaigns (profile_id, name, created_at)
  VALUES (v_profile_id, 'Cold Outreach #1', now() - interval '10 days')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_campaign_id;
  
  -- If campaign already exists, get its ID
  IF v_campaign_id IS NULL THEN
    SELECT id INTO v_campaign_id 
    FROM public.campaigns 
    WHERE profile_id = v_profile_id 
    ORDER BY created_at DESC 
    LIMIT 1;
  END IF;

  -- Create messages across different days
  -- Day -5: 10 sent, 0 bounced, 0 replied
  FOR i IN 1..10 LOOP
    INSERT INTO public.messages (profile_id, campaign_id, to_email, status, sent_at, created_at)
    VALUES (
      v_profile_id, 
      v_campaign_id, 
      'test' || i || '@example.com', 
      'sent', 
      now() - interval '5 days',
      now() - interval '5 days'
    );
  END LOOP;

  -- Day -4: 15 sent, 2 bounced, 3 replied (2 positive)
  FOR i IN 11..25 LOOP
    INSERT INTO public.messages (profile_id, campaign_id, to_email, status, sent_at, created_at)
    VALUES (
      v_profile_id, 
      v_campaign_id, 
      'test' || i || '@example.com', 
      CASE 
        WHEN i <= 12 THEN 'bounced'
        WHEN i <= 15 THEN 'replied'
        ELSE 'sent'
      END,
      now() - interval '4 days',
      now() - interval '4 days'
    );
  END LOOP;
  
  -- Update replied messages with reply timestamps and intents
  UPDATE public.messages
  SET replied_at = now() - interval '4 days',
      reply_intent = CASE 
        WHEN to_email IN ('test13@example.com', 'test14@example.com') THEN 'positive'
        ELSE 'neutral'
      END
  WHERE to_email IN ('test13@example.com', 'test14@example.com', 'test15@example.com');

  -- Day -3: 20 sent, 1 bounced, 5 replied (3 positive)
  FOR i IN 26..45 LOOP
    INSERT INTO public.messages (profile_id, campaign_id, to_email, status, sent_at, created_at)
    VALUES (
      v_profile_id, 
      v_campaign_id, 
      'test' || i || '@example.com', 
      CASE 
        WHEN i = 26 THEN 'bounced'
        WHEN i <= 30 THEN 'replied'
        ELSE 'sent'
      END,
      now() - interval '3 days',
      now() - interval '3 days'
    );
  END LOOP;
  
  UPDATE public.messages
  SET replied_at = now() - interval '3 days',
      reply_intent = CASE 
        WHEN to_email IN ('test27@example.com', 'test28@example.com', 'test29@example.com') THEN 'positive'
        ELSE 'neutral'
      END
  WHERE to_email IN ('test27@example.com', 'test28@example.com', 'test29@example.com', 'test30@example.com');

  -- Day -2: 12 sent, 0 bounced, 2 replied (1 positive)
  FOR i IN 46..57 LOOP
    INSERT INTO public.messages (profile_id, campaign_id, to_email, status, sent_at, created_at)
    VALUES (
      v_profile_id, 
      v_campaign_id, 
      'test' || i || '@example.com', 
      CASE 
        WHEN i <= 47 THEN 'replied'
        ELSE 'sent'
      END,
      now() - interval '2 days',
      now() - interval '2 days'
    );
  END LOOP;
  
  UPDATE public.messages
  SET replied_at = now() - interval '2 days',
      reply_intent = CASE 
        WHEN to_email = 'test46@example.com' THEN 'positive'
        ELSE 'neutral'
      END
  WHERE to_email IN ('test46@example.com', 'test47@example.com');

  -- Day -1: 8 sent, 1 bounced, 1 replied (1 positive)
  FOR i IN 58..65 LOOP
    INSERT INTO public.messages (profile_id, campaign_id, to_email, status, sent_at, created_at)
    VALUES (
      v_profile_id, 
      v_campaign_id, 
      'test' || i || '@example.com', 
      CASE 
        WHEN i = 58 THEN 'bounced'
        WHEN i = 59 THEN 'replied'
        ELSE 'sent'
      END,
      now() - interval '1 day',
      now() - interval '1 day'
    );
  END LOOP;
  
  UPDATE public.messages
  SET replied_at = now() - interval '1 day',
      reply_intent = 'positive'
  WHERE to_email = 'test59@example.com';

  -- Create meetings for positive replies
  -- 2 meetings from Day -4 positive replies
  INSERT INTO public.meetings (profile_id, campaign_id, message_id, attendee_email, status, scheduled_at, created_at)
  SELECT 
    v_profile_id,
    v_campaign_id,
    id,
    to_email,
    'scheduled',
    now() + interval '3 days',
    now() - interval '4 days' + interval '2 hours'
  FROM public.messages
  WHERE reply_intent = 'positive' 
    AND to_email IN ('test13@example.com', 'test14@example.com');

  -- 2 meetings from Day -3 positive replies
  INSERT INTO public.meetings (profile_id, campaign_id, message_id, attendee_email, status, scheduled_at, created_at)
  SELECT 
    v_profile_id,
    v_campaign_id,
    id,
    to_email,
    'scheduled',
    now() + interval '5 days',
    now() - interval '3 days' + interval '1 hour'
  FROM public.messages
  WHERE reply_intent = 'positive' 
    AND to_email IN ('test27@example.com', 'test28@example.com');

  -- 1 meeting from Day -2 positive reply
  INSERT INTO public.meetings (profile_id, campaign_id, message_id, attendee_email, status, scheduled_at, created_at)
  SELECT 
    v_profile_id,
    v_campaign_id,
    id,
    to_email,
    'scheduled',
    now() + interval '4 days',
    now() - interval '2 days' + interval '3 hours'
  FROM public.messages
  WHERE reply_intent = 'positive' 
    AND to_email = 'test46@example.com';

  -- 1 meeting from Day -1 positive reply
  INSERT INTO public.meetings (profile_id, campaign_id, message_id, attendee_email, status, scheduled_at, created_at)
  SELECT 
    v_profile_id,
    v_campaign_id,
    id,
    to_email,
    'scheduled',
    now() + interval '2 days',
    now() - interval '1 day' + interval '4 hours'
  FROM public.messages
  WHERE reply_intent = 'positive' 
    AND to_email = 'test59@example.com';

  RAISE NOTICE 'Test data created successfully!';
  RAISE NOTICE 'Campaign ID: %', v_campaign_id;
  RAISE NOTICE 'Total messages: 65';
  RAISE NOTICE 'Total meetings: 6';
  RAISE NOTICE 'Expected MB/100: ~54.5 (6 meetings / 11 replies * 100)';
END $$;

-- Verify the data
SELECT 
  'Messages' as table_name,
  count(*) as count,
  count(*) filter (where status = 'sent') as sent,
  count(*) filter (where status = 'bounced') as bounced,
  count(*) filter (where replied_at is not null) as replied,
  count(*) filter (where reply_intent = 'positive') as positive_replies
FROM public.messages
WHERE profile_id = 'YOUR_PROFILE_ID'
UNION ALL
SELECT 
  'Meetings' as table_name,
  count(*) as count,
  null as sent,
  null as bounced,
  null as replied,
  null as positive_replies
FROM public.meetings
WHERE profile_id = 'YOUR_PROFILE_ID';
