-- =========================================================
-- Block 19940 — SmartSend Inbox Photo Intelligence v1
-- (AI Roof Photo Analysis, Damage Detection, Severity Scoring, 
--  Material Recognition, and Instant Job Insights from Homeowner Images)
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE IMAGE_ANALYSIS_REPORTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.image_analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  attachment_id uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  
  -- Damage Type Detection (AI Vision Model)
  damage_type text, -- Primary damage category: 'missing_shingles', 'torn_shingles', 'lifted_shingles', 'hail_bruising', 'granule_loss', 'nail_pops', 'vent_pipe_boot_deterioration', 'flashing_separation', 'chimney_leak', 'skylight_leak', 'gutter_overflow', 'fascia_rot', 'soffit_rot', 'punctures', 'old_worn_shingles', 'moss_algae', 'debris_buildup', 'none'
  damage_types text[], -- Array of all detected damage types
  
  -- Severity Scoring (0-100)
  severity integer DEFAULT 0 CHECK (severity >= 0 AND severity <= 100),
  severity_label text, -- 'Minor' (0-20), 'Moderate' (20-50), 'Severe' (50-100)
  severity_description text, -- Human-readable description like "Active leak — missing shingles exposing decking."
  
  -- Material Recognition
  material_detected text, -- 'asphalt', 'architectural_shingles', '3_tab_shingles', 'metal_panel_roofing', 'tpo_flat_roof', 'epdm', 'tile', 'wood_shake', 'unknown'
  material_confidence numeric(5,2) CHECK (material_confidence >= 0 AND material_confidence <= 100),
  
  -- Roof Condition Assessment
  slope_estimation text, -- 'low_slope', 'moderate_slope', 'steep_slope', 'unknown'
  roof_condition_notes text, -- AI-generated condition summary like "Shingles appear brittle", "Granule loss heavy", etc.
  condition_summary text[], -- Array of condition observations
  
  -- Insurance Likelihood Prediction
  insurance_likelihood integer DEFAULT 0 CHECK (insurance_likelihood >= 0 AND insurance_likelihood <= 100), -- Percentage probability
  insurance_indicators text[], -- Array of indicators found (hail bruises, wind damage patterns, etc.)
  
  -- AI Suggested Next Step
  recommended_next_step text, -- Examples: "Recommend tarp + repair ASAP", "Recommend full inspection – likely insurance replacement", etc.
  recommended_action_type text, -- 'emergency_repair', 'full_inspection', 'replacement_estimate', 'quick_repair', 'monitor'
  
  -- Potential Job Type
  potential_job_type text, -- 'repair', 'partial_replacement', 'full_replacement', 'maintenance', 'inspection_only'
  job_type_confidence numeric(5,2) CHECK (job_type_confidence >= 0 AND job_type_confidence <= 100),
  
  -- Value Range Based on Damage
  value_range_min numeric(12,2), -- Minimum estimated value
  value_range_max numeric(12,2), -- Maximum estimated value
  value_range_type text, -- 'repair' or 'replacement'
  value_range_formatted text, -- Human-readable like "$150–$400" or "$7,000–$15,000"
  
  -- Analysis Metadata
  analysis_model text DEFAULT 'gpt-4o',
  analysis_version text DEFAULT 'v1',
  analysis_metadata jsonb DEFAULT '{}'::jsonb, -- Full AI response and metadata
  analyzed_at timestamptz DEFAULT now(),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT image_analysis_reports_contact_fk FOREIGN KEY (contact_id) 
    REFERENCES public.contacts(id) ON DELETE CASCADE,
  CONSTRAINT image_analysis_reports_workspace_fk FOREIGN KEY (workspace_id) 
    REFERENCES public.workspaces(id) ON DELETE CASCADE
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_image_analysis_reports_thread 
  ON public.image_analysis_reports(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_image_analysis_reports_contact 
  ON public.image_analysis_reports(contact_id);
CREATE INDEX IF NOT EXISTS idx_image_analysis_reports_workspace 
  ON public.image_analysis_reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_image_analysis_reports_attachment 
  ON public.image_analysis_reports(attachment_id) WHERE attachment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_image_analysis_reports_message 
  ON public.image_analysis_reports(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_image_analysis_reports_damage_type 
  ON public.image_analysis_reports(damage_type) WHERE damage_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_image_analysis_reports_severity 
  ON public.image_analysis_reports(severity DESC);
CREATE INDEX IF NOT EXISTS idx_image_analysis_reports_insurance 
  ON public.image_analysis_reports(insurance_likelihood DESC) WHERE insurance_likelihood >= 50;
CREATE INDEX IF NOT EXISTS idx_image_analysis_reports_analyzed_at 
  ON public.image_analysis_reports(analyzed_at DESC);

-- ============================================================================
-- PART 2 — FUNCTION TO CALCULATE SEVERITY LABEL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_severity_label(p_severity integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_severity >= 50 THEN
    RETURN 'Severe';
  ELSIF p_severity >= 20 THEN
    RETURN 'Moderate';
  ELSE
    RETURN 'Minor';
  END IF;
END;
$$;

-- ============================================================================
-- PART 3 — FUNCTION TO FORMAT VALUE RANGE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.format_value_range(
  p_min numeric,
  p_max numeric
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_min IS NULL OR p_max IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN '$' || TRIM(TO_CHAR(p_min, '999,999,999,999')) || '–$' || TRIM(TO_CHAR(p_max, '999,999,999,999'));
END;
$$;

-- ============================================================================
-- PART 4 — TRIGGER TO AUTO-UPDATE SEVERITY LABEL AND VALUE RANGE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_update_analysis_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Auto-calculate severity label
  IF NEW.severity IS NOT NULL THEN
    NEW.severity_label := public.calculate_severity_label(NEW.severity);
  END IF;
  
  -- Auto-format value range
  IF NEW.value_range_min IS NOT NULL AND NEW.value_range_max IS NOT NULL THEN
    NEW.value_range_formatted := public.format_value_range(NEW.value_range_min, NEW.value_range_max);
  END IF;
  
  -- Update timestamp
  NEW.updated_at := now();
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_update_analysis_fields ON public.image_analysis_reports;
CREATE TRIGGER trg_auto_update_analysis_fields
  BEFORE INSERT OR UPDATE ON public.image_analysis_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_update_analysis_fields();

-- ============================================================================
-- PART 5 — ENABLE RLS ON IMAGE_ANALYSIS_REPORTS
-- ============================================================================

ALTER TABLE public.image_analysis_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Workspace members can view/edit their reports
CREATE POLICY "image_analysis_reports_view_workspace_members" ON public.image_analysis_reports
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "image_analysis_reports_insert_workspace_members" ON public.image_analysis_reports
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "image_analysis_reports_update_workspace_members" ON public.image_analysis_reports
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY "image_analysis_reports_service_role_full_access" ON public.image_analysis_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 6 — VIEW FOR THREAD PHOTO ANALYSIS SUMMARY
-- ============================================================================

CREATE OR REPLACE VIEW public.inbox_thread_photo_analysis_summary AS
SELECT 
  t.id as thread_id,
  t.contact_id,
  COUNT(DISTINCT iar.id) as photo_analysis_count,
  MAX(iar.severity) as max_severity,
  MAX(iar.insurance_likelihood) as max_insurance_likelihood,
  ARRAY_AGG(DISTINCT iar.damage_type) FILTER (WHERE iar.damage_type IS NOT NULL) as detected_damage_types,
  ARRAY_AGG(DISTINCT iar.material_detected) FILTER (WHERE iar.material_detected IS NOT NULL) as detected_materials,
  MAX(iar.analyzed_at) as last_photo_analyzed_at
FROM public.inbox_threads t
LEFT JOIN public.image_analysis_reports iar ON iar.thread_id = t.id
GROUP BY t.id, t.contact_id;

-- ============================================================================
-- PART 7 — COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.image_analysis_reports IS 'AI-powered photo analysis reports for homeowner images - detects damage types, severity, materials, insurance likelihood, and provides job insights';
COMMENT ON COLUMN public.image_analysis_reports.damage_type IS 'Primary damage category detected: missing_shingles, torn_shingles, lifted_shingles, hail_bruising, granule_loss, nail_pops, vent_pipe_boot_deterioration, flashing_separation, chimney_leak, skylight_leak, gutter_overflow, fascia_rot, soffit_rot, punctures, old_worn_shingles, moss_algae, debris_buildup, none';
COMMENT ON COLUMN public.image_analysis_reports.severity IS 'Damage severity score 0-100: 0-20=Minor, 20-50=Moderate, 50-100=Severe';
COMMENT ON COLUMN public.image_analysis_reports.insurance_likelihood IS 'AI-predicted probability (0-100%) that damage qualifies for insurance coverage';
COMMENT ON COLUMN public.image_analysis_reports.recommended_next_step IS 'AI-suggested action based on photo analysis (e.g., "Recommend tarp + repair ASAP", "Recommend full inspection – likely insurance replacement")';
COMMENT ON COLUMN public.image_analysis_reports.value_range_formatted IS 'Human-readable value range like "$150–$400" for repairs or "$7,000–$15,000" for replacements';



















































