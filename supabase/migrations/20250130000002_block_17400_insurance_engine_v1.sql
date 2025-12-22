-- =========================================================
-- Block 17400 — SmartSend Insurance Engine v1
-- (Full Insurance Claim Intelligence: Detection, Claim Timeline, Adjuster Prep, Revenue Forecasting & Insurance-Specific Follow-Up Sequences)
-- =========================================================

-- ============================================================================
-- 1. CREATE insurance_metadata TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Claim Information
  claim_number text,
  insurance_company text,
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  date_of_loss date,
  claim_status text CHECK (claim_status IN ('filed', 'adjuster_scheduled', 'adjuster_met', 'scope_received', 'pending_approval', 'approved', 'denied', 'supplement_pending', 'ready_to_schedule', 'unknown')),
  
  -- Financial Information
  deductible numeric(12,2),
  acv numeric(12,2), -- Actual Cash Value
  rcv numeric(12,2), -- Replacement Cost Value
  depreciation numeric(12,2),
  net_claim_amount numeric(12,2), -- RCV - Deductible
  estimated_payout_min numeric(12,2),
  estimated_payout_max numeric(12,2),
  
  -- Detection Metadata
  detection_source text CHECK (detection_source IN ('message', 'pdf', 'attachment', 'manual', 'enrichment')),
  detected_at timestamptz DEFAULT now(),
  detection_confidence numeric(3,2) CHECK (detection_confidence >= 0.0 AND detection_confidence <= 1.0),
  detected_keywords text[],
  
  -- Timeline Tracking
  claim_filed_date date,
  adjuster_scheduled_date date,
  adjuster_meeting_date date,
  scope_received_date date,
  approval_date date,
  supplement_submitted_date date,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_insurance_metadata_contact ON public.insurance_metadata(contact_id);
CREATE INDEX IF NOT EXISTS idx_insurance_metadata_workspace ON public.insurance_metadata(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_metadata_claim_status ON public.insurance_metadata(workspace_id, claim_status);
CREATE INDEX IF NOT EXISTS idx_insurance_metadata_date_of_loss ON public.insurance_metadata(date_of_loss DESC);

-- ============================================================================
-- 2. CREATE insurance_scores TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Overall Score (0-100)
  likelihood_score integer NOT NULL CHECK (likelihood_score >= 0 AND likelihood_score <= 100),
  
  -- Score Breakdown (0-100 each)
  storm_type_score integer DEFAULT 0,
  severity_score integer DEFAULT 0,
  homeowner_language_score integer DEFAULT 0,
  document_upload_score integer DEFAULT 0,
  deductible_amount_score integer DEFAULT 0,
  neighborhood_history_score integer DEFAULT 0,
  appointment_scheduling_score integer DEFAULT 0,
  prior_claims_score integer DEFAULT 0,
  roof_type_score integer DEFAULT 0,
  roof_age_score integer DEFAULT 0,
  
  -- Score Factors
  has_storm_damage boolean DEFAULT false,
  has_insurance_documents boolean DEFAULT false,
  has_deductible_info boolean DEFAULT false,
  has_adjuster_info boolean DEFAULT false,
  has_claim_number boolean DEFAULT false,
  storm_type text,
  storm_severity text CHECK (storm_severity IN ('high', 'medium', 'low', 'none')),
  neighborhood_claim_rate numeric(5,2), -- Percentage of homes in ZIP with prior claims
  
  -- Score Category
  score_category text CHECK (score_category IN ('active_claim', 'strong_likelihood', 'possible_claim', 'low_probability')),
  
  -- Metadata
  calculation_factors jsonb DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_insurance_scores_contact ON public.insurance_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_insurance_scores_workspace ON public.insurance_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_scores_likelihood ON public.insurance_scores(workspace_id, likelihood_score DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_scores_category ON public.insurance_scores(workspace_id, score_category);

-- ============================================================================
-- 3. CREATE insurance_timeline TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Timeline Stage
  stage text NOT NULL CHECK (stage IN (
    'claim_filed',
    'adjuster_scheduled',
    'adjuster_meeting',
    'scope_received',
    'supplement_review',
    'pending_approval',
    'approved',
    'denied',
    'ready_to_schedule',
    'scheduled',
    'completed'
  )),
  
  -- Stage Dates
  stage_date date NOT NULL,
  estimated_completion_date date,
  actual_completion_date date,
  
  -- Stage Details
  stage_description text,
  stage_notes text,
  stage_metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Next Actions
  next_action text,
  next_action_due_date date,
  recommended_template text,
  
  -- Status
  is_completed boolean DEFAULT false,
  is_current_stage boolean DEFAULT false,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_timeline_contact ON public.insurance_timeline(contact_id, stage_date DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_timeline_workspace ON public.insurance_timeline(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_timeline_stage ON public.insurance_timeline(workspace_id, stage);
CREATE INDEX IF NOT EXISTS idx_insurance_timeline_current ON public.insurance_timeline(contact_id, is_current_stage) WHERE is_current_stage = true;

-- ============================================================================
-- 4. CREATE insurance_documents TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  attachment_id uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  
  -- Document Type
  document_type text NOT NULL CHECK (document_type IN (
    'claim_form',
    'scope_of_loss',
    'estimate',
    'supplement',
    'adjuster_report',
    'insurance_check',
    'policy_document',
    'other'
  )),
  
  -- Extracted Data
  extracted_data jsonb DEFAULT '{}'::jsonb, -- Stores ACV, RCV, deductible, claim number, etc.
  
  -- Extraction Status
  extraction_status text CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),
  extraction_confidence numeric(3,2) CHECK (extraction_confidence >= 0.0 AND extraction_confidence <= 1.0),
  extraction_errors text[],
  
  -- Document Metadata
  file_name text NOT NULL,
  file_type text,
  file_size integer,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_documents_contact ON public.insurance_documents(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_documents_workspace ON public.insurance_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_documents_type ON public.insurance_documents(workspace_id, document_type);
CREATE INDEX IF NOT EXISTS idx_insurance_documents_extraction ON public.insurance_documents(extraction_status) WHERE extraction_status = 'pending';

-- ============================================================================
-- 5. CREATE insurance_events TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Event Type
  event_type text NOT NULL CHECK (event_type IN (
    'claim_detected',
    'claim_filed',
    'adjuster_scheduled',
    'adjuster_met',
    'scope_received',
    'supplement_submitted',
    'approval_received',
    'denial_received',
    'document_uploaded',
    'timeline_updated',
    'score_updated',
    'revenue_updated',
    'risk_alert_triggered'
  )),
  
  -- Event Details
  event_description text NOT NULL,
  event_metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Source
  source text CHECK (source IN ('auto_detection', 'manual', 'document_extraction', 'user_action', 'system')),
  
  -- Related Entities
  related_document_id uuid REFERENCES public.insurance_documents(id) ON DELETE SET NULL,
  related_timeline_id uuid REFERENCES public.insurance_timeline(id) ON DELETE SET NULL,
  related_task_id uuid REFERENCES public.smartsend_tasks(id) ON DELETE SET NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_insurance_events_contact ON public.insurance_events(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_events_workspace ON public.insurance_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_events_type ON public.insurance_events(workspace_id, event_type);
CREATE INDEX IF NOT EXISTS idx_insurance_events_date ON public.insurance_events(created_at DESC);

-- ============================================================================
-- 6. ADD INSURANCE COLUMNS TO CONTACTS TABLE
-- ============================================================================

ALTER TABLE IF EXISTS public.contacts
  ADD COLUMN IF NOT EXISTS insurance_tagged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS insurance_likelihood_score integer CHECK (insurance_likelihood_score >= 0 AND insurance_likelihood_score <= 100),
  ADD COLUMN IF NOT EXISTS insurance_pipeline_stage text CHECK (insurance_pipeline_stage IN (
    'claimed',
    'adjuster_set',
    'scope_received',
    'pending_approval',
    'approved',
    'ready_to_schedule'
  )),
  ADD COLUMN IF NOT EXISTS insurance_revenue_estimate_min numeric(12,2),
  ADD COLUMN IF NOT EXISTS insurance_revenue_estimate_max numeric(12,2);

CREATE INDEX IF NOT EXISTS idx_contacts_insurance_tagged ON public.contacts(workspace_id, insurance_tagged) WHERE insurance_tagged = true;
CREATE INDEX IF NOT EXISTS idx_contacts_insurance_score ON public.contacts(workspace_id, insurance_likelihood_score DESC) WHERE insurance_likelihood_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_insurance_stage ON public.contacts(workspace_id, insurance_pipeline_stage);

-- ============================================================================
-- 7. CREATE insurance_pipeline_stages TABLE (Custom Stages for Insurance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Stage Info
  key text NOT NULL, -- 'claimed', 'adjuster_set', 'scope_received', etc.
  label text NOT NULL,
  position int NOT NULL, -- Order left→right
  color text DEFAULT 'blue',
  
  -- Stage Configuration
  recommended_action text,
  recommended_template text,
  default_tasks jsonb DEFAULT '[]'::jsonb, -- Tasks to auto-create when entering this stage
  
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(workspace_id, key)
);

CREATE INDEX IF NOT EXISTS idx_insurance_pipeline_stages_workspace ON public.insurance_pipeline_stages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_pipeline_stages_position ON public.insurance_pipeline_stages(workspace_id, position);

-- Seed default insurance pipeline stages for existing workspaces
INSERT INTO public.insurance_pipeline_stages (workspace_id, key, label, position, recommended_action, recommended_template)
SELECT 
  id,
  'claimed',
  'Insurance – Claimed',
  1,
  'Follow up with homeowner about claim status',
  'insurance_claim_filed'
FROM public.workspaces
ON CONFLICT (workspace_id, key) DO NOTHING;

INSERT INTO public.insurance_pipeline_stages (workspace_id, key, label, position, recommended_action, recommended_template)
SELECT 
  id,
  'adjuster_set',
  'Insurance – Adjuster Set',
  2,
  'Prepare adjuster prep kit and schedule meeting',
  'insurance_adjuster_scheduled'
FROM public.workspaces
ON CONFLICT (workspace_id, key) DO NOTHING;

INSERT INTO public.insurance_pipeline_stages (workspace_id, key, label, position, recommended_action, recommended_template)
SELECT 
  id,
  'scope_received',
  'Insurance – Scope Received',
  3,
  'Review scope and identify supplement opportunities',
  'insurance_scope_received'
FROM public.workspaces
ON CONFLICT (workspace_id, key) DO NOTHING;

INSERT INTO public.insurance_pipeline_stages (workspace_id, key, label, position, recommended_action, recommended_template)
SELECT 
  id,
  'pending_approval',
  'Insurance – Pending Approval',
  4,
  'Weekly check-ins with homeowner',
  'insurance_pending_approval'
FROM public.workspaces
ON CONFLICT (workspace_id, key) DO NOTHING;

INSERT INTO public.insurance_pipeline_stages (workspace_id, key, label, position, recommended_action, recommended_template)
SELECT 
  id,
  'approved',
  'Insurance – Approved',
  5,
  'Move to roof replacement scheduling',
  'insurance_approved'
FROM public.workspaces
ON CONFLICT (workspace_id, key) DO NOTHING;

INSERT INTO public.insurance_pipeline_stages (workspace_id, key, label, position, recommended_action, recommended_template)
SELECT 
  id,
  'ready_to_schedule',
  'Insurance – Ready to Schedule',
  6,
  'Send scheduling link and confirm dates',
  'insurance_ready_to_schedule'
FROM public.workspaces
ON CONFLICT (workspace_id, key) DO NOTHING;

-- ============================================================================
-- 8. CREATE insurance_risk_alerts TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_risk_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Alert Type
  alert_type text NOT NULL CHECK (alert_type IN (
    'claim_stalled',
    'adjuster_meeting_soon',
    'scope_missing_items',
    'approval_pending_long',
    'no_reply_recent',
    'supplement_opportunity',
    'timeline_delay'
  )),
  
  -- Alert Details
  alert_title text NOT NULL,
  alert_message text NOT NULL,
  alert_severity text CHECK (alert_severity IN ('high', 'medium', 'low')) DEFAULT 'medium',
  
  -- Alert Status
  is_resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Alert Metadata
  alert_metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_risk_alerts_contact ON public.insurance_risk_alerts(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_risk_alerts_workspace ON public.insurance_risk_alerts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_risk_alerts_type ON public.insurance_risk_alerts(workspace_id, alert_type);
CREATE INDEX IF NOT EXISTS idx_insurance_risk_alerts_unresolved ON public.insurance_risk_alerts(workspace_id, is_resolved) WHERE is_resolved = false;

-- ============================================================================
-- 9. FUNCTION: Detect Insurance Keywords
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_insurance_keywords(
  p_text text,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_keywords text[] := ARRAY[
    'claim',
    'adjuster',
    'deductible',
    'acv',
    'rcv',
    'insurance is coming',
    'filed a claim',
    'meeting the adjuster',
    'insurance company',
    'claim number',
    'scope of loss',
    'supplement',
    'coverage',
    'carrier',
    'policy',
    'depreciation'
  ];
  v_detected_keywords text[] := '{}';
  v_lower_text text;
  v_keyword text;
  v_has_insurance boolean := false;
  v_confidence numeric(3,2) := 0.0;
BEGIN
  IF p_text IS NULL OR length(trim(p_text)) = 0 THEN
    RETURN jsonb_build_object(
      'has_insurance', false,
      'detected_keywords', '{}'::text[],
      'confidence', 0.0
    );
  END IF;
  
  v_lower_text := lower(p_text);
  
  -- Check for keywords
  FOREACH v_keyword IN ARRAY v_keywords
  LOOP
    IF v_lower_text LIKE '%' || lower(v_keyword) || '%' THEN
      v_has_insurance := true;
      v_detected_keywords := array_append(v_detected_keywords, v_keyword);
      v_confidence := GREATEST(v_confidence, 0.5);
    END IF;
  END LOOP;
  
  -- Boost confidence for multiple keywords
  IF array_length(v_detected_keywords, 1) > 1 THEN
    v_confidence := LEAST(1.0, v_confidence + (array_length(v_detected_keywords, 1) - 1) * 0.15);
  END IF;
  
  -- Boost confidence for specific high-value keywords
  IF 'adjuster' = ANY(v_detected_keywords) OR 'claim number' = ANY(v_detected_keywords) THEN
    v_confidence := LEAST(1.0, v_confidence + 0.2);
  END IF;
  
  -- Check attachments for PDFs (likely insurance documents)
  IF jsonb_array_length(p_attachments) > 0 THEN
    v_confidence := LEAST(1.0, v_confidence + 0.1);
  END IF;
  
  RETURN jsonb_build_object(
    'has_insurance', v_has_insurance,
    'detected_keywords', v_detected_keywords,
    'confidence', ROUND(v_confidence, 2)
  );
END;
$$;

COMMENT ON FUNCTION public.detect_insurance_keywords IS 'Detects insurance-related keywords in text and returns detection results';

-- ============================================================================
-- 10. FUNCTION: Calculate Insurance Likelihood Score (0-100)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_insurance_likelihood_score(
  p_contact_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_enrichment record;
  v_score integer := 0;
  v_storm_type_score integer := 0;
  v_severity_score integer := 0;
  v_homeowner_language_score integer := 0;
  v_document_upload_score integer := 0;
  v_deductible_amount_score integer := 0;
  v_neighborhood_history_score integer := 0;
  v_appointment_scheduling_score integer := 0;
  v_prior_claims_score integer := 0;
  v_roof_type_score integer := 0;
  v_roof_age_score integer := 0;
  v_score_category text;
  v_metadata jsonb;
  v_keyword_detection jsonb;
  v_message_count integer := 0;
  v_has_insurance_keywords boolean := false;
BEGIN
  -- Get contact data
  SELECT 
    c.*,
    ce.storm_risk_level,
    ce.insurance_interest,
    ce.inferred_zip,
    ce.inferred_neighborhood
  INTO v_contact
  FROM public.contacts c
  LEFT JOIN public.contact_enrichment ce ON ce.contact_id = c.id
  WHERE c.id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Check for insurance keywords in recent messages
  SELECT COUNT(*) INTO v_message_count
  FROM public.inbox_threads
  WHERE contact_id = p_contact_id
    AND is_reply = true
    AND created_at > now() - interval '90 days';
  
  -- Check latest messages for insurance keywords
  SELECT public.detect_insurance_keywords(
    string_agg(body, ' '),
    '[]'::jsonb
  ) INTO v_keyword_detection
  FROM public.inbox_threads
  WHERE contact_id = p_contact_id
    AND is_reply = true
    AND created_at > now() - interval '30 days'
  LIMIT 10;
  
  v_has_insurance_keywords := (v_keyword_detection->>'has_insurance')::boolean;
  
  -- 1. Storm Type Score (0-15 points)
  IF v_contact.storm_risk_level IN ('hail', 'wind', 'hurricane') OR v_contact.job_type = 'storm_damage' THEN
    v_storm_type_score := 15;
  ELSIF v_contact.storm_risk_level = 'medium' THEN
    v_storm_type_score := 10;
  ELSIF v_contact.storm_risk_level = 'low' THEN
    v_storm_type_score := 5;
  END IF;
  
  -- 2. Severity Score (0-10 points)
  IF v_contact.storm_impact_severity = 'high' THEN
    v_severity_score := 10;
  ELSIF v_contact.storm_impact_severity = 'medium' THEN
    v_severity_score := 7;
  ELSIF v_contact.storm_impact_severity = 'low' THEN
    v_severity_score := 4;
  END IF;
  
  -- 3. Homeowner Language Score (0-20 points)
  IF v_has_insurance_keywords THEN
    v_homeowner_language_score := 15;
    -- Boost if multiple keywords
    IF array_length((v_keyword_detection->>'detected_keywords')::text[], 1) > 2 THEN
      v_homeowner_language_score := 20;
    END IF;
  END IF;
  
  -- 4. Document Upload Score (0-15 points)
  SELECT COUNT(*) INTO v_document_upload_score
  FROM public.insurance_documents
  WHERE contact_id = p_contact_id
    AND extraction_status = 'completed';
  
  v_document_upload_score := LEAST(15, v_document_upload_score * 5);
  
  -- 5. Deductible Amount Score (0-10 points)
  SELECT COUNT(*) INTO v_deductible_amount_score
  FROM public.insurance_metadata
  WHERE contact_id = p_contact_id
    AND deductible IS NOT NULL;
  
  IF v_deductible_amount_score > 0 THEN
    v_deductible_amount_score := 10;
  END IF;
  
  -- 6. Neighborhood History Score (0-10 points)
  -- Simplified: if ZIP has storm risk, assume some claim history
  IF v_contact.inferred_zip IS NOT NULL AND v_contact.storm_risk_level IS NOT NULL THEN
    v_neighborhood_history_score := 7;
  END IF;
  
  -- 7. Appointment Scheduling Score (0-10 points)
  IF v_contact.lead_status IN ('booked', 'qualified') OR v_message_count > 2 THEN
    v_appointment_scheduling_score := 10;
  ELSIF v_message_count > 0 THEN
    v_appointment_scheduling_score := 5;
  END IF;
  
  -- 8. Prior Claims Score (0-5 points)
  -- Check if contact has insurance metadata (indicates prior detection)
  SELECT COUNT(*) INTO v_prior_claims_score
  FROM public.insurance_metadata
  WHERE contact_id = p_contact_id;
  
  IF v_prior_claims_score > 0 THEN
    v_prior_claims_score := 5;
  END IF;
  
  -- 9. Roof Type Score (0-5 points)
  -- Older roofs more likely to need replacement (insurance claim)
  IF v_contact.roof_age_years IS NOT NULL AND v_contact.roof_age_years > 15 THEN
    v_roof_type_score := 5;
  ELSIF v_contact.roof_age_years IS NOT NULL AND v_contact.roof_age_years > 10 THEN
    v_roof_type_score := 3;
  END IF;
  
  -- 10. Roof Age Score (0-5 points)
  -- Already factored into roof_type_score above
  
  -- Calculate total score
  v_score := v_storm_type_score + v_severity_score + v_homeowner_language_score + 
             v_document_upload_score + v_deductible_amount_score + v_neighborhood_history_score +
             v_appointment_scheduling_score + v_prior_claims_score + v_roof_type_score + v_roof_age_score;
  
  -- Cap at 100
  v_score := LEAST(100, v_score);
  
  -- Determine score category
  IF v_score >= 80 THEN
    v_score_category := 'active_claim';
  ELSIF v_score >= 60 THEN
    v_score_category := 'strong_likelihood';
  ELSIF v_score >= 30 THEN
    v_score_category := 'possible_claim';
  ELSE
    v_score_category := 'low_probability';
  END IF;
  
  -- Build metadata
  v_metadata := jsonb_build_object(
    'storm_type', v_contact.storm_risk_level,
    'severity', v_contact.storm_impact_severity,
    'has_insurance_keywords', v_has_insurance_keywords,
    'detected_keywords', v_keyword_detection->'detected_keywords',
    'message_count', v_message_count,
    'has_documents', v_document_upload_score > 0,
    'has_deductible', v_deductible_amount_score > 0
  );
  
  -- Upsert insurance score
  INSERT INTO public.insurance_scores (
    contact_id,
    workspace_id,
    likelihood_score,
    storm_type_score,
    severity_score,
    homeowner_language_score,
    document_upload_score,
    deductible_amount_score,
    neighborhood_history_score,
    appointment_scheduling_score,
    prior_claims_score,
    roof_type_score,
    roof_age_score,
    has_storm_damage,
    has_insurance_documents,
    has_deductible_info,
    storm_type,
    storm_severity,
    score_category,
    calculation_factors
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    v_score,
    v_storm_type_score,
    v_severity_score,
    v_homeowner_language_score,
    v_document_upload_score,
    v_deductible_amount_score,
    v_neighborhood_history_score,
    v_appointment_scheduling_score,
    v_prior_claims_score,
    v_roof_type_score,
    v_roof_age_score,
    v_contact.storm_risk_level IS NOT NULL,
    v_document_upload_score > 0,
    v_deductible_amount_score > 0,
    v_contact.storm_risk_level,
    v_contact.storm_impact_severity,
    v_score_category,
    v_metadata
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    likelihood_score = EXCLUDED.likelihood_score,
    storm_type_score = EXCLUDED.storm_type_score,
    severity_score = EXCLUDED.severity_score,
    homeowner_language_score = EXCLUDED.homeowner_language_score,
    document_upload_score = EXCLUDED.document_upload_score,
    deductible_amount_score = EXCLUDED.deductible_amount_score,
    neighborhood_history_score = EXCLUDED.neighborhood_history_score,
    appointment_scheduling_score = EXCLUDED.appointment_scheduling_score,
    prior_claims_score = EXCLUDED.prior_claims_score,
    roof_type_score = EXCLUDED.roof_type_score,
    roof_age_score = EXCLUDED.roof_age_score,
    has_storm_damage = EXCLUDED.has_storm_damage,
    has_insurance_documents = EXCLUDED.has_insurance_documents,
    has_deductible_info = EXCLUDED.has_deductible_info,
    storm_type = EXCLUDED.storm_type,
    storm_severity = EXCLUDED.storm_severity,
    score_category = EXCLUDED.score_category,
    calculation_factors = EXCLUDED.calculation_factors,
    calculated_at = now();
  
  -- Update contact with insurance score
  UPDATE public.contacts
  SET insurance_likelihood_score = v_score
  WHERE id = p_contact_id;
  
  RETURN v_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_insurance_likelihood_score IS 'Calculates insurance likelihood score (0-100) based on storm type, severity, homeowner language, documents, deductible, neighborhood history, appointments, prior claims, roof type, and roof age';

-- ============================================================================
-- 11. FUNCTION: Generate Insurance Timeline
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_insurance_timeline(
  p_contact_id uuid,
  p_claim_filed_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_metadata record;
  v_timeline_stages jsonb := '[]'::jsonb;
  v_stage_date date;
  v_claim_date date;
  v_stage jsonb;
  v_stage_id uuid;
BEGIN
  -- Get contact and insurance metadata
  SELECT c.*, im.claim_filed_date, im.date_of_loss
  INTO v_contact
  FROM public.contacts c
  LEFT JOIN public.insurance_metadata im ON im.contact_id = c.id
  WHERE c.id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Contact not found');
  END IF;
  
  -- Determine claim filed date
  v_claim_date := COALESCE(p_claim_filed_date, v_contact.claim_filed_date, v_contact.date_of_loss, CURRENT_DATE);
  
  -- Clear existing timeline stages (keep events)
  UPDATE public.insurance_timeline
  SET is_current_stage = false
  WHERE contact_id = p_contact_id;
  
  -- Stage 1: Claim Filed (Day 0)
  v_stage_date := v_claim_date;
  INSERT INTO public.insurance_timeline (
    contact_id,
    workspace_id,
    stage,
    stage_date,
    estimated_completion_date,
    stage_description,
    next_action,
    next_action_due_date,
    recommended_template,
    is_current_stage
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    'claim_filed',
    v_stage_date,
    v_stage_date + interval '3 days',
    'Homeowner has filed an insurance claim',
    'Follow up with homeowner about claim status',
    v_stage_date + interval '1 day',
    'insurance_claim_filed',
    true
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_stage_id;
  
  -- Stage 2: Adjuster Scheduled (Day 1-3)
  v_stage_date := v_claim_date + interval '2 days';
  INSERT INTO public.insurance_timeline (
    contact_id,
    workspace_id,
    stage,
    stage_date,
    estimated_completion_date,
    stage_description,
    next_action,
    next_action_due_date,
    recommended_template,
    is_current_stage
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    'adjuster_scheduled',
    v_stage_date,
    v_stage_date + interval '4 days',
    'Adjuster meeting has been scheduled',
    'Prepare adjuster prep kit and send to homeowner',
    v_stage_date + interval '1 day',
    'insurance_adjuster_scheduled',
    false
  )
  ON CONFLICT DO NOTHING;
  
  -- Stage 3: Adjuster Meeting (Day 7)
  v_stage_date := v_claim_date + interval '7 days';
  INSERT INTO public.insurance_timeline (
    contact_id,
    workspace_id,
    stage,
    stage_date,
    estimated_completion_date,
    stage_description,
    next_action,
    next_action_due_date,
    recommended_template,
    is_current_stage
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    'adjuster_meeting',
    v_stage_date,
    v_stage_date + interval '7 days',
    'Adjuster meeting completed',
    'Follow up for scope of loss document',
    v_stage_date + interval '3 days',
    'insurance_adjuster_meeting',
    false
  )
  ON CONFLICT DO NOTHING;
  
  -- Stage 4: Scope Received (Day 14)
  v_stage_date := v_claim_date + interval '14 days';
  INSERT INTO public.insurance_timeline (
    contact_id,
    workspace_id,
    stage,
    stage_date,
    estimated_completion_date,
    stage_description,
    next_action,
    next_action_due_date,
    recommended_template,
    is_current_stage
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    'scope_received',
    v_stage_date,
    v_stage_date + interval '7 days',
    'Scope of loss document received',
    'Review scope and identify supplement opportunities',
    v_stage_date + interval '2 days',
    'insurance_scope_received',
    false
  )
  ON CONFLICT DO NOTHING;
  
  -- Stage 5: Supplement Review (Day 21)
  v_stage_date := v_claim_date + interval '21 days';
  INSERT INTO public.insurance_timeline (
    contact_id,
    workspace_id,
    stage,
    stage_date,
    estimated_completion_date,
    stage_description,
    next_action,
    next_action_due_date,
    recommended_template,
    is_current_stage
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    'supplement_review',
    v_stage_date,
    v_stage_date + interval '9 days',
    'Supplement submitted for review',
    'Follow up on supplement status',
    v_stage_date + interval '5 days',
    'insurance_supplement_review',
    false
  )
  ON CONFLICT DO NOTHING;
  
  -- Stage 6: Pending Approval (Day 30)
  v_stage_date := v_claim_date + interval '30 days';
  INSERT INTO public.insurance_timeline (
    contact_id,
    workspace_id,
    stage,
    stage_date,
    estimated_completion_date,
    stage_description,
    next_action,
    next_action_due_date,
    recommended_template,
    is_current_stage
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    'pending_approval',
    v_stage_date,
    v_stage_date + interval '14 days',
    'Claim pending insurance approval',
    'Weekly check-ins with homeowner',
    v_stage_date + interval '7 days',
    'insurance_pending_approval',
    false
  )
  ON CONFLICT DO NOTHING;
  
  -- Stage 7: Approved (Day 44)
  v_stage_date := v_claim_date + interval '44 days';
  INSERT INTO public.insurance_timeline (
    contact_id,
    workspace_id,
    stage,
    stage_date,
    estimated_completion_date,
    stage_description,
    next_action,
    next_action_due_date,
    recommended_template,
    is_current_stage
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    'approved',
    v_stage_date,
    v_stage_date + interval '7 days',
    'Insurance claim approved',
    'Move to roof replacement scheduling',
    v_stage_date + interval '2 days',
    'insurance_approved',
    false
  )
  ON CONFLICT DO NOTHING;
  
  -- Stage 8: Ready to Schedule (Day 51)
  v_stage_date := v_claim_date + interval '51 days';
  INSERT INTO public.insurance_timeline (
    contact_id,
    workspace_id,
    stage,
    stage_date,
    estimated_completion_date,
    stage_description,
    next_action,
    next_action_due_date,
    recommended_template,
    is_current_stage
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    'ready_to_schedule',
    v_stage_date,
    NULL,
    'Ready to schedule roof replacement',
    'Send scheduling link and confirm dates',
    v_stage_date + interval '1 day',
    'insurance_ready_to_schedule',
    false
  )
  ON CONFLICT DO NOTHING;
  
  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', p_contact_id,
    'claim_filed_date', v_claim_date,
    'timeline_generated', true
  );
END;
$$;

COMMENT ON FUNCTION public.generate_insurance_timeline IS 'Generates a complete insurance claim timeline with all stages, dates, and recommended actions';

-- ============================================================================
-- 12. FUNCTION: Auto-Apply Insurance Tag and Metadata
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_apply_insurance_detection(
  p_contact_id uuid,
  p_detection_source text DEFAULT 'message',
  p_detected_keywords text[] DEFAULT '{}'::text[],
  p_confidence numeric DEFAULT 0.5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_score integer;
  v_revenue_min numeric(12,2);
  v_revenue_max numeric(12,2);
  v_pipeline_stage text;
  v_result jsonb;
BEGIN
  -- Get contact
  SELECT * INTO v_contact
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Contact not found');
  END IF;
  
  -- Calculate insurance likelihood score
  v_score := public.calculate_insurance_likelihood_score(p_contact_id);
  
  -- Determine pipeline stage based on score
  IF v_score >= 80 THEN
    v_pipeline_stage := 'claimed';
  ELSIF v_score >= 60 THEN
    v_pipeline_stage := 'adjuster_set';
  ELSE
    v_pipeline_stage := NULL;
  END IF;
  
  -- Calculate insurance revenue estimate
  IF v_score >= 60 THEN
    v_revenue_min := 12000;
    v_revenue_max := 35000;
  ELSIF v_score >= 30 THEN
    v_revenue_min := 8000;
    v_revenue_max := 25000;
  ELSE
    v_revenue_min := NULL;
    v_revenue_max := NULL;
  END IF;
  
  -- Update contact
  UPDATE public.contacts
  SET
    insurance_tagged = true,
    insurance_likelihood_score = v_score,
    insurance_pipeline_stage = v_pipeline_stage,
    insurance_revenue_estimate_min = v_revenue_min,
    insurance_revenue_estimate_max = v_revenue_max,
    tags = CASE
      WHEN 'insurance' = ANY(tags) THEN tags
      ELSE array_append(COALESCE(tags, '{}'), 'insurance')
    END,
    updated_at = now()
  WHERE id = p_contact_id;
  
  -- Create or update insurance metadata
  INSERT INTO public.insurance_metadata (
    contact_id,
    workspace_id,
    detection_source,
    detected_at,
    detection_confidence,
    detected_keywords,
    claim_status
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    p_detection_source,
    now(),
    p_confidence,
    p_detected_keywords,
    CASE
      WHEN v_score >= 80 THEN 'filed'
      WHEN v_score >= 60 THEN 'adjuster_scheduled'
      ELSE 'unknown'
    END
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    detection_source = EXCLUDED.detection_source,
    detected_at = EXCLUDED.detected_at,
    detection_confidence = EXCLUDED.detection_confidence,
    detected_keywords = EXCLUDED.detected_keywords,
    claim_status = CASE
      WHEN EXCLUDED.detection_confidence > detection_confidence THEN EXCLUDED.claim_status
      ELSE insurance_metadata.claim_status
    END,
    updated_at = now();
  
  -- Log insurance event
  INSERT INTO public.insurance_events (
    contact_id,
    workspace_id,
    event_type,
    event_description,
    source,
    event_metadata
  ) VALUES (
    p_contact_id,
    v_contact.workspace_id,
    'claim_detected',
    format('Insurance claim detected via %s with confidence %.2f', p_detection_source, p_confidence),
    'auto_detection',
    jsonb_build_object(
      'detected_keywords', p_detected_keywords,
      'confidence', p_confidence,
      'score', v_score,
      'pipeline_stage', v_pipeline_stage
    )
  );
  
  -- Generate timeline if score is high enough
  IF v_score >= 60 THEN
    PERFORM public.generate_insurance_timeline(p_contact_id);
  END IF;
  
  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', p_contact_id,
    'score', v_score,
    'pipeline_stage', v_pipeline_stage,
    'revenue_min', v_revenue_min,
    'revenue_max', v_revenue_max,
    'tagged', true
  );
END;
$$;

COMMENT ON FUNCTION public.auto_apply_insurance_detection IS 'Automatically applies insurance tag, calculates score, sets pipeline stage, and generates timeline when insurance is detected';

-- ============================================================================
-- 13. FUNCTION: Extract ACV/RCV from Document
-- ============================================================================

CREATE OR REPLACE FUNCTION public.extract_insurance_document_data(
  p_document_id uuid,
  p_document_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_document record;
  v_contact_id uuid;
  v_extracted_data jsonb := '{}'::jsonb;
  v_deductible numeric(12,2);
  v_acv numeric(12,2);
  v_rcv numeric(12,2);
  v_depreciation numeric(12,2);
  v_claim_number text;
  v_insurance_company text;
  v_adjuster_name text;
  v_date_of_loss date;
  v_confidence numeric(3,2) := 0.0;
BEGIN
  -- Get document
  SELECT * INTO v_document
  FROM public.insurance_documents
  WHERE id = p_document_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Document not found');
  END IF;
  
  v_contact_id := v_document.contact_id;
  
  -- If document_text provided, use it; otherwise would need to extract from PDF
  -- For now, this is a placeholder - in production, you'd use OCR/PDF parsing
  IF p_document_text IS NULL THEN
    -- Would extract text from PDF here
    p_document_text := '';
  END IF;
  
  -- Extract values using regex patterns (simplified - production would use better parsing)
  -- Deductible pattern: "$1,500" or "Deductible: $1,500"
  -- ACV pattern: "ACV: $12,000" or "Actual Cash Value: $12,000"
  -- RCV pattern: "RCV: $15,000" or "Replacement Cost Value: $15,000"
  -- Claim number pattern: "Claim #: ABC123" or "Claim Number: ABC123"
  
  -- This is simplified - production would have robust parsing
  -- For now, return structure with placeholders
  
  v_extracted_data := jsonb_build_object(
    'deductible', v_deductible,
    'acv', v_acv,
    'rcv', v_rcv,
    'depreciation', v_depreciation,
    'claim_number', v_claim_number,
    'insurance_company', v_insurance_company,
    'adjuster_name', v_adjuster_name,
    'date_of_loss', v_date_of_loss,
    'extraction_confidence', v_confidence
  );
  
  -- Update document
  UPDATE public.insurance_documents
  SET
    extracted_data = v_extracted_data,
    extraction_status = 'completed',
    extraction_confidence = v_confidence,
    updated_at = now()
  WHERE id = p_document_id;
  
  -- Update insurance metadata if values extracted
  IF v_deductible IS NOT NULL OR v_acv IS NOT NULL OR v_rcv IS NOT NULL THEN
    UPDATE public.insurance_metadata
    SET
      deductible = COALESCE(v_deductible, deductible),
      acv = COALESCE(v_acv, acv),
      rcv = COALESCE(v_rcv, rcv),
      depreciation = COALESCE(v_depreciation, depreciation),
      claim_number = COALESCE(v_claim_number, claim_number),
      insurance_company = COALESCE(v_insurance_company, insurance_company),
      adjuster_name = COALESCE(v_adjuster_name, adjuster_name),
      date_of_loss = COALESCE(v_date_of_loss, date_of_loss),
      net_claim_amount = CASE
        WHEN v_rcv IS NOT NULL AND v_deductible IS NOT NULL THEN v_rcv - v_deductible
        ELSE net_claim_amount
      END,
      estimated_payout_min = CASE
        WHEN v_acv IS NOT NULL AND v_deductible IS NOT NULL THEN GREATEST(0, v_acv - v_deductible)
        ELSE estimated_payout_min
      END,
      estimated_payout_max = CASE
        WHEN v_rcv IS NOT NULL AND v_deductible IS NOT NULL THEN v_rcv - v_deductible
        ELSE estimated_payout_max
      END,
      updated_at = now()
    WHERE contact_id = v_contact_id;
    
    -- Recalculate revenue
    PERFORM public.calculate_contact_revenue_v2(v_contact_id);
  END IF;
  
  RETURN jsonb_build_object(
    'ok', true,
    'document_id', p_document_id,
    'extracted_data', v_extracted_data,
    'confidence', v_confidence
  );
END;
$$;

COMMENT ON FUNCTION public.extract_insurance_document_data IS 'Extracts ACV, RCV, deductible, claim number, and other insurance data from uploaded documents';

-- ============================================================================
-- 14. FUNCTION: Check and Create Insurance Risk Alerts
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_insurance_risk_alerts(
  p_contact_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_metadata record;
  v_timeline record;
  v_alerts_created integer := 0;
  v_days_since_reply integer;
  v_days_until_meeting integer;
  v_days_pending integer;
BEGIN
  -- If contact_id provided, check just that contact; otherwise check all insurance-tagged contacts
  FOR v_contact IN
    SELECT c.*
    FROM public.contacts c
    WHERE c.insurance_tagged = true
      AND (p_contact_id IS NULL OR c.id = p_contact_id)
      AND c.workspace_id IS NOT NULL
  LOOP
    -- Get insurance metadata
    SELECT * INTO v_metadata
    FROM public.insurance_metadata
    WHERE contact_id = v_contact.id;
    
    -- Get current timeline stage
    SELECT * INTO v_timeline
    FROM public.insurance_timeline
    WHERE contact_id = v_contact.id
      AND is_current_stage = true
    ORDER BY stage_date DESC
    LIMIT 1;
    
    -- Alert 1: Claim stalled - no reply in 4+ days
    SELECT EXTRACT(DAY FROM (now() - MAX(created_at)))::integer INTO v_days_since_reply
    FROM public.inbox_threads
    WHERE contact_id = v_contact.id
      AND is_reply = true;
    
    IF v_days_since_reply >= 4 AND NOT EXISTS (
      SELECT 1 FROM public.insurance_risk_alerts
      WHERE contact_id = v_contact.id
        AND alert_type = 'claim_stalled'
        AND is_resolved = false
    ) THEN
      INSERT INTO public.insurance_risk_alerts (
        contact_id,
        workspace_id,
        alert_type,
        alert_title,
        alert_message,
        alert_severity
      ) VALUES (
        v_contact.id,
        v_contact.workspace_id,
        'claim_stalled',
        'Potential claim stalled',
        format('Homeowner hasn''t replied in %s days. Follow up needed.', v_days_since_reply),
        'medium'
      );
      v_alerts_created := v_alerts_created + 1;
    END IF;
    
    -- Alert 2: Adjuster meeting in 24 hours
    IF v_metadata.adjuster_meeting_date IS NOT NULL THEN
      SELECT EXTRACT(DAY FROM (v_metadata.adjuster_meeting_date - CURRENT_DATE))::integer INTO v_days_until_meeting;
      
      IF v_days_until_meeting <= 1 AND v_days_until_meeting >= 0 AND NOT EXISTS (
        SELECT 1 FROM public.insurance_risk_alerts
        WHERE contact_id = v_contact.id
          AND alert_type = 'adjuster_meeting_soon'
          AND is_resolved = false
      ) THEN
        INSERT INTO public.insurance_risk_alerts (
          contact_id,
          workspace_id,
          alert_type,
          alert_title,
          alert_message,
          alert_severity
        ) VALUES (
          v_contact.id,
          v_contact.workspace_id,
          'adjuster_meeting_soon',
          'Adjuster meeting soon',
          format('Adjuster meeting in %s hours. Prep checklist recommended.', v_days_until_meeting * 24),
          'high'
        );
        v_alerts_created := v_alerts_created + 1;
      END IF;
    END IF;
    
    -- Alert 3: Scope received with missing items (simplified check)
    IF v_metadata.claim_status = 'scope_received' AND NOT EXISTS (
      SELECT 1 FROM public.insurance_risk_alerts
      WHERE contact_id = v_contact.id
        AND alert_type = 'scope_missing_items'
        AND is_resolved = false
    ) THEN
      INSERT INTO public.insurance_risk_alerts (
        contact_id,
        workspace_id,
        alert_type,
        alert_title,
        alert_message,
        alert_severity
      ) VALUES (
        v_contact.id,
        v_contact.workspace_id,
        'scope_missing_items',
        'Review scope for supplements',
        'Scope received. Review for missing line items - supplement opportunity possible.',
        'medium'
      );
      v_alerts_created := v_alerts_created + 1;
    END IF;
    
    -- Alert 4: Approval pending too long (30+ days)
    IF v_metadata.claim_status = 'pending_approval' THEN
      SELECT EXTRACT(DAY FROM (now() - COALESCE(v_metadata.scope_received_date, v_metadata.created_at)))::integer INTO v_days_pending;
      
      IF v_days_pending >= 30 AND NOT EXISTS (
        SELECT 1 FROM public.insurance_risk_alerts
        WHERE contact_id = v_contact.id
          AND alert_type = 'approval_pending_long'
          AND is_resolved = false
      ) THEN
        INSERT INTO public.insurance_risk_alerts (
          contact_id,
          workspace_id,
          alert_type,
          alert_title,
          alert_message,
          alert_severity
        ) VALUES (
          v_contact.id,
          v_contact.workspace_id,
          'approval_pending_long',
          'Approval pending too long',
          format('Approval has been pending for %s days. Time to check status.', v_days_pending),
          'high'
        );
        v_alerts_created := v_alerts_created + 1;
      END IF;
    END IF;
  END LOOP;
  
  RETURN v_alerts_created;
END;
$$;

COMMENT ON FUNCTION public.check_insurance_risk_alerts IS 'Checks for insurance risk alerts and creates them when conditions are met';

-- ============================================================================
-- 15. TRIGGER: Auto-detect insurance when message contains keywords
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_insurance_detection_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_detection jsonb;
  v_has_insurance boolean;
  v_keywords text[];
BEGIN
  -- Only process inbound messages
  IF NEW.direction != 'inbound' OR NEW.is_reply != true THEN
    RETURN NEW;
  END IF;
  
  -- Detect insurance keywords
  v_detection := public.detect_insurance_keywords(NEW.body, '[]'::jsonb);
  v_has_insurance := (v_detection->>'has_insurance')::boolean;
  v_keywords := (v_detection->>'detected_keywords')::text[];
  
  -- If insurance detected, auto-apply
  IF v_has_insurance AND NEW.contact_id IS NOT NULL THEN
    BEGIN
      PERFORM public.auto_apply_insurance_detection(
        NEW.contact_id,
        'message',
        v_keywords,
        (v_detection->>'confidence')::numeric
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the insert
      RAISE WARNING 'Error detecting insurance for contact %: %', NEW.contact_id, SQLERRM;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on inbox_threads (if table exists)
-- Note: Adjust table name based on your actual message/thread table
DROP TRIGGER IF EXISTS trg_insurance_detection_on_message ON public.inbox_threads;
CREATE TRIGGER trg_insurance_detection_on_message
  AFTER INSERT ON public.inbox_threads
  FOR EACH ROW
  WHEN (NEW.is_reply = true AND NEW.direction = 'inbound')
  EXECUTE FUNCTION public.trigger_insurance_detection_on_message();

-- ============================================================================
-- 16. RLS POLICIES
-- ============================================================================

ALTER TABLE public.insurance_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_risk_alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view insurance data for contacts in their workspace
CREATE POLICY "Users can view insurance metadata for their workspace"
  ON public.insurance_metadata FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view insurance scores for their workspace"
  ON public.insurance_scores FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view insurance timeline for their workspace"
  ON public.insurance_timeline FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view insurance documents for their workspace"
  ON public.insurance_documents FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view insurance events for their workspace"
  ON public.insurance_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view insurance pipeline stages for their workspace"
  ON public.insurance_pipeline_stages FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view insurance risk alerts for their workspace"
  ON public.insurance_risk_alerts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Service role can insert/update (for workers)
CREATE POLICY "Service role can manage insurance metadata"
  ON public.insurance_metadata FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage insurance scores"
  ON public.insurance_scores FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage insurance timeline"
  ON public.insurance_timeline FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage insurance documents"
  ON public.insurance_documents FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage insurance events"
  ON public.insurance_events FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage insurance risk alerts"
  ON public.insurance_risk_alerts FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 17. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.insurance_metadata TO authenticated;
GRANT SELECT ON public.insurance_scores TO authenticated;
GRANT SELECT ON public.insurance_timeline TO authenticated;
GRANT SELECT ON public.insurance_documents TO authenticated;
GRANT SELECT ON public.insurance_events TO authenticated;
GRANT SELECT ON public.insurance_pipeline_stages TO authenticated;
GRANT SELECT ON public.insurance_risk_alerts TO authenticated;

GRANT EXECUTE ON FUNCTION public.detect_insurance_keywords(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_insurance_likelihood_score(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_insurance_timeline(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_apply_insurance_detection(uuid, text, text[], numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.extract_insurance_document_data(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_insurance_risk_alerts(uuid) TO service_role;

-- ============================================================================
-- 18. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.insurance_metadata IS 'Stores insurance claim metadata including claim number, adjuster info, ACV/RCV, deductible, and claim status (Block 17400)';
COMMENT ON TABLE public.insurance_scores IS 'Insurance likelihood scores (0-100) with detailed breakdown by factor (Block 17400)';
COMMENT ON TABLE public.insurance_timeline IS 'Insurance claim timeline with stages, dates, and recommended actions (Block 17400)';
COMMENT ON TABLE public.insurance_documents IS 'Insurance-related documents with extracted data (ACV, RCV, deductible, etc.) (Block 17400)';
COMMENT ON TABLE public.insurance_events IS 'Insurance events log for audit trail (Block 17400)';
COMMENT ON TABLE public.insurance_pipeline_stages IS 'Custom pipeline stages for insurance claims (Block 17400)';
COMMENT ON TABLE public.insurance_risk_alerts IS 'Risk alerts for insurance claims (stalled, meeting soon, etc.) (Block 17400)';





















































