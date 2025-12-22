-- =========================================================
-- Block 21745 — SmartSend Roofing Risk & Churn Radar v1
-- (Detect Quiet Leads • At-Risk Jobs • Follow-Up Blind Spots)
-- =========================================================
-- 
-- This block makes SmartSend feel alive — like it's watching every lead
-- and warning the roofer: "You're about to lose this job if you don't act."
--
-- This is one of the most VALUE-DENSE features you will ever build.
-- You are giving roofers something JobNimbus, AccuLynx, Roofr, and ALL major CRMs do not have:
-- A Risk Radar that automatically flags leads, appointments, and estimates that are slipping away.
--
-- This saves roofers THOUSANDS per month by preventing lost jobs.

-- ============================================================================
-- STEP 1: Add Risk Fields to Leads Table
-- ============================================================================

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'none' CHECK (risk_level IN ('none', 'low', 'medium', 'high'));

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS risk_reason TEXT;

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS risk_updated_at TIMESTAMPTZ DEFAULT now();

-- Indexes for risk queries
CREATE INDEX IF NOT EXISTS idx_leads_risk_level
ON public.leads (risk_level)
WHERE risk_level != 'none';

CREATE INDEX IF NOT EXISTS idx_leads_risk_updated_at
ON public.leads (risk_updated_at DESC);

-- ============================================================================
-- STEP 2: RPC Function — Evaluate Lead Risk
-- ============================================================================
-- This is the engine that checks:
-- - last_activity_at
-- - first_hot_at
-- - first_contact_at
-- - appointment history
-- - quote history
-- and auto-assigns risk level

CREATE OR REPLACE FUNCTION public.evaluate_lead_risk(p_lead_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  risk TEXT := 'none';
  reason TEXT := NULL;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Get lead data
  SELECT 
    id,
    status,
    pipeline_stage,
    first_hot_at,
    first_contact_at,
    last_activity_at,
    job_value
  INTO r
  FROM public.leads
  WHERE id = p_lead_id;

  -- If lead not found, return error
  IF r.id IS NULL THEN
    RETURN json_build_object(
      'lead_id', p_lead_id,
      'risk_level', 'none',
      'reason', 'Lead not found',
      'error', true
    );
  END IF;

  -- Skip if lead is won or lost
  IF r.pipeline_stage IN ('won', 'lost') THEN
    UPDATE public.leads
    SET risk_level = 'none',
        risk_reason = NULL,
        risk_updated_at = v_now
    WHERE id = p_lead_id;
    
    RETURN json_build_object(
      'lead_id', r.id,
      'risk_level', 'none',
      'reason', 'Lead is won or lost'
    );
  END IF;

  -- QUIET HOT LEAD (HIGH RISK)
  -- Lead became hot but NO call attempt within 2 hours OR no contact within 24 hours
  IF r.status = 'hot' AND r.first_hot_at IS NOT NULL THEN
    IF r.first_contact_at IS NULL THEN
      -- No contact at all
      IF v_now - r.first_hot_at > interval '24 hours' THEN
        risk := 'high';
        reason := 'Hot lead not contacted within 24 hours';
      ELSIF v_now - r.first_hot_at > interval '2 hours' THEN
        risk := 'high';
        reason := 'Hot lead not contacted within 2 hours';
      END IF;
    END IF;
  END IF;

  -- APPOINTMENT SET → NO ESTIMATE SENT (MEDIUM/HIGH RISK)
  -- Appointment completed but no quote created within 48 hours
  IF r.pipeline_stage = 'appointment_set' THEN
    IF EXISTS (
      SELECT 1 
      FROM public.appointments a
      WHERE a.lead_id = r.id
        AND a.scheduled_for < v_now
        AND a.scheduled_for > v_now - interval '7 days' -- Only check recent appointments
    ) THEN
      -- Check if there's a quote created after the appointment
      IF NOT EXISTS (
        SELECT 1
        FROM public.quotes q
        WHERE q.lead_id = r.id
          AND q.created_at > (
            SELECT MAX(scheduled_for)
            FROM public.appointments
            WHERE lead_id = r.id
              AND scheduled_for < v_now
          )
      ) THEN
        -- Check how long since the most recent completed appointment
        IF EXISTS (
          SELECT 1
          FROM public.appointments a
          WHERE a.lead_id = r.id
            AND a.scheduled_for < v_now
            AND v_now - a.scheduled_for > interval '48 hours'
        ) THEN
          risk := CASE 
            WHEN v_now - (SELECT MAX(scheduled_for) FROM public.appointments WHERE lead_id = r.id AND scheduled_for < v_now) > interval '72 hours' THEN 'high'
            ELSE 'medium'
          END;
          reason := 'Appointment completed, no estimate sent after 48 hours';
        END IF;
      END IF;
    END IF;
  END IF;

  -- ESTIMATE SENT → NO RESPONSE (MEDIUM RISK)
  -- Sent quote but no homeowner reply in 5 days and no follow-up sent
  IF r.pipeline_stage = 'estimate_sent' THEN
    IF EXISTS (
      SELECT 1
      FROM public.quotes q
      WHERE q.lead_id = r.id
        AND q.status = 'sent'
        AND q.sent_at IS NOT NULL
        AND v_now - q.sent_at > interval '5 days'
        AND q.status NOT IN ('accepted', 'rejected', 'viewed')
    ) THEN
      risk := 'medium';
      reason := 'Estimate sent, no homeowner response after 5 days';
    END IF;
  END IF;

  -- STALE LEAD (LOW RISK)
  -- No activity for >7 days, not won, not lost, still active
  IF r.pipeline_stage IN ('new', 'hot', 'appointment_set', 'estimate_sent') THEN
    IF r.last_activity_at IS NULL OR (v_now - r.last_activity_at > interval '7 days') THEN
      -- Only set to low if no higher risk was already detected
      IF risk = 'none' THEN
        risk := 'low';
        reason := 'Lead has had no activity in over 7 days';
      END IF;
    END IF;
  END IF;

  -- UPDATE TABLE
  UPDATE public.leads
  SET
    risk_level = risk,
    risk_reason = reason,
    risk_updated_at = v_now
  WHERE id = p_lead_id;

  RETURN json_build_object(
    'lead_id', r.id,
    'risk_level', risk,
    'reason', reason
  );
END;
$$;

-- ============================================================================
-- STEP 3: Global Risk Scanner (Cron Function)
-- ============================================================================
-- This scans ALL active leads

CREATE OR REPLACE FUNCTION public.scan_all_leads_for_risk()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT id 
    FROM public.leads 
    WHERE pipeline_stage NOT IN ('won', 'lost')
  LOOP
    PERFORM public.evaluate_lead_risk(rec.id);
  END LOOP;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.leads.risk_level IS 'Risk level: none, low, medium, high. Automatically calculated by evaluate_lead_risk()';
COMMENT ON COLUMN public.leads.risk_reason IS 'Human-readable reason for the risk level';
COMMENT ON COLUMN public.leads.risk_updated_at IS 'Timestamp when risk was last evaluated';
COMMENT ON FUNCTION public.evaluate_lead_risk IS 'Evaluates risk for a single lead based on activity, timing, and pipeline stage. Returns JSON with risk_level and reason';
COMMENT ON FUNCTION public.scan_all_leads_for_risk IS 'Scans all active leads and evaluates their risk. Designed to be run via cron every 15 minutes';










































