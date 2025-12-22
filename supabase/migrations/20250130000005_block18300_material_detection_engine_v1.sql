-- =========================================================
-- Block 18300 — SmartSend Material Detection Engine v1
-- (Reading Homeowner Messages & Photos to Identify Roofing Materials, 
--  Pitch, Layers, Age & Compatibility for Replacement Quotes)
-- =========================================================

-- ============================================================================
-- 1. CREATE MATERIAL INTELLIGENCE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.material_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  
  -- Material Detection
  material_type text, -- 'asphalt_shingle', 'metal', 'tile', 'flat_tpo', 'flat_epdm', 'flat_mod_bit', 'slate', 'wood_shake', 'unknown'
  shingle_type text, -- '3_tab', 'architectural', 'premium', 'impact_resistant' (for asphalt)
  metal_type text, -- 'standing_seam', 'corrugated', 'ribbed_panel' (for metal)
  tile_type text, -- 'clay', 'concrete', 'slate_look' (for tile)
  flat_type text, -- 'tpo', 'epdm', 'modified_bitumen' (for flat)
  
  -- Roof Characteristics
  pitch_estimate text, -- 'low_slope', 'medium_slope', 'steep_slope', 'unknown'
  layer_count text, -- '1_layer', '2_layers', 'uncertain'
  roof_age_category text, -- '0_5_years', '6_15_years', '16_25_years', '25_plus_years', 'unknown'
  roof_color text, -- Detected color
  
  -- Components Detected
  has_skylights boolean DEFAULT false,
  has_chimney boolean DEFAULT false,
  has_box_vents boolean DEFAULT false,
  has_ridge_vents boolean DEFAULT false,
  has_pipe_boots boolean DEFAULT false,
  has_satellite_mounts boolean DEFAULT false,
  has_solar_panels boolean DEFAULT false,
  
  -- Condition Indicators
  granule_loss_detected boolean DEFAULT false,
  shingle_curl_detected boolean DEFAULT false,
  moss_buildup_detected boolean DEFAULT false,
  hail_impact_marks boolean DEFAULT false,
  wind_uplift_detected boolean DEFAULT false,
  
  -- Compatibility & Risk
  compatibility_flags text[], -- Array of compatibility issues: 'metal_low_pitch', 'tile_weak_framing', 'tpo_cold_climate', etc.
  storm_vulnerability text, -- 'low', 'medium', 'high', 'unknown'
  insurance_angle text, -- 'weak', 'moderate', 'strong', 'unknown'
  replacement_urgency text, -- 'low', 'medium', 'high', 'critical', 'unknown'
  
  -- Detection Sources & Confidence
  detected_from_text boolean DEFAULT false,
  detected_from_photo boolean DEFAULT false,
  text_confidence numeric(5,2) CHECK (text_confidence >= 0 AND text_confidence <= 100),
  photo_confidence numeric(5,2) CHECK (photo_confidence >= 0 AND photo_confidence <= 100),
  overall_confidence numeric(5,2) CHECK (overall_confidence >= 0 AND overall_confidence <= 100),
  
  -- Metadata
  detection_metadata jsonb DEFAULT '{}'::jsonb, -- Full detection details, clues found, reasoning
  last_analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Foreign keys
  CONSTRAINT material_intelligence_contact_fk FOREIGN KEY (contact_id) 
    REFERENCES public.contacts(id) ON DELETE CASCADE,
  CONSTRAINT material_intelligence_workspace_fk FOREIGN KEY (workspace_id) 
    REFERENCES public.workspaces(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_material_intelligence_contact 
  ON public.material_intelligence(contact_id);
CREATE INDEX IF NOT EXISTS idx_material_intelligence_workspace 
  ON public.material_intelligence(workspace_id);
CREATE INDEX IF NOT EXISTS idx_material_intelligence_material_type 
  ON public.material_intelligence(material_type) WHERE material_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_intelligence_pitch 
  ON public.material_intelligence(pitch_estimate) WHERE pitch_estimate IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_intelligence_urgency 
  ON public.material_intelligence(replacement_urgency) WHERE replacement_urgency IS NOT NULL;

-- ============================================================================
-- 2. CREATE MATERIAL TAGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.material_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  tag text NOT NULL, -- e.g., 'asphalt_shingle', 'architectural', 'skylight', 'hail_damage'
  tag_category text, -- 'material', 'component', 'condition', 'damage', 'feature'
  source text, -- 'text_analysis', 'photo_analysis', 'manual', 'inferred'
  confidence numeric(5,2) CHECK (confidence >= 0 AND confidence <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT material_tags_contact_fk FOREIGN KEY (contact_id) 
    REFERENCES public.contacts(id) ON DELETE CASCADE,
  CONSTRAINT material_tags_workspace_fk FOREIGN KEY (workspace_id) 
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Unique constraint: one tag per contact per tag name
  UNIQUE(contact_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_material_tags_contact 
  ON public.material_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_material_tags_workspace 
  ON public.material_tags(workspace_id);
CREATE INDEX IF NOT EXISTS idx_material_tags_tag 
  ON public.material_tags(tag);
CREATE INDEX IF NOT EXISTS idx_material_tags_category 
  ON public.material_tags(tag_category) WHERE tag_category IS NOT NULL;

-- ============================================================================
-- 3. CREATE MATERIAL SCORES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.material_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  
  -- Scoring Categories
  material_detection_score numeric(5,2) DEFAULT 0 CHECK (material_detection_score >= 0 AND material_detection_score <= 100),
  pitch_detection_score numeric(5,2) DEFAULT 0 CHECK (pitch_detection_score >= 0 AND pitch_detection_score <= 100),
  layer_detection_score numeric(5,2) DEFAULT 0 CHECK (layer_detection_score >= 0 AND layer_detection_score <= 100),
  age_estimation_score numeric(5,2) DEFAULT 0 CHECK (age_estimation_score >= 0 AND age_estimation_score <= 100),
  component_detection_score numeric(5,2) DEFAULT 0 CHECK (component_detection_score >= 0 AND component_detection_score <= 100),
  
  -- Overall Score
  overall_score numeric(5,2) DEFAULT 0 CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- Metadata
  scoring_metadata jsonb DEFAULT '{}'::jsonb,
  last_scored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT material_scores_contact_fk FOREIGN KEY (contact_id) 
    REFERENCES public.contacts(id) ON DELETE CASCADE,
  CONSTRAINT material_scores_workspace_fk FOREIGN KEY (workspace_id) 
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- One score record per contact
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_material_scores_contact 
  ON public.material_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_material_scores_workspace 
  ON public.material_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_material_scores_overall 
  ON public.material_scores(overall_score DESC);

-- ============================================================================
-- 4. CREATE MATERIAL PHOTOS TABLE (Links photos to material detection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.material_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  attachment_id uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  photo_analysis_id uuid REFERENCES public.photo_analysis(id) ON DELETE SET NULL,
  
  -- Material Detection from Photo
  detected_material_type text,
  detected_shingle_pattern text, -- Pattern description
  detected_metal_seam_spacing text, -- For metal roofs
  detected_tile_shape text, -- For tile roofs
  detected_membrane_color text, -- For flat roofs
  
  -- Penetrations Detected
  penetrations_detected text[], -- ['pipe', 'vent', 'skylight', 'chimney', 'satellite']
  
  -- Condition Indicators from Photo
  moss_buildup_detected boolean DEFAULT false,
  granule_loss_detected boolean DEFAULT false,
  hail_impact_marks boolean DEFAULT false,
  wind_uplift_detected boolean DEFAULT false,
  
  -- Photo Analysis Metadata
  photo_analysis_metadata jsonb DEFAULT '{}'::jsonb,
  analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT material_photos_contact_fk FOREIGN KEY (contact_id) 
    REFERENCES public.contacts(id) ON DELETE CASCADE,
  CONSTRAINT material_photos_workspace_fk FOREIGN KEY (workspace_id) 
    REFERENCES public.workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_material_photos_contact 
  ON public.material_photos(contact_id);
CREATE INDEX IF NOT EXISTS idx_material_photos_attachment 
  ON public.material_photos(attachment_id) WHERE attachment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_photos_workspace 
  ON public.material_photos(workspace_id);

-- ============================================================================
-- 5. FUNCTION TO UPDATE OVERALL CONFIDENCE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_material_overall_confidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Calculate overall confidence from text and photo confidence
  IF NEW.text_confidence IS NOT NULL AND NEW.photo_confidence IS NOT NULL THEN
    NEW.overall_confidence := (NEW.text_confidence + NEW.photo_confidence) / 2;
  ELSIF NEW.text_confidence IS NOT NULL THEN
    NEW.overall_confidence := NEW.text_confidence;
  ELSIF NEW.photo_confidence IS NOT NULL THEN
    NEW.overall_confidence := NEW.photo_confidence;
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_material_overall_confidence ON public.material_intelligence;
CREATE TRIGGER trg_update_material_overall_confidence
  BEFORE INSERT OR UPDATE ON public.material_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_material_overall_confidence();

-- ============================================================================
-- 6. FUNCTION TO AUTO-UPDATE MATERIAL TAGS FROM INTELLIGENCE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_material_tags_from_intelligence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Clear existing auto-generated tags
  DELETE FROM public.material_tags 
  WHERE contact_id = NEW.contact_id 
    AND source IN ('text_analysis', 'photo_analysis', 'inferred');
  
  -- Add material type tag
  IF NEW.material_type IS NOT NULL THEN
    INSERT INTO public.material_tags (contact_id, workspace_id, tag, tag_category, source, confidence)
    VALUES (NEW.contact_id, NEW.workspace_id, NEW.material_type, 'material', 'inferred', NEW.overall_confidence)
    ON CONFLICT (contact_id, tag) DO UPDATE SET confidence = NEW.overall_confidence;
  END IF;
  
  -- Add shingle type tag
  IF NEW.shingle_type IS NOT NULL THEN
    INSERT INTO public.material_tags (contact_id, workspace_id, tag, tag_category, source, confidence)
    VALUES (NEW.contact_id, NEW.workspace_id, NEW.shingle_type, 'material', 'inferred', NEW.overall_confidence)
    ON CONFLICT (contact_id, tag) DO UPDATE SET confidence = NEW.overall_confidence;
  END IF;
  
  -- Add component tags
  IF NEW.has_skylights THEN
    INSERT INTO public.material_tags (contact_id, workspace_id, tag, tag_category, source, confidence)
    VALUES (NEW.contact_id, NEW.workspace_id, 'skylight', 'component', 'inferred', NEW.overall_confidence)
    ON CONFLICT (contact_id, tag) DO UPDATE SET confidence = NEW.overall_confidence;
  END IF;
  
  IF NEW.has_chimney THEN
    INSERT INTO public.material_tags (contact_id, workspace_id, tag, tag_category, source, confidence)
    VALUES (NEW.contact_id, NEW.workspace_id, 'chimney', 'component', 'inferred', NEW.overall_confidence)
    ON CONFLICT (contact_id, tag) DO UPDATE SET confidence = NEW.overall_confidence;
  END IF;
  
  -- Add condition tags
  IF NEW.granule_loss_detected THEN
    INSERT INTO public.material_tags (contact_id, workspace_id, tag, tag_category, source, confidence)
    VALUES (NEW.contact_id, NEW.workspace_id, 'granule_loss', 'condition', 'inferred', NEW.overall_confidence)
    ON CONFLICT (contact_id, tag) DO UPDATE SET confidence = NEW.overall_confidence;
  END IF;
  
  IF NEW.hail_impact_marks THEN
    INSERT INTO public.material_tags (contact_id, workspace_id, tag, tag_category, source, confidence)
    VALUES (NEW.contact_id, NEW.workspace_id, 'hail_damage', 'damage', 'inferred', NEW.overall_confidence)
    ON CONFLICT (contact_id, tag) DO UPDATE SET confidence = NEW.overall_confidence;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_material_tags_from_intelligence ON public.material_intelligence;
CREATE TRIGGER trg_sync_material_tags_from_intelligence
  AFTER INSERT OR UPDATE ON public.material_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_material_tags_from_intelligence();

-- ============================================================================
-- 7. FUNCTION TO CALCULATE MATERIAL SCORES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_material_scores(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_intelligence record;
  v_scores record;
BEGIN
  -- Get material intelligence
  SELECT * INTO v_intelligence
  FROM public.material_intelligence
  WHERE contact_id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate scores based on available data
  INSERT INTO public.material_scores (
    contact_id,
    workspace_id,
    material_detection_score,
    pitch_detection_score,
    layer_detection_score,
    age_estimation_score,
    component_detection_score,
    overall_score,
    last_scored_at
  )
  VALUES (
    p_contact_id,
    v_intelligence.workspace_id,
    COALESCE(v_intelligence.overall_confidence, 0),
    CASE WHEN v_intelligence.pitch_estimate IS NOT NULL THEN 80 ELSE 0 END,
    CASE WHEN v_intelligence.layer_count IS NOT NULL AND v_intelligence.layer_count != 'uncertain' THEN 70 ELSE 0 END,
    CASE WHEN v_intelligence.roof_age_category IS NOT NULL AND v_intelligence.roof_age_category != 'unknown' THEN 75 ELSE 0 END,
    CASE WHEN v_intelligence.has_skylights OR v_intelligence.has_chimney OR v_intelligence.has_box_vents THEN 60 ELSE 0 END,
    COALESCE(v_intelligence.overall_confidence, 0),
    now()
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    material_detection_score = EXCLUDED.material_detection_score,
    pitch_detection_score = EXCLUDED.pitch_detection_score,
    layer_detection_score = EXCLUDED.layer_detection_score,
    age_estimation_score = EXCLUDED.age_estimation_score,
    component_detection_score = EXCLUDED.component_detection_score,
    overall_score = EXCLUDED.overall_score,
    last_scored_at = EXCLUDED.last_scored_at,
    updated_at = now();
END;
$$;

-- ============================================================================
-- 8. ENABLE RLS ON NEW TABLES
-- ============================================================================

ALTER TABLE public.material_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can view/edit material intelligence for contacts in their workspace
CREATE POLICY "material_intelligence_view_workspace_members" ON public.material_intelligence
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "material_intelligence_insert_workspace_members" ON public.material_intelligence
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "material_intelligence_update_workspace_members" ON public.material_intelligence
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Similar policies for other tables
CREATE POLICY "material_tags_view_workspace_members" ON public.material_tags
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "material_tags_insert_workspace_members" ON public.material_tags
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "material_scores_view_workspace_members" ON public.material_scores
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "material_photos_view_workspace_members" ON public.material_photos
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Service role can do everything
CREATE POLICY "material_intelligence_service_role_full_access" ON public.material_intelligence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "material_tags_service_role_full_access" ON public.material_tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "material_scores_service_role_full_access" ON public.material_scores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "material_photos_service_role_full_access" ON public.material_photos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 9. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.material_intelligence IS 'Comprehensive material detection intelligence for contacts - detects roofing materials, pitch, layers, age, components, and compatibility from text and photos';
COMMENT ON TABLE public.material_tags IS 'Material-related tags extracted from detection analysis - material types, components, conditions, damage';
COMMENT ON TABLE public.material_scores IS 'Scoring metrics for material detection quality and completeness';
COMMENT ON TABLE public.material_photos IS 'Photo-specific material detection results linking attachments to material intelligence';

COMMENT ON COLUMN public.material_intelligence.material_type IS 'Primary roofing material: asphalt_shingle, metal, tile, flat_tpo, flat_epdm, flat_mod_bit, slate, wood_shake, unknown';
COMMENT ON COLUMN public.material_intelligence.pitch_estimate IS 'Roof pitch category: low_slope, medium_slope, steep_slope, unknown';
COMMENT ON COLUMN public.material_intelligence.layer_count IS 'Number of roof layers: 1_layer, 2_layers, uncertain';
COMMENT ON COLUMN public.material_intelligence.roof_age_category IS 'Estimated roof age: 0_5_years, 6_15_years, 16_25_years, 25_plus_years, unknown';
COMMENT ON COLUMN public.material_intelligence.compatibility_flags IS 'Array of compatibility issues detected: metal_low_pitch, tile_weak_framing, tpo_cold_climate, etc.';
COMMENT ON COLUMN public.material_intelligence.storm_vulnerability IS 'Storm vulnerability assessment: low, medium, high, unknown';
COMMENT ON COLUMN public.material_intelligence.insurance_angle IS 'Insurance claim potential: weak, moderate, strong, unknown';
COMMENT ON COLUMN public.material_intelligence.replacement_urgency IS 'Replacement urgency: low, medium, high, critical, unknown';





















































