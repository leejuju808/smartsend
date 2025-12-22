-- =========================================================
-- Block 21744 — SmartSend Roofing Hot Lead Accelerator v1
-- (Time-to-Contact Tracking • Missed Window Alerts • Speed-to-Lead Metrics)
-- =========================================================
-- 
-- This block makes SmartSend feel dangerous in the best way.
-- Cold email + AI is great.
-- But if roofers don't call hot leads FAST, money dies.
-- 
-- Hot Lead Accelerator v1 turns SmartSend into:
-- "We call homeowners fast. If we don't, SmartSend snitches."

-- ============================================================================
-- STEP 1: ADD COLUMNS TO LEADS TABLE FOR HOT LEAD TRACKING
-- ============================================================================

-- Track when lead first became hot
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS first_hot_at timestamptz;

-- Track when roofer first contacted the lead (call or email)
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS first_contact_at timestamptz;

-- Calculate time from hot signal to first contact
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS time_to_first_contact interval;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_first_hot_at 
ON public.leads(first_hot_at) 
WHERE first_hot_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_first_contact_at 
ON public.leads(first_contact_at) 
WHERE first_contact_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_status_first_hot_at 
ON public.leads(status, first_hot_at) 
WHERE status = 'hot' AND first_hot_at IS NOT NULL;

-- ============================================================================
-- STEP 2: FUNCTION TO MARK FIRST CONTACT WHEN ROOFER REACHES OUT
-- ============================================================================
-- "First contact" is:
-- - A logged call (completed, no_answer, voicemail_left)
-- - Or a manual email reply from the roofer
-- - Or a manual note specifically tagged as "contacted" (v2)

CREATE OR REPLACE FUNCTION public.mark_first_contact_if_needed(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hot timestamptz;
  v_first_contact timestamptz;
BEGIN
  -- Get current values
  SELECT first_hot_at, first_contact_at
  INTO v_hot, v_first_contact
  FROM public.leads
  WHERE id = p_lead_id;

  -- If already set, don't overwrite
  IF v_first_contact IS NOT NULL THEN
    RETURN;
  END IF;

  -- Set first_contact_at and calculate time_to_first_contact
  UPDATE public.leads
  SET 
    first_contact_at = now(),
    time_to_first_contact = CASE 
      WHEN v_hot IS NOT NULL THEN now() - v_hot
      ELSE NULL
    END
  WHERE id = p_lead_id;
END;
$$;

COMMENT ON FUNCTION public.mark_first_contact_if_needed IS 'Marks the first time a roofer contacted a hot lead (call or email). Only sets once per lead.';

-- ============================================================================
-- STEP 3: FUNCTION TO GET SPEED-TO-LEAD METRICS
-- ============================================================================
-- Returns comprehensive speed metrics for hot leads in a time window

CREATE OR REPLACE FUNCTION public.hot_lead_speed_summary(p_days int DEFAULT 7)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_since timestamptz := now() - (p_days || ' days')::interval;
  v_avg interval;
  v_total int;
  v_contacted int;
  v_under_15 int;
  v_under_60 int;
  v_under_120 int;
  v_no_contact int;
  v_slow_list json;
BEGIN
  -- Count total hot leads created in window
  SELECT count(*)
  INTO v_total
  FROM public.leads
  WHERE status = 'hot'
    AND first_hot_at >= v_since;

  -- Count contacted hot leads
  SELECT count(*)
  INTO v_contacted
  FROM public.leads
  WHERE status = 'hot'
    AND first_hot_at >= v_since
    AND first_contact_at IS NOT NULL;

  -- Average time to first contact
  SELECT avg(time_to_first_contact)
  INTO v_avg
  FROM public.leads
  WHERE status = 'hot'
    AND first_hot_at >= v_since
    AND time_to_first_contact IS NOT NULL;

  -- Count contacted within 15 minutes
  SELECT count(*)
  INTO v_under_15
  FROM public.leads
  WHERE status = 'hot'
    AND first_hot_at >= v_since
    AND time_to_first_contact <= interval '15 minutes';

  -- Count contacted within 60 minutes
  SELECT count(*)
  INTO v_under_60
  FROM public.leads
  WHERE status = 'hot'
    AND first_hot_at >= v_since
    AND time_to_first_contact <= interval '60 minutes';

  -- Count contacted within 120 minutes
  SELECT count(*)
  INTO v_under_120
  FROM public.leads
  WHERE status = 'hot'
    AND first_hot_at >= v_since
    AND time_to_first_contact <= interval '120 minutes';

  -- Count hot leads with no contact yet
  SELECT count(*)
  INTO v_no_contact
  FROM public.leads
  WHERE status = 'hot'
    AND first_hot_at >= v_since
    AND first_contact_at IS NULL;

  -- List hot leads with no contact (limit 25)
  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
  INTO v_slow_list
  FROM (
    SELECT 
      id, 
      name, 
      email, 
      city, 
      heat_score, 
      first_hot_at
    FROM public.leads
    WHERE status = 'hot'
      AND first_hot_at >= v_since
      AND first_contact_at IS NULL
    ORDER BY first_hot_at ASC
    LIMIT 25
  ) t;

  RETURN json_build_object(
    'since', v_since,
    'total_hot', v_total,
    'contacted', v_contacted,
    'avg_time_to_first_contact', v_avg,
    'under_15_min', v_under_15,
    'under_60_min', v_under_60,
    'under_120_min', v_under_120,
    'no_contact', v_no_contact,
    'uncontacted_hot_leads', v_slow_list
  );
END;
$$;

COMMENT ON FUNCTION public.hot_lead_speed_summary IS 'Returns speed-to-lead metrics for hot leads in the specified time window. Includes averages, percentages, and list of uncontacted hot leads.';

-- ============================================================================
-- STEP 4: TRIGGER TO SET first_hot_at WHEN STATUS CHANGES TO HOT
-- ============================================================================
-- This ensures first_hot_at is set automatically whenever a lead becomes hot

CREATE OR REPLACE FUNCTION public.trigger_set_first_hot_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If status is changing to 'hot' and first_hot_at is not set, set it now
  IF NEW.status = 'hot' AND (OLD.status IS NULL OR OLD.status != 'hot') THEN
    IF NEW.first_hot_at IS NULL THEN
      NEW.first_hot_at := now();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_set_first_hot_at ON public.leads;
CREATE TRIGGER trg_set_first_hot_at
  BEFORE UPDATE OF status ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_first_hot_at();

-- Also handle INSERT case
CREATE OR REPLACE FUNCTION public.trigger_set_first_hot_at_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If lead is created with status 'hot', set first_hot_at
  IF NEW.status = 'hot' AND NEW.first_hot_at IS NULL THEN
    NEW.first_hot_at := now();
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_first_hot_at_insert ON public.leads;
CREATE TRIGGER trg_set_first_hot_at_insert
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_first_hot_at_insert();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.leads.first_hot_at IS 'Timestamp when lead first became hot. Used for speed-to-lead tracking.';
COMMENT ON COLUMN public.leads.first_contact_at IS 'Timestamp when roofer first contacted the lead (call or email). Used for speed-to-lead tracking.';
COMMENT ON COLUMN public.leads.time_to_first_contact IS 'Calculated interval from first_hot_at to first_contact_at. Shows how fast the team responded to hot leads.';










































