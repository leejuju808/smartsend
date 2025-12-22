-- =========================================================
-- Block 17600 — SmartSend Contact Priority Engine v1
-- (AI Ranking System for Leads: Heat Score, Urgency, Storm Risk, Insurance Value, Appointment Status & Money Potential)
-- =========================================================

-- ============================================================================
-- 1. CREATE priority_scores TABLE
-- ============================================================================
-- Master table that stores the final priority score and all component scores

CREATE TABLE IF NOT EXISTS public.priority_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Final Priority Score (0-100)
  priority_score integer NOT NULL DEFAULT 0 CHECK (priority_score >= 0 AND priority_score <= 100),
  priority_band text NOT NULL CHECK (priority_band IN ('priority_1', 'priority_2', 'priority_3', 'priority_4', 'priority_5')) DEFAULT 'priority_5',
  
  -- Component Scores (0-100 each)
  heat_score integer NOT NULL DEFAULT 0 CHECK (heat_score >= 0 AND heat_score <= 100),
  urgency_score integer NOT NULL DEFAULT 0 CHECK (urgency_score >= 0 AND urgency_score <= 100),
  insurance_value_score integer NOT NULL DEFAULT 0 CHECK (insurance_value_score >= 0 AND insurance_value_score <= 100),
  storm_risk_score integer NOT NULL DEFAULT 0 CHECK (storm_risk_score >= 0 AND storm_risk_score <= 100),
  money_potential_score integer NOT NULL DEFAULT 0 CHECK (money_potential_score >= 0 AND money_potential_score <= 100),
  engagement_score integer NOT NULL DEFAULT 0 CHECK (engagement_score >= 0 AND engagement_score <= 100),
  
  -- Priority Reason (human-readable explanation)
  priority_reason text,
  next_action text,
  
  -- Neglect Detection
  is_neglected boolean DEFAULT false,
  hours_since_last_touch numeric(10,2),
  days_since_last_reply numeric(10,2),
  
  -- Metadata
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One score per contact
  UNIQUE(contact_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_priority_scores_contact ON public.priority_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_priority_scores_workspace ON public.priority_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_priority_scores_priority_score ON public.priority_scores(workspace_id, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_priority_scores_priority_band ON public.priority_scores(workspace_id, priority_band);
CREATE INDEX IF NOT EXISTS idx_priority_scores_neglected ON public.priority_scores(workspace_id, is_neglected, priority_score DESC) WHERE is_neglected = true;
CREATE INDEX IF NOT EXISTS idx_priority_scores_last_calculated ON public.priority_scores(last_calculated_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_priority_scores_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_priority_scores_updated_at ON public.priority_scores;
CREATE TRIGGER trg_set_priority_scores_updated_at
  BEFORE UPDATE ON public.priority_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.set_priority_scores_updated_at();

-- ============================================================================
-- 2. CREATE urgency_scores TABLE (Detailed Urgency Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.urgency_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Urgency Factors
  has_leak boolean DEFAULT false,
  has_storm_damage boolean DEFAULT false,
  has_interior_stains boolean DEFAULT false,
  urgent_language_detected boolean DEFAULT false,
  weather_forecast_risk boolean DEFAULT false,
  storm_proximity_risk boolean DEFAULT false,
  insurance_deadline_approaching boolean DEFAULT false,
  insurance_deadline_date date,
  
  -- Calculated Urgency Score (0-100)
  urgency_score integer NOT NULL DEFAULT 0 CHECK (urgency_score >= 0 AND urgency_score <= 100),
  
  -- Metadata
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_urgency_scores_contact ON public.urgency_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_urgency_scores_workspace ON public.urgency_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_urgency_scores_score ON public.urgency_scores(workspace_id, urgency_score DESC);

-- ============================================================================
-- 3. CREATE engagement_scores TABLE (Detailed Engagement Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.engagement_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Engagement Metrics
  unread_messages_count integer DEFAULT 0,
  unanswered_questions_count integer DEFAULT 0,
  hours_since_last_touch numeric(10,2),
  open_tasks_count integer DEFAULT 0,
  pending_booking boolean DEFAULT false,
  last_reply_at timestamptz,
  last_opened_at timestamptz,
  last_clicked_at timestamptz,
  
  -- Calculated Engagement Score (0-100)
  engagement_score integer NOT NULL DEFAULT 0 CHECK (engagement_score >= 0 AND engagement_score <= 100),
  
  -- Metadata
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_engagement_scores_contact ON public.engagement_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_engagement_scores_workspace ON public.engagement_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_engagement_scores_score ON public.engagement_scores(workspace_id, engagement_score DESC);

-- ============================================================================
-- 4. FUNCTION: Calculate Heat Score (0-100)
-- ============================================================================
-- Based on: reply tone, engagement, behavior, clicks, opens, positive signals, intent words

CREATE OR REPLACE FUNCTION public.calculate_heat_score(
  p_contact_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score integer := 0;
  v_contact_record RECORD;
  v_latest_reply RECORD;
  v_opens_count integer := 0;
  v_clicks_count integer := 0;
  v_reply_tone_score integer := 0;
  v_intent_keywords_score integer := 0;
  v_engagement_score integer := 0;
BEGIN
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get latest reply
  SELECT * INTO v_latest_reply
  FROM public.inbox_messages
  WHERE contact_id = p_contact_id
    AND direction = 'in'
  ORDER BY received_at DESC
  LIMIT 1;
  
  -- 1. Reply Tone Score (0-30)
  IF v_latest_reply IS NOT NULL THEN
    -- Very positive/urgent language
    IF v_latest_reply.body_text ~* '(yes|interested|urgent|asap|soon|ready|when can|schedule|book|definitely|absolutely)' THEN
      v_reply_tone_score := 30;
    -- Positive language
    ELSIF v_latest_reply.body_text ~* '(maybe|possibly|think about|consider|sounds good|let me know)' THEN
      v_reply_tone_score := 15;
    -- Neutral/negative
    ELSE
      v_reply_tone_score := 5;
    END IF;
  END IF;
  
  -- 2. Intent Keywords Score (0-25)
  IF v_latest_reply IS NOT NULL THEN
    -- High-intent roofing keywords
    IF v_latest_reply.body_text ~* '(roof|damage|leak|inspection|estimate|quote|insurance|claim|adjuster|storm|hail|wind|repair|replace)' THEN
      v_intent_keywords_score := 25;
    -- Medium-intent keywords
    ELSIF v_latest_reply.body_text ~* '(need|want|help|problem|issue|concern)' THEN
      v_intent_keywords_score := 12;
    END IF;
  END IF;
  
  -- 3. Engagement Score (0-25) - Opens and Clicks
  SELECT COALESCE(SUM(CASE WHEN type = 'open' THEN 1 ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN type = 'click' THEN 1 ELSE 0 END), 0)
  INTO v_opens_count, v_clicks_count
  FROM public.lead_email_events lee
  JOIN public.lead_tracking_tokens ltt ON lee.token_id = ltt.id
  WHERE ltt.lead_id = p_contact_id;
  
  -- Opens boost score
  IF v_opens_count >= 3 THEN
    v_engagement_score := v_engagement_score + 10;
  ELSIF v_opens_count >= 1 THEN
    v_engagement_score := v_engagement_score + 5;
  END IF;
  
  -- Clicks boost score significantly
  IF v_clicks_count >= 2 THEN
    v_engagement_score := v_engagement_score + 15;
  ELSIF v_clicks_count >= 1 THEN
    v_engagement_score := v_engagement_score + 8;
  END IF;
  
  -- 4. Recent Activity Boost (0-20)
  IF v_latest_reply IS NOT NULL AND v_latest_reply.received_at > now() - interval '7 days' THEN
    v_score := v_score + 20;
  ELSIF v_latest_reply IS NOT NULL AND v_latest_reply.received_at > now() - interval '30 days' THEN
    v_score := v_score + 10;
  END IF;
  
  -- Combine all scores
  v_score := LEAST(v_reply_tone_score + v_intent_keywords_score + v_engagement_score + v_score, 100);
  
  RETURN v_score;
END;
$$;

-- ============================================================================
-- 5. FUNCTION: Calculate Urgency Score (0-100)
-- ============================================================================
-- Based on: leaks, storm damage, interior stains, "urgent" language, weather forecast, storm proximity, insurance deadlines

CREATE OR REPLACE FUNCTION public.calculate_urgency_score(
  p_contact_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score integer := 0;
  v_contact_record RECORD;
  v_latest_reply RECORD;
  v_insurance_meta RECORD;
  v_storm_event RECORD;
  v_has_leak boolean := false;
  v_has_storm_damage boolean := false;
  v_has_interior_stains boolean := false;
  v_urgent_language boolean := false;
  v_insurance_deadline boolean := false;
BEGIN
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get latest reply
  SELECT * INTO v_latest_reply
  FROM public.inbox_messages
  WHERE contact_id = p_contact_id
    AND direction = 'in'
  ORDER BY received_at DESC
  LIMIT 1;
  
  -- Check for leak mentions
  IF v_latest_reply IS NOT NULL AND v_latest_reply.body_text ~* '(leak|leaking|water|drip|dripping|wet|moisture)' THEN
    v_has_leak := true;
    v_score := v_score + 30;
  END IF;
  
  -- Check for storm damage mentions
  IF v_latest_reply IS NOT NULL AND v_latest_reply.body_text ~* '(storm|hail|wind|damage|damaged|broken|missing shingles)' THEN
    v_has_storm_damage := true;
    v_score := v_score + 25;
  END IF;
  
  -- Check for interior stains
  IF v_latest_reply IS NOT NULL AND v_latest_reply.body_text ~* '(stain|stained|ceiling|wall|interior|inside|water damage)' THEN
    v_has_interior_stains := true;
    v_score := v_score + 20;
  END IF;
  
  -- Check for urgent language
  IF v_latest_reply IS NOT NULL AND v_latest_reply.body_text ~* '(urgent|asap|immediately|soon|quickly|emergency|critical)' THEN
    v_urgent_language := true;
    v_score := v_score + 15;
  END IF;
  
  -- Check insurance metadata for deadlines
  SELECT * INTO v_insurance_meta
  FROM public.insurance_metadata
  WHERE contact_id = p_contact_id;
  
  IF v_insurance_meta IS NOT NULL AND v_insurance_meta.claim_date IS NOT NULL THEN
    -- Insurance claims typically have deadlines within 1-2 years
    -- Boost urgency if claim is recent (within 6 months)
    IF v_insurance_meta.claim_date > CURRENT_DATE - interval '6 months' THEN
      v_insurance_deadline := true;
      v_score := v_score + 20;
    END IF;
  END IF;
  
  -- Check for recent storm events in contact's ZIP
  IF v_contact_record.zip IS NOT NULL THEN
    SELECT * INTO v_storm_event
    FROM public.weather_events
    WHERE zip = v_contact_record.zip
      AND storm_started_at > now() - interval '30 days'
      AND severity IN ('high', 'severe', 'extreme')
    ORDER BY storm_started_at DESC
    LIMIT 1;
    
    IF v_storm_event IS NOT NULL THEN
      v_score := v_score + 15;
    END IF;
  END IF;
  
  -- Cap at 100
  RETURN LEAST(v_score, 100);
END;
$$;

-- ============================================================================
-- 6. FUNCTION: Calculate Insurance Value Score (0-100)
-- ============================================================================
-- High-value claims score higher when: claim filed, deductible known, adjuster set, ACV/RCV extracted, storm severity high

CREATE OR REPLACE FUNCTION public.calculate_insurance_value_score(
  p_contact_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score integer := 0;
  v_insurance_meta RECORD;
  v_insurance_doc RECORD;
  v_contact_record RECORD;
BEGIN
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get insurance metadata
  SELECT * INTO v_insurance_meta
  FROM public.insurance_metadata
  WHERE contact_id = p_contact_id;
  
  -- If no insurance claim, return 0
  IF v_insurance_meta IS NULL OR NOT v_insurance_meta.has_insurance_claim THEN
    RETURN 0;
  END IF;
  
  -- Base score for having a claim
  v_score := 30;
  
  -- Claim filed
  IF v_insurance_meta.claim_status = 'filed' THEN
    v_score := v_score + 15;
  ELSIF v_insurance_meta.claim_status = 'pending' THEN
    v_score := v_score + 10;
  ELSIF v_insurance_meta.claim_status = 'approved' THEN
    v_score := v_score + 20;
  END IF;
  
  -- Adjuster set
  IF v_insurance_meta.adjuster_name IS NOT NULL OR v_insurance_meta.adjuster_email IS NOT NULL THEN
    v_score := v_score + 15;
  END IF;
  
  -- Get insurance document with ACV/RCV
  SELECT * INTO v_insurance_doc
  FROM public.insurance_docs
  WHERE contact_id = p_contact_id
  ORDER BY extracted_at DESC
  LIMIT 1;
  
  -- ACV/RCV extracted
  IF v_insurance_doc IS NOT NULL THEN
    IF v_insurance_doc.rcv IS NOT NULL AND v_insurance_doc.rcv > 0 THEN
      v_score := v_score + 20;
      
      -- High-value claim boost
      IF v_insurance_doc.rcv >= 20000 THEN
        v_score := v_score + 10;
      ELSIF v_insurance_doc.rcv >= 10000 THEN
        v_score := v_score + 5;
      END IF;
    ELSIF v_insurance_doc.acv IS NOT NULL AND v_insurance_doc.acv > 0 THEN
      v_score := v_score + 15;
    END IF;
    
    -- Deductible known
    IF v_insurance_doc.deductible IS NOT NULL THEN
      v_score := v_score + 5;
    END IF;
  END IF;
  
  -- Storm-related claim boost
  IF v_insurance_meta.storm_related THEN
    v_score := v_score + 10;
  END IF;
  
  -- Cap at 100
  RETURN LEAST(v_score, 100);
END;
$$;

-- ============================================================================
-- 7. FUNCTION: Calculate Storm Risk Score (0-100)
-- ============================================================================
-- Based on: hail size, wind speeds, storm distance, date of last storm, number of hits in ZIP

CREATE OR REPLACE FUNCTION public.calculate_storm_risk_score(
  p_contact_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score integer := 0;
  v_contact_record RECORD;
  v_storm_event RECORD;
  v_storm_count integer := 0;
  v_max_hail_size numeric := 0;
  v_max_wind_speed numeric := 0;
BEGIN
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND OR v_contact_record.zip IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Get recent storm events in ZIP (last 90 days)
  SELECT COUNT(*),
         MAX(hail_size),
         MAX(wind_speed)
  INTO v_storm_count, v_max_hail_size, v_max_wind_speed
  FROM public.weather_events
  WHERE zip = v_contact_record.zip
    AND storm_started_at > now() - interval '90 days';
  
  -- Base score for having storms
  IF v_storm_count > 0 THEN
    v_score := 20;
    
    -- Multiple storms boost
    IF v_storm_count >= 3 THEN
      v_score := v_score + 30;
    ELSIF v_storm_count >= 2 THEN
      v_score := v_score + 20;
    ELSE
      v_score := v_score + 10;
    END IF;
    
    -- Hail size boost
    IF v_max_hail_size IS NOT NULL THEN
      IF v_max_hail_size >= 2.0 THEN
        v_score := v_score + 25;
      ELSIF v_max_hail_size >= 1.5 THEN
        v_score := v_score + 20;
      ELSIF v_max_hail_size >= 1.0 THEN
        v_score := v_score + 15;
      ELSIF v_max_hail_size >= 0.75 THEN
        v_score := v_score + 10;
      END IF;
    END IF;
    
    -- Wind speed boost
    IF v_max_wind_speed IS NOT NULL THEN
      IF v_max_wind_speed >= 70 THEN
        v_score := v_score + 20;
      ELSIF v_max_wind_speed >= 60 THEN
        v_score := v_score + 15;
      ELSIF v_max_wind_speed >= 50 THEN
        v_score := v_score + 10;
      END IF;
    END IF;
    
    -- Recent storm boost (within 7 days)
    SELECT * INTO v_storm_event
    FROM public.weather_events
    WHERE zip = v_contact_record.zip
      AND storm_started_at > now() - interval '7 days'
    ORDER BY storm_started_at DESC
    LIMIT 1;
    
    IF v_storm_event IS NOT NULL THEN
      v_score := v_score + 15;
    END IF;
  END IF;
  
  -- Cap at 100
  RETURN LEAST(v_score, 100);
END;
$$;

-- ============================================================================
-- 8. FUNCTION: Calculate Money Potential Score (0-100)
-- ============================================================================
-- From revenue engine: roof size guess, home value, type of job, expected payout

CREATE OR REPLACE FUNCTION public.calculate_money_potential_score(
  p_contact_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score integer := 0;
  v_contact_record RECORD;
  v_estimated_value_min numeric := 0;
  v_estimated_value_max numeric := 0;
  v_avg_value numeric := 0;
BEGIN
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Use estimated value from revenue engine
  v_estimated_value_min := COALESCE(v_contact_record.estimated_value_min, 0);
  v_estimated_value_max := COALESCE(v_contact_record.estimated_value_max, 0);
  
  IF v_estimated_value_max > 0 THEN
    v_avg_value := (v_estimated_value_min + v_estimated_value_max) / 2;
    
    -- Score based on job value
    -- $30K+ = 100 points
    -- $20K+ = 80 points
    -- $15K+ = 60 points
    -- $10K+ = 40 points
    -- $5K+ = 20 points
    -- < $5K = 10 points
    
    IF v_avg_value >= 30000 THEN
      v_score := 100;
    ELSIF v_avg_value >= 20000 THEN
      v_score := 80;
    ELSIF v_avg_value >= 15000 THEN
      v_score := 60;
    ELSIF v_avg_value >= 10000 THEN
      v_score := 40;
    ELSIF v_avg_value >= 5000 THEN
      v_score := 20;
    ELSE
      v_score := 10;
    END IF;
  END IF;
  
  -- Job type boost
  IF v_contact_record.job_type = 'replacement' THEN
    v_score := GREATEST(v_score, 60);
  ELSIF v_contact_record.job_type = 'insurance_claim' THEN
    v_score := GREATEST(v_score, 70);
  ELSIF v_contact_record.job_type = 'storm_damage' THEN
    v_score := GREATEST(v_score, 50);
  END IF;
  
  -- Home value boost (if available)
  IF v_contact_record.home_value IS NOT NULL AND v_contact_record.home_value > 0 THEN
    IF v_contact_record.home_value >= 500000 THEN
      v_score := v_score + 10;
    ELSIF v_contact_record.home_value >= 300000 THEN
      v_score := v_score + 5;
    END IF;
  END IF;
  
  -- Cap at 100
  RETURN LEAST(v_score, 100);
END;
$$;

-- ============================================================================
-- 9. FUNCTION: Calculate Engagement Score (0-100)
-- ============================================================================
-- Based on: unread messages, unanswered questions, last touched time, open tasks, pending booking

CREATE OR REPLACE FUNCTION public.calculate_engagement_score(
  p_contact_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score integer := 0;
  v_unread_count integer := 0;
  v_unanswered_questions integer := 0;
  v_open_tasks integer := 0;
  v_pending_booking boolean := false;
  v_hours_since_touch numeric := 999;
  v_last_reply_at timestamptz;
  v_last_opened_at timestamptz;
  v_last_clicked_at timestamptz;
BEGIN
  -- Count unread messages
  SELECT COUNT(*) INTO v_unread_count
  FROM public.inbox_messages
  WHERE contact_id = p_contact_id
    AND direction = 'in'
    AND read_at IS NULL;
  
  -- Unread messages boost engagement (they need attention)
  IF v_unread_count >= 3 THEN
    v_score := v_score + 30;
  ELSIF v_unread_count >= 1 THEN
    v_score := v_score + 20;
  END IF;
  
  -- Count open tasks
  SELECT COUNT(*) INTO v_open_tasks
  FROM public.tasks
  WHERE contact_id = p_contact_id
    AND (status = 'open' OR status = 'todo' OR completed = false);
  
  -- Open tasks boost engagement
  IF v_open_tasks >= 2 THEN
    v_score := v_score + 20;
  ELSIF v_open_tasks >= 1 THEN
    v_score := v_score + 10;
  END IF;
  
  -- Check for pending booking
  SELECT EXISTS(
    SELECT 1 FROM public.contacts
    WHERE id = p_contact_id
      AND next_appointment_at IS NOT NULL
      AND next_appointment_at > now()
  ) INTO v_pending_booking;
  
  IF v_pending_booking THEN
    v_score := v_score + 25;
  END IF;
  
  -- Get last activity times
  SELECT MAX(received_at) INTO v_last_reply_at
  FROM public.inbox_messages
  WHERE contact_id = p_contact_id
    AND direction = 'in';
  
  SELECT MAX(created_at) INTO v_last_opened_at
  FROM public.lead_email_events lee
  JOIN public.lead_tracking_tokens ltt ON lee.token_id = ltt.id
  WHERE ltt.lead_id = p_contact_id
    AND lee.type = 'open';
  
  SELECT MAX(created_at) INTO v_last_clicked_at
  FROM public.lead_email_events lee
  JOIN public.lead_tracking_tokens ltt ON lee.token_id = ltt.id
  WHERE ltt.lead_id = p_contact_id
    AND lee.type = 'click';
  
  -- Recent activity boost
  IF v_last_reply_at IS NOT NULL AND v_last_reply_at > now() - interval '24 hours' THEN
    v_score := v_score + 25;
  ELSIF v_last_reply_at IS NOT NULL AND v_last_reply_at > now() - interval '7 days' THEN
    v_score := v_score + 15;
  END IF;
  
  IF v_last_clicked_at IS NOT NULL AND v_last_clicked_at > now() - interval '7 days' THEN
    v_score := v_score + 10;
  END IF;
  
  -- Cap at 100
  RETURN LEAST(v_score, 100);
END;
$$;

-- ============================================================================
-- 10. FUNCTION: Calculate Final Priority Score (0-100)
-- ============================================================================
-- Weighted Average: Insurance Value 30%, Heat Score 25%, Storm Risk 20%, Urgency 15%, Money Potential 5%, Engagement 5%

CREATE OR REPLACE FUNCTION public.calculate_priority_score(
  p_contact_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_heat_score integer := 0;
  v_urgency_score integer := 0;
  v_insurance_value_score integer := 0;
  v_storm_risk_score integer := 0;
  v_money_potential_score integer := 0;
  v_engagement_score integer := 0;
  v_final_score numeric := 0;
  v_priority_band text;
BEGIN
  -- Calculate all component scores
  v_heat_score := public.calculate_heat_score(p_contact_id);
  v_urgency_score := public.calculate_urgency_score(p_contact_id);
  v_insurance_value_score := public.calculate_insurance_value_score(p_contact_id);
  v_storm_risk_score := public.calculate_storm_risk_score(p_contact_id);
  v_money_potential_score := public.calculate_money_potential_score(p_contact_id);
  v_engagement_score := public.calculate_engagement_score(p_contact_id);
  
  -- Weighted average
  v_final_score := 
    (v_insurance_value_score * 0.30) +
    (v_heat_score * 0.25) +
    (v_storm_risk_score * 0.20) +
    (v_urgency_score * 0.15) +
    (v_money_potential_score * 0.05) +
    (v_engagement_score * 0.05);
  
  -- Round to integer
  v_final_score := ROUND(v_final_score);
  
  -- Determine priority band
  IF v_final_score >= 95 THEN
    v_priority_band := 'priority_1';
  ELSIF v_final_score >= 85 THEN
    v_priority_band := 'priority_2';
  ELSIF v_final_score >= 70 THEN
    v_priority_band := 'priority_3';
  ELSIF v_final_score >= 50 THEN
    v_priority_band := 'priority_4';
  ELSE
    v_priority_band := 'priority_5';
  END IF;
  
  RETURN v_final_score::integer;
END;
$$;

-- ============================================================================
-- 11. FUNCTION: Calculate Priority Score for Contact (Main Function)
-- ============================================================================
-- Calculates all scores and stores them in priority_scores table

CREATE OR REPLACE FUNCTION public.calculate_contact_priority(
  p_contact_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_heat_score integer := 0;
  v_urgency_score integer := 0;
  v_insurance_value_score integer := 0;
  v_storm_risk_score integer := 0;
  v_money_potential_score integer := 0;
  v_engagement_score integer := 0;
  v_priority_score integer := 0;
  v_priority_band text;
  v_priority_reason text := '';
  v_next_action text := '';
  v_is_neglected boolean := false;
  v_hours_since_touch numeric := 0;
  v_days_since_reply numeric := 0;
  v_pending_booking boolean := false;
  v_contact_record RECORD;
  v_last_reply_at timestamptz;
BEGIN
  -- Get contact workspace
  SELECT workspace_id INTO v_workspace_id
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF v_workspace_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Calculate all component scores
  v_heat_score := public.calculate_heat_score(p_contact_id);
  v_urgency_score := public.calculate_urgency_score(p_contact_id);
  v_insurance_value_score := public.calculate_insurance_value_score(p_contact_id);
  v_storm_risk_score := public.calculate_storm_risk_score(p_contact_id);
  v_money_potential_score := public.calculate_money_potential_score(p_contact_id);
  v_engagement_score := public.calculate_engagement_score(p_contact_id);
  
  -- Calculate final priority score
  v_priority_score := public.calculate_priority_score(p_contact_id);
  
  -- Determine priority band
  IF v_priority_score >= 95 THEN
    v_priority_band := 'priority_1';
  ELSIF v_priority_score >= 85 THEN
    v_priority_band := 'priority_2';
  ELSIF v_priority_score >= 70 THEN
    v_priority_band := 'priority_3';
  ELSIF v_priority_score >= 50 THEN
    v_priority_band := 'priority_4';
  ELSE
    v_priority_band := 'priority_5';
  END IF;
  
  -- Generate priority reason
  IF v_insurance_value_score >= 50 THEN
    v_priority_reason := v_priority_reason || 'Insurance claim + ';
  END IF;
  IF v_storm_risk_score >= 50 THEN
    v_priority_reason := v_priority_reason || 'Storm hit + ';
  END IF;
  IF v_urgency_score >= 50 THEN
    v_priority_reason := v_priority_reason || 'Urgent + ';
  END IF;
  IF v_heat_score >= 50 THEN
    v_priority_reason := v_priority_reason || 'Strong reply intent + ';
  END IF;
  IF v_money_potential_score >= 50 THEN
    v_priority_reason := v_priority_reason || 'High value + ';
  END IF;
  
  -- Remove trailing " + "
  v_priority_reason := TRIM(TRAILING ' + ' FROM v_priority_reason);
  
  -- Check for pending booking
  SELECT EXISTS(
    SELECT 1 FROM public.contacts
    WHERE id = p_contact_id
      AND next_appointment_at IS NOT NULL
      AND next_appointment_at > now()
  ) INTO v_pending_booking;
  
  -- Generate next action
  IF v_insurance_value_score >= 50 THEN
    v_next_action := 'Follow up on insurance claim';
  ELSIF v_urgency_score >= 50 THEN
    v_next_action := 'Call ASAP';
  ELSIF v_heat_score >= 50 THEN
    v_next_action := 'Reply to message';
  ELSIF v_storm_risk_score >= 50 THEN
    v_next_action := 'Send storm reply template';
  ELSIF v_pending_booking THEN
    v_next_action := 'Confirm appointment';
  ELSE
    v_next_action := 'Follow up';
  END IF;
  
  -- Check for neglect
  SELECT MAX(received_at) INTO v_last_reply_at
  FROM public.inbox_messages
  WHERE contact_id = p_contact_id
    AND direction = 'in';
  
  IF v_last_reply_at IS NOT NULL THEN
    v_hours_since_touch := EXTRACT(EPOCH FROM (now() - v_last_reply_at)) / 3600;
    v_days_since_reply := v_hours_since_touch / 24;
    
    -- Mark as neglected if high priority but no reply in 24+ hours
    IF v_priority_score >= 85 AND v_hours_since_touch >= 24 THEN
      v_is_neglected := true;
    END IF;
  END IF;
  
  -- Upsert priority score
  INSERT INTO public.priority_scores (
    contact_id,
    workspace_id,
    priority_score,
    priority_band,
    heat_score,
    urgency_score,
    insurance_value_score,
    storm_risk_score,
    money_potential_score,
    engagement_score,
    priority_reason,
    next_action,
    is_neglected,
    hours_since_last_touch,
    days_since_last_reply,
    last_calculated_at
  ) VALUES (
    p_contact_id,
    v_workspace_id,
    v_priority_score,
    v_priority_band,
    v_heat_score,
    v_urgency_score,
    v_insurance_value_score,
    v_storm_risk_score,
    v_money_potential_score,
    v_engagement_score,
    v_priority_reason,
    v_next_action,
    v_is_neglected,
    v_hours_since_touch,
    v_days_since_reply,
    now()
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    priority_score = EXCLUDED.priority_score,
    priority_band = EXCLUDED.priority_band,
    heat_score = EXCLUDED.heat_score,
    urgency_score = EXCLUDED.urgency_score,
    insurance_value_score = EXCLUDED.insurance_value_score,
    storm_risk_score = EXCLUDED.storm_risk_score,
    money_potential_score = EXCLUDED.money_potential_score,
    engagement_score = EXCLUDED.engagement_score,
    priority_reason = EXCLUDED.priority_reason,
    next_action = EXCLUDED.next_action,
    is_neglected = EXCLUDED.is_neglected,
    hours_since_last_touch = EXCLUDED.hours_since_last_touch,
    days_since_last_reply = EXCLUDED.days_since_last_reply,
    last_calculated_at = now();
END;
$$;

-- ============================================================================
-- 12. FUNCTION: Recalculate Priority Scores for Workspace
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_workspace_priority_scores(
  p_workspace_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_contact_id IN 
    SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id
  LOOP
    PERFORM public.calculate_contact_priority(v_contact_id);
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 13. TRIGGER: Auto-calculate priority when contact is updated
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_calculate_contact_priority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Recalculate priority score when contact is updated
  PERFORM public.calculate_contact_priority(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_contact_priority ON public.contacts;
CREATE TRIGGER trg_calculate_contact_priority
  AFTER INSERT OR UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_calculate_contact_priority();

-- ============================================================================
-- 14. RLS POLICIES
-- ============================================================================

ALTER TABLE public.priority_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urgency_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_scores ENABLE ROW LEVEL SECURITY;

-- Priority scores: users can view scores for contacts in their workspace
CREATE POLICY "priority_scores_select_workspace"
  ON public.priority_scores FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Urgency scores: users can view scores for contacts in their workspace
CREATE POLICY "urgency_scores_select_workspace"
  ON public.urgency_scores FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Engagement scores: users can view scores for contacts in their workspace
CREATE POLICY "engagement_scores_select_workspace"
  ON public.engagement_scores FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 15. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.priority_scores IS 'Master priority scoring table that ranks contacts by urgency, value, and engagement';
COMMENT ON COLUMN public.priority_scores.priority_score IS 'Final priority score (0-100) calculated from weighted average of 6 component scores';
COMMENT ON COLUMN public.priority_scores.priority_band IS 'Priority band: priority_1 (95-100), priority_2 (85-94), priority_3 (70-84), priority_4 (50-69), priority_5 (0-49)';
COMMENT ON FUNCTION public.calculate_priority_score IS 'Calculates final priority score using weighted average: Insurance 30%, Heat 25%, Storm 20%, Urgency 15%, Money 5%, Engagement 5%';

