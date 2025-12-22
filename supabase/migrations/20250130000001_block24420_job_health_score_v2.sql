-- =========================================================
-- Block 24420 — SmartSend Roofing Job Health Score v2
-- (Real-Time Job Risk Detection • Scheduling Delays • Material Problems • Crew Issues • Payment Flags • A Live "Job Safety Meter" That Prevents Roofing Disasters Before They Happen)
-- =========================================================
-- 
-- FULL JOB HEALTH ENGINE — ZERO FLUFF.
-- 
-- This version upgrades the Job Health Score into a live early-warning system for every roof job.
-- It tells roofers:
-- ✔ what's wrong
-- ✔ why it's wrong
-- ✔ what to fix
-- ✔ how urgent it is
--
-- No roofer has ever had this.
-- SmartSend makes them operate like a $10M roofing company, even if it's just one crew.

-- ============================================================================
-- PART 1 — CREATE job_health_scores TABLE
-- ============================================================================
-- Stores calculated health scores and breakdown by pillar for each job

CREATE TABLE IF NOT EXISTS public.job_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Overall score (0-100)
  overall_score numeric(5,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- Pillar scores (0-100 each)
  materials_score numeric(5,2) DEFAULT 0 CHECK (materials_score >= 0 AND materials_score <= 100),
  crew_readiness_score numeric(5,2) DEFAULT 0 CHECK (crew_readiness_score >= 0 AND crew_readiness_score <= 100),
  weather_impact_score numeric(5,2) DEFAULT 0 CHECK (weather_impact_score >= 0 AND weather_impact_score <= 100),
  homeowner_readiness_score numeric(5,2) DEFAULT 0 CHECK (homeowner_readiness_score >= 0 AND homeowner_readiness_score <= 100),
  payments_paperwork_score numeric(5,2) DEFAULT 0 CHECK (payments_paperwork_score >= 0 AND payments_paperwork_score <= 100),

  -- Health status badge
  health_status text CHECK (health_status IN ('healthy', 'needs_attention', 'at_risk')) NOT NULL,
  
  -- Score breakdown details (JSONB for flexibility)
  score_details jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  calculated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one score per job
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_health_scores_job_id ON public.job_health_scores(job_id);
CREATE INDEX IF NOT EXISTS idx_job_health_scores_workspace ON public.job_health_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_health_scores_overall_score ON public.job_health_scores(overall_score);
CREATE INDEX IF NOT EXISTS idx_job_health_scores_health_status ON public.job_health_scores(health_status);
CREATE INDEX IF NOT EXISTS idx_job_health_scores_calculated_at ON public.job_health_scores(calculated_at DESC);

-- ============================================================================
-- PART 2 — CREATE job_health_issues TABLE
-- ============================================================================
-- Tracks specific issues affecting job health (Top 3 Issues To Fix Right Now)

CREATE TABLE IF NOT EXISTS public.job_health_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  health_score_id uuid REFERENCES public.job_health_scores(id) ON DELETE CASCADE,

  -- Issue details
  pillar text NOT NULL CHECK (pillar IN ('materials', 'crew_readiness', 'weather_impact', 'homeowner_readiness', 'payments_paperwork')),
  issue_type text NOT NULL, -- e.g., 'supplier_not_confirmed', 'crew_not_assigned', 'weather_risk', 'homeowner_no_confirmation', 'deposit_not_collected'
  issue_title text NOT NULL, -- Human-readable title
  issue_description text, -- Detailed description
  urgency text CHECK (urgency IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  
  -- Impact on score
  score_impact numeric(5,2) DEFAULT 0, -- How many points this issue costs
  
  -- Status
  status text CHECK (status IN ('active', 'resolved', 'dismissed')) DEFAULT 'active',
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_health_issues_job_id ON public.job_health_issues(job_id);
CREATE INDEX IF NOT EXISTS idx_job_health_issues_workspace ON public.job_health_issues(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_health_issues_status ON public.job_health_issues(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_job_health_issues_pillar ON public.job_health_issues(pillar);
CREATE INDEX IF NOT EXISTS idx_job_health_issues_urgency ON public.job_health_issues(urgency);

-- ============================================================================
-- PART 3 — CREATE job_health_alerts TABLE
-- ============================================================================
-- Early warning alerts when health score drops

CREATE TABLE IF NOT EXISTS public.job_health_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Alert details
  alert_type text CHECK (alert_type IN ('risk_alert', 'action_required')) NOT NULL,
  previous_score numeric(5,2),
  current_score numeric(5,2),
  score_change numeric(5,2), -- negative = dropped
  
  -- Reason
  reason text NOT NULL,
  affected_pillar text CHECK (affected_pillar IN ('materials', 'crew_readiness', 'weather_impact', 'homeowner_readiness', 'payments_paperwork')),
  
  -- Status
  status text CHECK (status IN ('active', 'acknowledged', 'resolved')) DEFAULT 'active',
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_health_alerts_job_id ON public.job_health_alerts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_health_alerts_workspace ON public.job_health_alerts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_health_alerts_status ON public.job_health_alerts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_job_health_alerts_created_at ON public.job_health_alerts(created_at DESC);

-- ============================================================================
-- PART 4 — CREATE job_health_fix_suggestions TABLE
-- ============================================================================
-- AI-powered fix suggestions for health issues

CREATE TABLE IF NOT EXISTS public.job_health_fix_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  issue_id uuid REFERENCES public.job_health_issues(id) ON DELETE CASCADE,

  -- Suggestion details
  suggestion_type text CHECK (suggestion_type IN ('reschedule_crew', 'send_notes', 'send_confirmation', 'adjust_start', 'send_invoice', 'contact_supplier', 'other')) NOT NULL,
  suggestion_title text NOT NULL,
  suggestion_description text NOT NULL,
  action_url text, -- URL to perform the action (e.g., /api/jobs/{id}/reschedule)
  
  -- Status
  status text CHECK (status IN ('pending', 'applied', 'dismissed')) DEFAULT 'pending',
  applied_at timestamptz,
  applied_by uuid REFERENCES auth.users(id),
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_health_fix_suggestions_job_id ON public.job_health_fix_suggestions(job_id);
CREATE INDEX IF NOT EXISTS idx_job_health_fix_suggestions_workspace ON public.job_health_fix_suggestions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_health_fix_suggestions_status ON public.job_health_fix_suggestions(status) WHERE status = 'pending';

-- ============================================================================
-- PART 5 — CREATE crew_readiness_tracking TABLE
-- ============================================================================
-- Tracks crew readiness checklist items

CREATE TABLE IF NOT EXISTS public.crew_readiness_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Checklist items
  crew_assigned boolean DEFAULT false,
  crew_reviewed_job_notes boolean DEFAULT false,
  pre_job_checklist_complete boolean DEFAULT false,
  crew_confirmed_arrival boolean DEFAULT false,
  crew_submitted_arrival_photos boolean DEFAULT false,
  
  -- Timestamps
  crew_reviewed_at timestamptz,
  checklist_completed_at timestamptz,
  arrival_confirmed_at timestamptz,
  arrival_photos_submitted_at timestamptz,
  
  -- Metadata
  notes text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One tracking record per job
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_crew_readiness_tracking_job_id ON public.crew_readiness_tracking(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_readiness_tracking_workspace ON public.crew_readiness_tracking(workspace_id);

-- ============================================================================
-- PART 6 — CREATE homeowner_readiness_tracking TABLE
-- ============================================================================
-- Tracks homeowner readiness checklist items

CREATE TABLE IF NOT EXISTS public.homeowner_readiness_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Checklist items
  reminder_sent boolean DEFAULT false,
  homeowner_confirmed_availability boolean DEFAULT false,
  homeowner_aware_of_placement_instructions boolean DEFAULT false,
  driveway_clear_confirmed boolean DEFAULT false,
  
  -- Timestamps
  reminder_sent_at timestamptz,
  homeowner_confirmed_at timestamptz,
  placement_instructions_sent_at timestamptz,
  driveway_confirmed_at timestamptz,
  
  -- Metadata
  notes text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One tracking record per job
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_homeowner_readiness_tracking_job_id ON public.homeowner_readiness_tracking(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_readiness_tracking_workspace ON public.homeowner_readiness_tracking(workspace_id);

-- ============================================================================
-- PART 7 — FUNCTION: calculate_materials_score
-- ============================================================================
-- Calculates Materials pillar score (30% weight)

CREATE OR REPLACE FUNCTION public.calculate_materials_score(p_job_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_order record;
  v_delivery record;
  v_issues jsonb := '[]'::jsonb;
  v_issue jsonb;
BEGIN
  -- Get latest material order for this job
  SELECT * INTO v_order
  FROM public.material_orders
  WHERE job_id = p_job_id
    AND status NOT IN ('cancelled', 'canceled')
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no order exists, major issue
  IF v_order IS NULL THEN
    v_issue := jsonb_build_object(
      'type', 'no_order',
      'title', 'No material order created',
      'impact', -25
    );
    v_issues := v_issues || v_issue;
    v_score := v_score - 25;
    RETURN v_score;
  END IF;

  -- Check PO sent
  IF v_order.po_sent_at IS NULL THEN
    v_issue := jsonb_build_object(
      'type', 'po_not_sent',
      'title', 'PO has not been sent to supplier',
      'impact', -10
    );
    v_issues := v_issues || v_issue;
    v_score := v_score - 10;
  ELSE
    v_score := v_score + 8;
  END IF;

  -- Check supplier confirmed
  IF NOT v_order.supplier_confirmed THEN
    v_issue := jsonb_build_object(
      'type', 'supplier_not_confirmed',
      'title', 'Supplier has not confirmed order',
      'impact', -15
    );
    v_issues := v_issues || v_issue;
    v_score := v_score - 15;
  ELSE
    v_score := v_score + 8;
  END IF;

  -- Check delivery scheduled
  IF v_order.expected_delivery_date IS NULL THEN
    v_issue := jsonb_build_object(
      'type', 'delivery_not_scheduled',
      'title', 'Delivery date not scheduled',
      'impact', -8
    );
    v_issues := v_issues || v_issue;
    v_score := v_score - 8;
  ELSE
    v_score := v_score + 5;
    
    -- Check if delivery is late
    IF v_order.expected_delivery_date < CURRENT_DATE AND v_order.status NOT IN ('delivered', 'on_truck') THEN
      v_issue := jsonb_build_object(
        'type', 'delivery_late',
        'title', 'Delivery is late',
        'impact', -12
      );
      v_issues := v_issues || v_issue;
      v_score := v_score - 12;
    END IF;
  END IF;

  -- Check delivery status
  IF v_order.status = 'delivered' THEN
    v_score := v_score + 5;
  ELSIF v_order.status IN ('delayed', 'en_route') THEN
    v_score := v_score - 5;
  END IF;

  -- Check for reported issues
  IF v_order.issue_reported THEN
    v_issue := jsonb_build_object(
      'type', 'issue_reported',
      'title', COALESCE(v_order.issue_description, 'Material issue reported'),
      'impact', -10
    );
    v_issues := v_issues || v_issue;
    v_score := v_score - 10;
  END IF;

  -- Check for shortage alerts
  IF EXISTS (
    SELECT 1 FROM public.material_shortage_alerts
    WHERE job_id = p_job_id AND status = 'detected'
  ) THEN
    v_issue := jsonb_build_object(
      'type', 'material_shortage',
      'title', 'Material shortage detected',
      'impact', -10
    );
    v_issues := v_issues || v_issue;
    v_score := v_score - 10;
  END IF;

  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));

  RETURN v_score;
END;
$$;

-- ============================================================================
-- PART 8 — FUNCTION: calculate_crew_readiness_score
-- ============================================================================
-- Calculates Crew Readiness pillar score (25% weight)

CREATE OR REPLACE FUNCTION public.calculate_crew_readiness_score(p_job_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_assignment record;
  v_readiness record;
BEGIN
  -- Check if crew is assigned
  SELECT * INTO v_assignment
  FROM public.job_crew_assignments
  WHERE job_id = p_job_id
    AND unassigned_at IS NULL
  LIMIT 1;

  IF v_assignment IS NULL THEN
    -- No crew assigned = major issue
    RETURN 0;
  END IF;

  -- Get readiness tracking
  SELECT * INTO v_readiness
  FROM public.crew_readiness_tracking
  WHERE job_id = p_job_id;

  -- If no tracking record exists, create one (but still penalize)
  IF v_readiness IS NULL THEN
    v_score := v_score - 20; -- Crew assigned but no tracking started
    RETURN GREATEST(0, v_score);
  END IF;

  -- Check each readiness item
  IF NOT v_readiness.crew_reviewed_job_notes THEN
    v_score := v_score - 8;
  ELSE
    v_score := v_score + 3;
  END IF;

  IF NOT v_readiness.pre_job_checklist_complete THEN
    v_score := v_score - 10;
  ELSE
    v_score := v_score + 5;
  END IF;

  IF NOT v_readiness.crew_confirmed_arrival THEN
    v_score := v_score - 12;
  ELSE
    v_score := v_score + 5;
  END IF;

  IF NOT v_readiness.crew_submitted_arrival_photos THEN
    v_score := v_score - 5;
  ELSE
    v_score := v_score + 3;
  END IF;

  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));

  RETURN v_score;
END;
$$;

-- ============================================================================
-- PART 9 — FUNCTION: calculate_weather_impact_score
-- ============================================================================
-- Calculates Weather Impact pillar score (15% weight)

CREATE OR REPLACE FUNCTION public.calculate_weather_impact_score(p_job_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_job record;
  v_weather_risk text;
  v_scheduled_date date;
BEGIN
  -- Get job details
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = p_job_id;

  IF v_job IS NULL THEN
    RETURN 100; -- No job = no weather risk
  END IF;

  v_scheduled_date := COALESCE(v_job.scheduled_start_date, v_job.preferred_start_date);

  -- If no scheduled date, no weather risk
  IF v_scheduled_date IS NULL THEN
    RETURN 100;
  END IF;

  -- Check weather risk label
  v_weather_risk := v_job.weather_risk_label;

  IF v_weather_risk = 'high' THEN
    v_score := v_score - 12;
  ELSIF v_weather_risk = 'medium' THEN
    v_score := v_score - 6;
  ELSIF v_weather_risk = 'low' THEN
    v_score := v_score - 2;
  END IF;

  -- Check weather risk score (0.0-1.0)
  IF v_job.weather_risk_score IS NOT NULL THEN
    IF v_job.weather_risk_score > 0.7 THEN
      v_score := v_score - 10;
    ELSIF v_job.weather_risk_score > 0.4 THEN
      v_score := v_score - 5;
    END IF;
  END IF;

  -- Check if scheduled date is within 3 days and weather is risky
  IF v_scheduled_date <= CURRENT_DATE + INTERVAL '3 days' AND v_weather_risk IN ('high', 'medium') THEN
    v_score := v_score - 5; -- Additional penalty for imminent weather risk
  END IF;

  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));

  RETURN v_score;
END;
$$;

-- ============================================================================
-- PART 10 — FUNCTION: calculate_homeowner_readiness_score
-- ============================================================================
-- Calculates Homeowner Readiness pillar score (15% weight)

CREATE OR REPLACE FUNCTION public.calculate_homeowner_readiness_score(p_job_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_readiness record;
  v_scheduled_date date;
BEGIN
  -- Get job scheduled date
  SELECT scheduled_start_date, preferred_start_date INTO v_scheduled_date
  FROM public.roofing_jobs
  WHERE id = p_job_id;

  -- Get readiness tracking
  SELECT * INTO v_readiness
  FROM public.homeowner_readiness_tracking
  WHERE job_id = p_job_id;

  -- If no tracking record exists, penalize
  IF v_readiness IS NULL THEN
    v_score := v_score - 15;
    RETURN GREATEST(0, v_score);
  END IF;

  -- Check reminder sent
  IF NOT v_readiness.reminder_sent THEN
    v_score := v_score - 8;
  ELSE
    v_score := v_score + 5;
  END IF;

  -- Check homeowner confirmed availability
  IF NOT v_readiness.homeowner_confirmed_availability THEN
    v_score := v_score - 10;
    -- Extra penalty if job is scheduled soon
    IF v_scheduled_date IS NOT NULL AND v_scheduled_date <= CURRENT_DATE + INTERVAL '2 days' THEN
      v_score := v_score - 5;
    END IF;
  ELSE
    v_score := v_score + 5;
  END IF;

  -- Check placement instructions awareness
  IF NOT v_readiness.homeowner_aware_of_placement_instructions THEN
    v_score := v_score - 3;
  ELSE
    v_score := v_score + 2;
  END IF;

  -- Check driveway clear
  IF NOT v_readiness.driveway_clear_confirmed THEN
    v_score := v_score - 2;
  ELSE
    v_score := v_score + 1;
  END IF;

  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));

  RETURN v_score;
END;
$$;

-- ============================================================================
-- PART 11 — FUNCTION: calculate_payments_paperwork_score
-- ============================================================================
-- Calculates Payments & Paperwork pillar score (15% weight)

CREATE OR REPLACE FUNCTION public.calculate_payments_paperwork_score(p_job_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_job record;
  v_deposit_paid numeric := 0;
  v_deposit_required numeric := 0;
  v_contract_signed boolean := false;
BEGIN
  -- Get job details
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = p_job_id;

  IF v_job IS NULL THEN
    RETURN 100;
  END IF;

  v_deposit_required := COALESCE(v_job.deposit_required, 0);
  v_deposit_paid := COALESCE(v_job.deposit_paid, 0);

  -- Check deposit collection
  IF v_deposit_required > 0 THEN
    IF v_deposit_paid < v_deposit_required THEN
      -- Calculate penalty based on how much is missing
      DECLARE
        v_missing_percent numeric;
      BEGIN
        v_missing_percent := ((v_deposit_required - v_deposit_paid) / v_deposit_required) * 100;
        IF v_missing_percent = 100 THEN
          v_score := v_score - 15; -- No deposit paid
        ELSIF v_missing_percent > 50 THEN
          v_score := v_score - 10; -- More than half missing
        ELSE
          v_score := v_score - 5; -- Less than half missing
        END IF;
      END;
    ELSE
      v_score := v_score + 8; -- Deposit fully paid
    END IF;
  END IF;

  -- Check contract signed
  SELECT EXISTS (
    SELECT 1 FROM public.job_signable_documents
    WHERE job_id = p_job_id
      AND document_type = 'contract'
      AND status = 'signed'
  ) INTO v_contract_signed;

  IF NOT v_contract_signed THEN
    -- Check if job is scheduled or in progress without contract
    IF v_job.status IN ('scheduled', 'in_progress') THEN
      v_score := v_score - 15; -- Major issue: job started without contract
    ELSE
      v_score := v_score - 8; -- Contract not signed yet
    END IF;
  ELSE
    v_score := v_score + 5;
  END IF;

  -- Check for final invoice ready (if job is completed or near completion)
  IF v_job.status = 'completed' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.job_invoices
      WHERE job_id = p_job_id
        AND type = 'final'
        AND status IN ('sent', 'viewed', 'paid')
    ) THEN
      v_score := v_score - 5; -- Final invoice not sent
    END IF;
  END IF;

  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));

  RETURN v_score;
END;
$$;

-- ============================================================================
-- PART 12 — FUNCTION: calculate_job_health_score
-- ============================================================================
-- Main function to calculate overall job health score

CREATE OR REPLACE FUNCTION public.calculate_job_health_score(p_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_materials_score numeric;
  v_crew_score numeric;
  v_weather_score numeric;
  v_homeowner_score numeric;
  v_payments_score numeric;
  v_overall_score numeric;
  v_health_status text;
  v_score_id uuid;
  v_previous_score numeric;
BEGIN
  -- Get job details
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = p_job_id;

  IF v_job IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  -- Calculate pillar scores
  v_materials_score := public.calculate_materials_score(p_job_id);
  v_crew_score := public.calculate_crew_readiness_score(p_job_id);
  v_weather_score := public.calculate_weather_impact_score(p_job_id);
  v_homeowner_score := public.calculate_homeowner_readiness_score(p_job_id);
  v_payments_score := public.calculate_payments_paperwork_score(p_job_id);

  -- Calculate weighted overall score
  -- Materials: 30%, Crew: 25%, Weather: 15%, Homeowner: 15%, Payments: 15%
  v_overall_score := 
    (v_materials_score * 0.30) +
    (v_crew_score * 0.25) +
    (v_weather_score * 0.15) +
    (v_homeowner_score * 0.15) +
    (v_payments_score * 0.15);

  -- Round to 2 decimal places
  v_overall_score := ROUND(v_overall_score, 2);

  -- Determine health status
  IF v_overall_score >= 90 THEN
    v_health_status := 'healthy';
  ELSIF v_overall_score >= 70 THEN
    v_health_status := 'needs_attention';
  ELSE
    v_health_status := 'at_risk';
  END IF;

  -- Get previous score for alert generation
  SELECT overall_score INTO v_previous_score
  FROM public.job_health_scores
  WHERE job_id = p_job_id;

  -- Insert or update health score
  INSERT INTO public.job_health_scores (
    job_id,
    workspace_id,
    overall_score,
    materials_score,
    crew_readiness_score,
    weather_impact_score,
    homeowner_readiness_score,
    payments_paperwork_score,
    health_status,
    score_details,
    calculated_at,
    updated_at
  ) VALUES (
    p_job_id,
    v_job.workspace_id,
    v_overall_score,
    v_materials_score,
    v_crew_score,
    v_weather_score,
    v_homeowner_score,
    v_payments_score,
    v_health_status,
    jsonb_build_object(
      'materials', jsonb_build_object('score', v_materials_score, 'weight', 0.30),
      'crew_readiness', jsonb_build_object('score', v_crew_score, 'weight', 0.25),
      'weather_impact', jsonb_build_object('score', v_weather_score, 'weight', 0.15),
      'homeowner_readiness', jsonb_build_object('score', v_homeowner_score, 'weight', 0.15),
      'payments_paperwork', jsonb_build_object('score', v_payments_score, 'weight', 0.15)
    ),
    now(),
    now()
  )
  ON CONFLICT (job_id) DO UPDATE SET
    overall_score = EXCLUDED.overall_score,
    materials_score = EXCLUDED.materials_score,
    crew_readiness_score = EXCLUDED.crew_readiness_score,
    weather_impact_score = EXCLUDED.weather_impact_score,
    homeowner_readiness_score = EXCLUDED.homeowner_readiness_score,
    payments_paperwork_score = EXCLUDED.payments_paperwork_score,
    health_status = EXCLUDED.health_status,
    score_details = EXCLUDED.score_details,
    updated_at = EXCLUDED.updated_at
  RETURNING id INTO v_score_id;

  -- Generate alert if score dropped significantly
  IF v_previous_score IS NOT NULL AND (v_previous_score - v_overall_score) >= 10 THEN
    INSERT INTO public.job_health_alerts (
      job_id,
      workspace_id,
      alert_type,
      previous_score,
      current_score,
      score_change,
      reason,
      affected_pillar
    ) VALUES (
      p_job_id,
      v_job.workspace_id,
      'risk_alert',
      v_previous_score,
      v_overall_score,
      v_overall_score - v_previous_score,
      'Job health score dropped significantly',
      NULL -- Will be determined by analyzing which pillar dropped most
    );
  END IF;

  -- Generate issues for top problems
  PERFORM public.generate_job_health_issues(p_job_id, v_score_id);

  -- Generate fix suggestions
  PERFORM public.generate_fix_suggestions(p_job_id, v_score_id);

  RETURN v_score_id;
END;
$$;

-- ============================================================================
-- PART 13 — FUNCTION: generate_job_health_issues
-- ============================================================================
-- Generates top 3 issues for a job

CREATE OR REPLACE FUNCTION public.generate_job_health_issues(p_job_id uuid, p_score_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score record;
  v_job record;
  v_order record;
  v_assignment record;
  v_readiness record;
  v_homeowner_readiness record;
  v_issues jsonb := '[]'::jsonb;
BEGIN
  -- Get health score
  SELECT * INTO v_score
  FROM public.job_health_scores
  WHERE id = p_score_id;

  IF v_score IS NULL THEN
    RETURN;
  END IF;

  -- Get job details
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = p_job_id;

  -- Clear existing active issues
  UPDATE public.job_health_issues
  SET status = 'dismissed'
  WHERE job_id = p_job_id AND status = 'active';

  -- MATERIALS ISSUES
  IF v_score.materials_score < 70 THEN
    -- Check for specific material issues
    SELECT * INTO v_order
    FROM public.material_orders
    WHERE job_id = p_job_id
      AND status NOT IN ('cancelled', 'canceled')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_order IS NULL THEN
      INSERT INTO public.job_health_issues (
        job_id, workspace_id, health_score_id, pillar, issue_type, issue_title, issue_description, urgency, score_impact
      ) VALUES (
        p_job_id, v_job.workspace_id, p_score_id, 'materials', 'no_order', 'No material order created', 'Create a material order for this job', 'high', 25
      );
    ELSIF NOT v_order.supplier_confirmed THEN
      INSERT INTO public.job_health_issues (
        job_id, workspace_id, health_score_id, pillar, issue_type, issue_title, issue_description, urgency, score_impact
      ) VALUES (
        p_job_id, v_job.workspace_id, p_score_id, 'materials', 'supplier_not_confirmed', 'Supplier has not confirmed order', 'Contact supplier to confirm material order', 'high', 15
      );
    ELSIF v_order.expected_delivery_date IS NULL THEN
      INSERT INTO public.job_health_issues (
        job_id, workspace_id, health_score_id, pillar, issue_type, issue_title, issue_description, urgency, score_impact
      ) VALUES (
        p_job_id, v_job.workspace_id, p_score_id, 'materials', 'delivery_not_scheduled', 'Delivery date not scheduled', 'Schedule material delivery date', 'medium', 8
      );
    END IF;
  END IF;

  -- CREW READINESS ISSUES
  IF v_score.crew_readiness_score < 70 THEN
    SELECT * INTO v_assignment
    FROM public.job_crew_assignments
    WHERE job_id = p_job_id AND unassigned_at IS NULL
    LIMIT 1;

    IF v_assignment IS NULL THEN
      INSERT INTO public.job_health_issues (
        job_id, workspace_id, health_score_id, pillar, issue_type, issue_title, issue_description, urgency, score_impact
      ) VALUES (
        p_job_id, v_job.workspace_id, p_score_id, 'crew_readiness', 'crew_not_assigned', 'Crew not assigned', 'Assign a crew to this job', 'critical', 20
      );
    ELSE
      SELECT * INTO v_readiness
      FROM public.crew_readiness_tracking
      WHERE job_id = p_job_id;

      IF v_readiness IS NULL OR NOT v_readiness.crew_reviewed_job_notes THEN
        INSERT INTO public.job_health_issues (
          job_id, workspace_id, health_score_id, pillar, issue_type, issue_title, issue_description, urgency, score_impact
        ) VALUES (
          p_job_id, v_job.workspace_id, p_score_id, 'crew_readiness', 'crew_not_reviewed', 'Crew has not reviewed job notes', 'Send job notes to crew', 'medium', 8
        );
      END IF;
    END IF;
  END IF;

  -- WEATHER ISSUES
  IF v_score.weather_impact_score < 85 THEN
    IF v_job.weather_risk_label IN ('high', 'medium') THEN
      INSERT INTO public.job_health_issues (
        job_id, workspace_id, health_score_id, pillar, issue_type, issue_title, issue_description, urgency, score_impact
      ) VALUES (
        p_job_id, v_job.workspace_id, p_score_id, 'weather_impact', 'weather_risk', 
        CASE 
          WHEN v_job.weather_risk_label = 'high' THEN 'High weather risk for scheduled date'
          ELSE 'Medium weather risk for scheduled date'
        END,
        'Consider rescheduling if weather conditions worsen', 
        CASE WHEN v_job.weather_risk_label = 'high' THEN 'high' ELSE 'medium' END,
        12
      );
    END IF;
  END IF;

  -- HOMEOWNER READINESS ISSUES
  IF v_score.homeowner_readiness_score < 70 THEN
    SELECT * INTO v_homeowner_readiness
    FROM public.homeowner_readiness_tracking
    WHERE job_id = p_job_id;

    IF v_homeowner_readiness IS NULL OR NOT v_homeowner_readiness.homeowner_confirmed_availability THEN
      INSERT INTO public.job_health_issues (
        job_id, workspace_id, health_score_id, pillar, issue_type, issue_title, issue_description, urgency, score_impact
      ) VALUES (
        p_job_id, v_job.workspace_id, p_score_id, 'homeowner_readiness', 'homeowner_no_confirmation', 
        'Homeowner has not confirmed availability', 'Send confirmation message to homeowner', 'high', 10
      );
    END IF;
  END IF;

  -- PAYMENTS ISSUES
  IF v_score.payments_paperwork_score < 70 THEN
    IF v_job.deposit_required > 0 AND v_job.deposit_paid < v_job.deposit_required THEN
      INSERT INTO public.job_health_issues (
        job_id, workspace_id, health_score_id, pillar, issue_type, issue_title, issue_description, urgency, score_impact
      ) VALUES (
        p_job_id, v_job.workspace_id, p_score_id, 'payments_paperwork', 'deposit_not_collected', 
        'Deposit not fully collected', 'Collect remaining deposit before starting job', 'high', 15
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.job_signable_documents
      WHERE job_id = p_job_id AND document_type = 'contract' AND status = 'signed'
    ) AND v_job.status IN ('scheduled', 'in_progress') THEN
      INSERT INTO public.job_health_issues (
        job_id, workspace_id, health_score_id, pillar, issue_type, issue_title, issue_description, urgency, score_impact
      ) VALUES (
        p_job_id, v_job.workspace_id, p_score_id, 'payments_paperwork', 'contract_not_signed', 
        'Contract not signed', 'Get contract signed before starting work', 'critical', 15
      );
    END IF;
  END IF;
END;
$$;

-- ============================================================================
-- PART 14 — FUNCTION: generate_fix_suggestions
-- ============================================================================
-- Generates automated fix suggestions for health issues

CREATE OR REPLACE FUNCTION public.generate_fix_suggestions(p_job_id uuid, p_score_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_issue record;
  v_job record;
BEGIN
  -- Get job details
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = p_job_id;

  -- Clear existing pending suggestions
  UPDATE public.job_health_fix_suggestions
  SET status = 'dismissed'
  WHERE job_id = p_job_id AND status = 'pending';

  -- Generate suggestions based on active issues
  FOR v_issue IN
    SELECT * FROM public.job_health_issues
    WHERE job_id = p_job_id AND status = 'active'
    ORDER BY urgency DESC, score_impact DESC
    LIMIT 5
  LOOP
    CASE v_issue.issue_type
      WHEN 'supplier_not_confirmed' THEN
        INSERT INTO public.job_health_fix_suggestions (
          job_id, workspace_id, issue_id, suggestion_type, suggestion_title, suggestion_description, action_url
        ) VALUES (
          p_job_id, v_job.workspace_id, v_issue.id, 'contact_supplier',
          'Contact supplier to confirm order',
          'Send a follow-up message to the supplier to confirm the material order status.',
          '/api/jobs/' || p_job_id || '/contact-supplier'
        );

      WHEN 'crew_not_assigned' THEN
        INSERT INTO public.job_health_fix_suggestions (
          job_id, workspace_id, issue_id, suggestion_type, suggestion_title, suggestion_description, action_url
        ) VALUES (
          p_job_id, v_job.workspace_id, v_issue.id, 'other',
          'Assign a crew to this job',
          'Go to the scheduling board and assign a crew to this job.',
          '/scheduling/assign-crew?job_id=' || p_job_id
        );

      WHEN 'crew_not_reviewed' THEN
        INSERT INTO public.job_health_fix_suggestions (
          job_id, workspace_id, issue_id, suggestion_type, suggestion_title, suggestion_description, action_url
        ) VALUES (
          p_job_id, v_job.workspace_id, v_issue.id, 'send_notes',
          'Send job notes to crew automatically',
          'Automatically send job notes and instructions to the assigned crew.',
          '/api/jobs/' || p_job_id || '/send-crew-notes'
        );

      WHEN 'weather_risk' THEN
        INSERT INTO public.job_health_fix_suggestions (
          job_id, workspace_id, issue_id, suggestion_type, suggestion_title, suggestion_description, action_url
        ) VALUES (
          p_job_id, v_job.workspace_id, v_issue.id, 'adjust_start',
          'Adjust job start date',
          'Consider rescheduling the job start date to avoid weather issues.',
          '/scheduling/reschedule?job_id=' || p_job_id
        );

      WHEN 'homeowner_no_confirmation' THEN
        INSERT INTO public.job_health_fix_suggestions (
          job_id, workspace_id, issue_id, suggestion_type, suggestion_title, suggestion_description, action_url
        ) VALUES (
          p_job_id, v_job.workspace_id, v_issue.id, 'send_confirmation',
          'Send confirmation message to homeowner',
          'Automatically send a confirmation message to the homeowner asking them to confirm availability.',
          '/api/jobs/' || p_job_id || '/send-confirmation'
        );

      WHEN 'deposit_not_collected' THEN
        INSERT INTO public.job_health_fix_suggestions (
          job_id, workspace_id, issue_id, suggestion_type, suggestion_title, suggestion_description, action_url
        ) VALUES (
          p_job_id, v_job.workspace_id, v_issue.id, 'send_invoice',
          'Send invoice reminder for deposit',
          'Send an invoice reminder to the homeowner for the remaining deposit amount.',
          '/api/jobs/' || p_job_id || '/send-deposit-invoice'
        );

      WHEN 'contract_not_signed' THEN
        INSERT INTO public.job_health_fix_suggestions (
          job_id, workspace_id, issue_id, suggestion_type, suggestion_title, suggestion_description, action_url
        ) VALUES (
          p_job_id, v_job.workspace_id, v_issue.id, 'other',
          'Send contract for signature',
          'Send the contract document to the homeowner for e-signature.',
          '/jobs/' || p_job_id || '/documents/send-contract'
        );

      ELSE
        NULL; -- No suggestion for this issue type
    END CASE;
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 15 — TRIGGERS — Auto-update health scores
-- ============================================================================

-- Trigger to recalculate health score when material order changes
CREATE OR REPLACE FUNCTION public.trigger_recalculate_job_health()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Recalculate health score for the affected job
  PERFORM public.calculate_job_health_score(NEW.job_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_material_orders_health ON public.material_orders;
CREATE TRIGGER trg_material_orders_health
AFTER INSERT OR UPDATE ON public.material_orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalculate_job_health();

-- Trigger for crew assignments
DROP TRIGGER IF EXISTS trg_job_crew_assignments_health ON public.job_crew_assignments;
CREATE TRIGGER trg_job_crew_assignments_health
AFTER INSERT OR UPDATE ON public.job_crew_assignments
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalculate_job_health();

-- Trigger for crew readiness tracking
DROP TRIGGER IF EXISTS trg_crew_readiness_tracking_health ON public.crew_readiness_tracking;
CREATE TRIGGER trg_crew_readiness_tracking_health
AFTER INSERT OR UPDATE ON public.crew_readiness_tracking
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalculate_job_health();

-- Trigger for homeowner readiness tracking
DROP TRIGGER IF EXISTS trg_homeowner_readiness_tracking_health ON public.homeowner_readiness_tracking;
CREATE TRIGGER trg_homeowner_readiness_tracking_health
AFTER INSERT OR UPDATE ON public.homeowner_readiness_tracking
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalculate_job_health();

-- Trigger for job payments
DROP TRIGGER IF EXISTS trg_job_payments_health ON public.job_payments;
CREATE TRIGGER trg_job_payments_health
AFTER INSERT OR UPDATE ON public.job_payments
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalculate_job_health();

-- Trigger for job documents (contracts)
DROP TRIGGER IF EXISTS trg_job_signable_documents_health ON public.job_signable_documents;
CREATE TRIGGER trg_job_signable_documents_health
AFTER INSERT OR UPDATE ON public.job_signable_documents
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalculate_job_health();

-- Trigger for weather risk updates
DROP TRIGGER IF EXISTS trg_roofing_jobs_weather_health ON public.roofing_jobs;
CREATE TRIGGER trg_roofing_jobs_weather_health
AFTER UPDATE OF weather_risk_score, weather_risk_label ON public.roofing_jobs
FOR EACH ROW
WHEN (OLD.weather_risk_score IS DISTINCT FROM NEW.weather_risk_score OR OLD.weather_risk_label IS DISTINCT FROM NEW.weather_risk_label)
EXECUTE FUNCTION public.trigger_recalculate_job_health();

-- ============================================================================
-- PART 16 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_job_health_scores_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_health_scores_updated_at ON public.job_health_scores;
CREATE TRIGGER trg_job_health_scores_updated_at
BEFORE UPDATE ON public.job_health_scores
FOR EACH ROW
EXECUTE FUNCTION public.set_job_health_scores_updated_at();

CREATE OR REPLACE FUNCTION public.set_job_health_issues_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_health_issues_updated_at ON public.job_health_issues;
CREATE TRIGGER trg_job_health_issues_updated_at
BEFORE UPDATE ON public.job_health_issues
FOR EACH ROW
EXECUTE FUNCTION public.set_job_health_issues_updated_at();

CREATE OR REPLACE FUNCTION public.set_crew_readiness_tracking_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_readiness_tracking_updated_at ON public.crew_readiness_tracking;
CREATE TRIGGER trg_crew_readiness_tracking_updated_at
BEFORE UPDATE ON public.crew_readiness_tracking
FOR EACH ROW
EXECUTE FUNCTION public.set_crew_readiness_tracking_updated_at();

CREATE OR REPLACE FUNCTION public.set_homeowner_readiness_tracking_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_homeowner_readiness_tracking_updated_at ON public.homeowner_readiness_tracking;
CREATE TRIGGER trg_homeowner_readiness_tracking_updated_at
BEFORE UPDATE ON public.homeowner_readiness_tracking
FOR EACH ROW
EXECUTE FUNCTION public.set_homeowner_readiness_tracking_updated_at();

-- ============================================================================
-- PART 17 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.job_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_health_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_health_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_health_fix_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_readiness_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_readiness_tracking ENABLE ROW LEVEL SECURITY;

-- Job Health Scores
CREATE POLICY "Users can view health scores in their workspace"
  ON public.job_health_scores FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Job Health Issues
CREATE POLICY "Users can view health issues in their workspace"
  ON public.job_health_issues FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update health issues in their workspace"
  ON public.job_health_issues FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Job Health Alerts
CREATE POLICY "Users can view health alerts in their workspace"
  ON public.job_health_alerts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update health alerts in their workspace"
  ON public.job_health_alerts FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Job Health Fix Suggestions
CREATE POLICY "Users can view fix suggestions in their workspace"
  ON public.job_health_fix_suggestions FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update fix suggestions in their workspace"
  ON public.job_health_fix_suggestions FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Crew Readiness Tracking
CREATE POLICY "Users can manage crew readiness in their workspace"
  ON public.crew_readiness_tracking FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Homeowner Readiness Tracking
CREATE POLICY "Users can manage homeowner readiness in their workspace"
  ON public.homeowner_readiness_tracking FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 18 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.job_health_scores TO authenticated;
GRANT SELECT, UPDATE ON public.job_health_issues TO authenticated;
GRANT SELECT, UPDATE ON public.job_health_alerts TO authenticated;
GRANT SELECT, UPDATE ON public.job_health_fix_suggestions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crew_readiness_tracking TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.homeowner_readiness_tracking TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_job_health_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_materials_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_crew_readiness_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_weather_impact_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_homeowner_readiness_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_payments_paperwork_score(uuid) TO authenticated;

-- ============================================================================
-- PART 19 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.job_health_scores IS 'Block 24420: Job Health Score v2 - Real-time job risk detection and health monitoring';
COMMENT ON TABLE public.job_health_issues IS 'Block 24420: Top issues affecting job health (Top 3 Issues To Fix Right Now)';
COMMENT ON TABLE public.job_health_alerts IS 'Block 24420: Early warning alerts when health score drops';
COMMENT ON TABLE public.job_health_fix_suggestions IS 'Block 24420: AI-powered automated fix suggestions for health issues';
COMMENT ON TABLE public.crew_readiness_tracking IS 'Block 24420: Crew readiness checklist tracking';
COMMENT ON TABLE public.homeowner_readiness_tracking IS 'Block 24420: Homeowner readiness checklist tracking';

COMMENT ON FUNCTION public.calculate_job_health_score(uuid) IS 'Block 24420: Main function to calculate overall job health score with weighted pillars';
COMMENT ON FUNCTION public.calculate_materials_score(uuid) IS 'Block 24420: Calculates Materials pillar score (30% weight)';
COMMENT ON FUNCTION public.calculate_crew_readiness_score(uuid) IS 'Block 24420: Calculates Crew Readiness pillar score (25% weight)';
COMMENT ON FUNCTION public.calculate_weather_impact_score(uuid) IS 'Block 24420: Calculates Weather Impact pillar score (15% weight)';
COMMENT ON FUNCTION public.calculate_homeowner_readiness_score(uuid) IS 'Block 24420: Calculates Homeowner Readiness pillar score (15% weight)';
COMMENT ON FUNCTION public.calculate_payments_paperwork_score(uuid) IS 'Block 24420: Calculates Payments & Paperwork pillar score (15% weight)';






































