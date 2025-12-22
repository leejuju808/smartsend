-- =========================================================
-- Block 21730 — SmartSend Roofing Lead Heat Score v1
-- (Interest Scoring Engine That Shows Roofers Who To Call FIRST)
-- =========================================================
-- 
-- This is THE feature that turns chaos into a money list.
-- Roofers open the CRM, see a huge list of leads, have no idea who actually cares.
-- SmartSend fixes this by giving each lead a HEAT SCORE from 0–100.
-- 
-- So the roofer can log in and immediately see:
-- "These 7 leads are HOT. Call these first. The rest can wait."
-- 
-- This is how you turn chaos into a money list.

-- ============================================================================
-- 1. ADD HEAT SCORE COLUMN TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS heat_score INTEGER DEFAULT 0;

-- Index for fast sorting by heat score
CREATE INDEX IF NOT EXISTS idx_leads_heat_score
ON public.leads (heat_score DESC);

-- Index for workspace + heat score queries
CREATE INDEX IF NOT EXISTS idx_leads_workspace_heat_score
ON public.leads (workspace_id, heat_score DESC)
WHERE workspace_id IS NOT NULL;

-- ============================================================================
-- 2. ADD LAST_REPLY_INTENT COLUMN (if not exists)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'last_reply_intent'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN last_reply_intent TEXT 
    CHECK (last_reply_intent IN ('hot', 'warm', 'cold') OR last_reply_intent IS NULL);
  END IF;
END $$;

-- ============================================================================
-- 3. ADD LAST_ACTIVITY_AT COLUMN (if not exists)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN last_activity_at TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================================================
-- 4. FUNCTION: Calculate Heat Score for One Lead
-- ============================================================================
-- Scoring Rules:
-- BASE POINTS BY STATUS:
--   hot → +50
--   warm → +25
--   cold → +0
--   new → +10
-- 
-- BEHAVIOR POINTS:
--   Email Opens (last 48h): +3 points per open (cap +15 from opens)
--   Link Clicks (last 72h): +15 per click (cap +30 from clicks)
--   Reply Intent (from AI): HOT → +30, WARM → +15, COLD → +0
-- 
-- TIME DECAY:
--   Every 3 days with no activity: −10 points (floor 0)

CREATE OR REPLACE FUNCTION public.calculate_lead_heat_score(p_lead_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status TEXT;
  v_score INT := 0;
  v_opens INT := 0;
  v_clicks INT := 0;
  v_last_activity TIMESTAMPTZ;
  v_days_idle INT := 0;
  v_last_reply_intent TEXT;
BEGIN
  -- Get status and last activity
  SELECT 
    status, 
    GREATEST(
      COALESCE(last_activity_at, last_reply_at, last_email_opened_at, last_email_sent_at, created_at),
      created_at
    )
  INTO v_status, v_last_activity
  FROM public.leads
  WHERE id = p_lead_id;

  -- If lead doesn't exist, return 0
  IF v_status IS NULL THEN
    RETURN 0;
  END IF;

  -- BASE POINTS BY STATUS
  IF v_status = 'hot' THEN
    v_score := v_score + 50;
  ELSIF v_status = 'warm' THEN
    v_score := v_score + 25;
  ELSIF v_status = 'new' THEN
    v_score := v_score + 10;
  END IF;
  -- cold → +0 (already default)

  -- EMAIL OPENS (last 48h)
  SELECT COUNT(*)
  INTO v_opens
  FROM public.email_events
  WHERE lead_id = p_lead_id
    AND event_type = 'open'
    AND created_at > NOW() - INTERVAL '48 hours';

  v_score := v_score + LEAST(v_opens * 3, 15);

  -- LINK CLICKS (last 72h)
  SELECT COUNT(*)
  INTO v_clicks
  FROM public.email_events
  WHERE lead_id = p_lead_id
    AND event_type = 'click'
    AND created_at > NOW() - INTERVAL '72 hours';

  v_score := v_score + LEAST(v_clicks * 15, 30);

  -- REPLY INTENT (stored on leads)
  SELECT last_reply_intent
  INTO v_last_reply_intent
  FROM public.leads
  WHERE id = p_lead_id;

  IF v_last_reply_intent = 'hot' THEN
    v_score := v_score + 30;
  ELSIF v_last_reply_intent = 'warm' THEN
    v_score := v_score + 15;
  END IF;
  -- cold → +0 (already default)

  -- TIME DECAY
  IF v_last_activity IS NOT NULL THEN
    v_days_idle := FLOOR(EXTRACT(EPOCH FROM (NOW() - v_last_activity)) / 86400);
    v_score := v_score - ((v_days_idle / 3) * 10);
  END IF;

  -- Clamp score between 0 and 100
  IF v_score < 0 THEN 
    v_score := 0; 
  END IF;
  IF v_score > 100 THEN 
    v_score := 100; 
  END IF;

  RETURN v_score;
END;
$$;

-- ============================================================================
-- 5. FUNCTION: Update Heat Score + Optional Timeline Logging
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_lead_heat_score(p_lead_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old INT;
  v_new INT;
BEGIN
  -- Get current heat score
  SELECT heat_score INTO v_old 
  FROM public.leads 
  WHERE id = p_lead_id;

  -- Calculate new score
  v_new := public.calculate_lead_heat_score(p_lead_id);

  -- Update the lead
  UPDATE public.leads
  SET heat_score = v_new
  WHERE id = p_lead_id;

  -- Only log big changes to timeline (jump of 20+)
  IF v_old IS NOT NULL AND ABS(v_new - v_old) >= 20 THEN
    INSERT INTO public.lead_timeline_events (
      lead_id, 
      event_type, 
      event_subtype, 
      message, 
      metadata
    )
    VALUES (
      p_lead_id,
      'heat_score_changed',
      'auto',
      'Lead heat score changed',
      jsonb_build_object('old', v_old, 'new', v_new)
    );
  END IF;

  -- Block 21734: Create call task if heat score passes threshold (70+)
  IF v_new >= 70 AND (v_old IS NULL OR v_old < 70) THEN
    PERFORM public.create_call_task_if_needed(p_lead_id, 'heat_score');
  END IF;
END;
$$;

-- ============================================================================
-- 6. TRIGGER: Auto-update heat score when email events are inserted
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_update_heat_score_on_email_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update heat score for the lead when email event is inserted
  IF NEW.lead_id IS NOT NULL THEN
    PERFORM public.update_lead_heat_score(NEW.lead_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on email_events table
DROP TRIGGER IF EXISTS trg_update_heat_score_on_email_event ON public.email_events;
CREATE TRIGGER trg_update_heat_score_on_email_event
  AFTER INSERT ON public.email_events
  FOR EACH ROW
  WHEN (NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION public.trigger_update_heat_score_on_email_event();

-- ============================================================================
-- 7. TRIGGER: Auto-update heat score when lead status changes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_update_heat_score_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update heat score when status changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.update_lead_heat_score(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on leads table
DROP TRIGGER IF EXISTS trg_update_heat_score_on_status_change ON public.leads;
CREATE TRIGGER trg_update_heat_score_on_status_change
  AFTER UPDATE OF status ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_heat_score_on_status_change();

-- ============================================================================
-- 8. TRIGGER: Auto-update heat score when last_reply_intent changes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_update_heat_score_on_reply_intent_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update heat score when reply intent changes
  IF OLD.last_reply_intent IS DISTINCT FROM NEW.last_reply_intent THEN
    PERFORM public.update_lead_heat_score(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on leads table
DROP TRIGGER IF EXISTS trg_update_heat_score_on_reply_intent_change ON public.leads;
CREATE TRIGGER trg_update_heat_score_on_reply_intent_change
  AFTER UPDATE OF last_reply_intent ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_heat_score_on_reply_intent_change();

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.leads.heat_score IS 'Lead heat score (0-100) indicating interest level. Higher = call first.';
COMMENT ON FUNCTION public.calculate_lead_heat_score IS 'Calculates heat score for a lead based on status, opens, clicks, reply intent, and time decay.';
COMMENT ON FUNCTION public.update_lead_heat_score IS 'Updates lead heat score and logs significant changes (20+ points) to timeline.';
COMMENT ON FUNCTION public.trigger_update_heat_score_on_email_event IS 'Automatically updates heat score when email events (open/click) are inserted.';
COMMENT ON FUNCTION public.trigger_update_heat_score_on_status_change IS 'Automatically updates heat score when lead status changes.';
COMMENT ON FUNCTION public.trigger_update_heat_score_on_reply_intent_change IS 'Automatically updates heat score when reply intent changes.';

