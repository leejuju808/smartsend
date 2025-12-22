-- ============================================================================
-- Block 23650 — SmartSend Onboarding Email + SMS Pack v1
-- 7-Day Onboarding Sequence • Exact Templates • Timing • Why Each Step Helps Roofers
-- ============================================================================

-- PART 1: ONBOARDING MESSAGE TRACKING TABLE
-- Tracks which onboarding messages have been sent to which users
CREATE TABLE IF NOT EXISTS onboarding_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK (message_type IN ('email', 'sms')),
  message_key TEXT NOT NULL, -- e.g. 'onboarding_day0_welcome_email', 'onboarding_day0_welcome_sms'
  day_offset INTEGER NOT NULL, -- 0, 1, 2, 3, 4, 5, 7, etc.
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_onboarding_messages_user_id ON onboarding_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_messages_status ON onboarding_messages(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_messages_scheduled_at ON onboarding_messages(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_messages_user_key ON onboarding_messages(user_id, message_key);

-- Unique constraint: one message per user per message_key
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_messages_user_key_unique
ON onboarding_messages(user_id, message_key);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_onboarding_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_onboarding_messages_updated_at
BEFORE UPDATE ON onboarding_messages
FOR EACH ROW
EXECUTE FUNCTION update_onboarding_messages_updated_at();

-- Enable RLS
ALTER TABLE onboarding_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "onboarding_messages_service_role_all" ON onboarding_messages
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "onboarding_messages_users_read_own" ON onboarding_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- PART 2: ONBOARDING EMAIL TEMPLATES
-- ============================================================================

-- Day 0 — Welcome Email
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
VALUES
  ('00000000-0000-0000-0000-000000000000'::uuid, 'onboarding_day0_welcome_email',
    'Day 0 — Welcome Email',
    'Your SmartSend account is ready',
    'Welcome to SmartSend — you now have a system that books roofing estimates automatically.

Over this first week, I''ll help you launch your first campaigns and get your first homeowner replies.

If you have ANY homeowner list — even a screenshot or export — send it to me and I''ll upload it for you.

Your goal this week: get replies and book estimates.
My job: make it as easy as possible.',
    FALSE, 'casual')
ON CONFLICT DO NOTHING;

-- Day 1 — Launch Campaign #1 Email
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
VALUES
  ('00000000-0000-0000-0000-000000000000'::uuid, 'onboarding_day1_launch_campaign1',
    'Day 1 — Launch Campaign #1',
    'Let''s launch your first SmartSend campaign',
    'Time to get your first replies.
I recommend starting with this campaign:

''Lead Revival — Homeowners Who Didn''t Respond''

This campaign typically gets replies within 24–48 hours.

Want me to launch it for you?',
    FALSE, 'casual')
ON CONFLICT DO NOTHING;

-- Day 3 — Value Proof Email
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
VALUES
  ('00000000-0000-0000-0000-000000000000'::uuid, 'onboarding_day3_value_proof',
    'Day 3 — Value Proof Email',
    'Your SmartSend opens start here 👇',
    'Your first homeowners will start opening and replying once your campaign is live.
Most roofers see a mix of:

• Quick questions
• Appointment requests
• Inspection interest
• Repair inquiries

If you haven''t launched yet, I can do it for you — just say the word.',
    FALSE, 'casual')
ON CONFLICT DO NOTHING;

-- Day 4 — Launch Campaign #2 Email
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
VALUES
  ('00000000-0000-0000-0000-000000000000'::uuid, 'onboarding_day4_launch_campaign2',
    'Day 4 — Launch Campaign #2',
    'Want more estimates this week?',
    'SmartSend can run multiple campaigns for you.
A great second campaign is:

''Free Inspection + Estimate''

This one fills the schedule for roofers with empty days.
Want me to turn it on for you?',
    FALSE, 'casual')
ON CONFLICT DO NOTHING;

-- Day 7 — First Week Summary Email
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
VALUES
  ('00000000-0000-0000-0000-000000000000'::uuid, 'onboarding_day7_summary',
    'Day 7 — First Week Summary',
    'Your first SmartSend week — quick summary',
    'Here''s your Week 1 SmartSend recap:

• Opens: ___
• Replies: ___
• Leads created: ___
• Campaigns live: ___
• Estimated roof value: $___

Next Step:
Want me to launch another campaign for you to keep momentum growing?

One steady week of SmartSend = booked estimates for months.',
    FALSE, 'casual')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 3: ONBOARDING SMS TEMPLATES
-- SMS templates stored in email_templates with 'sms_' prefix
-- ============================================================================

-- Day 0 — Welcome SMS
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
VALUES
  ('00000000-0000-0000-0000-000000000000'::uuid, 'sms_onboarding_day0_welcome',
    'Day 0 — Welcome SMS',
    '', -- SMS has no subject
    'Welcome to SmartSend — you''re all set.
Send me any homeowner list you have and I''ll upload it for you.',
    FALSE, 'casual')
ON CONFLICT DO NOTHING;

-- Day 2 — Quick-Win Reminder SMS
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
VALUES
  ('00000000-0000-0000-0000-000000000000'::uuid, 'sms_onboarding_day2_reminder',
    'Day 2 — Quick-Win Reminder SMS',
    '',
    'Quick heads up — roofers who launch a campaign by day 2 see replies MUCH faster.
Want me to activate your revival or free estimate campaign?',
    FALSE, 'casual')
ON CONFLICT DO NOTHING;

-- Day 5 — Personal Check-In SMS
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
VALUES
  ('00000000-0000-0000-0000-000000000000'::uuid, 'sms_onboarding_day5_checkin',
    'Day 5 — Personal Check-In SMS',
    '',
    'Hey, this is Julian. Want me to look at your SmartSend dashboard and help you plan your next steps? Takes 1 minute.',
    FALSE, 'casual')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 4: FUNCTION TO SCHEDULE ONBOARDING MESSAGES
-- Called when a user subscribes (via trigger or API)
-- ============================================================================

CREATE OR REPLACE FUNCTION schedule_onboarding_sequence(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_email TEXT;
  v_user_phone TEXT;
  v_subscription_date TIMESTAMPTZ;
  v_message_key TEXT;
  v_scheduled_at TIMESTAMPTZ;
  v_day_offset INTEGER;
BEGIN
  -- Get user email and phone
  SELECT 
    email,
    raw_user_meta_data->>'phone' INTO v_user_email, v_user_phone
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User email not found';
  END IF;

  -- Get subscription date (use created_at from subscriptions table or profiles)
  SELECT COALESCE(
    (SELECT created_at FROM subscriptions WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 1),
    (SELECT created_at FROM auth.users WHERE id = p_user_id)
  ) INTO v_subscription_date;

  -- Check if onboarding sequence already scheduled
  IF EXISTS (
    SELECT 1 FROM onboarding_messages 
    WHERE user_id = p_user_id 
    AND message_key = 'onboarding_day0_welcome_email'
  ) THEN
    RETURN; -- Already scheduled
  END IF;

  -- Day 0: Welcome Email + SMS (immediate)
  v_day_offset := 0;
  v_scheduled_at := v_subscription_date;
  
  -- Schedule Day 0 Email
  INSERT INTO onboarding_messages (user_id, message_type, message_key, day_offset, scheduled_at, status)
  VALUES (p_user_id, 'email', 'onboarding_day0_welcome_email', v_day_offset, v_scheduled_at, 'pending')
  ON CONFLICT (user_id, message_key) DO NOTHING;

  -- Schedule Day 0 SMS (if phone exists)
  IF v_user_phone IS NOT NULL THEN
    INSERT INTO onboarding_messages (user_id, message_type, message_key, day_offset, scheduled_at, status)
    VALUES (p_user_id, 'sms', 'sms_onboarding_day0_welcome', v_day_offset, v_scheduled_at, 'pending')
    ON CONFLICT (user_id, message_key) DO NOTHING;
  END IF;

  -- Day 1: Launch Campaign #1 Email
  v_day_offset := 1;
  v_scheduled_at := v_subscription_date + INTERVAL '1 day';
  INSERT INTO onboarding_messages (user_id, message_type, message_key, day_offset, scheduled_at, status)
  VALUES (p_user_id, 'email', 'onboarding_day1_launch_campaign1', v_day_offset, v_scheduled_at, 'pending')
  ON CONFLICT (user_id, message_key) DO NOTHING;

  -- Day 2: Quick-Win Reminder SMS
  v_day_offset := 2;
  v_scheduled_at := v_subscription_date + INTERVAL '2 days';
  IF v_user_phone IS NOT NULL THEN
    INSERT INTO onboarding_messages (user_id, message_type, message_key, day_offset, scheduled_at, status)
    VALUES (p_user_id, 'sms', 'sms_onboarding_day2_reminder', v_day_offset, v_scheduled_at, 'pending')
    ON CONFLICT (user_id, message_key) DO NOTHING;
  END IF;

  -- Day 3: Value Proof Email
  v_day_offset := 3;
  v_scheduled_at := v_subscription_date + INTERVAL '3 days';
  INSERT INTO onboarding_messages (user_id, message_type, message_key, day_offset, scheduled_at, status)
  VALUES (p_user_id, 'email', 'onboarding_day3_value_proof', v_day_offset, v_scheduled_at, 'pending')
  ON CONFLICT (user_id, message_key) DO NOTHING;

  -- Day 4: Launch Campaign #2 Email
  v_day_offset := 4;
  v_scheduled_at := v_subscription_date + INTERVAL '4 days';
  INSERT INTO onboarding_messages (user_id, message_type, message_key, day_offset, scheduled_at, status)
  VALUES (p_user_id, 'email', 'onboarding_day4_launch_campaign2', v_day_offset, v_scheduled_at, 'pending')
  ON CONFLICT (user_id, message_key) DO NOTHING;

  -- Day 5: Personal Check-In SMS
  v_day_offset := 5;
  v_scheduled_at := v_subscription_date + INTERVAL '5 days';
  IF v_user_phone IS NOT NULL THEN
    INSERT INTO onboarding_messages (user_id, message_type, message_key, day_offset, scheduled_at, status)
    VALUES (p_user_id, 'sms', 'sms_onboarding_day5_checkin', v_day_offset, v_scheduled_at, 'pending')
    ON CONFLICT (user_id, message_key) DO NOTHING;
  END IF;

  -- Day 7: First Week Summary Email
  v_day_offset := 7;
  v_scheduled_at := v_subscription_date + INTERVAL '7 days';
  INSERT INTO onboarding_messages (user_id, message_type, message_key, day_offset, scheduled_at, status)
  VALUES (p_user_id, 'email', 'onboarding_day7_summary', v_day_offset, v_scheduled_at, 'pending')
  ON CONFLICT (user_id, message_key) DO NOTHING;

END;
$$;

-- ============================================================================
-- PART 5: FUNCTION TO SEND PENDING ONBOARDING MESSAGES
-- Called by cron job to process scheduled messages
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pending_onboarding_messages()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  message_type TEXT,
  message_key TEXT,
  day_offset INTEGER,
  scheduled_at TIMESTAMPTZ,
  user_email TEXT,
  user_phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    om.id,
    om.user_id,
    om.message_type,
    om.message_key,
    om.day_offset,
    om.scheduled_at,
    u.email::TEXT as user_email,
    u.raw_user_meta_data->>'phone'::TEXT as user_phone
  FROM onboarding_messages om
  JOIN auth.users u ON u.id = om.user_id
  WHERE om.status = 'pending'
    AND om.scheduled_at <= now()
    AND (
      (om.message_type = 'email' AND u.email IS NOT NULL)
      OR (om.message_type = 'sms' AND u.raw_user_meta_data->>'phone' IS NOT NULL)
    )
  ORDER BY om.scheduled_at ASC
  LIMIT 100; -- Process in batches
END;
$$;

-- ============================================================================
-- PART 6: TRIGGER TO AUTO-SCHEDULE ONBOARDING ON SUBSCRIPTION
-- Automatically schedules onboarding sequence when subscription is created
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_schedule_onboarding_on_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only trigger on new active subscriptions
  IF NEW.status = 'active' AND (OLD IS NULL OR OLD.status != 'active') THEN
    PERFORM schedule_onboarding_sequence(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on subscriptions table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions') THEN
    DROP TRIGGER IF EXISTS trg_schedule_onboarding_on_subscription ON subscriptions;
    CREATE TRIGGER trg_schedule_onboarding_on_subscription
      AFTER INSERT OR UPDATE ON subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION trigger_schedule_onboarding_on_subscription();
  END IF;
END $$;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE onboarding_messages IS 'Tracks 7-day onboarding email and SMS sequence for new SmartSend subscribers';
COMMENT ON COLUMN onboarding_messages.message_key IS 'Template key identifying which onboarding message to send';
COMMENT ON COLUMN onboarding_messages.day_offset IS 'Days after subscription (0, 1, 2, 3, 4, 5, 7)';
COMMENT ON FUNCTION schedule_onboarding_sequence IS 'Schedules all 7-day onboarding messages for a new subscriber';
COMMENT ON FUNCTION get_pending_onboarding_messages IS 'Returns pending onboarding messages ready to send (called by cron)';

