-- =========================================================
-- Block 18500 — SmartSend Photo Intelligence v1
-- (AI Photo Analyzer for Roof Damage, Leak Evidence, Hail Impact, 
--  Material Clues, Insurance Indicators & Appointment Preparation)
-- =========================================================

-- ============================================================================
-- 1. CREATE PHOTO_INTELLIGENCE TABLE (Main Intelligence Store)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.photo_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  attachment_id uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  
  -- Photo Classification
  photo_type text, -- 'exterior_roof', 'interior_leak', 'damage_closeup', 'overview', 'gutter', 'skylight', 'chimney', 'unknown'
  photo_location text, -- 'exterior', 'interior', 'attic', 'unknown'
  
  -- Storm Damage Detection
  storm_damage_detected boolean DEFAULT false,
  hail_marks_detected boolean DEFAULT false,
  hail_bruising_detected boolean DEFAULT false,
  circular_impact_marks boolean DEFAULT false,
  granule_loss_patches boolean DEFAULT false,
  wind_torn_shingles boolean DEFAULT false,
  loose_shingles boolean DEFAULT false,
  uplifted_shingle_edges boolean DEFAULT false,
  storm_opportunity_score numeric(5,2) CHECK (storm_opportunity_score >= 0 AND storm_opportunity_score <= 100),
  
  -- Leak & Water Intrusion Detection
  leak_detected boolean DEFAULT false,
  water_intrusion_detected boolean DEFAULT false,
  ceiling_stains boolean DEFAULT false,
  brown_water_rings boolean DEFAULT false,
  yellow_discoloration boolean DEFAULT false,
  bubbling_paint boolean DEFAULT false,
  sagging_drywall boolean DEFAULT false,
  mold_patterns boolean DEFAULT false,
  is_emergency boolean DEFAULT false,
  
  -- Material Detection (syncs with Material Engine)
  material_type text, -- References material_intelligence.material_type
  shingle_type text,
  metal_type text,
  tile_type text,
  flat_type text,
  skylight_type text,
  vent_types text[], -- Array of vent types detected
  chimney_configuration text,
  
  -- Condition & Wear Detection
  granule_loss boolean DEFAULT false,
  cracking boolean DEFAULT false,
  curling boolean DEFAULT false,
  blistering boolean DEFAULT false,
  algae_moss boolean DEFAULT false,
  nail_pops boolean DEFAULT false,
  exposed_underlayment boolean DEFAULT false,
  roof_age_estimate text, -- '0_5_years', '6_15_years', '16_25_years', '25_plus_years', 'unknown'
  
  -- Gutter / Flashing Damage
  gutter_damage_detected boolean DEFAULT false,
  bent_gutters boolean DEFAULT false,
  sagging_gutters boolean DEFAULT false,
  pulled_back_flashings boolean DEFAULT false,
  damaged_drip_edge boolean DEFAULT false,
  
  -- Interior Indicators
  interior_damage_detected boolean DEFAULT false,
  wall_stains boolean DEFAULT false,
  ceiling_cracks boolean DEFAULT false,
  mold_colonies boolean DEFAULT false,
  active_leak_path boolean DEFAULT false,
  insulation_moisture boolean DEFAULT false,
  labeled_interior_leak_evidence boolean DEFAULT false,
  
  -- Damage Severity Score (0-100)
  severity_score numeric(5,2) DEFAULT 0 CHECK (severity_score >= 0 AND severity_score <= 100),
  severity_category text, -- 'major_damage', 'moderate_damage', 'minor_damage', 'cosmetic_uncertain'
  
  -- Insurance Indicators
  insurance_indicators_count integer DEFAULT 0,
  hail_bruising_pattern boolean DEFAULT false,
  shingle_fractures boolean DEFAULT false,
  broken_tiles boolean DEFAULT false,
  dented_metal_vents boolean DEFAULT false,
  compromised_ridge_caps boolean DEFAULT false,
  interior_water_damage boolean DEFAULT false,
  mold_formations boolean DEFAULT false,
  insurance_strong_candidate boolean DEFAULT false,
  
  -- Upsell Opportunities
  upsell_opportunities text[], -- ['skylight_replacement', 'gutter_upgrade', 'pipe_boot_tuneup', 'roof_cleaning']
  cracked_skylight boolean DEFAULT false,
  gutter_sag boolean DEFAULT false,
  pipe_boot_crack boolean DEFAULT false,
  moss_detected boolean DEFAULT false,
  
  -- Photo Quality Assessment
  photo_quality_score numeric(5,2) CHECK (photo_quality_score >= 0 AND photo_quality_score <= 100),
  is_blurry boolean DEFAULT false,
  is_too_dark boolean DEFAULT false,
  is_too_close boolean DEFAULT false,
  is_too_far boolean DEFAULT false,
  has_angle_issues boolean DEFAULT false,
  quality_feedback text, -- Feedback message for homeowner
  
  -- Multi-Photo Intelligence
  photo_sequence_number integer, -- For multi-photo analysis
  compared_with_photos uuid[], -- Array of other photo_intelligence IDs
  pattern_consistency_score numeric(5,2) CHECK (pattern_consistency_score >= 0 AND pattern_consistency_score <= 100),
  confidence_interval numeric(5,2) CHECK (confidence_interval >= 0 AND confidence_interval <= 100),
  
  -- Analysis Metadata
  analysis_model text, -- AI model used
  analysis_version text DEFAULT 'v1',
  analysis_metadata jsonb DEFAULT '{}'::jsonb, -- Full analysis details
  analyzed_at timestamptz DEFAULT now(),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT photo_intelligence_contact_fk FOREIGN KEY (contact_id) 
    REFERENCES public.contacts(id) ON DELETE CASCADE,
  CONSTRAINT photo_intelligence_workspace_fk FOREIGN KEY (workspace_id) 
    REFERENCES public.workspaces(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_photo_intelligence_contact 
  ON public.photo_intelligence(contact_id);
CREATE INDEX IF NOT EXISTS idx_photo_intelligence_workspace 
  ON public.photo_intelligence(workspace_id);
CREATE INDEX IF NOT EXISTS idx_photo_intelligence_attachment 
  ON public.photo_intelligence(attachment_id) WHERE attachment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photo_intelligence_storm_damage 
  ON public.photo_intelligence(contact_id) WHERE storm_damage_detected = true;
CREATE INDEX IF NOT EXISTS idx_photo_intelligence_leak 
  ON public.photo_intelligence(contact_id) WHERE leak_detected = true;
CREATE INDEX IF NOT EXISTS idx_photo_intelligence_severity 
  ON public.photo_intelligence(severity_score DESC);
CREATE INDEX IF NOT EXISTS idx_photo_intelligence_insurance 
  ON public.photo_intelligence(contact_id) WHERE insurance_strong_candidate = true;
CREATE INDEX IF NOT EXISTS idx_photo_intelligence_emergency 
  ON public.photo_intelligence(contact_id) WHERE is_emergency = true;

-- ============================================================================
-- 2. CREATE PHOTO_DAMAGE_SCORES TABLE (Aggregated Scores per Contact)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.photo_damage_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  
  -- Category Scores (0-100)
  storm_damage_score numeric(5,2) DEFAULT 0 CHECK (storm_damage_score >= 0 AND storm_damage_score <= 100),
  leak_damage_score numeric(5,2) DEFAULT 0 CHECK (leak_damage_score >= 0 AND leak_damage_score <= 100),
  material_condition_score numeric(5,2) DEFAULT 0 CHECK (material_condition_score >= 0 AND material_condition_score <= 100),
  gutter_flashing_score numeric(5,2) DEFAULT 0 CHECK (gutter_flashing_score >= 0 AND gutter_flashing_score <= 100),
  interior_damage_score numeric(5,2) DEFAULT 0 CHECK (interior_damage_score >= 0 AND interior_damage_score <= 100),
  
  -- Overall Scores
  overall_severity_score numeric(5,2) DEFAULT 0 CHECK (overall_severity_score >= 0 AND overall_severity_score <= 100),
  insurance_probability_score numeric(5,2) DEFAULT 0 CHECK (insurance_probability_score >= 0 AND insurance_probability_score <= 100),
  repair_urgency_score numeric(5,2) DEFAULT 0 CHECK (repair_urgency_score >= 0 AND repair_urgency_score <= 100),
  
  -- Recommendations
  recommended_action text, -- 'offer_appointment_tomorrow', 'emergency_slot', 'send_storm_inspection', 'add_to_insurance_pipeline'
  recommended_appointment_slot text, -- Suggested time slot
  replacement_recommendation text, -- 'repair', 'partial_replacement', 'full_replacement', 'monitor'
  
  -- Metadata
  last_calculated_at timestamptz,
  photos_analyzed_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT photo_damage_scores_contact_fk FOREIGN KEY (contact_id) 
    REFERENCES public.contacts(id) ON DELETE CASCADE,
  CONSTRAINT photo_damage_scores_workspace_fk FOREIGN KEY (workspace_id) 
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_photo_damage_scores_contact 
  ON public.photo_damage_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_photo_damage_scores_workspace 
  ON public.photo_damage_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_photo_damage_scores_severity 
  ON public.photo_damage_scores(overall_severity_score DESC);
CREATE INDEX IF NOT EXISTS idx_photo_damage_scores_urgency 
  ON public.photo_damage_scores(repair_urgency_score DESC);

-- ============================================================================
-- 3. CREATE PHOTO_MATERIAL_TAGS TABLE (Material Tags from Photos)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.photo_material_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  photo_intelligence_id uuid REFERENCES public.photo_intelligence(id) ON DELETE CASCADE,
  tag text NOT NULL,
  tag_category text, -- 'material', 'damage', 'component', 'condition', 'upsell'
  confidence numeric(5,2) CHECK (confidence >= 0 AND confidence <= 100),
  source text DEFAULT 'photo_analysis',
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT photo_material_tags_contact_fk FOREIGN KEY (contact_id) 
    REFERENCES public.contacts(id) ON DELETE CASCADE,
  CONSTRAINT photo_material_tags_workspace_fk FOREIGN KEY (workspace_id) 
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  UNIQUE(contact_id, photo_intelligence_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_photo_material_tags_contact 
  ON public.photo_material_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_photo_material_tags_workspace 
  ON public.photo_material_tags(workspace_id);
CREATE INDEX IF NOT EXISTS idx_photo_material_tags_tag 
  ON public.photo_material_tags(tag);
CREATE INDEX IF NOT EXISTS idx_photo_material_tags_category 
  ON public.photo_material_tags(tag_category) WHERE tag_category IS NOT NULL;

-- ============================================================================
-- 4. CREATE PHOTO_EVENTS TABLE (Event Log for Photo Analysis)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.photo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  photo_intelligence_id uuid REFERENCES public.photo_intelligence(id) ON DELETE SET NULL,
  attachment_id uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  
  event_type text NOT NULL, -- 'photo_analyzed', 'damage_detected', 'leak_detected', 'insurance_flagged', 'task_created', 'appointment_prepped'
  event_data jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT photo_events_contact_fk FOREIGN KEY (contact_id) 
    REFERENCES public.contacts(id) ON DELETE CASCADE,
  CONSTRAINT photo_events_workspace_fk FOREIGN KEY (workspace_id) 
    REFERENCES public.workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_photo_events_contact 
  ON public.photo_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_photo_events_workspace 
  ON public.photo_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_photo_events_type 
  ON public.photo_events(event_type);
CREATE INDEX IF NOT EXISTS idx_photo_events_created 
  ON public.photo_events(created_at DESC);

-- ============================================================================
-- 5. FUNCTION TO CALCULATE SEVERITY SCORE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_photo_severity_score(p_photo_intelligence_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_photo record;
  v_score numeric := 0;
  v_category text;
BEGIN
  SELECT * INTO v_photo
  FROM public.photo_intelligence
  WHERE id = p_photo_intelligence_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate severity score based on detected damage
  -- Major damage indicators (high weight)
  IF v_photo.leak_detected THEN v_score := v_score + 30; END IF;
  IF v_photo.water_intrusion_detected THEN v_score := v_score + 25; END IF;
  IF v_photo.storm_damage_detected THEN v_score := v_score + 20; END IF;
  IF v_photo.interior_damage_detected THEN v_score := v_score + 25; END IF;
  
  -- Moderate damage indicators
  IF v_photo.hail_marks_detected THEN v_score := v_score + 15; END IF;
  IF v_photo.wind_torn_shingles THEN v_score := v_score + 15; END IF;
  IF v_photo.gutter_damage_detected THEN v_score := v_score + 10; END IF;
  IF v_photo.granule_loss THEN v_score := v_score + 10; END IF;
  
  -- Minor damage indicators
  IF v_photo.cracking THEN v_score := v_score + 5; END IF;
  IF v_photo.curling THEN v_score := v_score + 5; END IF;
  IF v_photo.algae_moss THEN v_score := v_score + 3; END IF;
  
  -- Cap at 100
  v_score := LEAST(v_score, 100);
  
  -- Determine category
  IF v_score >= 80 THEN
    v_category := 'major_damage';
  ELSIF v_score >= 60 THEN
    v_category := 'moderate_damage';
  ELSIF v_score >= 40 THEN
    v_category := 'minor_damage';
  ELSE
    v_category := 'cosmetic_uncertain';
  END IF;
  
  -- Update photo intelligence
  UPDATE public.photo_intelligence
  SET 
    severity_score = v_score,
    severity_category = v_category,
    updated_at = now()
  WHERE id = p_photo_intelligence_id;
END;
$$;

-- ============================================================================
-- 6. FUNCTION TO CALCULATE INSURANCE INDICATORS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_insurance_indicators(p_photo_intelligence_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_photo record;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_photo
  FROM public.photo_intelligence
  WHERE id = p_photo_intelligence_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Count insurance indicators
  IF v_photo.hail_bruising_pattern THEN v_count := v_count + 1; END IF;
  IF v_photo.shingle_fractures THEN v_count := v_count + 1; END IF;
  IF v_photo.broken_tiles THEN v_count := v_count + 1; END IF;
  IF v_photo.dented_metal_vents THEN v_count := v_count + 1; END IF;
  IF v_photo.compromised_ridge_caps THEN v_count := v_count + 1; END IF;
  IF v_photo.interior_water_damage THEN v_count := v_count + 1; END IF;
  IF v_photo.mold_formations THEN v_count := v_count + 1; END IF;
  
  -- Mark as insurance strong candidate if 2+ indicators
  UPDATE public.photo_intelligence
  SET 
    insurance_indicators_count = v_count,
    insurance_strong_candidate = (v_count >= 2),
    updated_at = now()
  WHERE id = p_photo_intelligence_id;
END;
$$;

-- ============================================================================
-- 7. FUNCTION TO CALCULATE CONTACT PHOTO DAMAGE SCORES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_contact_photo_scores(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
  v_storm_score numeric := 0;
  v_leak_score numeric := 0;
  v_material_score numeric := 0;
  v_gutter_score numeric := 0;
  v_interior_score numeric := 0;
  v_overall_severity numeric := 0;
  v_insurance_prob numeric := 0;
  v_urgency_score numeric := 0;
  v_photos_count integer := 0;
  v_max_severity numeric := 0;
  v_recommended_action text;
  v_replacement_rec text;
BEGIN
  -- Get workspace_id
  SELECT workspace_id INTO v_workspace_id
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate aggregate scores from all photos
  SELECT 
    COUNT(*)::integer,
    COALESCE(MAX(severity_score), 0),
    COALESCE(AVG(CASE WHEN storm_damage_detected THEN severity_score ELSE 0 END), 0),
    COALESCE(AVG(CASE WHEN leak_detected THEN severity_score ELSE 0 END), 0),
    COALESCE(AVG(CASE WHEN material_type IS NOT NULL THEN 80 ELSE 0 END), 0),
    COALESCE(AVG(CASE WHEN gutter_damage_detected THEN severity_score ELSE 0 END), 0),
    COALESCE(AVG(CASE WHEN interior_damage_detected THEN severity_score ELSE 0 END), 0),
    COALESCE(AVG(severity_score), 0),
    COALESCE(AVG(CASE WHEN insurance_strong_candidate THEN 80 ELSE 0 END), 0),
    COALESCE(AVG(CASE WHEN is_emergency THEN 90 ELSE severity_score END), 0)
  INTO 
    v_photos_count,
    v_max_severity,
    v_storm_score,
    v_leak_score,
    v_material_score,
    v_gutter_score,
    v_interior_score,
    v_overall_severity,
    v_insurance_prob,
    v_urgency_score
  FROM public.photo_intelligence
  WHERE contact_id = p_contact_id;
  
  -- Determine recommended action
  IF v_urgency_score >= 80 THEN
    v_recommended_action := 'offer_emergency_slot';
  ELSIF v_storm_score >= 60 THEN
    v_recommended_action := 'send_storm_inspection_message';
  ELSIF v_insurance_prob >= 60 THEN
    v_recommended_action := 'add_to_insurance_pipeline';
  ELSIF v_overall_severity >= 40 THEN
    v_recommended_action := 'offer_appointment_tomorrow';
  ELSE
    v_recommended_action := 'schedule_routine_inspection';
  END IF;
  
  -- Determine replacement recommendation
  IF v_overall_severity >= 80 THEN
    v_replacement_rec := 'full_replacement';
  ELSIF v_overall_severity >= 60 THEN
    v_replacement_rec := 'partial_replacement';
  ELSIF v_overall_severity >= 40 THEN
    v_replacement_rec := 'repair';
  ELSE
    v_replacement_rec := 'monitor';
  END IF;
  
  -- Upsert photo damage scores
  INSERT INTO public.photo_damage_scores (
    contact_id,
    workspace_id,
    storm_damage_score,
    leak_damage_score,
    material_condition_score,
    gutter_flashing_score,
    interior_damage_score,
    overall_severity_score,
    insurance_probability_score,
    repair_urgency_score,
    recommended_action,
    replacement_recommendation,
    photos_analyzed_count,
    last_calculated_at
  )
  VALUES (
    p_contact_id,
    v_workspace_id,
    v_storm_score,
    v_leak_score,
    v_material_score,
    v_gutter_score,
    v_interior_score,
    v_overall_severity,
    v_insurance_prob,
    v_urgency_score,
    v_recommended_action,
    v_replacement_rec,
    v_photos_count,
    now()
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    storm_damage_score = EXCLUDED.storm_damage_score,
    leak_damage_score = EXCLUDED.leak_damage_score,
    material_condition_score = EXCLUDED.material_condition_score,
    gutter_flashing_score = EXCLUDED.gutter_flashing_score,
    interior_damage_score = EXCLUDED.interior_damage_score,
    overall_severity_score = EXCLUDED.overall_severity_score,
    insurance_probability_score = EXCLUDED.insurance_probability_score,
    repair_urgency_score = EXCLUDED.repair_urgency_score,
    recommended_action = EXCLUDED.recommended_action,
    replacement_recommendation = EXCLUDED.replacement_recommendation,
    photos_analyzed_count = EXCLUDED.photos_analyzed_count,
    last_calculated_at = EXCLUDED.last_calculated_at,
    updated_at = now();
END;
$$;

-- ============================================================================
-- 8. TRIGGER TO AUTO-CALCULATE SEVERITY ON INSERT/UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_calculate_photo_severity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Calculate severity score
  PERFORM public.calculate_photo_severity_score(NEW.id);
  
  -- Calculate insurance indicators
  PERFORM public.calculate_insurance_indicators(NEW.id);
  
  -- Recalculate contact aggregate scores
  PERFORM public.calculate_contact_photo_scores(NEW.contact_id);
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_calculate_photo_severity ON public.photo_intelligence;
CREATE TRIGGER trg_auto_calculate_photo_severity
  AFTER INSERT OR UPDATE ON public.photo_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_calculate_photo_severity();

-- ============================================================================
-- 9. ENABLE RLS ON NEW TABLES
-- ============================================================================

ALTER TABLE public.photo_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_damage_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_material_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Workspace members can view/edit photo intelligence
CREATE POLICY "photo_intelligence_view_workspace_members" ON public.photo_intelligence
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "photo_intelligence_insert_workspace_members" ON public.photo_intelligence
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "photo_intelligence_update_workspace_members" ON public.photo_intelligence
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Similar policies for other tables
CREATE POLICY "photo_damage_scores_view_workspace_members" ON public.photo_damage_scores
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "photo_material_tags_view_workspace_members" ON public.photo_material_tags
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "photo_material_tags_insert_workspace_members" ON public.photo_material_tags
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "photo_events_view_workspace_members" ON public.photo_events
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "photo_events_insert_workspace_members" ON public.photo_events
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY "photo_intelligence_service_role_full_access" ON public.photo_intelligence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "photo_damage_scores_service_role_full_access" ON public.photo_damage_scores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "photo_material_tags_service_role_full_access" ON public.photo_material_tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "photo_events_service_role_full_access" ON public.photo_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 10. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.photo_intelligence IS 'Comprehensive photo analysis intelligence - detects storm damage, leaks, materials, conditions, and insurance indicators from homeowner photos';
COMMENT ON TABLE public.photo_damage_scores IS 'Aggregated damage scores per contact calculated from all analyzed photos';
COMMENT ON TABLE public.photo_material_tags IS 'Material and damage tags extracted from photo analysis';
COMMENT ON TABLE public.photo_events IS 'Event log for photo analysis activities and auto-generated actions';

COMMENT ON COLUMN public.photo_intelligence.severity_score IS 'Damage severity score 0-100: 80-100=Major, 60-79=Moderate, 40-59=Minor, 0-39=Cosmetic';
COMMENT ON COLUMN public.photo_intelligence.insurance_strong_candidate IS 'True if 2+ insurance indicators detected (hail bruising, shingle fractures, interior water damage, etc.)';
COMMENT ON COLUMN public.photo_damage_scores.recommended_action IS 'AI-recommended next action: offer_emergency_slot, send_storm_inspection_message, add_to_insurance_pipeline, offer_appointment_tomorrow';
COMMENT ON COLUMN public.photo_damage_scores.replacement_recommendation IS 'Recommended repair approach: repair, partial_replacement, full_replacement, monitor';





















































