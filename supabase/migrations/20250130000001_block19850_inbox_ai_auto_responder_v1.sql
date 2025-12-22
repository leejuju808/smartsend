-- =========================================================
-- Block 19850 — Inbox AI Auto-Responder v1
-- (Time-Delayed Replies, Smart Draft Queues, After-Hours Handling, Semi-Automatic Sending)
-- =========================================================
--
-- This block implements a comprehensive AI auto-responder system for SmartSend:
--
-- PART 1: Smart Draft Queue
--   - Auto-generates draft replies when homeowners message
--   - Stores drafts in auto_draft_replies table
--   - UI shows "AI Draft Ready" indicator
--
-- PART 2: After-Hours Auto-Responder
--   - Sends safe acknowledgments during quiet hours
--   - Configurable via inbox_settings
--
-- PART 3: AI Reply Timer
--   - Optional auto-send if owner doesn't respond within X minutes
--   - Only for HOT leads (configurable)
--
-- PART 4: Hot Lead Escalation
--   - Auto-escalates HOT leads if no response within window
--   - Sends urgent follow-up messages
--
-- PART 5: Multi-Draft Options
--   - Generates 3 tone variants: Direct, Friendly, Professional
--   - Stored in variants JSONB column
--
-- PART 6: Quick Reply Buttons
--   - Pre-generated quick actions (Yes, Schedule, Pricing, etc.)
--   - API endpoint: /api/inbox/drafts/quick-reply
--
-- PART 7: Confidence Thresholds
--   - Only generates drafts if confidence >= minimum (default 70%)
--   - Configurable per user
--
-- PART 8: Auto-Responder Logs
--   - Tracks all AI actions in auto_reply_logs table
--   - Fully traceable and auditable
--
-- PART 9: Owner Controls
--   - All features can be enabled/disabled in inbox_settings
--   - Granular control over auto-reply behavior
--
-- INTEGRATION:
--   - Edge function: supabase/functions/inbox-auto-responder/index.ts
--   - API endpoints: app/api/inbox/drafts/*
--   - AI service: src/lib/ai/autoResponder.ts
--   - Triggered automatically when inbound messages arrive via handleInboundReply()
--
-- =========================================================

-- ============================================================================
-- PART 1: SMART DRAFT QUEUE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.auto_draft_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  
  -- Draft content
  ai_reply_text text NOT NULL,
  ai_reply_subject text,
  
  -- AI metadata
  confidence numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reason text, -- "Schedule inquiry", "Leak emergency", etc.
  category text, -- From ReplyCategoryV2
  tone text DEFAULT 'professional' CHECK (tone IN ('direct', 'friendly', 'professional')),
  
  -- Multi-draft variants (stored as JSONB)
  variants jsonb DEFAULT '[]'::jsonb, -- Array of {tone, text} objects
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired', 'rejected')),
  used_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '24 hours'),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_draft_replies_thread ON public.auto_draft_replies(thread_id);
CREATE INDEX IF NOT EXISTS idx_auto_draft_replies_user ON public.auto_draft_replies(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_draft_replies_status ON public.auto_draft_replies(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_auto_draft_replies_message ON public.auto_draft_replies(message_id);

-- ============================================================================
-- PART 2: AUTO-REPLY LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.auto_reply_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_id uuid REFERENCES public.auto_draft_replies(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  
  -- Action details
  action_type text NOT NULL CHECK (action_type IN (
    'draft_created',
    'after_hours_reply_sent',
    'timer_reply_sent',
    'hot_lead_escalation_sent',
    'quick_reply_sent',
    'draft_used',
    'draft_rejected'
  )),
  
  -- AI content
  ai_text text NOT NULL,
  ai_subject text,
  confidence numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  
  -- Sending details
  sent_by_ai boolean DEFAULT false,
  sent_at timestamptz,
  
  -- Context
  reason text,
  trigger_reason text, -- "after_hours", "timer_expired", "hot_lead_no_response", etc.
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_reply_logs_thread ON public.auto_reply_logs(thread_id);
CREATE INDEX IF NOT EXISTS idx_auto_reply_logs_user ON public.auto_reply_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_reply_logs_action ON public.auto_reply_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_auto_reply_logs_created ON public.auto_reply_logs(created_at DESC);

-- ============================================================================
-- PART 3: ADD AUTO-RESPONDER SETTINGS TO INBOX_SETTINGS
-- ============================================================================

-- AI Drafting controls
ALTER TABLE public.inbox_settings
  ADD COLUMN IF NOT EXISTS ai_drafting_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_draft_confidence_minimum numeric(3,2) DEFAULT 0.70 CHECK (ai_draft_confidence_minimum >= 0.50 AND ai_draft_confidence_minimum <= 0.95);

-- After-hours auto-responder
ALTER TABLE public.inbox_settings
  ADD COLUMN IF NOT EXISTS after_hours_auto_responder_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS after_hours_override_urgent boolean DEFAULT true; -- Allow urgent messages even during quiet hours

-- Auto-send timer controls
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auto_send_timer') THEN
    CREATE TYPE auto_send_timer AS ENUM ('off', '3m', '5m', '10m', '15m');
  END IF;
END$$;

ALTER TABLE public.inbox_settings
  ADD COLUMN IF NOT EXISTS auto_send_timer auto_send_timer DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS auto_send_hot_leads_only boolean DEFAULT true; -- Only auto-send for hot leads

-- Hot lead escalation
ALTER TABLE public.inbox_settings
  ADD COLUMN IF NOT EXISTS hot_lead_auto_send_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hot_lead_response_window_minutes integer DEFAULT 5 CHECK (hot_lead_response_window_minutes >= 1 AND hot_lead_response_window_minutes <= 30);

-- Default tone for AI replies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_reply_tone') THEN
    CREATE TYPE ai_reply_tone AS ENUM ('direct', 'friendly', 'professional');
  END IF;
END$$;

ALTER TABLE public.inbox_settings
  ADD COLUMN IF NOT EXISTS ai_reply_tone_default ai_reply_tone DEFAULT 'professional';

-- ============================================================================
-- PART 4: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.auto_draft_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_reply_logs ENABLE ROW LEVEL SECURITY;

-- Auto draft replies: users can only see their own drafts
DROP POLICY IF EXISTS "auto_draft_replies_select_own" ON public.auto_draft_replies;
CREATE POLICY "auto_draft_replies_select_own" ON public.auto_draft_replies
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "auto_draft_replies_insert_own" ON public.auto_draft_replies;
CREATE POLICY "auto_draft_replies_insert_own" ON public.auto_draft_replies
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "auto_draft_replies_update_own" ON public.auto_draft_replies;
CREATE POLICY "auto_draft_replies_update_own" ON public.auto_draft_replies
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Auto reply logs: users can only see their own logs
DROP POLICY IF EXISTS "auto_reply_logs_select_own" ON public.auto_reply_logs;
CREATE POLICY "auto_reply_logs_select_own" ON public.auto_reply_logs
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "auto_reply_logs_insert_own" ON public.auto_reply_logs;
CREATE POLICY "auto_reply_logs_insert_own" ON public.auto_reply_logs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Service role has full access
GRANT ALL ON public.auto_draft_replies TO service_role;
GRANT ALL ON public.auto_reply_logs TO service_role;

-- ============================================================================
-- PART 5: HELPER FUNCTIONS
-- ============================================================================

-- Function to get user_id from thread_id
CREATE OR REPLACE FUNCTION public.get_thread_user_id(p_thread_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Try to get user_id from campaign
  SELECT c.user_id INTO v_user_id
  FROM public.inbox_threads t
  JOIN public.campaigns c ON c.id = t.campaign_id
  WHERE t.id = p_thread_id;
  
  -- If not found, try connected_accounts
  IF v_user_id IS NULL THEN
    SELECT ca.user_id INTO v_user_id
    FROM public.inbox_threads t
    JOIN public.connected_accounts ca ON ca.id = t.account_id
    WHERE t.id = p_thread_id;
  END IF;
  
  RETURN v_user_id;
END;
$$;

-- Function to check if thread is HOT (has urgent damage, booking intent, etc.)
CREATE OR REPLACE FUNCTION public.is_thread_hot(p_thread_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_is_hot boolean := false;
  v_latest_message public.inbox_messages;
BEGIN
  -- Get latest inbound message
  SELECT * INTO v_latest_message
  FROM public.inbox_messages
  WHERE thread_id = p_thread_id
    AND direction = 'inbound'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_latest_message IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check AI classification for hot signals
  -- Category indicates urgent_roof_damage, yes_come_inspect, etc.
  IF v_latest_message.ai_intent IN (
    'urgent_roof_damage',
    'yes_come_inspect',
    'yes_wants_estimate',
    'insurance_claim_active',
    'adjuster_coming_soon'
  ) THEN
    RETURN true;
  END IF;
  
  -- Check confidence and urgency keywords in body
  IF v_latest_message.ai_confidence >= 0.8 AND (
    v_latest_message.body_html ~* '(leak|leaking|water|emergency|urgent|hole|shingles|damage)'
  ) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Function to check if current time is after-hours (quiet hours)
CREATE OR REPLACE FUNCTION public.is_after_hours(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_settings public.inbox_settings;
BEGIN
  SELECT * INTO v_settings
  FROM public.inbox_settings
  WHERE user_id = p_user_id;
  
  IF v_settings IS NULL OR v_settings.quiet_hours_start IS NULL OR v_settings.quiet_hours_end IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if current day is in quiet_hours_days array
  IF v_settings.quiet_hours_days IS NOT NULL AND 
     NOT (EXTRACT(DOW FROM now())::integer = ANY(v_settings.quiet_hours_days)) THEN
    RETURN false;
  END IF;
  
  -- Check if current time is within quiet hours
  RETURN public.is_quiet_hours_active(p_user_id);
END;
$$;

-- Function to get latest draft for a thread
CREATE OR REPLACE FUNCTION public.get_latest_draft(p_thread_id uuid)
RETURNS public.auto_draft_replies
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_draft public.auto_draft_replies;
BEGIN
  SELECT * INTO v_draft
  FROM public.auto_draft_replies
  WHERE thread_id = p_thread_id
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN v_draft;
END;
$$;

-- Function to mark draft as used
CREATE OR REPLACE FUNCTION public.mark_draft_used(p_draft_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.auto_draft_replies
  SET status = 'used',
      used_at = now(),
      updated_at = now()
  WHERE id = p_draft_id;
END;
$$;

-- ============================================================================
-- PART 6: TRIGGER TO AUTO-GENERATE DRAFTS ON INBOUND MESSAGES
-- ============================================================================

-- This trigger will be called by an edge function after AI analysis
-- We create a placeholder function that can be called from the edge function

CREATE OR REPLACE FUNCTION public.create_auto_draft(
  p_thread_id uuid,
  p_message_id uuid,
  p_ai_reply_text text,
  p_ai_reply_subject text DEFAULT NULL,
  p_confidence numeric DEFAULT 0.7,
  p_reason text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_tone text DEFAULT 'professional',
  p_variants jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_draft_id uuid;
  v_settings public.inbox_settings;
BEGIN
  -- Get user_id from thread
  v_user_id := public.get_thread_user_id(p_thread_id);
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Could not determine user_id for thread %', p_thread_id;
  END IF;
  
  -- Get user settings
  SELECT * INTO v_settings
  FROM public.inbox_settings
  WHERE user_id = v_user_id;
  
  -- Check if AI drafting is enabled
  IF v_settings IS NULL OR NOT COALESCE(v_settings.ai_drafting_enabled, true) THEN
    RETURN NULL;
  END IF;
  
  -- Check confidence threshold
  IF p_confidence < COALESCE(v_settings.ai_draft_confidence_minimum, 0.70) THEN
    -- Log that draft was not created due to low confidence
    INSERT INTO public.auto_reply_logs (
      thread_id,
      user_id,
      message_id,
      action_type,
      ai_text,
      confidence,
      reason,
      trigger_reason
    ) VALUES (
      p_thread_id,
      v_user_id,
      p_message_id,
      'draft_created',
      'Draft not created - confidence below threshold',
      p_confidence,
      p_reason,
      'low_confidence'
    );
    RETURN NULL;
  END IF;
  
  -- Expire old pending drafts for this thread
  UPDATE public.auto_draft_replies
  SET status = 'expired',
      updated_at = now()
  WHERE thread_id = p_thread_id
    AND status = 'pending';
  
  -- Create new draft
  INSERT INTO public.auto_draft_replies (
    thread_id,
    user_id,
    message_id,
    ai_reply_text,
    ai_reply_subject,
    confidence,
    reason,
    category,
    tone,
    variants
  ) VALUES (
    p_thread_id,
    v_user_id,
    p_message_id,
    p_ai_reply_text,
    p_ai_reply_subject,
    p_confidence,
    p_reason,
    p_category,
    COALESCE(p_tone, COALESCE(v_settings.ai_reply_tone_default::text, 'professional')),
    p_variants
  )
  RETURNING id INTO v_draft_id;
  
  -- Log draft creation
  INSERT INTO public.auto_reply_logs (
    thread_id,
    user_id,
    draft_id,
    message_id,
    action_type,
    ai_text,
    ai_subject,
    confidence,
    reason,
    trigger_reason
  ) VALUES (
    p_thread_id,
    v_user_id,
    v_draft_id,
    p_message_id,
    'draft_created',
    p_ai_reply_text,
    p_ai_reply_subject,
    p_confidence,
    p_reason,
    'auto_generated'
  );
  
  RETURN v_draft_id;
END;
$$;

-- ============================================================================
-- PART 7: FUNCTION FOR AFTER-HOURS AUTO-RESPONDER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.send_after_hours_reply(
  p_thread_id uuid,
  p_message_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_settings public.inbox_settings;
  v_thread public.inbox_threads;
  v_message public.inbox_messages;
  v_is_urgent boolean;
  v_reply_text text;
BEGIN
  -- Get user_id
  v_user_id := public.get_thread_user_id(p_thread_id);
  
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get settings
  SELECT * INTO v_settings
  FROM public.inbox_settings
  WHERE user_id = v_user_id;
  
  -- Check if after-hours auto-responder is enabled
  IF v_settings IS NULL OR NOT COALESCE(v_settings.after_hours_auto_responder_enabled, false) THEN
    RETURN false;
  END IF;
  
  -- Check if we're in after-hours
  IF NOT public.is_after_hours(v_user_id) THEN
    RETURN false;
  END IF;
  
  -- Get thread and message
  SELECT * INTO v_thread FROM public.inbox_threads WHERE id = p_thread_id;
  SELECT * INTO v_message FROM public.inbox_messages WHERE id = p_message_id;
  
  IF v_thread IS NULL OR v_message IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if urgent (and if override is enabled)
  v_is_urgent := public.is_thread_hot(p_thread_id);
  
  IF v_is_urgent AND NOT COALESCE(v_settings.after_hours_override_urgent, true) THEN
    -- Don't send auto-reply for urgent if override is disabled
    RETURN false;
  END IF;
  
  -- Generate safe after-hours reply
  v_reply_text := 'Thanks for reaching out! We''ll take care of you first thing in the morning.';
  
  IF v_is_urgent THEN
    v_reply_text := v_reply_text || ' If this is urgent (leak/storm damage), reply ''URGENT'' and we''ll prioritize you ASAP.';
  END IF;
  
  -- Log the reply (actual sending will be handled by edge function)
  INSERT INTO public.auto_reply_logs (
    thread_id,
    user_id,
    message_id,
    action_type,
    ai_text,
    confidence,
    sent_by_ai,
    reason,
    trigger_reason
  ) VALUES (
    p_thread_id,
    v_user_id,
    p_message_id,
    'after_hours_reply_sent',
    v_reply_text,
    0.95, -- High confidence for simple acknowledgment
    true,
    'After-hours acknowledgment',
    CASE WHEN v_is_urgent THEN 'after_hours_urgent' ELSE 'after_hours' END
  );
  
  RETURN true;
END;
$$;

-- ============================================================================
-- PART 8: FUNCTION TO CHECK AND SEND TIMER-BASED REPLIES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_timer_auto_send()
RETURNS TABLE(thread_id uuid, draft_id uuid, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_record RECORD;
  v_settings public.inbox_settings;
  v_draft public.auto_draft_replies;
  v_thread public.inbox_threads;
  v_latest_outbound timestamptz;
  v_minutes_elapsed integer;
  v_timer_minutes integer;
BEGIN
  -- Find all threads with pending drafts that have timer enabled
  FOR v_thread_record IN
    SELECT DISTINCT t.id as thread_id, t.campaign_id, t.account_id
    FROM public.inbox_threads t
    JOIN public.auto_draft_replies d ON d.thread_id = t.id
    WHERE d.status = 'pending'
      AND d.expires_at > now()
  LOOP
    -- Get user_id
    DECLARE
      v_user_id uuid := public.get_thread_user_id(v_thread_record.thread_id);
    BEGIN
      IF v_user_id IS NULL THEN
        CONTINUE;
      END IF;
      
      -- Get settings
      SELECT * INTO v_settings
      FROM public.inbox_settings
      WHERE user_id = v_user_id;
      
      -- Check if timer is enabled
      IF v_settings IS NULL OR v_settings.auto_send_timer = 'off' THEN
        CONTINUE;
      END IF;
      
      -- Parse timer minutes
      v_timer_minutes := CASE v_settings.auto_send_timer
        WHEN '3m' THEN 3
        WHEN '5m' THEN 5
        WHEN '10m' THEN 10
        WHEN '15m' THEN 15
        ELSE 0
      END;
      
      -- Get latest outbound message time (when owner last responded)
      SELECT MAX(created_at) INTO v_latest_outbound
      FROM public.inbox_messages
      WHERE thread_id = v_thread_record.thread_id
        AND direction = 'outbound';
      
      -- If no outbound messages, check when last inbound arrived
      IF v_latest_outbound IS NULL THEN
        SELECT MAX(created_at) INTO v_latest_outbound
        FROM public.inbox_messages
        WHERE thread_id = v_thread_record.thread_id
          AND direction = 'inbound';
      END IF;
      
      -- Calculate minutes elapsed
      v_minutes_elapsed := EXTRACT(EPOCH FROM (now() - v_latest_outbound)) / 60;
      
      -- Check if timer has expired
      IF v_minutes_elapsed >= v_timer_minutes THEN
        -- Get latest draft
        SELECT * INTO v_draft
        FROM public.auto_draft_replies
        WHERE thread_id = v_thread_record.thread_id
          AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1;
        
        IF v_draft IS NULL THEN
          CONTINUE;
        END IF;
        
        -- Check if hot-leads-only restriction applies
        IF v_settings.auto_send_hot_leads_only THEN
          IF NOT public.is_thread_hot(v_thread_record.thread_id) THEN
            CONTINUE;
          END IF;
        END IF;
        
        -- Return this thread for auto-send
        thread_id := v_thread_record.thread_id;
        draft_id := v_draft.id;
        user_id := v_user_id;
        RETURN NEXT;
      END IF;
    END;
  END LOOP;
  
  RETURN;
END;
$$;

-- ============================================================================
-- PART 9: FUNCTION FOR HOT LEAD ESCALATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_hot_lead_escalation()
RETURNS TABLE(thread_id uuid, user_id uuid, escalation_text text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_record RECORD;
  v_settings public.inbox_settings;
  v_thread public.inbox_threads;
  v_latest_outbound timestamptz;
  v_minutes_elapsed integer;
BEGIN
  -- Find all HOT threads
  FOR v_thread_record IN
    SELECT DISTINCT t.id as thread_id, t.campaign_id, t.account_id
    FROM public.inbox_threads t
    WHERE public.is_thread_hot(t.id)
  LOOP
    DECLARE
      v_user_id uuid := public.get_thread_user_id(v_thread_record.thread_id);
    BEGIN
      IF v_user_id IS NULL THEN
        CONTINUE;
      END IF;
      
      -- Get settings
      SELECT * INTO v_settings
      FROM public.inbox_settings
      WHERE user_id = v_user_id;
      
      -- Check if hot lead auto-send is enabled
      IF v_settings IS NULL OR NOT COALESCE(v_settings.hot_lead_auto_send_enabled, false) THEN
        CONTINUE;
      END IF;
      
      -- Get latest outbound message time
      SELECT MAX(created_at) INTO v_latest_outbound
      FROM public.inbox_messages
      WHERE thread_id = v_thread_record.thread_id
        AND direction = 'outbound';
      
      -- If no outbound, check inbound
      IF v_latest_outbound IS NULL THEN
        SELECT MAX(created_at) INTO v_latest_outbound
        FROM public.inbox_messages
        WHERE thread_id = v_thread_record.thread_id
          AND direction = 'inbound';
      END IF;
      
      -- Calculate minutes elapsed
      v_minutes_elapsed := EXTRACT(EPOCH FROM (now() - v_latest_outbound)) / 60;
      
      -- Check if response window has passed
      IF v_minutes_elapsed >= COALESCE(v_settings.hot_lead_response_window_minutes, 5) THEN
        -- Generate escalation message
        thread_id := v_thread_record.thread_id;
        user_id := v_user_id;
        escalation_text := 'We''re ready right away! When would be a good time for us to come out and take a look?';
        RETURN NEXT;
      END IF;
    END;
  END LOOP;
  
  RETURN;
END;
$$;

-- ============================================================================
-- PART 10: UPDATE TRIGGERS
-- ============================================================================

-- Auto-update updated_at for drafts
CREATE OR REPLACE FUNCTION public.update_auto_draft_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_auto_draft_updated_at ON public.auto_draft_replies;
CREATE TRIGGER trg_update_auto_draft_updated_at
  BEFORE UPDATE ON public.auto_draft_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_auto_draft_updated_at();

-- ============================================================================
-- PART 11: TRIGGER TO AUTO-GENERATE DRAFTS ON INBOUND MESSAGES
-- ============================================================================

-- Function to trigger auto-draft generation via pg_notify
-- The application code (handleInboundReply) will call the edge function directly
-- This trigger is kept for potential future use with LISTEN/NOTIFY pattern
CREATE OR REPLACE FUNCTION public.trigger_auto_draft_generation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only process inbound messages
  -- Note: The actual auto-draft generation is handled by the application code
  -- in handleInboundReply() function which calls the edge function directly.
  -- This trigger can be used for future LISTEN/NOTIFY patterns if needed.
  IF NEW.direction IN ('inbound', 'in') THEN
    -- Emit notification (can be listened to by application if needed)
    PERFORM pg_notify('auto_draft_generation', json_build_object(
      'thread_id', NEW.thread_id,
      'message_id', NEW.id,
      'action', 'process_inbound'
    )::text);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on inbox_messages
DROP TRIGGER IF EXISTS trg_auto_draft_generation ON public.inbox_messages;
CREATE TRIGGER trg_auto_draft_generation
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.direction IN ('inbound', 'in'))
  EXECUTE FUNCTION public.trigger_auto_draft_generation();

-- ============================================================================
-- PART 12: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.auto_draft_replies IS 'AI-generated draft replies that owners can review and send';
COMMENT ON TABLE public.auto_reply_logs IS 'Log of all AI auto-reply actions (drafts created, messages sent, etc.)';
COMMENT ON COLUMN public.auto_draft_replies.confidence IS 'AI confidence score (0-1) for the draft reply';
COMMENT ON COLUMN public.auto_draft_replies.variants IS 'JSONB array of tone variants: [{"tone": "direct", "text": "..."}, ...]';
COMMENT ON COLUMN public.auto_reply_logs.action_type IS 'Type of action: draft_created, after_hours_reply_sent, timer_reply_sent, etc.';
COMMENT ON COLUMN public.auto_reply_logs.sent_by_ai IS 'Whether the message was actually sent by AI (true) or just drafted (false)';
COMMENT ON COLUMN public.inbox_settings.ai_drafting_enabled IS 'Enable automatic draft generation when homeowners message';
COMMENT ON COLUMN public.inbox_settings.after_hours_auto_responder_enabled IS 'Enable automatic after-hours acknowledgments';
COMMENT ON COLUMN public.inbox_settings.auto_send_timer IS 'Auto-send draft if owner doesn''t respond within this time (off, 3m, 5m, 10m, 15m)';
COMMENT ON COLUMN public.inbox_settings.hot_lead_auto_send_enabled IS 'Enable automatic escalation for HOT leads if no response within window';
COMMENT ON COLUMN public.inbox_settings.hot_lead_response_window_minutes IS 'Minutes to wait before escalating HOT leads';
COMMENT ON FUNCTION public.trigger_auto_draft_generation IS 'Trigger function to auto-generate drafts when inbound messages arrive (Block 19850)';

