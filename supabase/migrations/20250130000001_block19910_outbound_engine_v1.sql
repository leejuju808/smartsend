-- =========================================================
-- Block 19910 — Inbox Multi-Channel Outbound Engine v1
-- (Email + SMS + Voicemail Drop + Call Scripts + AI Outreach Packs)
-- =========================================================
--
-- This block creates the database foundation for the SmartSend Outbound Engine,
-- allowing roofing companies to reach out to old leads, re-engage stale quotes,
-- message past customers, run win-back campaigns, and more.
-- =========================================================

-- ============================================================================
-- 1. CREATE ENUM TYPES
-- ============================================================================

-- Outbound channel enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbound_channel') THEN
    CREATE TYPE outbound_channel AS ENUM ('email', 'sms', 'voicemail', 'multi_step');
  END IF;
END$$;

-- Outbound status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbound_status') THEN
    CREATE TYPE outbound_status AS ENUM ('pending', 'queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked', 'replied', 'opted_out');
  END IF;
END$$;

-- Multi-step sequence type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'multistep_sequence_type') THEN
    CREATE TYPE multistep_sequence_type AS ENUM ('sms_then_email', 'email_then_sms');
  END IF;
END$$;

-- ============================================================================
-- 2. CREATE outbound_logs TABLE
-- ============================================================================
-- Main table tracking every outbound attempt

CREATE TABLE IF NOT EXISTS public.outbound_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  
  -- Channel and message details
  channel outbound_channel NOT NULL,
  message text NOT NULL,
  subject text, -- For email
  
  -- Multi-step sequence (if applicable)
  is_multistep boolean DEFAULT false,
  multistep_sequence_type multistep_sequence_type,
  multistep_step_number integer DEFAULT 1, -- 1 or 2
  
  -- Status tracking
  status outbound_status NOT NULL DEFAULT 'pending',
  
  -- Scheduling
  scheduled_at timestamptz,
  sent_at timestamptz,
  
  -- Engagement tracking
  opened_at timestamptz,
  clicked_at timestamptz,
  replied_at timestamptz,
  
  -- Revenue attribution
  booking_id uuid, -- Reference to booking/job if created
  revenue_attributed numeric(12,2), -- Revenue from this outbound
  
  -- AI and templates
  ai_outreach_pack_id text, -- Which pack was used (e.g., 'old_lead_reactivation', 'storm_event')
  ai_outreach_angle text, -- Which angle from the pack
  call_script text, -- AI-generated call script if applicable
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb, -- Flexible JSON for additional data
  
  -- User tracking
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_outbound_logs_workspace_id ON public.outbound_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_outbound_logs_contact_id ON public.outbound_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_outbound_logs_campaign_id ON public.outbound_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outbound_logs_thread_id ON public.outbound_logs(thread_id);
CREATE INDEX IF NOT EXISTS idx_outbound_logs_channel ON public.outbound_logs(channel);
CREATE INDEX IF NOT EXISTS idx_outbound_logs_status ON public.outbound_logs(status);
CREATE INDEX IF NOT EXISTS idx_outbound_logs_scheduled_at ON public.outbound_logs(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_outbound_logs_sent_at ON public.outbound_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_logs_created_by ON public.outbound_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_outbound_logs_ai_pack ON public.outbound_logs(ai_outreach_pack_id);

-- ============================================================================
-- 3. CREATE outbound_events TABLE
-- ============================================================================
-- Detailed event tracking for each outbound (opens, clicks, replies, etc.)

CREATE TABLE IF NOT EXISTS public.outbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbound_log_id uuid NOT NULL REFERENCES public.outbound_logs(id) ON DELETE CASCADE,
  
  -- Event details
  event_type text NOT NULL, -- 'open', 'click', 'reply', 'bounce', 'opt_out', 'delivery', etc.
  event_data jsonb DEFAULT '{}'::jsonb, -- Additional event-specific data
  
  -- Timestamps
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_outbound_events_log_id ON public.outbound_events(outbound_log_id);
CREATE INDEX IF NOT EXISTS idx_outbound_events_type ON public.outbound_events(event_type);
CREATE INDEX IF NOT EXISTS idx_outbound_events_occurred_at ON public.outbound_events(occurred_at DESC);

-- ============================================================================
-- 4. CREATE voicemail_drops TABLE
-- ============================================================================
-- Tracks voicemail drop recordings and sends

CREATE TABLE IF NOT EXISTS public.voicemail_drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Recording details
  recording_url text, -- URL to uploaded/recorded voicemail
  recording_duration_seconds integer,
  transcription text, -- Optional transcription
  
  -- Status
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'queued', 'dropped', 'failed'
  dropped_at timestamptz,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- User tracking
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_voicemail_drops_workspace_id ON public.voicemail_drops(workspace_id);
CREATE INDEX IF NOT EXISTS idx_voicemail_drops_contact_id ON public.voicemail_drops(contact_id);
CREATE INDEX IF NOT EXISTS idx_voicemail_drops_status ON public.voicemail_drops(status);

-- ============================================================================
-- 5. CREATE outbound_rate_limits TABLE
-- ============================================================================
-- Tracks rate limiting per workspace to prevent spam

CREATE TABLE IF NOT EXISTS public.outbound_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Rate limit tracking
  channel outbound_channel NOT NULL,
  count_today integer DEFAULT 0,
  count_this_hour integer DEFAULT 0,
  last_reset_date date NOT NULL DEFAULT CURRENT_DATE,
  last_reset_hour timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  
  -- Limits (can be customized per workspace)
  daily_limit integer DEFAULT 1000,
  hourly_limit integer DEFAULT 100,
  
  -- Timestamps
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Unique constraint: one record per workspace+channel
  UNIQUE(workspace_id, channel)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_outbound_rate_limits_workspace_channel ON public.outbound_rate_limits(workspace_id, channel);

-- ============================================================================
-- 6. CREATE TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_outbound_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger for outbound_logs
DROP TRIGGER IF EXISTS trg_outbound_logs_updated_at ON public.outbound_logs;
CREATE TRIGGER trg_outbound_logs_updated_at
  BEFORE UPDATE ON public.outbound_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_outbound_updated_at_column();

-- Trigger for voicemail_drops
DROP TRIGGER IF EXISTS trg_voicemail_drops_updated_at ON public.voicemail_drops;
CREATE TRIGGER trg_voicemail_drops_updated_at
  BEFORE UPDATE ON public.voicemail_drops
  FOR EACH ROW
  EXECUTE FUNCTION public.update_outbound_updated_at_column();

-- Trigger for outbound_rate_limits
DROP TRIGGER IF EXISTS trg_outbound_rate_limits_updated_at ON public.outbound_rate_limits;
CREATE TRIGGER trg_outbound_rate_limits_updated_at
  BEFORE UPDATE ON public.outbound_rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_outbound_updated_at_column();

-- ============================================================================
-- 7. CREATE FUNCTION TO CHECK RATE LIMITS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_outbound_rate_limit(
  p_workspace_id uuid,
  p_channel outbound_channel
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rate_limit_record public.outbound_rate_limits%ROWTYPE;
  v_current_date date := CURRENT_DATE;
  v_current_hour timestamptz := date_trunc('hour', now());
BEGIN
  -- Get or create rate limit record
  SELECT * INTO v_rate_limit_record
  FROM public.outbound_rate_limits
  WHERE workspace_id = p_workspace_id
    AND channel = p_channel;
  
  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.outbound_rate_limits (workspace_id, channel)
    VALUES (p_workspace_id, p_channel)
    RETURNING * INTO v_rate_limit_record;
  END IF;
  
  -- Reset daily count if new day
  IF v_rate_limit_record.last_reset_date < v_current_date THEN
    UPDATE public.outbound_rate_limits
    SET count_today = 0,
        last_reset_date = v_current_date,
        updated_at = now()
    WHERE id = v_rate_limit_record.id;
    v_rate_limit_record.count_today := 0;
  END IF;
  
  -- Reset hourly count if new hour
  IF v_rate_limit_record.last_reset_hour < v_current_hour THEN
    UPDATE public.outbound_rate_limits
    SET count_this_hour = 0,
        last_reset_hour = v_current_hour,
        updated_at = now()
    WHERE id = v_rate_limit_record.id;
    v_rate_limit_record.count_this_hour := 0;
  END IF;
  
  -- Check limits
  IF v_rate_limit_record.count_today >= v_rate_limit_record.daily_limit THEN
    RETURN false; -- Daily limit exceeded
  END IF;
  
  IF v_rate_limit_record.count_this_hour >= v_rate_limit_record.hourly_limit THEN
    RETURN false; -- Hourly limit exceeded
  END IF;
  
  RETURN true; -- Within limits
END;
$$;

-- ============================================================================
-- 8. CREATE FUNCTION TO INCREMENT RATE LIMIT COUNTER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_outbound_rate_limit(
  p_workspace_id uuid,
  p_channel outbound_channel
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_date date := CURRENT_DATE;
  v_current_hour timestamptz := date_trunc('hour', now());
BEGIN
  -- Insert or update rate limit record
  INSERT INTO public.outbound_rate_limits (workspace_id, channel, count_today, count_this_hour, last_reset_date, last_reset_hour)
  VALUES (p_workspace_id, p_channel, 1, 1, v_current_date, v_current_hour)
  ON CONFLICT (workspace_id, channel)
  DO UPDATE SET
    count_today = CASE
      WHEN outbound_rate_limits.last_reset_date < v_current_date THEN 1
      ELSE outbound_rate_limits.count_today + 1
    END,
    count_this_hour = CASE
      WHEN outbound_rate_limits.last_reset_hour < v_current_hour THEN 1
      ELSE outbound_rate_limits.count_this_hour + 1
    END,
    last_reset_date = CASE
      WHEN outbound_rate_limits.last_reset_date < v_current_date THEN v_current_date
      ELSE outbound_rate_limits.last_reset_date
    END,
    last_reset_hour = CASE
      WHEN outbound_rate_limits.last_reset_hour < v_current_hour THEN v_current_hour
      ELSE outbound_rate_limits.last_reset_hour
    END,
    updated_at = now();
END;
$$;

-- ============================================================================
-- 9. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.outbound_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voicemail_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_rate_limits ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 10. RLS POLICIES
-- ============================================================================

-- Helper function to check workspace membership
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid()
  );
END;
$$;

-- RLS Policy: outbound_logs SELECT
DROP POLICY IF EXISTS "outbound_logs_select" ON public.outbound_logs;
CREATE POLICY "outbound_logs_select"
  ON public.outbound_logs
  FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- RLS Policy: outbound_logs INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "outbound_logs_modify" ON public.outbound_logs;
CREATE POLICY "outbound_logs_modify"
  ON public.outbound_logs
  FOR ALL
  USING (public.is_workspace_member(workspace_id) AND created_by = auth.uid())
  WITH CHECK (public.is_workspace_member(workspace_id) AND created_by = auth.uid());

-- RLS Policy: outbound_events SELECT
DROP POLICY IF EXISTS "outbound_events_select" ON public.outbound_events;
CREATE POLICY "outbound_events_select"
  ON public.outbound_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.outbound_logs ol
      WHERE ol.id = outbound_events.outbound_log_id
      AND public.is_workspace_member(ol.workspace_id)
    )
  );

-- RLS Policy: outbound_events INSERT
DROP POLICY IF EXISTS "outbound_events_insert" ON public.outbound_events;
CREATE POLICY "outbound_events_insert"
  ON public.outbound_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.outbound_logs ol
      WHERE ol.id = outbound_events.outbound_log_id
      AND public.is_workspace_member(ol.workspace_id)
    )
  );

-- RLS Policy: voicemail_drops SELECT
DROP POLICY IF EXISTS "voicemail_drops_select" ON public.voicemail_drops;
CREATE POLICY "voicemail_drops_select"
  ON public.voicemail_drops
  FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- RLS Policy: voicemail_drops INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "voicemail_drops_modify" ON public.voicemail_drops;
CREATE POLICY "voicemail_drops_modify"
  ON public.voicemail_drops
  FOR ALL
  USING (public.is_workspace_member(workspace_id) AND created_by = auth.uid())
  WITH CHECK (public.is_workspace_member(workspace_id) AND created_by = auth.uid());

-- RLS Policy: outbound_rate_limits SELECT
DROP POLICY IF EXISTS "outbound_rate_limits_select" ON public.outbound_rate_limits;
CREATE POLICY "outbound_rate_limits_select"
  ON public.outbound_rate_limits
  FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- ============================================================================
-- 11. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.outbound_logs IS 'Main table tracking every outbound attempt (email, SMS, voicemail, multi-step)';
COMMENT ON TABLE public.outbound_events IS 'Detailed event tracking for each outbound (opens, clicks, replies, etc.)';
COMMENT ON TABLE public.voicemail_drops IS 'Tracks voicemail drop recordings and sends';
COMMENT ON TABLE public.outbound_rate_limits IS 'Tracks rate limiting per workspace to prevent spam';

COMMENT ON COLUMN public.outbound_logs.channel IS 'Channel used: email, sms, voicemail, or multi_step';
COMMENT ON COLUMN public.outbound_logs.status IS 'Status: pending, queued, sending, sent, delivered, failed, bounced, opened, clicked, replied, opted_out';
COMMENT ON COLUMN public.outbound_logs.ai_outreach_pack_id IS 'Which AI outreach pack was used (e.g., old_lead_reactivation, storm_event)';
COMMENT ON COLUMN public.outbound_logs.revenue_attributed IS 'Revenue from this outbound attempt';

-- ============================================================================
-- 12. CREATE FUNCTION FOR FOLLOW-UP AUTOMATION
-- ============================================================================
-- Automatically creates follow-up tasks for outbound messages that don't get replies

CREATE OR REPLACE FUNCTION public.create_outbound_followup_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_outbound_record RECORD;
BEGIN
  -- Find outbound messages sent 24+ hours ago that haven't been replied to
  FOR v_outbound_record IN
    SELECT ol.id, ol.contact_id, ol.workspace_id, ol.channel, ol.sent_at, ol.created_by
    FROM public.outbound_logs ol
    WHERE ol.status = 'sent'
      AND ol.sent_at IS NOT NULL
      AND ol.sent_at < now() - INTERVAL '24 hours'
      AND ol.replied_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.outbound_events oe
        WHERE oe.outbound_log_id = ol.id
        AND oe.event_type = 'followup_scheduled'
      )
    LIMIT 100
  LOOP
    -- Create follow-up event
    INSERT INTO public.outbound_events (outbound_log_id, event_type, event_data)
    VALUES (
      v_outbound_record.id,
      'followup_scheduled',
      jsonb_build_object(
        'scheduled_at', now() + INTERVAL '24 hours',
        'channel', v_outbound_record.channel
      )
    )
    ON CONFLICT DO NOTHING;

    -- Create task for 3-day follow-up if not exists
    IF NOT EXISTS (
      SELECT 1 FROM public.outbound_events oe
      WHERE oe.outbound_log_id = v_outbound_record.id
      AND oe.event_type = 'followup_scheduled'
      AND (oe.event_data->>'delay_days')::int = 3
    ) THEN
      INSERT INTO public.outbound_events (outbound_log_id, event_type, event_data)
      VALUES (
        v_outbound_record.id,
        'followup_scheduled',
        jsonb_build_object(
          'scheduled_at', now() + INTERVAL '3 days',
          'channel', v_outbound_record.channel,
          'delay_days', 3
        )
      );
    END IF;

    -- Create task for 7-day follow-up if not exists
    IF NOT EXISTS (
      SELECT 1 FROM public.outbound_events oe
      WHERE oe.outbound_log_id = v_outbound_record.id
      AND oe.event_type = 'followup_scheduled'
      AND (oe.event_data->>'delay_days')::int = 7
    ) THEN
      INSERT INTO public.outbound_events (outbound_log_id, event_type, event_data)
      VALUES (
        v_outbound_record.id,
        'followup_scheduled',
        jsonb_build_object(
          'scheduled_at', now() + INTERVAL '7 days',
          'channel', v_outbound_record.channel,
          'delay_days', 7
        )
      );
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- 13. CREATE TRIGGER TO UPDATE REPLY STATUS
-- ============================================================================
-- When a reply comes in, mark the outbound as replied

CREATE OR REPLACE FUNCTION public.update_outbound_on_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
  v_thread_id uuid;
BEGIN
  -- Try to get contact_id and thread_id from the new message
  IF TG_TABLE_NAME = 'inbox_messages' THEN
    v_contact_id := NEW.contact_id;
    v_thread_id := NEW.thread_id;
  ELSIF TG_TABLE_NAME = 'messages' THEN
    v_contact_id := (SELECT contact_id FROM public.contacts WHERE email = NEW.from_email LIMIT 1);
    v_thread_id := NEW.thread_id;
  END IF;

  -- If we have a contact_id, mark recent outbound messages as replied
  IF v_contact_id IS NOT NULL THEN
    UPDATE public.outbound_logs
    SET replied_at = now(),
        status = 'replied'
    WHERE contact_id = v_contact_id
      AND status IN ('sent', 'delivered')
      AND replied_at IS NULL
      AND sent_at > now() - INTERVAL '30 days';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on inbox_messages insert
DROP TRIGGER IF EXISTS trg_update_outbound_on_reply_inbox ON public.inbox_messages;
CREATE TRIGGER trg_update_outbound_on_reply_inbox
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.direction = 'inbound' OR NEW.direction = 'incoming')
  EXECUTE FUNCTION public.update_outbound_on_reply();

-- Trigger on messages insert (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    DROP TRIGGER IF EXISTS trg_update_outbound_on_reply_messages ON public.messages;
    CREATE TRIGGER trg_update_outbound_on_reply_messages
      AFTER INSERT ON public.messages
      FOR EACH ROW
      WHEN (NEW.direction = 'inbound' OR NEW.direction = 'incoming')
      EXECUTE FUNCTION public.update_outbound_on_reply();
  END IF;
END $$;

