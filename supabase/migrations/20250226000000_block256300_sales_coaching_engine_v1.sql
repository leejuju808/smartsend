-- ============================================================================
-- Block 256300 — SmartSend AI Sales Coaching Engine v1
-- Sales Call Scoring, Script Enforcement, Rep Performance Analytics, 
-- Deal Risk Detection, Follow-Up Optimization
-- ============================================================================
-- 
-- This block transforms SmartSend into the sales manager every roofing 
-- company wishes they had — but automated, unbiased, and available 24/7.
--
-- Features:
-- - AI transcribes every sales call
-- - AI scores every call (0-100)
-- - Script enforcement & deviation detection
-- - Deal risk detection (red flags)
-- - Follow-up frequency coaching
-- - Rep performance dashboard
-- - Sales heatmaps (what works, what fails)
-- - Upsell/missed money alerts
--
-- ============================================================================
-- PART 1 — SALES CALLS TABLE
-- ============================================================================
-- Every sales call is recorded, transcribed, and scored

CREATE TABLE IF NOT EXISTS public.sales_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rep_id uuid REFERENCES public.sales_reps(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  roofing_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Call metadata
  call_duration_seconds integer,
  call_date timestamptz NOT NULL DEFAULT now(),
  phone_number text,
  direction text CHECK (direction IN ('inbound', 'outbound')) DEFAULT 'outbound',
  
  -- Audio & transcription
  audio_url text,
  transcript text,
  transcript_metadata jsonb DEFAULT '{}'::jsonb, -- speaker labels, timestamps, confidence scores
  
  -- AI Scoring (0-100)
  score numeric(5,2) CHECK (score >= 0 AND score <= 100),
  score_breakdown jsonb DEFAULT '{}'::jsonb, -- {
  --   "rapport_building": 85,
  --   "needs_discovery": 72,
  --   "emotional_drivers": 68,
  --   "value_explanation": 90,
  --   "financing_mention": 95,
  --   "closing_statements": 45,
  --   "objection_handling": 78,
  --   "proposal_clarity": 82,
  --   "professionalism": 88
  -- }
  
  -- Script enforcement
  script_adherence_score numeric(5,2),
  script_deviations jsonb DEFAULT '[]'::jsonb, -- [
  --   {
  --     "section": "financing_script",
  --     "deviation": "Did not mention financing until customer asked",
  --     "severity": "medium",
  --     "timestamp": "12:34"
  --   }
  -- ]
  
  -- Deal risk detection
  risk_score numeric(5,2) CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
  risk_flags jsonb DEFAULT '[]'::jsonb, -- [
  --   {
  --     "flag": "customer_requested_time_to_think",
  --     "detected_at": "I need to think about it",
  --     "severity": "high",
  --     "recommended_action": "Follow-up in 24 hours with financing options"
  --   }
  -- ]
  
  -- Buying signals detected
  buying_signals jsonb DEFAULT '[]'::jsonb, -- [
  --   {
  --     "signal": "asked_about_timeline",
  --     "detected_at": "When can you start?",
  --     "confidence": 0.85
  --   }
  -- ]
  
  -- Detected issues & missed opportunities
  detected_issues jsonb DEFAULT '[]'::jsonb, -- [
  --   {
  --     "issue": "missed_closing_question",
  --     "category": "closing",
  --     "impact": "high"
  --   }
  -- ]
  
  -- Upsell opportunities missed
  missed_upsells jsonb DEFAULT '[]'::jsonb, -- [
  --   {
  --     "upsell": "ridge_vent_upgrade",
  --     "customer_interest": true,
  --     "potential_revenue": 325.00,
  --     "customer_mention": "customer asked about ventilation"
  --   }
  -- ]
  
  -- Call outcome
  call_outcome text CHECK (call_outcome IN ('scheduled_inspection', 'quote_requested', 'follow_up_needed', 'no_interest', 'objection', 'closed_won', 'closed_lost', 'unknown')) DEFAULT 'unknown',
  next_action text,
  next_action_date date,
  
  -- AI analysis summary
  ai_summary text,
  strengths jsonb DEFAULT '[]'::jsonb,
  weaknesses jsonb DEFAULT '[]'::jsonb,
  recommendations jsonb DEFAULT '[]'::jsonb,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for sales_calls
CREATE INDEX IF NOT EXISTS idx_sales_calls_org ON public.sales_calls(org_id);
CREATE INDEX IF NOT EXISTS idx_sales_calls_rep ON public.sales_calls(rep_id) WHERE rep_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_calls_customer ON public.sales_calls(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_calls_lead ON public.sales_calls(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_calls_job ON public.sales_calls(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_calls_call_date ON public.sales_calls(call_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_calls_score ON public.sales_calls(score DESC) WHERE score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_calls_risk ON public.sales_calls(risk_level, risk_score DESC) WHERE risk_level != 'low';
CREATE INDEX IF NOT EXISTS idx_sales_calls_outcome ON public.sales_calls(call_outcome) WHERE call_outcome != 'unknown';

-- ============================================================================
-- PART 2 — SALES COACHING NOTES TABLE
-- ============================================================================
-- Structured coaching feedback tied to calls

CREATE TABLE IF NOT EXISTS public.sales_coaching_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_id uuid REFERENCES public.sales_calls(id) ON DELETE CASCADE,
  rep_id uuid NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  
  -- Note content
  note text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'rapport_building',
    'needs_discovery',
    'value_communication',
    'objection_handling',
    'closing_techniques',
    'script_adherence',
    'financing_presentation',
    'upsell_opportunities',
    'professionalism',
    'follow_up',
    'other'
  )),
  
  -- Priority & action
  priority text CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  requires_action boolean DEFAULT false,
  action_completed boolean DEFAULT false,
  action_due_date date,
  
  -- Training recommendations
  recommended_training text[] DEFAULT '{}',
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- manager/admin who created the note
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for sales_coaching_notes
CREATE INDEX IF NOT EXISTS idx_coaching_notes_org ON public.sales_coaching_notes(org_id);
CREATE INDEX IF NOT EXISTS idx_coaching_notes_call ON public.sales_coaching_notes(call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coaching_notes_rep ON public.sales_coaching_notes(rep_id);
CREATE INDEX IF NOT EXISTS idx_coaching_notes_category ON public.sales_coaching_notes(category);
CREATE INDEX IF NOT EXISTS idx_coaching_notes_priority ON public.sales_coaching_notes(priority) WHERE priority IN ('high', 'critical');
CREATE INDEX IF NOT EXISTS idx_coaching_notes_action ON public.sales_coaching_notes(requires_action, action_due_date) WHERE requires_action = true;

-- ============================================================================
-- PART 3 — SALES FOLLOW-UP TRACKER TABLE
-- ============================================================================
-- Tracks follow-up frequency and recommends optimal timing

CREATE TABLE IF NOT EXISTS public.sales_followup_tracker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rep_id uuid REFERENCES public.sales_reps(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  
  -- Follow-up tracking
  attempts int NOT NULL DEFAULT 0,
  last_attempt timestamptz,
  last_attempt_method text CHECK (last_attempt_method IN ('call', 'email', 'text', 'visit', 'other')),
  next_recommended_followup timestamptz,
  
  -- Frequency analysis
  avg_days_between_followups numeric(5,2),
  days_since_last_contact numeric(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN last_attempt IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (now() - last_attempt)) / 86400.0
      ELSE NULL
    END
  ) STORED,
  
  -- Recommendations
  recommended_next_step text,
  recommended_action text, -- 'send_financing_reminder', 'book_appointment', 'send_quote', etc.
  urgency_level text CHECK (urgency_level IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  
  -- Status
  status text CHECK (status IN ('active', 'paused', 'closed', 'lost')) DEFAULT 'active',
  
  -- Lead/customer context
  lead_age_days numeric(5,2),
  last_buying_signal_date timestamptz,
  last_risk_flag_date timestamptz,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for sales_followup_tracker
CREATE INDEX IF NOT EXISTS idx_followup_tracker_org ON public.sales_followup_tracker(org_id);
CREATE INDEX IF NOT EXISTS idx_followup_tracker_rep ON public.sales_followup_tracker(rep_id) WHERE rep_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_followup_tracker_lead ON public.sales_followup_tracker(lead_id);
CREATE INDEX IF NOT EXISTS idx_followup_tracker_customer ON public.sales_followup_tracker(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_followup_tracker_next_followup ON public.sales_followup_tracker(next_recommended_followup, status) WHERE status = 'active' AND next_recommended_followup IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_followup_tracker_urgency ON public.sales_followup_tracker(urgency_level, days_since_last_contact DESC) WHERE urgency_level IN ('high', 'critical');

-- ============================================================================
-- PART 4 — TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_calls_updated_at ON public.sales_calls;
CREATE TRIGGER trg_sales_calls_updated_at
BEFORE UPDATE ON public.sales_calls
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_coaching_notes_updated_at ON public.sales_coaching_notes;
CREATE TRIGGER trg_coaching_notes_updated_at
BEFORE UPDATE ON public.sales_coaching_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_followup_tracker_updated_at ON public.sales_followup_tracker;
CREATE TRIGGER trg_followup_tracker_updated_at
BEFORE UPDATE ON public.sales_followup_tracker
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- PART 5 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Update follow-up tracker when a call is made
CREATE OR REPLACE FUNCTION public.update_followup_tracker_on_call()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_lead_id uuid;
  v_customer_id uuid;
  v_rep_id uuid;
  v_org_id uuid;
BEGIN
  -- Get IDs from the call
  v_lead_id := NEW.lead_id;
  v_customer_id := NEW.customer_id;
  v_rep_id := NEW.rep_id;
  v_org_id := NEW.org_id;
  
  -- Update or create follow-up tracker entry
  IF v_lead_id IS NOT NULL THEN
    INSERT INTO public.sales_followup_tracker (
      org_id, rep_id, lead_id, customer_id,
      attempts, last_attempt, last_attempt_method,
      next_recommended_followup, recommended_next_step, status
    )
    VALUES (
      v_org_id, v_rep_id, v_lead_id, v_customer_id,
      1, NEW.call_date, 'call',
      NEW.call_date + interval '2 days',
      COALESCE(NEW.next_action, 'Follow up on call'),
      'active'
    )
    ON CONFLICT DO NOTHING; -- Will update separately if exists
    
    -- Update existing tracker
    UPDATE public.sales_followup_tracker
    SET 
      attempts = attempts + 1,
      last_attempt = NEW.call_date,
      last_attempt_method = 'call',
      next_recommended_followup = NEW.call_date + interval '2 days',
      updated_at = now()
    WHERE lead_id = v_lead_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-update follow-up tracker on call creation
DROP TRIGGER IF EXISTS trg_update_followup_on_call ON public.sales_calls;
CREATE TRIGGER trg_update_followup_on_call
AFTER INSERT ON public.sales_calls
FOR EACH ROW EXECUTE FUNCTION public.update_followup_tracker_on_call();

-- Function: Calculate follow-up urgency based on lead age and risk
CREATE OR REPLACE FUNCTION public.calculate_followup_urgency(
  p_lead_id uuid,
  p_org_id uuid
)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_days_since_last_contact numeric;
  v_lead_age_days numeric;
  v_has_risk_flags boolean;
  v_has_buying_signals boolean;
  v_result text;
BEGIN
  -- Get days since last contact
  SELECT COALESCE(EXTRACT(EPOCH FROM (now() - MAX(last_attempt))) / 86400.0, 999)
  INTO v_days_since_last_contact
  FROM public.sales_followup_tracker
  WHERE lead_id = p_lead_id AND org_id = p_org_id;
  
  -- Get lead age
  SELECT COALESCE(EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0, 0)
  INTO v_lead_age_days
  FROM public.leads
  WHERE id = p_lead_id;
  
  -- Check for recent risk flags
  SELECT EXISTS(
    SELECT 1 FROM public.sales_calls
    WHERE lead_id = p_lead_id 
      AND org_id = p_org_id
      AND call_date > now() - interval '7 days'
      AND risk_level IN ('high', 'critical')
  ) INTO v_has_risk_flags;
  
  -- Check for recent buying signals
  SELECT EXISTS(
    SELECT 1 FROM public.sales_calls
    WHERE lead_id = p_lead_id 
      AND org_id = p_org_id
      AND call_date > now() - interval '7 days'
      AND jsonb_array_length(buying_signals) > 0
  ) INTO v_has_buying_signals;
  
  -- Calculate urgency
  IF v_has_risk_flags AND v_days_since_last_contact > 2 THEN
    v_result := 'critical';
  ELSIF v_has_buying_signals AND v_days_since_last_contact > 3 THEN
    v_result := 'high';
  ELSIF v_days_since_last_contact > 7 THEN
    v_result := 'high';
  ELSIF v_days_since_last_contact > 4 THEN
    v_result := 'medium';
  ELSE
    v_result := 'low';
  END IF;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.sales_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_coaching_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_followup_tracker ENABLE ROW LEVEL SECURITY;

-- Helper function for org membership check
CREATE OR REPLACE FUNCTION public.is_org_member(check_org uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.org_memberships
    WHERE org_id = check_org AND user_id = auth.uid() AND status = 'active'
  )
  OR EXISTS(
    SELECT 1 FROM public.organization_members
    WHERE org_id = check_org AND user_id = auth.uid()
  )
  OR EXISTS(
    SELECT 1 FROM public.org_members
    WHERE org_id = check_org AND user_id = auth.uid()
  );
$$;

-- Sales Calls policies
DROP POLICY IF EXISTS "sales_calls_read_org_members" ON public.sales_calls;
CREATE POLICY "sales_calls_read_org_members" ON public.sales_calls
  FOR SELECT USING (is_org_member(org_id));

DROP POLICY IF EXISTS "sales_calls_write_org_members" ON public.sales_calls;
CREATE POLICY "sales_calls_write_org_members" ON public.sales_calls
  FOR ALL USING (is_org_member(org_id));

-- Coaching Notes policies
DROP POLICY IF EXISTS "coaching_notes_read_org_members" ON public.sales_coaching_notes;
CREATE POLICY "coaching_notes_read_org_members" ON public.sales_coaching_notes
  FOR SELECT USING (is_org_member(org_id));

DROP POLICY IF EXISTS "coaching_notes_write_org_members" ON public.sales_coaching_notes;
CREATE POLICY "coaching_notes_write_org_members" ON public.sales_coaching_notes
  FOR ALL USING (is_org_member(org_id));

-- Follow-up Tracker policies
DROP POLICY IF EXISTS "followup_tracker_read_org_members" ON public.sales_followup_tracker;
CREATE POLICY "followup_tracker_read_org_members" ON public.sales_followup_tracker
  FOR SELECT USING (is_org_member(org_id));

DROP POLICY IF EXISTS "followup_tracker_write_org_members" ON public.sales_followup_tracker;
CREATE POLICY "followup_tracker_write_org_members" ON public.sales_followup_tracker
  FOR ALL USING (is_org_member(org_id));

-- ============================================================================
-- PART 7 — PERFORMANCE VIEWS & DASHBOARDS
-- ============================================================================

-- View: Rep Performance Dashboard
CREATE OR REPLACE VIEW public.v_sales_rep_performance_coaching AS
SELECT 
  sr.org_id,
  sr.id AS rep_id,
  sr.name AS rep_name,
  
  -- Call metrics
  COUNT(DISTINCT sc.id) AS total_calls,
  ROUND(AVG(sc.score), 2) AS avg_call_score,
  COUNT(DISTINCT sc.id) FILTER (WHERE sc.score >= 80) AS high_score_calls,
  COUNT(DISTINCT sc.id) FILTER (WHERE sc.score < 60) AS low_score_calls,
  
  -- Script adherence
  ROUND(AVG(sc.script_adherence_score), 2) AS avg_script_adherence,
  COUNT(DISTINCT sc.id) FILTER (WHERE sc.script_adherence_score < 70) AS script_deviation_calls,
  
  -- Risk detection
  COUNT(DISTINCT sc.id) FILTER (WHERE sc.risk_level IN ('high', 'critical')) AS high_risk_calls,
  
  -- Closing performance
  COUNT(DISTINCT sc.id) FILTER (WHERE sc.call_outcome = 'closed_won') AS calls_closed_won,
  COUNT(DISTINCT sc.id) FILTER (WHERE sc.call_outcome = 'closed_lost') AS calls_closed_lost,
  ROUND(
    COUNT(DISTINCT sc.id) FILTER (WHERE sc.call_outcome = 'closed_won')::numeric / 
    NULLIF(COUNT(DISTINCT sc.id) FILTER (WHERE sc.call_outcome IN ('closed_won', 'closed_lost')), 0) * 100,
    1
  ) AS call_close_rate_percent,
  
  -- Follow-up performance
  COUNT(DISTINCT sft.id) AS active_followups,
  COUNT(DISTINCT sft.id) FILTER (WHERE sft.days_since_last_contact > 7) AS stale_followups,
  ROUND(AVG(sft.avg_days_between_followups), 2) AS avg_followup_interval_days,
  
  -- Coaching notes
  COUNT(DISTINCT scn.id) AS total_coaching_notes,
  COUNT(DISTINCT scn.id) FILTER (WHERE scn.priority IN ('high', 'critical')) AS critical_coaching_notes,
  COUNT(DISTINCT scn.id) FILTER (WHERE scn.requires_action = true AND scn.action_completed = false) AS pending_actions,
  
  -- Strengths & weaknesses (from AI analysis)
  jsonb_agg(DISTINCT jsonb_array_elements(sc.strengths)) FILTER (WHERE sc.strengths IS NOT NULL) AS common_strengths,
  jsonb_agg(DISTINCT jsonb_array_elements(sc.weaknesses)) FILTER (WHERE sc.weaknesses IS NOT NULL) AS common_weaknesses,
  
  -- Time period
  MIN(sc.call_date) AS first_call_date,
  MAX(sc.call_date) AS last_call_date
  
FROM public.sales_reps sr
LEFT JOIN public.sales_calls sc ON sc.rep_id = sr.id
LEFT JOIN public.sales_followup_tracker sft ON sft.rep_id = sr.id AND sft.status = 'active'
LEFT JOIN public.sales_coaching_notes scn ON scn.rep_id = sr.id
WHERE sr.is_active = true
GROUP BY sr.org_id, sr.id, sr.name;

-- View: Deal Risk Dashboard
CREATE OR REPLACE VIEW public.v_deal_risk_dashboard AS
SELECT 
  sc.org_id,
  sc.id AS call_id,
  sc.rep_id,
  sr.name AS rep_name,
  sc.lead_id,
  l.customer_name AS lead_name,
  l.email AS lead_email,
  sc.customer_id,
  sc.job_id,
  
  -- Risk metrics
  sc.risk_score,
  sc.risk_level,
  sc.risk_flags,
  
  -- Call context
  sc.call_date,
  sc.call_outcome,
  sc.score AS call_score,
  
  -- Follow-up status
  sft.days_since_last_contact,
  sft.urgency_level AS followup_urgency,
  sft.next_recommended_followup,
  
  -- Recommended actions
  sc.recommendations AS ai_recommendations,
  sft.recommended_action AS followup_recommended_action
  
FROM public.sales_calls sc
LEFT JOIN public.sales_reps sr ON sr.id = sc.rep_id
LEFT JOIN public.leads l ON l.id = sc.lead_id
LEFT JOIN public.sales_followup_tracker sft ON sft.lead_id = sc.lead_id AND sft.status = 'active'
WHERE sc.risk_level IN ('high', 'critical')
  AND sc.call_date > now() - interval '30 days'
ORDER BY sc.risk_score DESC, sc.call_date DESC;

-- View: Follow-Up Coaching Dashboard
CREATE OR REPLACE VIEW public.v_followup_coaching_dashboard AS
SELECT 
  sft.org_id,
  sft.id AS tracker_id,
  sft.rep_id,
  sr.name AS rep_name,
  sft.lead_id,
  l.customer_name AS lead_name,
  l.email AS lead_email,
  l.sales_status AS lead_status,
  
  -- Follow-up metrics
  sft.attempts,
  sft.last_attempt,
  sft.days_since_last_contact,
  sft.avg_days_between_followups,
  sft.urgency_level,
  sft.next_recommended_followup,
  
  -- Context
  sft.lead_age_days,
  sft.last_buying_signal_date,
  sft.last_risk_flag_date,
  
  -- Recommendations
  sft.recommended_next_step,
  sft.recommended_action,
  
  -- Recent call context
  (
    SELECT call_outcome 
    FROM public.sales_calls 
    WHERE lead_id = sft.lead_id 
    ORDER BY call_date DESC 
    LIMIT 1
  ) AS last_call_outcome,
  
  (
    SELECT risk_level 
    FROM public.sales_calls 
    WHERE lead_id = sft.lead_id 
    ORDER BY call_date DESC 
    LIMIT 1
  ) AS last_call_risk_level
  
FROM public.sales_followup_tracker sft
LEFT JOIN public.sales_reps sr ON sr.id = sft.rep_id
LEFT JOIN public.leads l ON l.id = sft.lead_id
WHERE sft.status = 'active'
  AND (
    sft.urgency_level IN ('high', 'critical')
    OR sft.days_since_last_contact > 7
    OR sft.next_recommended_followup <= now()
  )
ORDER BY 
  sft.urgency_level DESC,
  sft.days_since_last_contact DESC NULLS LAST;

-- View: Script Adherence Dashboard
CREATE OR REPLACE VIEW public.v_script_adherence_dashboard AS
SELECT 
  sc.org_id,
  sc.rep_id,
  sr.name AS rep_name,
  sc.id AS call_id,
  sc.call_date,
  sc.script_adherence_score,
  sc.script_deviations,
  
  -- Deviation summary
  jsonb_array_length(sc.script_deviations) AS deviation_count,
  
  -- Call outcome
  sc.call_outcome,
  sc.score AS overall_score,
  
  -- Common deviations
  (
    SELECT jsonb_agg(DISTINCT deviation->>'section')
    FROM jsonb_array_elements(sc.script_deviations) AS deviation
  ) AS deviation_sections
  
FROM public.sales_calls sc
LEFT JOIN public.sales_reps sr ON sr.id = sc.rep_id
WHERE sc.script_adherence_score IS NOT NULL
  AND sc.call_date > now() - interval '30 days'
ORDER BY sc.script_adherence_score ASC, sc.call_date DESC;

-- View: Upsell Opportunity Dashboard
CREATE OR REPLACE VIEW public.v_upsell_opportunities_dashboard AS
SELECT 
  sc.org_id,
  sc.rep_id,
  sr.name AS rep_name,
  sc.id AS call_id,
  sc.call_date,
  sc.lead_id,
  l.customer_name AS lead_name,
  
  -- Missed upsells
  sc.missed_upsells,
  jsonb_array_length(sc.missed_upsells) AS missed_upsell_count,
  
  -- Revenue impact
  (
    SELECT SUM((upsell->>'potential_revenue')::numeric)
    FROM jsonb_array_elements(sc.missed_upsells) AS upsell
  ) AS total_potential_revenue_lost,
  
  -- Call context
  sc.call_outcome,
  sc.score AS call_score
  
FROM public.sales_calls sc
LEFT JOIN public.sales_reps sr ON sr.id = sc.rep_id
LEFT JOIN public.leads l ON l.id = sc.lead_id
WHERE jsonb_array_length(COALESCE(sc.missed_upsells, '[]'::jsonb)) > 0
  AND sc.call_date > now() - interval '30 days'
ORDER BY total_potential_revenue_lost DESC, sc.call_date DESC;

-- ============================================================================
-- PART 8 — COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE public.sales_calls IS 
'Records of all sales calls with AI transcription, scoring, and analysis. Every call is scored 0-100 and analyzed for script adherence, risk signals, and missed opportunities.';

COMMENT ON TABLE public.sales_coaching_notes IS 
'Structured coaching feedback tied to sales calls. Managers can create notes, assign priorities, and track training recommendations.';

COMMENT ON TABLE public.sales_followup_tracker IS 
'Tracks follow-up frequency and recommends optimal timing. Prevents deals from falling through cracks by alerting reps when follow-ups are overdue.';

COMMENT ON COLUMN public.sales_calls.score IS 
'Overall call score 0-100 based on multiple factors: rapport, discovery, value communication, closing, etc.';

COMMENT ON COLUMN public.sales_calls.risk_level IS 
'Deal risk level based on detected signals: "I need to think about it", "send it over email", competing quotes, etc.';

COMMENT ON COLUMN public.sales_followup_tracker.urgency_level IS 
'Calculated urgency for follow-up based on lead age, risk flags, buying signals, and days since last contact.';





















