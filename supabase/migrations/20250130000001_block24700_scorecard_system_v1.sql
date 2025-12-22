-- =========================================================
-- Block 24700 — SmartSend Roofing Supplier & Crew Scorecard v1
-- (Performance Scoring • Reliability Metrics • Issue Rate • On-Time Delivery • Crew Quality Dashboard)
-- =========================================================
-- 
-- THIS IS THE ACCOUNTABILITY ENGINE — ZERO FLUFF.
-- 
-- This block gives SmartSend the power to score suppliers and crews based on real job performance.
-- 
-- Roofers CONSTANTLY struggle with:
-- ✔ unreliable suppliers
-- ✔ sloppy crews
-- ✔ late deliveries
-- ✔ repeated issues
-- ✔ inconsistent workmanship
-- ✔ callbacks that cost money
-- 
-- SmartSend turns all of that into data, then gives roofers a clear score for every supplier and crew.
-- 
-- This makes roofers smarter, faster, and more profitable.

-- ============================================================================
-- PART 1 — CREATE crew_scorecards TABLE
-- ============================================================================
-- Stores calculated performance scores for each crew

CREATE TABLE IF NOT EXISTS public.crew_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Overall score (0-100)
  overall_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- Category scores (0-100 each)
  on_time_performance_score numeric(5,2) DEFAULT 0 CHECK (on_time_performance_score >= 0 AND on_time_performance_score <= 100),
  issue_rate_score numeric(5,2) DEFAULT 0 CHECK (issue_rate_score >= 0 AND issue_rate_score <= 100),
  duration_accuracy_score numeric(5,2) DEFAULT 0 CHECK (duration_accuracy_score >= 0 AND duration_accuracy_score <= 100),
  documentation_quality_score numeric(5,2) DEFAULT 0 CHECK (documentation_quality_score >= 0 AND documentation_quality_score <= 100),
  homeowner_feedback_score numeric(5,2) DEFAULT 0 CHECK (homeowner_feedback_score >= 0 AND homeowner_feedback_score <= 100),
  
  -- Performance metrics (raw data)
  total_jobs_completed int DEFAULT 0,
  on_time_jobs_count int DEFAULT 0,
  late_jobs_count int DEFAULT 0,
  total_issues_reported int DEFAULT 0,
  total_callbacks int DEFAULT 0,
  avg_duration_variance_hours numeric(10,2) DEFAULT 0, -- positive = slower than estimated, negative = faster
  
  -- Score breakdown details (JSONB for flexibility)
  score_details jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  calculated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one scorecard per crew
  UNIQUE(crew_id)
);

CREATE INDEX IF NOT EXISTS idx_crew_scorecards_crew_id ON public.crew_scorecards(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_scorecards_workspace ON public.crew_scorecards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_scorecards_overall_score ON public.crew_scorecards(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_crew_scorecards_updated_at ON public.crew_scorecards(updated_at DESC);

-- ============================================================================
-- PART 2 — CREATE supplier_scorecards TABLE
-- ============================================================================
-- Stores calculated performance scores for each supplier

CREATE TABLE IF NOT EXISTS public.supplier_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Overall score (0-100)
  overall_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- Category scores (0-100 each)
  delivery_accuracy_score numeric(5,2) DEFAULT 0 CHECK (delivery_accuracy_score >= 0 AND delivery_accuracy_score <= 100),
  on_time_delivery_score numeric(5,2) DEFAULT 0 CHECK (on_time_delivery_score >= 0 AND on_time_delivery_score <= 100),
  issue_resolution_speed_score numeric(5,2) DEFAULT 0 CHECK (issue_resolution_speed_score >= 0 AND issue_resolution_speed_score <= 100),
  pricing_consistency_score numeric(5,2) DEFAULT 0 CHECK (pricing_consistency_score >= 0 AND pricing_consistency_score <= 100),
  communication_quality_score numeric(5,2) DEFAULT 0 CHECK (communication_quality_score >= 0 AND communication_quality_score <= 100),
  
  -- Performance metrics (raw data)
  total_orders int DEFAULT 0,
  accurate_deliveries_count int DEFAULT 0,
  inaccurate_deliveries_count int DEFAULT 0,
  on_time_deliveries_count int DEFAULT 0,
  late_deliveries_count int DEFAULT 0,
  total_issues int DEFAULT 0,
  avg_issue_resolution_hours numeric(10,2) DEFAULT 0,
  pricing_variance_count int DEFAULT 0,
  communication_responses_count int DEFAULT 0,
  avg_response_time_hours numeric(10,2) DEFAULT 0,
  
  -- Score breakdown details (JSONB for flexibility)
  score_details jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  calculated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one scorecard per supplier
  UNIQUE(supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_scorecards_supplier_id ON public.supplier_scorecards(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_scorecards_workspace ON public.supplier_scorecards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_supplier_scorecards_overall_score ON public.supplier_scorecards(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_scorecards_updated_at ON public.supplier_scorecards(updated_at DESC);

-- ============================================================================
-- PART 3 — CREATE scorecard_action_suggestions TABLE
-- ============================================================================
-- Stores AI-generated action suggestions based on scorecard performance

CREATE TABLE IF NOT EXISTS public.scorecard_action_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Target entity
  entity_type text NOT NULL CHECK (entity_type IN ('crew', 'supplier')),
  entity_id uuid NOT NULL, -- crew_id or supplier_id
  
  -- Suggestion details
  suggestion_type text NOT NULL CHECK (suggestion_type IN ('warning', 'recommendation', 'praise')),
  title text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Related metrics
  related_score_category text, -- e.g., 'on_time_performance', 'issue_rate', etc.
  related_score_value numeric(5,2),
  
  -- Status
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'dismissed', 'resolved')),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scorecard_suggestions_workspace ON public.scorecard_action_suggestions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_suggestions_entity ON public.scorecard_action_suggestions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_suggestions_status ON public.scorecard_action_suggestions(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_scorecard_suggestions_priority ON public.scorecard_action_suggestions(priority DESC);

-- ============================================================================
-- PART 4 — FUNCTION: calculate_crew_on_time_performance_score
-- ============================================================================
-- Category A — On-Time Performance (25 pts)
-- Measures: arrival times, percentage of on-time jobs, "on the way" confirmations

CREATE OR REPLACE FUNCTION public.calculate_crew_on_time_performance_score(p_crew_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_total_jobs int := 0;
  v_on_time_jobs int := 0;
  v_late_jobs int := 0;
  v_job record;
  v_scheduled_time timestamptz;
  v_arrival_time timestamptz;
  v_on_time_threshold_minutes int := 15; -- 15 minutes grace period
BEGIN
  -- Get all completed jobs for this crew (last 90 days for relevance)
  FOR v_job IN
    SELECT 
      j.id,
      j.scheduled_start_date,
      j.scheduled_start_time,
      jmw.status,
      jmw.arrival_confirmed_at,
      jmw.on_the_way_confirmed_at
    FROM public.roofing_jobs j
    JOIN public.job_crew_assignments jca ON jca.job_id = j.id
    LEFT JOIN public.job_morning_workflow jmw ON jmw.job_id = j.id AND jmw.crew_id = jca.crew_id
    WHERE jca.crew_id = p_crew_id
      AND jca.unassigned_at IS NULL
      AND j.status IN ('completed', 'closed')
      AND j.completed_at >= NOW() - INTERVAL '90 days'
  LOOP
    v_total_jobs := v_total_jobs + 1;
    
    -- Calculate scheduled time
    IF v_job.scheduled_start_date IS NOT NULL AND v_job.scheduled_start_time IS NOT NULL THEN
      v_scheduled_time := (v_job.scheduled_start_date::date + v_job.scheduled_start_time::time)::timestamptz;
    ELSIF v_job.scheduled_start_date IS NOT NULL THEN
      v_scheduled_time := v_job.scheduled_start_date::timestamptz + INTERVAL '8 hours'; -- Default 8 AM
    ELSE
      CONTINUE; -- Skip if no scheduled time
    END IF;
    
    -- Get arrival time
    v_arrival_time := v_job.arrival_confirmed_at;
    
    -- If no arrival time but has "on the way" confirmation, check if it was early enough
    IF v_arrival_time IS NULL AND v_job.on_the_way_confirmed_at IS NOT NULL THEN
      IF v_job.on_the_way_confirmed_at <= v_scheduled_time + (v_on_time_threshold_minutes || ' minutes')::interval THEN
        v_on_time_jobs := v_on_time_jobs + 1;
      ELSE
        v_late_jobs := v_late_jobs + 1;
      END IF;
    ELSIF v_arrival_time IS NOT NULL THEN
      -- Check if arrival was on time
      IF v_arrival_time <= v_scheduled_time + (v_on_time_threshold_minutes || ' minutes')::interval THEN
        v_on_time_jobs := v_on_time_jobs + 1;
      ELSE
        v_late_jobs := v_late_jobs + 1;
      END IF;
    ELSE
      -- No arrival or on-the-way confirmation = late
      v_late_jobs := v_late_jobs + 1;
    END IF;
  END LOOP;
  
  -- Calculate score based on on-time percentage
  IF v_total_jobs > 0 THEN
    -- 90-100% on-time = 90-100 score
    -- 70-89% on-time = 70-89 score
    -- <70% on-time = <70 score
    DECLARE
      v_on_time_percentage numeric;
    BEGIN
      v_on_time_percentage := (v_on_time_jobs::numeric / v_total_jobs::numeric) * 100;
      
      IF v_on_time_percentage >= 90 THEN
        v_score := 90 + ((v_on_time_percentage - 90) / 10) * 10; -- Scale 90-100% to 90-100 score
      ELSIF v_on_time_percentage >= 70 THEN
        v_score := 70 + ((v_on_time_percentage - 70) / 20) * 20; -- Scale 70-90% to 70-90 score
      ELSE
        v_score := (v_on_time_percentage / 70) * 70; -- Scale 0-70% to 0-70 score
      END IF;
    END;
  END IF;
  
  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  RETURN v_score;
END;
$$;

-- ============================================================================
-- PART 5 — FUNCTION: calculate_crew_issue_rate_score
-- ============================================================================
-- Category B — Issue Rate (25 pts)
-- Counts: missing materials reports, mistakes, callbacks, incorrect shingle color,
-- improper flashing, cleanup issues

CREATE OR REPLACE FUNCTION public.calculate_crew_issue_rate_score(p_crew_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_total_jobs int := 0;
  v_total_issues int := 0;
  v_callbacks int := 0;
  v_issue record;
BEGIN
  -- Count total jobs completed by this crew (last 90 days)
  SELECT COUNT(*) INTO v_total_jobs
  FROM public.roofing_jobs j
  JOIN public.job_crew_assignments jca ON jca.job_id = j.id
  WHERE jca.crew_id = p_crew_id
    AND jca.unassigned_at IS NULL
    AND j.status IN ('completed', 'closed')
    AND j.completed_at >= NOW() - INTERVAL '90 days';
  
  -- Count total issues reported for this crew's jobs
  SELECT COUNT(*) INTO v_total_issues
  FROM public.job_issues ji
  JOIN public.roofing_jobs j ON j.id = ji.job_id
  JOIN public.job_crew_assignments jca ON jca.job_id = j.id
  WHERE jca.crew_id = p_crew_id
    AND jca.unassigned_at IS NULL
    AND ji.status != 'cancelled'
    AND ji.created_at >= NOW() - INTERVAL '90 days';
  
  -- Count callbacks (jobs with warranty/service issues)
  SELECT COUNT(DISTINCT jsc.job_id) INTO v_callbacks
  FROM public.job_service_calls jsc
  JOIN public.roofing_jobs j ON j.id = jsc.job_id
  JOIN public.job_crew_assignments jca ON jca.job_id = j.id
  WHERE jca.crew_id = p_crew_id
    AND jca.unassigned_at IS NULL
    AND jsc.is_warranty = true
    AND jsc.created_at >= NOW() - INTERVAL '90 days';
  
  -- Calculate score: Lower issue rate = higher score
  IF v_total_jobs > 0 THEN
    DECLARE
      v_issues_per_job numeric;
    BEGIN
      v_issues_per_job := (v_total_issues::numeric + v_callbacks::numeric) / v_total_jobs::numeric;
      
      -- 0 issues per job = 100 score
      -- 0.1 issues per job = 90 score
      -- 0.5 issues per job = 70 score
      -- 1+ issues per job = <70 score
      IF v_issues_per_job = 0 THEN
        v_score := 100;
      ELSIF v_issues_per_job <= 0.1 THEN
        v_score := 100 - (v_issues_per_job * 100); -- 90-100 range
      ELSIF v_issues_per_job <= 0.5 THEN
        v_score := 90 - ((v_issues_per_job - 0.1) / 0.4) * 20; -- 70-90 range
      ELSE
        v_score := 70 - ((v_issues_per_job - 0.5) / 0.5) * 70; -- 0-70 range
        v_score := GREATEST(0, v_score);
      END IF;
    END;
  END IF;
  
  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  RETURN v_score;
END;
$$;

-- ============================================================================
-- PART 6 — FUNCTION: calculate_crew_duration_accuracy_score
-- ============================================================================
-- Category C — Job Duration Accuracy (20 pts)
-- Compares: estimated duration vs actual

CREATE OR REPLACE FUNCTION public.calculate_crew_duration_accuracy_score(p_crew_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_total_jobs int := 0;
  v_total_variance_hours numeric := 0;
  v_job record;
  v_estimated_days numeric;
  v_actual_days numeric;
  v_variance_hours numeric;
BEGIN
  -- Get all completed jobs for this crew (last 90 days)
  FOR v_job IN
    SELECT 
      j.id,
      j.estimated_duration_days,
      j.scheduled_start_date,
      j.completed_at,
      c.avg_job_duration_days
    FROM public.roofing_jobs j
    JOIN public.job_crew_assignments jca ON jca.job_id = j.id
    LEFT JOIN public.crews c ON c.id = jca.crew_id
    WHERE jca.crew_id = p_crew_id
      AND jca.unassigned_at IS NULL
      AND j.status IN ('completed', 'closed')
      AND j.completed_at IS NOT NULL
      AND j.scheduled_start_date IS NOT NULL
      AND j.completed_at >= NOW() - INTERVAL '90 days'
  LOOP
    -- Get estimated duration
    v_estimated_days := COALESCE(v_job.estimated_duration_days, v_job.avg_job_duration_days, 1);
    
    -- Calculate actual duration
    v_actual_days := EXTRACT(EPOCH FROM (v_job.completed_at - v_job.scheduled_start_date)) / 86400;
    
    -- Calculate variance (positive = slower, negative = faster)
    v_variance_hours := (v_actual_days - v_estimated_days) * 24;
    
    v_total_variance_hours := v_total_variance_hours + ABS(v_variance_hours);
    v_total_jobs := v_total_jobs + 1;
  END LOOP;
  
  -- Calculate score based on average variance
  IF v_total_jobs > 0 THEN
    DECLARE
      v_avg_variance_hours numeric;
    BEGIN
      v_avg_variance_hours := v_total_variance_hours / v_total_jobs;
      
      -- 0 hours variance = 100 score
      -- 2 hours variance = 90 score
      -- 8 hours variance = 70 score
      -- 16+ hours variance = <70 score
      IF v_avg_variance_hours = 0 THEN
        v_score := 100;
      ELSIF v_avg_variance_hours <= 2 THEN
        v_score := 100 - (v_avg_variance_hours / 2) * 10; -- 90-100 range
      ELSIF v_avg_variance_hours <= 8 THEN
        v_score := 90 - ((v_avg_variance_hours - 2) / 6) * 20; -- 70-90 range
      ELSE
        v_score := 70 - ((v_avg_variance_hours - 8) / 8) * 70; -- 0-70 range
        v_score := GREATEST(0, v_score);
      END IF;
    END;
  END IF;
  
  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  RETURN v_score;
END;
$$;

-- ============================================================================
-- PART 7 — FUNCTION: calculate_crew_documentation_quality_score
-- ============================================================================
-- Category D — Documentation Quality (20 pts)
-- Measures: photos uploaded, before/after images, job notes, proof-of-work,
-- inspection photos

CREATE OR REPLACE FUNCTION public.calculate_crew_documentation_quality_score(p_crew_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_total_jobs int := 0;
  v_total_docs_score numeric := 0;
  v_job record;
  v_photos_count int;
  v_before_photos_count int;
  v_after_photos_count int;
  v_docs_count int;
  v_job_score numeric;
BEGIN
  -- Get all completed jobs for this crew (last 90 days)
  FOR v_job IN
    SELECT DISTINCT j.id
    FROM public.roofing_jobs j
    JOIN public.job_crew_assignments jca ON jca.job_id = j.id
    WHERE jca.crew_id = p_crew_id
      AND jca.unassigned_at IS NULL
      AND j.status IN ('completed', 'closed')
      AND j.completed_at >= NOW() - INTERVAL '90 days'
  LOOP
    v_total_jobs := v_total_jobs + 1;
    
    -- Count photos from job_documents
    SELECT COUNT(*) INTO v_photos_count
    FROM public.job_documents jd
    WHERE jd.job_id = v_job.id
      AND jd.doc_type IN ('photo_before', 'photo_after', 'other');
    
    -- Count before photos
    SELECT COUNT(*) INTO v_before_photos_count
    FROM public.job_documents jd
    WHERE jd.job_id = v_job.id
      AND jd.doc_type = 'photo_before';
    
    -- Count after photos
    SELECT COUNT(*) INTO v_after_photos_count
    FROM public.job_documents jd
    WHERE jd.job_id = v_job.id
      AND jd.doc_type = 'photo_after';
    
    -- Count field photos
    SELECT COUNT(*) INTO v_docs_count
    FROM public.job_field_photos jfp
    WHERE jfp.job_id = v_job.id
      AND jfp.crew_id = p_crew_id;
    
    -- Calculate job documentation score
    v_job_score := 0;
    
    -- Base score for having photos
    IF v_photos_count > 0 OR v_docs_count > 0 THEN
      v_job_score := v_job_score + 40;
    END IF;
    
    -- Bonus for before/after photos
    IF v_before_photos_count > 0 THEN
      v_job_score := v_job_score + 30;
    END IF;
    IF v_after_photos_count > 0 THEN
      v_job_score := v_job_score + 30;
    END IF;
    
    -- Bonus for multiple photos (comprehensive documentation)
    IF (v_photos_count + v_docs_count) >= 5 THEN
      v_job_score := v_job_score + 10;
    END IF;
    
    -- Check for completion workflow photos
    DECLARE
      v_completion_photos int;
    BEGIN
      SELECT COUNT(*) INTO v_completion_photos
      FROM public.crew_completion_workflow ccf
      WHERE ccf.job_id = v_job.id
        AND ccf.crew_id = p_crew_id
        AND jsonb_array_length(COALESCE(ccf.before_photos, '[]'::jsonb)) > 0
        AND jsonb_array_length(COALESCE(ccf.after_photos, '[]'::jsonb)) > 0;
      
      IF v_completion_photos > 0 THEN
        v_job_score := v_job_score + 10;
      END IF;
    END;
    
    v_total_docs_score := v_total_docs_score + LEAST(100, v_job_score);
  END LOOP;
  
  -- Calculate average score
  IF v_total_jobs > 0 THEN
    v_score := v_total_docs_score / v_total_jobs;
  END IF;
  
  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  RETURN v_score;
END;
$$;

-- ============================================================================
-- PART 8 — FUNCTION: calculate_crew_homeowner_feedback_score
-- ============================================================================
-- Category E — Homeowner Feedback (10 pts)
-- If homeowner replies: "Crew was great!", "They were respectful...", "They left a mess..."

CREATE OR REPLACE FUNCTION public.calculate_crew_homeowner_feedback_score(p_crew_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 50; -- Default neutral score
  v_total_feedback int := 0;
  v_positive_feedback int := 0;
  v_negative_feedback int := 0;
  v_message record;
BEGIN
  -- Get homeowner messages for jobs completed by this crew (last 90 days)
  -- Look for sentiment indicators in transcript_messages
  FOR v_message IN
    SELECT 
      tm.sentiment_score,
      tm.tone,
      tm.intent,
      tm.message_text
    FROM public.transcript_messages tm
    JOIN public.leads l ON l.id = tm.lead_id
    JOIN public.roofing_jobs j ON j.lead_id = l.id
    JOIN public.job_crew_assignments jca ON jca.job_id = j.id
    WHERE jca.crew_id = p_crew_id
      AND jca.unassigned_at IS NULL
      AND j.status IN ('completed', 'closed')
      AND tm.sender_type = 'homeowner'
      AND tm.created_at >= NOW() - INTERVAL '90 days'
      AND (
        tm.message_text ILIKE '%crew%' OR
        tm.message_text ILIKE '%team%' OR
        tm.message_text ILIKE '%work%' OR
        tm.message_text ILIKE '%great%' OR
        tm.message_text ILIKE '%mess%' OR
        tm.message_text ILIKE '%respectful%' OR
        tm.message_text ILIKE '%clean%' OR
        tm.message_text ILIKE '%professional%'
      )
  LOOP
    v_total_feedback := v_total_feedback + 1;
    
    -- Analyze sentiment
    IF v_message.sentiment_score IS NOT NULL THEN
      IF v_message.sentiment_score >= 70 THEN
        v_positive_feedback := v_positive_feedback + 1;
      ELSIF v_message.sentiment_score <= 30 THEN
        v_negative_feedback := v_negative_feedback + 1;
      END IF;
    ELSIF v_message.tone IN ('positive', 'appreciation') THEN
      v_positive_feedback := v_positive_feedback + 1;
    ELSIF v_message.tone IN ('negative', 'angry', 'complaint') THEN
      v_negative_feedback := v_negative_feedback + 1;
    ELSIF v_message.message_text ILIKE '%great%' OR 
          v_message.message_text ILIKE '%respectful%' OR
          v_message.message_text ILIKE '%professional%' OR
          v_message.message_text ILIKE '%clean%' THEN
      v_positive_feedback := v_positive_feedback + 1;
    ELSIF v_message.message_text ILIKE '%mess%' OR
          v_message.message_text ILIKE '%late%' OR
          v_message.message_text ILIKE '%problem%' THEN
      v_negative_feedback := v_negative_feedback + 1;
    END IF;
  END LOOP;
  
  -- Calculate score based on feedback ratio
  IF v_total_feedback > 0 THEN
    DECLARE
      v_positive_ratio numeric;
    BEGIN
      v_positive_ratio := v_positive_feedback::numeric / v_total_feedback::numeric;
      
      -- 100% positive = 100 score
      -- 80%+ positive = 80-100 score
      -- 50-80% positive = 50-80 score
      -- <50% positive = <50 score
      IF v_positive_ratio >= 0.8 THEN
        v_score := 80 + (v_positive_ratio - 0.8) / 0.2 * 20; -- 80-100 range
      ELSIF v_positive_ratio >= 0.5 THEN
        v_score := 50 + (v_positive_ratio - 0.5) / 0.3 * 30; -- 50-80 range
      ELSE
        v_score := (v_positive_ratio / 0.5) * 50; -- 0-50 range
      END IF;
    END;
  END IF;
  
  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  RETURN v_score;
END;
$$;

-- ============================================================================
-- PART 9 — FUNCTION: calculate_crew_scorecard
-- ============================================================================
-- Main function to calculate and update crew scorecard

CREATE OR REPLACE FUNCTION public.calculate_crew_scorecard(p_crew_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_on_time_score numeric;
  v_issue_rate_score numeric;
  v_duration_score numeric;
  v_documentation_score numeric;
  v_feedback_score numeric;
  v_overall_score numeric;
  v_total_jobs int;
  v_on_time_jobs int;
  v_late_jobs int;
  v_total_issues int;
  v_callbacks int;
  v_avg_variance numeric;
BEGIN
  -- Get workspace_id
  SELECT workspace_id INTO v_workspace_id
  FROM public.crews
  WHERE id = p_crew_id;
  
  IF v_workspace_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Calculate category scores
  v_on_time_score := public.calculate_crew_on_time_performance_score(p_crew_id);
  v_issue_rate_score := public.calculate_crew_issue_rate_score(p_crew_id);
  v_duration_score := public.calculate_crew_duration_accuracy_score(p_crew_id);
  v_documentation_score := public.calculate_crew_documentation_quality_score(p_crew_id);
  v_feedback_score := public.calculate_crew_homeowner_feedback_score(p_crew_id);
  
  -- Calculate weighted overall score
  -- Category A: 25 pts, B: 25 pts, C: 20 pts, D: 20 pts, E: 10 pts
  v_overall_score := 
    (v_on_time_score * 0.25) +
    (v_issue_rate_score * 0.25) +
    (v_duration_score * 0.20) +
    (v_documentation_score * 0.20) +
    (v_feedback_score * 0.10);
  
  -- Get metrics
  SELECT 
    COUNT(*) INTO v_total_jobs
  FROM public.roofing_jobs j
  JOIN public.job_crew_assignments jca ON jca.job_id = j.id
  WHERE jca.crew_id = p_crew_id
    AND jca.unassigned_at IS NULL
    AND j.status IN ('completed', 'closed')
    AND j.completed_at >= NOW() - INTERVAL '90 days';
  
  -- Count on-time vs late (simplified)
  SELECT 
    COUNT(*) FILTER (WHERE jmw.arrival_confirmed_at IS NOT NULL OR jmw.on_the_way_confirmed_at IS NOT NULL) INTO v_on_time_jobs
  FROM public.roofing_jobs j
  JOIN public.job_crew_assignments jca ON jca.job_id = j.id
  LEFT JOIN public.job_morning_workflow jmw ON jmw.job_id = j.id AND jmw.crew_id = jca.crew_id
  WHERE jca.crew_id = p_crew_id
    AND jca.unassigned_at IS NULL
    AND j.status IN ('completed', 'closed')
    AND j.completed_at >= NOW() - INTERVAL '90 days';
  
  v_late_jobs := v_total_jobs - v_on_time_jobs;
  
  SELECT COUNT(*) INTO v_total_issues
  FROM public.job_issues ji
  JOIN public.roofing_jobs j ON j.id = ji.job_id
  JOIN public.job_crew_assignments jca ON jca.job_id = j.id
  WHERE jca.crew_id = p_crew_id
    AND jca.unassigned_at IS NULL
    AND ji.status != 'cancelled'
    AND ji.created_at >= NOW() - INTERVAL '90 days';
  
  SELECT COUNT(DISTINCT jsc.job_id) INTO v_callbacks
  FROM public.job_service_calls jsc
  JOIN public.roofing_jobs j ON j.id = jsc.job_id
  JOIN public.job_crew_assignments jca ON jca.job_id = j.id
  WHERE jca.crew_id = p_crew_id
    AND jca.unassigned_at IS NULL
    AND jsc.is_warranty = true
    AND jsc.created_at >= NOW() - INTERVAL '90 days';
  
  -- Calculate average duration variance
  SELECT COALESCE(AVG(ABS(
    (EXTRACT(EPOCH FROM (j.completed_at - j.scheduled_start_date)) / 86400 - COALESCE(j.estimated_duration_days, 1)) * 24
  )), 0) INTO v_avg_variance
  FROM public.roofing_jobs j
  JOIN public.job_crew_assignments jca ON jca.job_id = j.id
  WHERE jca.crew_id = p_crew_id
    AND jca.unassigned_at IS NULL
    AND j.status IN ('completed', 'closed')
    AND j.completed_at IS NOT NULL
    AND j.scheduled_start_date IS NOT NULL
    AND j.completed_at >= NOW() - INTERVAL '90 days';
  
  -- Insert or update scorecard
  INSERT INTO public.crew_scorecards (
    crew_id,
    workspace_id,
    overall_score,
    on_time_performance_score,
    issue_rate_score,
    duration_accuracy_score,
    documentation_quality_score,
    homeowner_feedback_score,
    total_jobs_completed,
    on_time_jobs_count,
    late_jobs_count,
    total_issues_reported,
    total_callbacks,
    avg_duration_variance_hours,
    score_details,
    calculated_at,
    updated_at
  ) VALUES (
    p_crew_id,
    v_workspace_id,
    v_overall_score,
    v_on_time_score,
    v_issue_rate_score,
    v_duration_score,
    v_documentation_score,
    v_feedback_score,
    v_total_jobs,
    v_on_time_jobs,
    v_late_jobs,
    v_total_issues,
    v_callbacks,
    v_avg_variance,
    jsonb_build_object(
      'on_time_percentage', CASE WHEN v_total_jobs > 0 THEN (v_on_time_jobs::numeric / v_total_jobs::numeric) * 100 ELSE 0 END,
      'issues_per_job', CASE WHEN v_total_jobs > 0 THEN (v_total_issues::numeric + v_callbacks::numeric) / v_total_jobs::numeric ELSE 0 END
    ),
    NOW(),
    NOW()
  )
  ON CONFLICT (crew_id) DO UPDATE SET
    overall_score = EXCLUDED.overall_score,
    on_time_performance_score = EXCLUDED.on_time_performance_score,
    issue_rate_score = EXCLUDED.issue_rate_score,
    duration_accuracy_score = EXCLUDED.duration_accuracy_score,
    documentation_quality_score = EXCLUDED.documentation_quality_score,
    homeowner_feedback_score = EXCLUDED.homeowner_feedback_score,
    total_jobs_completed = EXCLUDED.total_jobs_completed,
    on_time_jobs_count = EXCLUDED.on_time_jobs_count,
    late_jobs_count = EXCLUDED.late_jobs_count,
    total_issues_reported = EXCLUDED.total_issues_reported,
    total_callbacks = EXCLUDED.total_callbacks,
    avg_duration_variance_hours = EXCLUDED.avg_duration_variance_hours,
    score_details = EXCLUDED.score_details,
    calculated_at = EXCLUDED.calculated_at,
    updated_at = NOW();
END;
$$;

-- ============================================================================
-- PART 10 — SUPPLIER SCORING FUNCTIONS
-- ============================================================================

-- Function: calculate_supplier_delivery_accuracy_score
-- Category A — Delivery Accuracy (30 pts)
CREATE OR REPLACE FUNCTION public.calculate_supplier_delivery_accuracy_score(p_supplier_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_total_orders int := 0;
  v_accurate_orders int := 0;
  v_inaccurate_orders int := 0;
  v_order record;
  v_issue_count int;
BEGIN
  -- Get all delivered orders for this supplier (last 90 days)
  FOR v_order IN
    SELECT 
      mo.id,
      mo.job_id,
      mo.status,
      mo.expected_delivery_date,
      mo.actual_delivery_date
    FROM public.material_orders mo
    WHERE mo.supplier_id = p_supplier_id
      AND mo.status IN ('delivered', 'partial')
      AND mo.created_at >= NOW() - INTERVAL '90 days'
  LOOP
    v_total_orders := v_total_orders + 1;
    
    -- Check for material accuracy issues
    SELECT COUNT(*) INTO v_issue_count
    FROM (
      SELECT ji.id
      FROM public.job_issues ji
      WHERE ji.job_id = v_order.job_id
        AND ji.issue_type IN ('wrong_material', 'material_shortage', 'material_damage')
        AND ji.created_at >= NOW() - INTERVAL '90 days'
      UNION
      SELECT si.id
      FROM public.supplier_issues si
      WHERE si.material_order_id = v_order.id
        AND si.issue_type IN ('wrong_material', 'missing_item', 'damaged_item')
        AND si.created_at >= NOW() - INTERVAL '90 days'
    ) combined_issues;
    
    IF v_issue_count > 0 THEN
      v_inaccurate_orders := v_inaccurate_orders + 1;
    ELSE
      v_accurate_orders := v_accurate_orders + 1;
    END IF;
  END LOOP;
  
  -- Calculate score based on accuracy percentage
  IF v_total_orders > 0 THEN
    DECLARE
      v_accuracy_percentage numeric;
    BEGIN
      v_accuracy_percentage := (v_accurate_orders::numeric / v_total_orders::numeric) * 100;
      
      -- 100% accurate = 100 score
      -- 95%+ accurate = 90-100 score
      -- 85-95% accurate = 70-90 score
      -- <85% accurate = <70 score
      IF v_accuracy_percentage >= 95 THEN
        v_score := 90 + ((v_accuracy_percentage - 95) / 5) * 10; -- 90-100 range
      ELSIF v_accuracy_percentage >= 85 THEN
        v_score := 70 + ((v_accuracy_percentage - 85) / 10) * 20; -- 70-90 range
      ELSE
        v_score := (v_accuracy_percentage / 85) * 70; -- 0-70 range
      END IF;
    END;
  END IF;
  
  v_score := GREATEST(0, LEAST(100, v_score));
  RETURN v_score;
END;
$$;

-- Function: calculate_supplier_on_time_delivery_score
-- Category B — On-Time Delivery (25 pts)
CREATE OR REPLACE FUNCTION public.calculate_supplier_on_time_delivery_score(p_supplier_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_total_deliveries int := 0;
  v_on_time_deliveries int := 0;
  v_late_deliveries int := 0;
  v_order record;
BEGIN
  -- Get all delivered orders for this supplier (last 90 days)
  FOR v_order IN
    SELECT 
      mo.id,
      mo.expected_delivery_date,
      mo.actual_delivery_date,
      md.delivery_date,
      md.status
    FROM public.material_orders mo
    LEFT JOIN public.material_deliveries md ON md.material_order_id = mo.id
    WHERE mo.supplier_id = p_supplier_id
      AND mo.status IN ('delivered', 'partial')
      AND mo.created_at >= NOW() - INTERVAL '90 days'
    ORDER BY md.created_at DESC
  LOOP
    v_total_deliveries := v_total_deliveries + 1;
    
    DECLARE
      v_expected_date date;
      v_actual_date date;
    BEGIN
      v_expected_date := COALESCE(v_order.expected_delivery_date, v_order.delivery_date);
      v_actual_date := COALESCE(v_order.actual_delivery_date, v_order.delivery_date);
      
      IF v_expected_date IS NOT NULL AND v_actual_date IS NOT NULL THEN
        IF v_actual_date <= v_expected_date THEN
          v_on_time_deliveries := v_on_time_deliveries + 1;
        ELSE
          v_late_deliveries := v_late_deliveries + 1;
        END IF;
      ELSIF v_order.status = 'delayed' THEN
        v_late_deliveries := v_late_deliveries + 1;
      ELSE
        v_on_time_deliveries := v_on_time_deliveries + 1; -- Assume on-time if no data
      END IF;
    END;
  END LOOP;
  
  -- Calculate score based on on-time percentage
  IF v_total_deliveries > 0 THEN
    DECLARE
      v_on_time_percentage numeric;
    BEGIN
      v_on_time_percentage := (v_on_time_deliveries::numeric / v_total_deliveries::numeric) * 100;
      
      -- 90-100% on-time = 90-100 score
      -- 70-89% on-time = 70-89 score
      -- <70% on-time = <70 score
      IF v_on_time_percentage >= 90 THEN
        v_score := 90 + ((v_on_time_percentage - 90) / 10) * 10;
      ELSIF v_on_time_percentage >= 70 THEN
        v_score := 70 + ((v_on_time_percentage - 70) / 20) * 20;
      ELSE
        v_score := (v_on_time_percentage / 70) * 70;
      END IF;
    END;
  END IF;
  
  v_score := GREATEST(0, LEAST(100, v_score));
  RETURN v_score;
END;
$$;

-- Function: calculate_supplier_issue_resolution_speed_score
-- Category C — Issue Resolution Speed (20 pts)
CREATE OR REPLACE FUNCTION public.calculate_supplier_issue_resolution_speed_score(p_supplier_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_total_issues int := 0;
  v_total_resolution_hours numeric := 0;
  v_issue record;
BEGIN
  -- Get all resolved issues for this supplier (last 90 days)
  FOR v_issue IN
    SELECT 
      si.id,
      si.created_at,
      si.resolved_at,
      ji.created_at as job_issue_created,
      ji.resolved_at as job_issue_resolved
    FROM public.supplier_issues si
    JOIN public.material_orders mo ON mo.id = si.material_order_id
    LEFT JOIN public.job_issues ji ON ji.job_id = mo.job_id 
      AND ji.issue_type IN ('wrong_material', 'material_shortage', 'material_damage')
      AND ji.supplier_notified = true
    WHERE mo.supplier_id = p_supplier_id
      AND (si.resolved_at IS NOT NULL OR ji.resolved_at IS NOT NULL)
      AND si.created_at >= NOW() - INTERVAL '90 days'
  LOOP
    v_total_issues := v_total_issues + 1;
    
    DECLARE
      v_created_at timestamptz;
      v_resolved_at timestamptz;
      v_hours numeric;
    BEGIN
      v_created_at := COALESCE(v_issue.created_at, v_issue.job_issue_created);
      v_resolved_at := COALESCE(v_issue.resolved_at, v_issue.job_issue_resolved);
      
      IF v_created_at IS NOT NULL AND v_resolved_at IS NOT NULL THEN
        v_hours := EXTRACT(EPOCH FROM (v_resolved_at - v_created_at)) / 3600;
        v_total_resolution_hours := v_total_resolution_hours + v_hours;
      END IF;
    END;
  END LOOP;
  
  -- Calculate score based on average resolution time
  IF v_total_issues > 0 THEN
    DECLARE
      v_avg_hours numeric;
    BEGIN
      v_avg_hours := v_total_resolution_hours / v_total_issues;
      
      -- <4 hours = 100 score
      -- 4-8 hours = 90-100 score
      -- 8-24 hours = 70-90 score
      -- 24+ hours = <70 score
      IF v_avg_hours < 4 THEN
        v_score := 100;
      ELSIF v_avg_hours <= 8 THEN
        v_score := 90 + ((8 - v_avg_hours) / 4) * 10;
      ELSIF v_avg_hours <= 24 THEN
        v_score := 70 + ((24 - v_avg_hours) / 16) * 20;
      ELSE
        v_score := GREATEST(0, 70 - ((v_avg_hours - 24) / 24) * 70);
      END IF;
    END;
  END IF;
  
  v_score := GREATEST(0, LEAST(100, v_score));
  RETURN v_score;
END;
$$;

-- Function: calculate_supplier_pricing_consistency_score
-- Category D — Pricing Consistency (15 pts)
CREATE OR REPLACE FUNCTION public.calculate_supplier_pricing_consistency_score(p_supplier_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_total_orders int := 0;
  v_price_variance_count int := 0;
  v_order record;
  v_avg_price_per_sq numeric;
  v_price_variance numeric;
BEGIN
  -- Get all orders for this supplier (last 90 days)
  SELECT 
    COUNT(*),
    AVG(mo.total / NULLIF(
      (SELECT SUM(quantity) FROM public.material_order_items WHERE material_order_id = mo.id), 0
    ))
  INTO v_total_orders, v_avg_price_per_sq
  FROM public.material_orders mo
  WHERE mo.supplier_id = p_supplier_id
    AND mo.total IS NOT NULL
    AND mo.created_at >= NOW() - INTERVAL '90 days';
  
  -- Check for price variance (orders with significantly different pricing)
  IF v_total_orders > 1 AND v_avg_price_per_sq IS NOT NULL THEN
    FOR v_order IN
      SELECT 
        mo.id,
        mo.total,
        (SELECT SUM(quantity) FROM public.material_order_items WHERE material_order_id = mo.id) as total_qty
      FROM public.material_orders mo
      WHERE mo.supplier_id = p_supplier_id
        AND mo.total IS NOT NULL
        AND mo.created_at >= NOW() - INTERVAL '90 days'
    LOOP
      IF v_order.total_qty > 0 THEN
        v_price_variance := ABS((v_order.total / v_order.total_qty) - v_avg_price_per_sq) / v_avg_price_per_sq;
        
        -- If variance > 15%, count as inconsistency
        IF v_price_variance > 0.15 THEN
          v_price_variance_count := v_price_variance_count + 1;
        END IF;
      END IF;
    END LOOP;
    
    -- Calculate score
    DECLARE
      v_variance_percentage numeric;
    BEGIN
      v_variance_percentage := (v_price_variance_count::numeric / v_total_orders::numeric) * 100;
      
      -- 0% variance = 100 score
      -- <10% variance = 90-100 score
      -- 10-25% variance = 70-90 score
      -- >25% variance = <70 score
      IF v_variance_percentage = 0 THEN
        v_score := 100;
      ELSIF v_variance_percentage < 10 THEN
        v_score := 90 + ((10 - v_variance_percentage) / 10) * 10;
      ELSIF v_variance_percentage <= 25 THEN
        v_score := 70 + ((25 - v_variance_percentage) / 15) * 20;
      ELSE
        v_score := GREATEST(0, 70 - ((v_variance_percentage - 25) / 25) * 70);
      END IF;
    END;
  END IF;
  
  v_score := GREATEST(0, LEAST(100, v_score));
  RETURN v_score;
END;
$$;

-- Function: calculate_supplier_communication_quality_score
-- Category E — Communication Quality (10 pts)
CREATE OR REPLACE FUNCTION public.calculate_supplier_communication_quality_score(p_supplier_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 100;
  v_total_communications int := 0;
  v_responses_count int := 0;
  v_avg_response_hours numeric := 0;
  v_comm record;
BEGIN
  -- Get all communications for this supplier (last 90 days)
  FOR v_comm IN
    SELECT 
      sc.id,
      sc.sent_at,
      sc.response_received_at,
      sc.status
    FROM public.supplier_communications sc
    WHERE sc.supplier_id = p_supplier_id
      AND sc.created_at >= NOW() - INTERVAL '90 days'
  LOOP
    v_total_communications := v_total_communications + 1;
    
    IF v_comm.response_received_at IS NOT NULL THEN
      v_responses_count := v_responses_count + 1;
      
      DECLARE
        v_response_hours numeric;
      BEGIN
        v_response_hours := EXTRACT(EPOCH FROM (v_comm.response_received_at - v_comm.sent_at)) / 3600;
        v_avg_response_hours := v_avg_response_hours + v_response_hours;
      END;
    END IF;
  END LOOP;
  
  -- Calculate score based on response rate and speed
  IF v_total_communications > 0 THEN
    DECLARE
      v_response_rate numeric;
      v_avg_hours numeric;
    BEGIN
      v_response_rate := (v_responses_count::numeric / v_total_communications::numeric) * 100;
      
      IF v_responses_count > 0 THEN
        v_avg_hours := v_avg_response_hours / v_responses_count;
      ELSE
        v_avg_hours := 999; -- No responses = very slow
      END IF;
      
      -- Response rate component (60% weight)
      DECLARE
        v_rate_score numeric;
      BEGIN
        IF v_response_rate >= 90 THEN
          v_rate_score := 100;
        ELSIF v_response_rate >= 70 THEN
          v_rate_score := 70 + ((v_response_rate - 70) / 20) * 30;
        ELSE
          v_rate_score := (v_response_rate / 70) * 70;
        END IF;
      END;
      
      -- Response speed component (40% weight)
      DECLARE
        v_speed_score numeric;
      BEGIN
        IF v_avg_hours <= 4 THEN
          v_speed_score := 100;
        ELSIF v_avg_hours <= 8 THEN
          v_speed_score := 90 + ((8 - v_avg_hours) / 4) * 10;
        ELSIF v_avg_hours <= 24 THEN
          v_speed_score := 70 + ((24 - v_avg_hours) / 16) * 20;
        ELSE
          v_speed_score := GREATEST(0, 70 - ((v_avg_hours - 24) / 24) * 70);
        END IF;
      END;
      
      v_score := (v_rate_score * 0.6) + (v_speed_score * 0.4);
    END;
  END IF;
  
  v_score := GREATEST(0, LEAST(100, v_score));
  RETURN v_score;
END;
$$;

-- Function: calculate_supplier_scorecard
-- Main function to calculate and update supplier scorecard
CREATE OR REPLACE FUNCTION public.calculate_supplier_scorecard(p_supplier_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_accuracy_score numeric;
  v_on_time_score numeric;
  v_resolution_score numeric;
  v_pricing_score numeric;
  v_communication_score numeric;
  v_overall_score numeric;
  v_total_orders int;
  v_accurate_count int;
  v_inaccurate_count int;
  v_on_time_count int;
  v_late_count int;
  v_total_issues int;
  v_avg_resolution_hours numeric;
  v_price_variance_count int;
  v_comm_responses int;
  v_avg_response_hours numeric;
BEGIN
  -- Get workspace_id
  SELECT workspace_id INTO v_workspace_id
  FROM public.suppliers
  WHERE id = p_supplier_id;
  
  IF v_workspace_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Calculate category scores
  v_accuracy_score := public.calculate_supplier_delivery_accuracy_score(p_supplier_id);
  v_on_time_score := public.calculate_supplier_on_time_delivery_score(p_supplier_id);
  v_resolution_score := public.calculate_supplier_issue_resolution_speed_score(p_supplier_id);
  v_pricing_score := public.calculate_supplier_pricing_consistency_score(p_supplier_id);
  v_communication_score := public.calculate_supplier_communication_quality_score(p_supplier_id);
  
  -- Calculate weighted overall score
  -- Category A: 30 pts, B: 25 pts, C: 20 pts, D: 15 pts, E: 10 pts
  v_overall_score := 
    (v_accuracy_score * 0.30) +
    (v_on_time_score * 0.25) +
    (v_resolution_score * 0.20) +
    (v_pricing_score * 0.15) +
    (v_communication_score * 0.10);
  
  -- Get metrics (simplified - would need more detailed queries)
  SELECT COUNT(*) INTO v_total_orders
  FROM public.material_orders mo
  WHERE mo.supplier_id = p_supplier_id
    AND mo.created_at >= NOW() - INTERVAL '90 days';
  
  -- Insert or update scorecard
  INSERT INTO public.supplier_scorecards (
    supplier_id,
    workspace_id,
    overall_score,
    delivery_accuracy_score,
    on_time_delivery_score,
    issue_resolution_speed_score,
    pricing_consistency_score,
    communication_quality_score,
    total_orders,
    calculated_at,
    updated_at
  ) VALUES (
    p_supplier_id,
    v_workspace_id,
    v_overall_score,
    v_accuracy_score,
    v_on_time_score,
    v_resolution_score,
    v_pricing_score,
    v_communication_score,
    v_total_orders,
    NOW(),
    NOW()
  )
  ON CONFLICT (supplier_id) DO UPDATE SET
    overall_score = EXCLUDED.overall_score,
    delivery_accuracy_score = EXCLUDED.delivery_accuracy_score,
    on_time_delivery_score = EXCLUDED.on_time_delivery_score,
    issue_resolution_speed_score = EXCLUDED.issue_resolution_speed_score,
    pricing_consistency_score = EXCLUDED.pricing_consistency_score,
    communication_quality_score = EXCLUDED.communication_quality_score,
    total_orders = EXCLUDED.total_orders,
    calculated_at = EXCLUDED.calculated_at,
    updated_at = NOW();
END;
$$;

-- ============================================================================
-- PART 11 — TRIGGERS TO AUTO-UPDATE SCORECARDS
-- ============================================================================

-- Trigger function to update crew scorecard when job data changes
CREATE OR REPLACE FUNCTION public.trigger_update_crew_scorecard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_crew_id uuid;
BEGIN
  -- Get crew_id from the changed record
  IF TG_TABLE_NAME = 'job_crew_assignments' THEN
    v_crew_id := NEW.crew_id;
  ELSIF TG_TABLE_NAME = 'roofing_jobs' THEN
    SELECT crew_id INTO v_crew_id
    FROM public.job_crew_assignments
    WHERE job_id = NEW.id AND unassigned_at IS NULL
    LIMIT 1;
  ELSIF TG_TABLE_NAME = 'job_issues' THEN
    v_crew_id := NEW.crew_id;
  ELSIF TG_TABLE_NAME = 'job_morning_workflow' THEN
    v_crew_id := NEW.crew_id;
  ELSIF TG_TABLE_NAME = 'job_documents' THEN
    SELECT crew_id INTO v_crew_id
    FROM public.job_crew_assignments
    WHERE job_id = NEW.job_id AND unassigned_at IS NULL
    LIMIT 1;
  ELSIF TG_TABLE_NAME = 'job_field_photos' THEN
    v_crew_id := NEW.crew_id;
  END IF;
  
  -- Update scorecard if crew_id found
  IF v_crew_id IS NOT NULL THEN
    PERFORM public.calculate_crew_scorecard(v_crew_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trg_update_crew_scorecard_job_assignments ON public.job_crew_assignments;
CREATE TRIGGER trg_update_crew_scorecard_job_assignments
AFTER INSERT OR UPDATE ON public.job_crew_assignments
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_crew_scorecard();

DROP TRIGGER IF EXISTS trg_update_crew_scorecard_jobs ON public.roofing_jobs;
CREATE TRIGGER trg_update_crew_scorecard_jobs
AFTER UPDATE OF status, completed_at ON public.roofing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_crew_scorecard();

DROP TRIGGER IF EXISTS trg_update_crew_scorecard_issues ON public.job_issues;
CREATE TRIGGER trg_update_crew_scorecard_issues
AFTER INSERT OR UPDATE ON public.job_issues
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_crew_scorecard();

DROP TRIGGER IF EXISTS trg_update_crew_scorecard_workflow ON public.job_morning_workflow;
CREATE TRIGGER trg_update_crew_scorecard_workflow
AFTER INSERT OR UPDATE ON public.job_morning_workflow
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_crew_scorecard();

DROP TRIGGER IF EXISTS trg_update_crew_scorecard_documents ON public.job_documents;
CREATE TRIGGER trg_update_crew_scorecard_documents
AFTER INSERT ON public.job_documents
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_crew_scorecard();

DROP TRIGGER IF EXISTS trg_update_crew_scorecard_photos ON public.job_field_photos;
CREATE TRIGGER trg_update_crew_scorecard_photos
AFTER INSERT ON public.job_field_photos
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_crew_scorecard();

-- Trigger function to update supplier scorecard when order data changes
CREATE OR REPLACE FUNCTION public.trigger_update_supplier_scorecard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_supplier_id uuid;
BEGIN
  -- Get supplier_id from the changed record
  IF TG_TABLE_NAME = 'material_orders' THEN
    v_supplier_id := NEW.supplier_id;
  ELSIF TG_TABLE_NAME = 'material_deliveries' THEN
    SELECT supplier_id INTO v_supplier_id
    FROM public.material_orders
    WHERE id = NEW.material_order_id;
  ELSIF TG_TABLE_NAME = 'supplier_issues' THEN
    SELECT supplier_id INTO v_supplier_id
    FROM public.material_orders
    WHERE id = NEW.material_order_id;
  ELSIF TG_TABLE_NAME = 'supplier_communications' THEN
    v_supplier_id := NEW.supplier_id;
  ELSIF TG_TABLE_NAME = 'job_issues' AND NEW.issue_type IN ('wrong_material', 'material_shortage', 'material_damage') THEN
    SELECT supplier_id INTO v_supplier_id
    FROM public.material_orders
    WHERE job_id = NEW.job_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;
  
  -- Update scorecard if supplier_id found
  IF v_supplier_id IS NOT NULL THEN
    PERFORM public.calculate_supplier_scorecard(v_supplier_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trg_update_supplier_scorecard_orders ON public.material_orders;
CREATE TRIGGER trg_update_supplier_scorecard_orders
AFTER INSERT OR UPDATE ON public.material_orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_supplier_scorecard();

DROP TRIGGER IF EXISTS trg_update_supplier_scorecard_deliveries ON public.material_deliveries;
CREATE TRIGGER trg_update_supplier_scorecard_deliveries
AFTER INSERT OR UPDATE ON public.material_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_supplier_scorecard();

DROP TRIGGER IF EXISTS trg_update_supplier_scorecard_issues ON public.supplier_issues;
CREATE TRIGGER trg_update_supplier_scorecard_issues
AFTER INSERT OR UPDATE ON public.supplier_issues
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_supplier_scorecard();

DROP TRIGGER IF EXISTS trg_update_supplier_scorecard_communications ON public.supplier_communications;
CREATE TRIGGER trg_update_supplier_scorecard_communications
AFTER INSERT OR UPDATE ON public.supplier_communications
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_supplier_scorecard();

DROP TRIGGER IF EXISTS trg_update_supplier_scorecard_job_issues ON public.job_issues;
CREATE TRIGGER trg_update_supplier_scorecard_job_issues
AFTER INSERT OR UPDATE ON public.job_issues
FOR EACH ROW
WHEN (NEW.issue_type IN ('wrong_material', 'material_shortage', 'material_damage'))
EXECUTE FUNCTION public.trigger_update_supplier_scorecard();

-- ============================================================================
-- PART 12 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.crew_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorecard_action_suggestions ENABLE ROW LEVEL SECURITY;

-- Crew scorecards: Users can view scorecards for crews in their workspace
CREATE POLICY "Users can view crew scorecards in their workspace"
  ON public.crew_scorecards FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Supplier scorecards: Users can view scorecards for suppliers in their workspace
CREATE POLICY "Users can view supplier scorecards in their workspace"
  ON public.supplier_scorecards FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Action suggestions: Users can view and manage suggestions in their workspace
CREATE POLICY "Users can view action suggestions in their workspace"
  ON public.scorecard_action_suggestions FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update action suggestions in their workspace"
  ON public.scorecard_action_suggestions FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 13 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.crew_scorecards TO authenticated;
GRANT SELECT ON public.supplier_scorecards TO authenticated;
GRANT SELECT, UPDATE ON public.scorecard_action_suggestions TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_crew_scorecard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_supplier_scorecard(uuid) TO authenticated;

-- ============================================================================
-- PART 14 — INITIAL SCORECARD CALCULATION
-- ============================================================================
-- Calculate scorecards for all existing crews and suppliers
-- This can be run manually or via a scheduled job

-- Note: This is commented out to avoid long-running migration
-- Uncomment and run separately if needed:
-- DO $$
-- DECLARE
--   v_crew record;
--   v_supplier record;
-- BEGIN
--   FOR v_crew IN SELECT id FROM public.crews WHERE is_active = true
--   LOOP
--     PERFORM public.calculate_crew_scorecard(v_crew.id);
--   END LOOP;
--   
--   FOR v_supplier IN SELECT id FROM public.suppliers WHERE is_active = true
--   LOOP
--     PERFORM public.calculate_supplier_scorecard(v_supplier.id);
--   END LOOP;
-- END $$;

