-- =========================================================
-- Block 20270 — SmartSend Inbox Engagement Scoring + Heat Meter v1
-- (Real "hot / warm / cold" logic behind the Inbox, not vibes.)
-- =========================================================

-- ============================================================================
-- PART 1 — Add Engagement Counters + Scoring Columns to inbox_threads
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS email_open_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_click_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_open_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_click_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_level TEXT CHECK (engagement_level IN ('cold', 'warm', 'hot'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_threads_email_open_count ON public.inbox_threads(email_open_count) WHERE email_open_count > 0;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_email_click_count ON public.inbox_threads(email_click_count) WHERE email_click_count > 0;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_reply_count ON public.inbox_threads(reply_count) WHERE reply_count > 0;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_last_open_at ON public.inbox_threads(last_open_at DESC) WHERE last_open_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_last_click_at ON public.inbox_threads(last_click_at DESC) WHERE last_click_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_engagement_score ON public.inbox_threads(engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_engagement_level ON public.inbox_threads(engagement_level);

-- Comments for documentation
COMMENT ON COLUMN public.inbox_threads.email_open_count IS 'Number of times emails have been opened by the homeowner';
COMMENT ON COLUMN public.inbox_threads.email_click_count IS 'Number of times links have been clicked by the homeowner';
COMMENT ON COLUMN public.inbox_threads.reply_count IS 'Number of replies received from the homeowner';
COMMENT ON COLUMN public.inbox_threads.last_open_at IS 'Timestamp of the most recent email open';
COMMENT ON COLUMN public.inbox_threads.last_click_at IS 'Timestamp of the most recent link click';
COMMENT ON COLUMN public.inbox_threads.engagement_score IS 'Computed engagement score (0-100+) based on opens, clicks, replies, calls, appointments';
COMMENT ON COLUMN public.inbox_threads.engagement_level IS 'Engagement level: cold, warm, or hot';

-- ============================================================================
-- PART 2 — Helper Function: Compute Engagement Score
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_compute_engagement_score(
  p_email_open_count INTEGER,
  p_email_click_count INTEGER,
  p_reply_count INTEGER,
  p_call_count INTEGER,
  p_has_appointment BOOLEAN,
  p_last_contact_at TIMESTAMPTZ
) RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER := 0;
  v_days_since_last_contact INTEGER;
BEGIN
  -- Base points
  v_score := v_score
    + COALESCE(p_email_open_count, 0) * 3
    + COALESCE(p_email_click_count, 0) * 7
    + COALESCE(p_reply_count, 0) * 15
    + COALESCE(p_call_count, 0) * 5;

  IF p_has_appointment THEN
    v_score := v_score + 25;
  END IF;

  -- Time decay (if no contact for many days, cool off)
  IF p_last_contact_at IS NOT NULL THEN
    v_days_since_last_contact :=
      GREATEST(0, CAST(EXTRACT(EPOCH FROM (now() - p_last_contact_at)) / 86400 AS INTEGER));
    v_score := v_score - (v_days_since_last_contact * 3);
  END IF;

  -- Clamp floor
  IF v_score < 0 THEN
    v_score := 0;
  END IF;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3 — Full Updater: Recompute Score + Level for One Conversation
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_update_conversation_engagement(p_conversation_id UUID)
RETURNS VOID AS $$
DECLARE
  r_convo RECORD;
  v_score INTEGER;
  v_level TEXT;
BEGIN
  SELECT
    email_open_count,
    email_click_count,
    reply_count,
    call_count,
    (appointment_status = 'scheduled') AS has_appointment,
    last_contact_at
  INTO r_convo
  FROM inbox_threads
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_score := fn_compute_engagement_score(
    r_convo.email_open_count,
    r_convo.email_click_count,
    r_convo.reply_count,
    r_convo.call_count,
    r_convo.has_appointment,
    r_convo.last_contact_at
  );

  -- Map score -> level
  IF v_score >= 70 THEN
    v_level := 'hot';
  ELSIF v_score >= 30 THEN
    v_level := 'warm';
  ELSE
    v_level := 'cold';
  END IF;

  UPDATE inbox_threads
  SET
    engagement_score = v_score,
    engagement_level = v_level,
    updated_at = now()
  WHERE id = p_conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Comment for documentation
COMMENT ON FUNCTION fn_compute_engagement_score IS 'Computes engagement score from counters and signals. Returns integer score (0-100+).';
COMMENT ON FUNCTION fn_update_conversation_engagement IS 'Updates engagement_score and engagement_level for a conversation based on current counters and signals.';

















































