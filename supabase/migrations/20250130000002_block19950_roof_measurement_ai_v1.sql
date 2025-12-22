-- =========================================================
-- Block 19950 — SmartSend Inbox AI Roof Measurement v1
-- (Photo-Based Measurements, Rough Square Estimations, Roof Size Classification, and Replacement Cost Intelligence)
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE roof_measurements TABLE
-- ============================================================================
-- Stores AI-powered roof measurements from photo analysis

CREATE TABLE IF NOT EXISTS public.roof_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  attachment_id uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  
  -- PART 1: Photo-Based Roof Size Estimation (AI Vision)
  estimated_squares_min integer, -- e.g., 18
  estimated_squares_max integer, -- e.g., 25
  estimated_squares_avg numeric(5,2), -- e.g., 21.5
  
  -- PART 2: Pitch Estimation (AI Accuracy v1)
  pitch_estimate text, -- e.g., '4/12', '6/12', '8/12', '10/12'
  pitch_category text CHECK (pitch_category IN ('low', 'medium', 'high', 'steep', 'flat', 'unknown')) DEFAULT 'unknown',
  
  -- PART 3: Replacement Cost AI (Based on Size + Region)
  replacement_cost_min numeric(12,2), -- e.g., 11000.00
  replacement_cost_max numeric(12,2), -- e.g., 19000.00
  replacement_cost_avg numeric(12,2),
  material_type text, -- 'asphalt', 'metal', 'tile', 'flat_roof'
  region_pricing_multiplier numeric(5,2) DEFAULT 1.0,
  
  -- PART 4: Complexity Estimation
  complexity_rating text CHECK (complexity_rating IN ('low', 'medium', 'high', 'very_high', 'unknown')) DEFAULT 'unknown',
  dormers_detected boolean DEFAULT false,
  chimneys_detected boolean DEFAULT false,
  skylights_detected boolean DEFAULT false,
  multi_plane_complexity boolean DEFAULT false,
  steep_slopes_detected boolean DEFAULT false,
  flashing_heavy_sections boolean DEFAULT false,
  penetrations_count integer DEFAULT 0,
  
  -- PART 5: Measurement Confidence Score
  confidence_score integer NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  image_quality_score integer CHECK (image_quality_score >= 0 AND image_quality_score <= 100),
  angle_score integer CHECK (angle_score >= 0 AND angle_score <= 100),
  clarity_score integer CHECK (clarity_score >= 0 AND clarity_score <= 100),
  visibility_score integer CHECK (visibility_score >= 0 AND visibility_score <= 100),
  obstruction_level text CHECK (obstruction_level IN ('none', 'low', 'medium', 'high')) DEFAULT 'none',
  quality_feedback text, -- e.g., "Ask homeowner for a photo from the front-left angle"
  
  -- PART 6: Mapping to Job Type (Repair vs Replacement)
  likely_job_type text CHECK (likely_job_type IN ('replacement', 'repair_only', 'unknown')) DEFAULT 'unknown',
  replacement_reasons text[], -- e.g., ['shingles_worn', 'large_square_footage', 'age_indicators', 'granule_loss', 'wind_lift']
  repair_reasons text[], -- e.g., ['small_localized_damage', 'roof_overall_good']
  
  -- PART 7: Roof Age Estimation (Visual AI)
  roof_age_min integer, -- e.g., 12
  roof_age_max integer, -- e.g., 18
  roof_age_median numeric(5,2), -- e.g., 15.0
  condition_assessment text CHECK (condition_assessment IN ('new', 'early_life', 'mid_life', 'past_mid_life', 'end_of_life', 'unknown')) DEFAULT 'unknown',
  granule_wear_detected boolean DEFAULT false,
  color_fading_detected boolean DEFAULT false,
  algae_moss_detected boolean DEFAULT false,
  warping_detected boolean DEFAULT false,
  cracking_detected boolean DEFAULT false,
  curling_detected boolean DEFAULT false,
  
  -- AI Analysis Metadata
  ai_analysis_metadata jsonb DEFAULT '{}'::jsonb, -- Stores raw AI response, detection details, etc.
  
  -- Timestamps
  analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one measurement per thread (can be updated)
  UNIQUE(thread_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_roof_measurements_thread ON public.roof_measurements(thread_id);
CREATE INDEX IF NOT EXISTS idx_roof_measurements_contact ON public.roof_measurements(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roof_measurements_workspace ON public.roof_measurements(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roof_measurements_attachment ON public.roof_measurements(attachment_id) WHERE attachment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roof_measurements_job_type ON public.roof_measurements(likely_job_type) WHERE likely_job_type != 'unknown';
CREATE INDEX IF NOT EXISTS idx_roof_measurements_confidence ON public.roof_measurements(confidence_score DESC) WHERE confidence_score >= 50;
CREATE INDEX IF NOT EXISTS idx_roof_measurements_squares ON public.roof_measurements(estimated_squares_avg) WHERE estimated_squares_avg IS NOT NULL;

-- ============================================================================
-- PART 2 — ADD ROOF MEASUREMENT FIELDS TO inbox_threads
-- ============================================================================
-- Link roof measurements to threads for quick access

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS roof_measurement_id uuid REFERENCES public.roof_measurements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_threads_roof_measurement ON public.inbox_threads(roof_measurement_id) WHERE roof_measurement_id IS NOT NULL;

-- ============================================================================
-- PART 3 — FUNCTION TO CALCULATE REPLACEMENT COST FROM MEASUREMENTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_replacement_cost_from_measurements(
  p_measurement_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_squares_avg numeric;
  v_material text;
  v_pitch_factor numeric;
  v_complexity_factor numeric;
  v_region_multiplier numeric;
  v_cost_per_sq numeric;
  v_cost_min numeric;
  v_cost_max numeric;
  v_cost_avg numeric;
BEGIN
  -- Get measurement data
  SELECT 
    estimated_squares_avg,
    material_type,
    region_pricing_multiplier,
    CASE 
      WHEN pitch_category = 'low' THEN 0.95
      WHEN pitch_category = 'medium' THEN 1.0
      WHEN pitch_category = 'high' THEN 1.15
      WHEN pitch_category = 'steep' THEN 1.35
      ELSE 1.0
    END,
    CASE 
      WHEN complexity_rating = 'low' THEN 1.0
      WHEN complexity_rating = 'medium' THEN 1.1
      WHEN complexity_rating = 'high' THEN 1.25
      WHEN complexity_rating = 'very_high' THEN 1.4
      ELSE 1.0
    END
  INTO v_squares_avg, v_material, v_region_multiplier, v_pitch_factor, v_complexity_factor
  FROM public.roof_measurements
  WHERE id = p_measurement_id;
  
  -- Get material cost per square
  v_cost_per_sq := CASE 
    WHEN v_material = 'asphalt' THEN 525.0 -- $300-$550/sq
    WHEN v_material = 'metal' THEN 1100.0 -- $800-$1,400/sq
    WHEN v_material = 'tile' THEN 1350.0 -- $900-$1,800/sq
    WHEN v_material = 'flat_roof' THEN 650.0 -- $400-$900/sq
    ELSE 525.0 -- Default to asphalt
  END;
  
  -- Calculate cost range
  v_cost_min := COALESCE(v_squares_avg, 20) * v_cost_per_sq * v_pitch_factor * v_complexity_factor * v_region_multiplier * 0.9;
  v_cost_max := COALESCE(v_squares_avg, 20) * v_cost_per_sq * v_pitch_factor * v_complexity_factor * v_region_multiplier * 1.1;
  v_cost_avg := (v_cost_min + v_cost_max) / 2.0;
  
  -- Update measurement record
  UPDATE public.roof_measurements
  SET 
    replacement_cost_min = v_cost_min,
    replacement_cost_max = v_cost_max,
    replacement_cost_avg = v_cost_avg,
    updated_at = now()
  WHERE id = p_measurement_id;
  
  RETURN jsonb_build_object(
    'replacement_cost_min', v_cost_min,
    'replacement_cost_max', v_cost_max,
    'replacement_cost_avg', v_cost_avg
  );
END;
$$;

-- ============================================================================
-- PART 4 — FUNCTION TO DETERMINE JOB TYPE FROM MEASUREMENTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.determine_job_type_from_measurements(
  p_measurement_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_squares_avg numeric;
  v_age_median numeric;
  v_damage_severity text;
  v_granule_loss boolean;
  v_wind_lift boolean;
  v_likely_job text;
  v_replacement_reasons text[];
  v_repair_reasons text[];
BEGIN
  -- Get measurement data
  SELECT 
    rm.estimated_squares_avg,
    rm.roof_age_median,
    rm.granule_wear_detected,
    COALESCE(pi.wind_torn_shingles, false),
    rm.cracking_detected,
    rm.curling_detected
  INTO v_squares_avg, v_age_median, v_granule_loss, v_wind_lift, v_damage_severity, v_damage_severity
  FROM public.roof_measurements rm
  LEFT JOIN public.photo_intelligence pi ON pi.attachment_id = rm.attachment_id
  WHERE rm.id = p_measurement_id;
  
  -- Determine job type based on multiple factors
  v_likely_job := 'unknown';
  v_replacement_reasons := ARRAY[]::text[];
  v_repair_reasons := ARRAY[]::text[];
  
  -- Replacement indicators
  IF COALESCE(v_age_median, 0) >= 15 THEN
    v_likely_job := 'replacement';
    v_replacement_reasons := array_append(v_replacement_reasons, 'age_indicators');
  END IF;
  
  IF v_granule_loss THEN
    v_likely_job := 'replacement';
    v_replacement_reasons := array_append(v_replacement_reasons, 'granule_loss');
  END IF;
  
  IF COALESCE(v_squares_avg, 0) >= 20 THEN
    v_likely_job := 'replacement';
    v_replacement_reasons := array_append(v_replacement_reasons, 'large_square_footage');
  END IF;
  
  IF v_wind_lift THEN
    v_likely_job := 'replacement';
    v_replacement_reasons := array_append(v_replacement_reasons, 'wind_lift');
  END IF;
  
  -- Repair indicators (override if damage is localized)
  IF COALESCE(v_squares_avg, 0) < 15 AND COALESCE(v_age_median, 0) < 10 THEN
    v_likely_job := 'repair_only';
    v_repair_reasons := array_append(v_repair_reasons, 'small_localized_damage');
    v_repair_reasons := array_append(v_repair_reasons, 'roof_overall_good');
  END IF;
  
  -- Update measurement record
  UPDATE public.roof_measurements
  SET 
    likely_job_type = v_likely_job,
    replacement_reasons = v_replacement_reasons,
    repair_reasons = v_repair_reasons,
    updated_at = now()
  WHERE id = p_measurement_id;
  
  RETURN jsonb_build_object(
    'likely_job_type', v_likely_job,
    'replacement_reasons', v_replacement_reasons,
    'repair_reasons', v_repair_reasons
  );
END;
$$;

-- ============================================================================
-- PART 5 — TRIGGER TO UPDATE THREAD WITH MEASUREMENT ID
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_link_measurement_to_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Link measurement to thread
  UPDATE public.inbox_threads
  SET roof_measurement_id = NEW.id
  WHERE id = NEW.thread_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_link_measurement_to_thread ON public.roof_measurements;
CREATE TRIGGER tr_link_measurement_to_thread
AFTER INSERT OR UPDATE ON public.roof_measurements
FOR EACH ROW
EXECUTE FUNCTION public.tg_link_measurement_to_thread();

-- ============================================================================
-- PART 6 — VIEW FOR ROOF MEASUREMENT SUMMARY
-- ============================================================================

CREATE OR REPLACE VIEW public.roof_measurement_summary AS
SELECT 
  rm.id,
  rm.thread_id,
  rm.contact_id,
  rm.workspace_id,
  rm.estimated_squares_min,
  rm.estimated_squares_max,
  rm.estimated_squares_avg,
  rm.pitch_estimate,
  rm.pitch_category,
  rm.replacement_cost_min,
  rm.replacement_cost_max,
  rm.replacement_cost_avg,
  rm.complexity_rating,
  rm.confidence_score,
  rm.likely_job_type,
  rm.roof_age_min,
  rm.roof_age_max,
  rm.roof_age_median,
  rm.condition_assessment,
  it.campaign_id,
  it.status as thread_status
FROM public.roof_measurements rm
LEFT JOIN public.inbox_threads it ON it.id = rm.thread_id;

-- ============================================================================
-- PART 7 — RLS POLICIES
-- ============================================================================

ALTER TABLE public.roof_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view roof measurements for their workspace threads"
  ON public.roof_measurements FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert/update roof measurements"
  ON public.roof_measurements FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update roof measurements"
  ON public.roof_measurements FOR UPDATE
  USING (true);

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roof_measurements IS 'AI-powered roof measurements from photo analysis - includes size estimation, pitch, complexity, replacement cost, job type classification, and age estimation';
COMMENT ON COLUMN public.roof_measurements.estimated_squares_min IS 'Minimum estimated roof squares (1 square = 100 sq ft)';
COMMENT ON COLUMN public.roof_measurements.estimated_squares_max IS 'Maximum estimated roof squares';
COMMENT ON COLUMN public.roof_measurements.pitch_estimate IS 'Roof pitch estimate (e.g., 4/12, 6/12, 8/12, 10/12)';
COMMENT ON COLUMN public.roof_measurements.replacement_cost_min IS 'Minimum estimated replacement cost';
COMMENT ON COLUMN public.roof_measurements.replacement_cost_max IS 'Maximum estimated replacement cost';
COMMENT ON COLUMN public.roof_measurements.complexity_rating IS 'Roof complexity rating: low, medium, high, very_high';
COMMENT ON COLUMN public.roof_measurements.confidence_score IS 'Overall confidence score (0-100) for the measurement';
COMMENT ON COLUMN public.roof_measurements.likely_job_type IS 'AI-suggested job type: replacement, repair_only, unknown';
COMMENT ON COLUMN public.roof_measurements.roof_age_median IS 'Estimated roof age median in years';

