-- =========================================================
-- Block 19870 — Inbox Real-Time SMS + Texting Pipeline v1
-- (Two-Way SMS, Text-Based Replies, AI SMS Drafts, Fast Booking via Text, Unified Roofing Communications)
-- =========================================================
--
-- This block enables two-way SMS communication inside SmartSend Inbox.
-- Each workspace gets a dedicated phone number, SMS messages are unified with email in threads,
-- AI generates short texting-optimized drafts, and SMS booking flows are supported.
-- =========================================================

-- ============================================================================
-- 1. ADD SMS PHONE NUMBER TO workspace_settings
-- ============================================================================
-- Each workspace gets a dedicated SmartSend phone number for SMS

DO $$
BEGIN
  -- Add SMS phone number to workspace_settings JSONB
  -- This will be set via API when a workspace provisions a Twilio number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workspace_settings' 
    AND column_name = 'settings'
  ) THEN
    -- workspace_settings table should already exist, but ensure SMS config is in default
    RAISE NOTICE 'workspace_settings table should already exist';
  END IF;
END$$;

-- Function to get SMS phone number for a workspace
CREATE OR REPLACE FUNCTION public.get_workspace_sms_number(p_workspace_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (settings->'sms'->>'phone_number')::text
  FROM public.workspace_settings
  WHERE workspace_id = p_workspace_id;
$$;

COMMENT ON FUNCTION public.get_workspace_sms_number IS 'Returns the SMS phone number for a workspace';

-- ============================================================================
-- 2. ADD SMS CHANNEL SUPPORT TO inbox_messages
-- ============================================================================
-- Extend inbox_messages to support both email and SMS

-- Create message channel enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_message_channel') THEN
    CREATE TYPE inbox_message_channel AS ENUM ('email', 'sms');
  END IF;
END$$;

-- Add channel column to inbox_messages (allow NULL initially for backward compatibility)
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS channel inbox_message_channel DEFAULT 'email';

-- Add SMS-specific fields
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS from_phone text,
  ADD COLUMN IF NOT EXISTS to_phone text,
  ADD COLUMN IF NOT EXISTS sms_provider_message_id text, -- Twilio SID or similar
  ADD COLUMN IF NOT EXISTS sms_delivery_status text CHECK (sms_delivery_status IN ('queued', 'sent', 'delivered', 'failed', 'read')),
  ADD COLUMN IF NOT EXISTS sms_delivery_error text;

-- Create indexes for SMS fields
CREATE INDEX IF NOT EXISTS idx_inbox_messages_channel ON public.inbox_messages(channel);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_from_phone ON public.inbox_messages(from_phone);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_to_phone ON public.inbox_messages(to_phone);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_sms_provider_id ON public.inbox_messages(sms_provider_message_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_sms_delivery_status ON public.inbox_messages(sms_delivery_status);

-- Update existing messages to be email channel (if any exist)
UPDATE public.inbox_messages SET channel = 'email' WHERE channel IS NULL;

COMMENT ON COLUMN public.inbox_messages.channel IS 'Message channel: email or sms';
COMMENT ON COLUMN public.inbox_messages.from_phone IS 'Phone number sender (for SMS)';
COMMENT ON COLUMN public.inbox_messages.to_phone IS 'Phone number recipient (for SMS)';
COMMENT ON COLUMN public.inbox_messages.sms_provider_message_id IS 'Provider message ID (e.g., Twilio SID)';
COMMENT ON COLUMN public.inbox_messages.sms_delivery_status IS 'SMS delivery status: queued, sent, delivered, failed, read';

-- ============================================================================
-- 3. CREATE SMS DELIVERY LOGS TABLE
-- ============================================================================
-- Tracks SMS delivery status updates from Twilio webhooks

CREATE TABLE IF NOT EXISTS public.sms_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.inbox_messages(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL, -- Twilio SID
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'read', 'undelivered')),
  error_code text,
  error_message text,
  provider_response jsonb DEFAULT '{}'::jsonb, -- Full webhook payload
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_delivery_logs_message_id ON public.sms_delivery_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_sms_delivery_logs_workspace_id ON public.sms_delivery_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sms_delivery_logs_provider_id ON public.sms_delivery_logs(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_sms_delivery_logs_status ON public.sms_delivery_logs(status);
CREATE INDEX IF NOT EXISTS idx_sms_delivery_logs_created_at ON public.sms_delivery_logs(created_at DESC);

ALTER TABLE public.sms_delivery_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Workspace members can view delivery logs
DROP POLICY IF EXISTS "sms_delivery_logs_select" ON public.sms_delivery_logs;
CREATE POLICY "sms_delivery_logs_select"
  ON public.sms_delivery_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = sms_delivery_logs.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.sms_delivery_logs IS 'Tracks SMS delivery status updates from Twilio webhooks';

-- ============================================================================
-- 4. CREATE SMS COMPLIANCE TABLE (Opt-Out Tracking)
-- ============================================================================
-- Tracks SMS opt-outs for compliance

CREATE TABLE IF NOT EXISTS public.sms_opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone_number text NOT NULL, -- E.164 format
  opt_out_reason text CHECK (opt_out_reason IN ('stop', 'unsubscribe', 'manual', 'complaint')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  detected_from_message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_opt_outs_workspace_phone ON public.sms_opt_outs(workspace_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_contact_id ON public.sms_opt_outs(contact_id);
CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_phone_number ON public.sms_opt_outs(phone_number);

ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;

-- RLS: Workspace members can view opt-outs
DROP POLICY IF EXISTS "sms_opt_outs_select" ON public.sms_opt_outs;
CREATE POLICY "sms_opt_outs_select"
  ON public.sms_opt_outs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = sms_opt_outs.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Add sms_opt_out flag to contacts table
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS sms_opt_out boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contacts_sms_opt_out ON public.contacts(sms_opt_out);

COMMENT ON TABLE public.sms_opt_outs IS 'Tracks SMS opt-outs for compliance (STOP, UNSUBSCRIBE, etc.)';
COMMENT ON COLUMN public.contacts.sms_opt_out IS 'Flag indicating if contact has opted out of SMS';

-- ============================================================================
-- 5. ADD SMS AUTO-REPLY CONFIGURATION TO workspace_settings
-- ============================================================================
-- Configuration for SMS auto-replies (after hours, timed responses)

-- Function to update workspace_settings with SMS config
CREATE OR REPLACE FUNCTION public.update_workspace_sms_settings(
  p_workspace_id uuid,
  p_sms_config jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert or update workspace_settings with SMS config
  INSERT INTO public.workspace_settings (workspace_id, settings)
  VALUES (
    p_workspace_id,
    jsonb_build_object(
      'sms', p_sms_config
    )
  )
  ON CONFLICT (workspace_id)
  DO UPDATE SET
    settings = jsonb_set(
      COALESCE(workspace_settings.settings, '{}'::jsonb),
      '{sms}',
      p_sms_config
    ),
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.update_workspace_sms_settings IS 'Updates SMS configuration in workspace_settings';

-- ============================================================================
-- 6. CREATE SMS BOOKING FLOW SUPPORT
-- ============================================================================
-- Tracks SMS-based appointment booking attempts

CREATE TABLE IF NOT EXISTS public.sms_booking_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  booking_intent_detected boolean DEFAULT false,
  proposed_times jsonb DEFAULT '[]'::jsonb, -- Array of proposed appointment times
  confirmed_time timestamptz,
  booking_status text CHECK (booking_status IN ('pending', 'confirmed', 'cancelled', 'completed')) DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_booking_attempts_thread_id ON public.sms_booking_attempts(thread_id);
CREATE INDEX IF NOT EXISTS idx_sms_booking_attempts_contact_id ON public.sms_booking_attempts(contact_id);
CREATE INDEX IF NOT EXISTS idx_sms_booking_attempts_workspace_id ON public.sms_booking_attempts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sms_booking_attempts_status ON public.sms_booking_attempts(booking_status);

ALTER TABLE public.sms_booking_attempts ENABLE ROW LEVEL SECURITY;

-- RLS: Workspace members can view booking attempts
DROP POLICY IF EXISTS "sms_booking_attempts_select" ON public.sms_booking_attempts;
CREATE POLICY "sms_booking_attempts_select"
  ON public.sms_booking_attempts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = sms_booking_attempts.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Update timestamp trigger for booking attempts
CREATE OR REPLACE FUNCTION public.update_sms_booking_attempts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_booking_attempts_updated_at ON public.sms_booking_attempts;
CREATE TRIGGER trg_sms_booking_attempts_updated_at
  BEFORE UPDATE ON public.sms_booking_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_sms_booking_attempts_updated_at();

COMMENT ON TABLE public.sms_booking_attempts IS 'Tracks SMS-based appointment booking attempts and confirmations';

-- ============================================================================
-- 7. CREATE SMS TASK AUTOMATION TRACKING
-- ============================================================================
-- Links SMS messages to task creation triggers

-- Add SMS task trigger metadata to inbox_messages
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS sms_task_created boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_task_id uuid; -- References tasks table if exists

CREATE INDEX IF NOT EXISTS idx_inbox_messages_sms_task_created ON public.inbox_messages(sms_task_created);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_sms_task_id ON public.inbox_messages(sms_task_id);

COMMENT ON COLUMN public.inbox_messages.sms_task_created IS 'Flag indicating if a task was auto-created from this SMS';
COMMENT ON COLUMN public.inbox_messages.sms_task_id IS 'Reference to task created from this SMS message';

-- ============================================================================
-- 8. UPDATE inbox_threads FOR UNIFIED EMAIL + SMS
-- ============================================================================
-- Ensure threads can handle both email and SMS messages

-- Add last channel used to threads
ALTER TABLE public.inbox_threads
  ADD COLUMN IF NOT EXISTS last_channel inbox_message_channel DEFAULT 'email';

CREATE INDEX IF NOT EXISTS idx_inbox_threads_last_channel ON public.inbox_threads(last_channel);

COMMENT ON COLUMN public.inbox_threads.last_channel IS 'Last channel used in this thread (email or sms)';

-- Function to update thread's last channel when message is inserted
CREATE OR REPLACE FUNCTION public.update_thread_channel_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update thread's last_channel and last_message_at
  UPDATE public.inbox_threads
  SET 
    last_channel = NEW.channel,
    last_message_at = NEW.received_at,
    updated_at = now()
  WHERE id = NEW.thread_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_thread_channel_on_message ON public.inbox_messages;
CREATE TRIGGER trg_update_thread_channel_on_message
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_thread_channel_on_message();

-- ============================================================================
-- 9. CREATE SMS QA LOGS TABLE
-- ============================================================================
-- Logs SMS messages for QA and compliance (similar to email QA logs)

CREATE TABLE IF NOT EXISTS public.sms_qa_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.inbox_messages(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone_number text NOT NULL,
  body text NOT NULL,
  ai_intent inbox_ai_intent,
  ai_confidence numeric(3,2),
  flagged boolean DEFAULT false,
  flagged_reason text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_qa_logs_message_id ON public.sms_qa_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_sms_qa_logs_workspace_id ON public.sms_qa_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sms_qa_logs_flagged ON public.sms_qa_logs(flagged);
CREATE INDEX IF NOT EXISTS idx_sms_qa_logs_created_at ON public.sms_qa_logs(created_at DESC);

ALTER TABLE public.sms_qa_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Workspace members can view QA logs
DROP POLICY IF EXISTS "sms_qa_logs_select" ON public.sms_qa_logs;
CREATE POLICY "sms_qa_logs_select"
  ON public.sms_qa_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = sms_qa_logs.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.sms_qa_logs IS 'Logs SMS messages for QA and compliance auditing';

-- ============================================================================
-- 10. CREATE FUNCTION TO CHECK SMS OPT-OUT STATUS
-- ============================================================================
-- Helper function to check if a phone number has opted out

CREATE OR REPLACE FUNCTION public.is_sms_opted_out(
  p_workspace_id uuid,
  p_phone_number text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sms_opt_outs
    WHERE workspace_id = p_workspace_id
    AND phone_number = p_phone_number
  )
  OR EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.workspace_id = p_workspace_id
    AND c.phone = p_phone_number
    AND c.sms_opt_out = true
  );
$$;

COMMENT ON FUNCTION public.is_sms_opted_out IS 'Checks if a phone number has opted out of SMS for a workspace';

-- ============================================================================
-- 11. CREATE FUNCTION TO DETECT OPT-OUT FROM MESSAGE
-- ============================================================================
-- Automatically detects STOP, UNSUBSCRIBE, etc. from SMS body

CREATE OR REPLACE FUNCTION public.detect_sms_opt_out(
  p_message_body text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_body_lower text;
BEGIN
  v_body_lower := lower(trim(p_message_body));
  
  -- Check for common opt-out keywords
  IF v_body_lower IN ('stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit') THEN
    RETURN 'stop';
  ELSIF v_body_lower LIKE '%unsubscribe%' THEN
    RETURN 'unsubscribe';
  ELSIF v_body_lower LIKE '%opt out%' OR v_body_lower LIKE '%optout%' THEN
    RETURN 'unsubscribe';
  ELSE
    RETURN NULL;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.detect_sms_opt_out IS 'Detects opt-out keywords in SMS message body';

-- ============================================================================
-- 12. CREATE TRIGGER TO AUTO-DETECT OPT-OUTS
-- ============================================================================
-- Automatically creates opt-out record when STOP/UNSUBSCRIBE detected

CREATE OR REPLACE FUNCTION public.handle_sms_opt_out_detection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opt_out_reason text;
  v_workspace_id uuid;
  v_contact_id uuid;
BEGIN
  -- Only process inbound SMS messages
  IF NEW.channel != 'sms' OR NEW.from_email IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Detect opt-out
  v_opt_out_reason := public.detect_sms_opt_out(NEW.body_raw);
  
  IF v_opt_out_reason IS NOT NULL THEN
    -- Get workspace_id from thread
    SELECT t.campaign_id INTO v_workspace_id
    FROM public.inbox_threads t
    WHERE t.id = NEW.thread_id;
    
    -- Get workspace_id from campaign if needed
    IF v_workspace_id IS NULL THEN
      SELECT c.workspace_id INTO v_workspace_id
      FROM public.campaigns c
      WHERE c.id = (SELECT campaign_id FROM public.inbox_threads WHERE id = NEW.thread_id);
    END IF;
    
    -- Get contact_id from thread
    SELECT contact_id INTO v_contact_id
    FROM public.inbox_threads
    WHERE id = NEW.thread_id;
    
    -- Create opt-out record
    INSERT INTO public.sms_opt_outs (
      workspace_id,
      contact_id,
      phone_number,
      opt_out_reason,
      detected_from_message_id
    )
    VALUES (
      v_workspace_id,
      v_contact_id,
      NEW.from_phone,
      v_opt_out_reason,
      NEW.id
    )
    ON CONFLICT (workspace_id, phone_number) DO NOTHING;
    
    -- Update contact sms_opt_out flag
    IF v_contact_id IS NOT NULL THEN
      UPDATE public.contacts
      SET sms_opt_out = true
      WHERE id = v_contact_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_sms_opt_out_detection ON public.inbox_messages;
CREATE TRIGGER trg_handle_sms_opt_out_detection
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_sms_opt_out_detection();

-- ============================================================================
-- 13. ENABLE REALTIME FOR SMS TABLES
-- ============================================================================
-- Allow frontend to subscribe to SMS messages in real-time

DO $$
BEGIN
  -- Add sms_delivery_logs to realtime publication
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'sms_delivery_logs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_delivery_logs;
    END IF;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Realtime publication update requires superuser. Enable via Supabase Dashboard > Database > Replication.';
END $$;

-- ============================================================================
-- 14. COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.sms_delivery_logs IS 'Tracks SMS delivery status updates from Twilio webhooks for transparency and trust';
COMMENT ON TABLE public.sms_opt_outs IS 'Tracks SMS opt-outs for compliance. Prevents sending SMS to opted-out numbers.';
COMMENT ON TABLE public.sms_booking_attempts IS 'Tracks SMS-based appointment booking attempts. Enables fast booking via text.';
COMMENT ON TABLE public.sms_qa_logs IS 'Logs SMS messages for QA and compliance auditing, similar to email QA logs';

-- ============================================================================
-- 15. HELPER FUNCTION TO SET WORKSPACE SMS PHONE NUMBER
-- ============================================================================
-- Makes it easy to assign a phone number to a workspace

CREATE OR REPLACE FUNCTION public.set_workspace_sms_number(
  p_workspace_id uuid,
  p_phone_number text,
  p_provider text DEFAULT 'twilio',
  p_credentials jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sms_config jsonb;
BEGIN
  v_sms_config := jsonb_build_object(
    'phone_number', p_phone_number,
    'provider', p_provider,
    'credentials', p_credentials,
    'auto_reply_enabled', false,
    'business_hours', jsonb_build_object('start', 9, 'end', 17),
    'after_hours_message', 'Got your message — we''ll reach out first thing in the morning. If it''s urgent, reply URGENT.'
  );

  -- Insert or update workspace_settings with SMS config
  INSERT INTO public.workspace_settings (workspace_id, settings)
  VALUES (
    p_workspace_id,
    jsonb_build_object('sms', v_sms_config)
  )
  ON CONFLICT (workspace_id)
  DO UPDATE SET
    settings = jsonb_set(
      COALESCE(workspace_settings.settings, '{}'::jsonb),
      '{sms}',
      v_sms_config
    ),
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.set_workspace_sms_number IS 'Assigns a phone number to a workspace for SMS functionality';

-- ============================================================================
-- END OF BLOCK 19870
-- ============================================================================

