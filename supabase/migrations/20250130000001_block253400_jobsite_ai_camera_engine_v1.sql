-- =========================================================
-- Block 253400 — SmartSend Jobsite AI Camera Engine v1
-- "Auto Photo Categorization, Progress Detection, QC Auto-Grading, Time-Lapse Builder, Safety Violation Detection"
-- =========================================================
-- 
-- This block makes SmartSend unstoppable.
-- Roofers will NEVER see anything like this in any CRM.
-- This is where SmartSend becomes the AI version of EagleView + CompanyCam + QC Manager in ONE system.
-- 
-- Roofers will say:
-- "SmartSend sorts and analyzes our photos automatically. This is next-level."
-- "No other CRM does ANYTHING close to this."
-- "We'd be stupid not using SmartSend."
-- =========================================================

-- ============================================================================
-- PART 1 — ADD AI METADATA COLUMNS TO job_photo_entries
-- ============================================================================

ALTER TABLE public.job_photo_entries
ADD COLUMN IF NOT EXISTS ai_category text,
ADD COLUMN IF NOT EXISTS ai_labels text[],
ADD COLUMN IF NOT EXISTS ai_confidence numeric,
ADD COLUMN IF NOT EXISTS ai_detected_stage text CHECK (ai_detected_stage IN ('tear_off', 'decking', 'underlayment', 'install', 'completed', 'material_delivery', 'safety', 'qc_check', 'damage', 'flashing', 'ventilation', 'structural_issue', 'before', 'after', null)),
ADD COLUMN IF NOT EXISTS ai_safety_flags text[],
ADD COLUMN IF NOT EXISTS ai_qc_score int CHECK (ai_qc_score >= 0 AND ai_qc_score <= 100),
ADD COLUMN IF NOT EXISTS ai_time_of_day text CHECK (ai_time_of_day IN ('morning', 'afternoon', 'evening', null)),
ADD COLUMN IF NOT EXISTS ai_workmanship_issues text[],
ADD COLUMN IF NOT EXISTS ai_material_problems text[],
ADD COLUMN IF NOT EXISTS ai_analysis_raw jsonb,
ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_job_photo_entries_ai_category ON public.job_photo_entries(job_id, ai_category);
CREATE INDEX IF NOT EXISTS idx_job_photo_entries_ai_stage ON public.job_photo_entries(job_id, ai_detected_stage);
CREATE INDEX IF NOT EXISTS idx_job_photo_entries_ai_qc_score ON public.job_photo_entries(job_id, ai_qc_score);
CREATE INDEX IF NOT EXISTS idx_job_photo_entries_ai_safety ON public.job_photo_entries(job_id) WHERE array_length(ai_safety_flags, 1) > 0;
CREATE INDEX IF NOT EXISTS idx_job_photo_entries_ai_analyzed ON public.job_photo_entries(ai_analyzed_at DESC);

COMMENT ON COLUMN public.job_photo_entries.ai_category IS 'AI-detected category: roof_surface, materials, safety, flashing, etc.';
COMMENT ON COLUMN public.job_photo_entries.ai_labels IS 'AI-detected labels: shingles, underlayment, ridge_vent, ladder, harness_missing, etc.';
COMMENT ON COLUMN public.job_photo_entries.ai_confidence IS 'AI confidence score (0-100)';
COMMENT ON COLUMN public.job_photo_entries.ai_detected_stage IS 'AI-detected installation stage: tear_off, decking, underlayment, install, completed, etc.';
COMMENT ON COLUMN public.job_photo_entries.ai_safety_flags IS 'AI-detected safety violations: no_harness, unsafe_ladder_angle, no_safety_vest, etc.';
COMMENT ON COLUMN public.job_photo_entries.ai_qc_score IS 'AI QC score (0-100): 90-100 Excellent, 75-89 Good, 60-74 Needs correction, <60 Warning';
COMMENT ON COLUMN public.job_photo_entries.ai_time_of_day IS 'AI-detected time of day: morning, afternoon, evening';
COMMENT ON COLUMN public.job_photo_entries.ai_workmanship_issues IS 'AI-detected workmanship issues: exposed_nails, lifted_shingle, crooked_line, etc.';
COMMENT ON COLUMN public.job_photo_entries.ai_material_problems IS 'AI-detected material problems: wrong_material, damaged_material, insufficient_material, etc.';
COMMENT ON COLUMN public.job_photo_entries.ai_analysis_raw IS 'Raw JSON from AI analysis for debugging/auditing';

-- ============================================================================
-- PART 2 — CREATE safety_violation_alerts TABLE
-- ============================================================================
-- Stores safety violations detected by AI for office alerts

CREATE TABLE IF NOT EXISTS public.safety_violation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  photo_id uuid REFERENCES public.job_photo_entries(id) ON DELETE CASCADE,
  violation_type text NOT NULL,
  description text NOT NULL,
  severity text DEFAULT 'warning' CHECK (severity IN ('warning', 'critical', 'minor')),
  acknowledged boolean DEFAULT false,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_violation_alerts_job ON public.safety_violation_alerts(job_id);
CREATE INDEX IF NOT EXISTS idx_safety_violation_alerts_photo ON public.safety_violation_alerts(photo_id);
CREATE INDEX IF NOT EXISTS idx_safety_violation_alerts_acknowledged ON public.safety_violation_alerts(job_id, acknowledged);
CREATE INDEX IF NOT EXISTS idx_safety_violation_alerts_created ON public.safety_violation_alerts(created_at DESC);

COMMENT ON TABLE public.safety_violation_alerts IS 'Safety violations detected by AI photo analysis (Block 253400)';
COMMENT ON COLUMN public.safety_violation_alerts.violation_type IS 'Type: no_harness, unsafe_ladder_angle, no_safety_vest, worker_too_close_to_edge, improper_anchor_point, material_blocking_ladder, missing_guardrail';

-- ============================================================================
-- PART 3 — CREATE job_timelapse_videos TABLE
-- ============================================================================
-- Stores generated time-lapse videos per job

CREATE TABLE IF NOT EXISTS public.job_timelapse_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  video_path text NOT NULL,
  photo_count int DEFAULT 0,
  duration_seconds numeric,
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_timelapse_videos_job ON public.job_timelapse_videos(job_id);
CREATE INDEX IF NOT EXISTS idx_job_timelapse_videos_generated ON public.job_timelapse_videos(generated_at DESC);

COMMENT ON TABLE public.job_timelapse_videos IS 'Auto-generated time-lapse videos per job (Block 253400)';

-- ============================================================================
-- PART 4 — CREATE insurance_photo_packages TABLE
-- ============================================================================
-- Stores auto-generated insurance photo packages (PDFs)

CREATE TABLE IF NOT EXISTS public.insurance_photo_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  package_url text NOT NULL,
  package_path text NOT NULL,
  photo_count int DEFAULT 0,
  includes_before boolean DEFAULT false,
  includes_damage boolean DEFAULT false,
  includes_materials boolean DEFAULT false,
  includes_during boolean DEFAULT false,
  includes_after boolean DEFAULT false,
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_photo_packages_job ON public.insurance_photo_packages(job_id);
CREATE INDEX IF NOT EXISTS idx_insurance_photo_packages_generated ON public.insurance_photo_packages(generated_at DESC);

COMMENT ON TABLE public.insurance_photo_packages IS 'Auto-generated insurance photo packages (PDFs) per job (Block 253400)';

-- ============================================================================
-- PART 5 — FUNCTION: update_production_milestone_from_photo
-- ============================================================================
-- Auto-updates production milestones based on AI-detected stage

CREATE OR REPLACE FUNCTION public.update_production_milestone_from_photo(
  job_uuid uuid,
  detected_stage text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  milestone_name text;
  milestone_id_val uuid;
BEGIN
  -- Map AI detected stage to milestone name
  CASE detected_stage
    WHEN 'tear_off' THEN milestone_name := 'Tear-Off';
    WHEN 'decking' THEN milestone_name := 'Decking Repair';
    WHEN 'underlayment' THEN milestone_name := 'Underlayment';
    WHEN 'install' THEN milestone_name := 'Shingle Install';
    WHEN 'completed' THEN milestone_name := 'Completed Roof';
    ELSE RETURN; -- Unknown stage, skip
  END CASE;

  -- Find or create milestone
  SELECT id INTO milestone_id_val
  FROM public.production_milestones
  WHERE job_id = job_uuid
    AND name = milestone_name
  LIMIT 1;

  IF milestone_id_val IS NULL THEN
    -- Create milestone if it doesn't exist
    INSERT INTO public.production_milestones (job_id, name, status, order_index)
    VALUES (job_uuid, milestone_name, 'in_progress', 0)
    RETURNING id INTO milestone_id_val;
  ELSE
    -- Update existing milestone to in_progress or completed
    UPDATE public.production_milestones
    SET status = CASE 
      WHEN detected_stage = 'completed' THEN 'completed'
      ELSE 'in_progress'
    END,
    started_date = COALESCE(started_date, CURRENT_DATE),
    completed_date = CASE 
      WHEN detected_stage = 'completed' THEN CURRENT_DATE
      ELSE completed_date
    END,
    updated_at = now()
    WHERE id = milestone_id_val;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_production_milestone_from_photo IS 'Auto-updates production milestones based on AI-detected photo stage (Block 253400)';

-- ============================================================================
-- PART 6 — FUNCTION: trigger_photo_ai_analysis
-- ============================================================================
-- Trigger function to automatically analyze photos when uploaded
-- (This will be called by the Edge Function after analysis completes)

CREATE OR REPLACE FUNCTION public.trigger_photo_ai_analysis()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If AI analysis is complete, update milestones and create safety alerts
  IF NEW.ai_detected_stage IS NOT NULL THEN
    PERFORM public.update_production_milestone_from_photo(NEW.job_id, NEW.ai_detected_stage);
  END IF;

  -- Create safety violation alerts if detected
  IF NEW.ai_safety_flags IS NOT NULL AND array_length(NEW.ai_safety_flags, 1) > 0 THEN
    INSERT INTO public.safety_violation_alerts (job_id, photo_id, violation_type, description, severity)
    SELECT 
      NEW.job_id,
      NEW.id,
      unnest(NEW.ai_safety_flags) as violation_type,
      'AI detected safety violation: ' || unnest(NEW.ai_safety_flags),
      CASE 
        WHEN unnest(NEW.ai_safety_flags) IN ('no_harness', 'worker_too_close_to_edge', 'missing_guardrail') THEN 'critical'
        WHEN unnest(NEW.ai_safety_flags) IN ('unsafe_ladder_angle', 'improper_anchor_point') THEN 'warning'
        ELSE 'minor'
      END
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_photo_ai_analysis_update ON public.job_photo_entries;
CREATE TRIGGER trigger_photo_ai_analysis_update
AFTER UPDATE OF ai_detected_stage, ai_safety_flags ON public.job_photo_entries
FOR EACH ROW
WHEN (NEW.ai_detected_stage IS DISTINCT FROM OLD.ai_detected_stage OR NEW.ai_safety_flags IS DISTINCT FROM OLD.ai_safety_flags)
EXECUTE FUNCTION public.trigger_photo_ai_analysis();

-- ============================================================================
-- PART 7 — FUNCTION: get_job_photo_qc_summary
-- ============================================================================
-- Get QC summary for a job based on all analyzed photos

CREATE OR REPLACE FUNCTION public.get_job_photo_qc_summary(job_uuid uuid)
RETURNS TABLE (
  total_photos int,
  avg_qc_score numeric,
  excellent_count int,
  good_count int,
  needs_correction_count int,
  warning_count int,
  workmanship_issues_count int
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    COUNT(*)::int as total_photos,
    ROUND(AVG(ai_qc_score), 2) as avg_qc_score,
    COUNT(*) FILTER (WHERE ai_qc_score >= 90)::int as excellent_count,
    COUNT(*) FILTER (WHERE ai_qc_score >= 75 AND ai_qc_score < 90)::int as good_count,
    COUNT(*) FILTER (WHERE ai_qc_score >= 60 AND ai_qc_score < 75)::int as needs_correction_count,
    COUNT(*) FILTER (WHERE ai_qc_score < 60)::int as warning_count,
    COUNT(*) FILTER (WHERE array_length(ai_workmanship_issues, 1) > 0)::int as workmanship_issues_count
  FROM public.job_photo_entries
  WHERE job_id = job_uuid
    AND ai_qc_score IS NOT NULL;
$$;

COMMENT ON FUNCTION public.get_job_photo_qc_summary IS 'Get QC summary statistics for a job (Block 253400)';

-- ============================================================================
-- PART 8 — FUNCTION: get_job_photo_progress_timeline
-- ============================================================================
-- Get chronological progress timeline based on AI-detected stages

CREATE OR REPLACE FUNCTION public.get_job_photo_progress_timeline(job_uuid uuid)
RETURNS TABLE (
  detected_stage text,
  first_detected_at timestamptz,
  photo_count int,
  latest_photo_url text
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    ai_detected_stage as detected_stage,
    MIN(created_at) as first_detected_at,
    COUNT(*)::int as photo_count,
    (array_agg(url ORDER BY created_at DESC))[1] as latest_photo_url
  FROM public.job_photo_entries
  WHERE job_id = job_uuid
    AND ai_detected_stage IS NOT NULL
  GROUP BY ai_detected_stage
  ORDER BY first_detected_at ASC;
$$;

COMMENT ON FUNCTION public.get_job_photo_progress_timeline IS 'Get chronological progress timeline based on AI-detected stages (Block 253400)';

-- ============================================================================
-- PART 9 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.safety_violation_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_timelapse_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_photo_packages ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user has access to roofing company
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'can_access_roofing_company'
  ) THEN
    CREATE OR REPLACE FUNCTION public.can_access_roofing_company(_company_id uuid)
    RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
      SELECT EXISTS(
        SELECT 1 FROM public.roofing_companies rc
        WHERE rc.id = _company_id
        AND (
          rc.owner_id = auth.uid()
          OR EXISTS(
            SELECT 1 FROM public.roofing_company_members rcm
            WHERE rcm.roofing_company_id = _company_id
            AND rcm.user_id = auth.uid()
            AND rcm.is_active = true
          )
        )
      );
    $$;
  END IF;
END $$;

-- RLS Policies for safety_violation_alerts
DROP POLICY IF EXISTS "safety_violation_alerts_select" ON public.safety_violation_alerts;
CREATE POLICY "safety_violation_alerts_select" ON public.safety_violation_alerts
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = safety_violation_alerts.job_id
      AND can_access_roofing_company(j.company_id)
    )
  );

DROP POLICY IF EXISTS "safety_violation_alerts_update" ON public.safety_violation_alerts;
CREATE POLICY "safety_violation_alerts_update" ON public.safety_violation_alerts
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = safety_violation_alerts.job_id
      AND can_access_roofing_company(j.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = safety_violation_alerts.job_id
      AND can_access_roofing_company(j.company_id)
    )
  );

-- RLS Policies for job_timelapse_videos
DROP POLICY IF EXISTS "job_timelapse_videos_select" ON public.job_timelapse_videos;
CREATE POLICY "job_timelapse_videos_select" ON public.job_timelapse_videos
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_timelapse_videos.job_id
      AND can_access_roofing_company(j.company_id)
    )
  );

-- RLS Policies for insurance_photo_packages
DROP POLICY IF EXISTS "insurance_photo_packages_select" ON public.insurance_photo_packages;
CREATE POLICY "insurance_photo_packages_select" ON public.insurance_photo_packages
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      WHERE j.id = insurance_photo_packages.job_id
      AND can_access_roofing_company(j.company_id)
    )
  );

-- Service role can do everything
DROP POLICY IF EXISTS "safety_violation_alerts_service_role" ON public.safety_violation_alerts;
CREATE POLICY "safety_violation_alerts_service_role" ON public.safety_violation_alerts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "job_timelapse_videos_service_role" ON public.job_timelapse_videos;
CREATE POLICY "job_timelapse_videos_service_role" ON public.job_timelapse_videos
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "insurance_photo_packages_service_role" ON public.insurance_photo_packages;
CREATE POLICY "insurance_photo_packages_service_role" ON public.insurance_photo_packages
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
























