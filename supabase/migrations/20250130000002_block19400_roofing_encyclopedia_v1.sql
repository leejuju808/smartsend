-- =========================================================
-- Block 19400 — SmartSend Roofing Encyclopedia v1
-- (The Roofing Knowledge Graph: Full Database of Terms, Damage Types,
--  Components, Materials, Insurance Terms, Storm Indicators & Sales Definitions)
-- =========================================================

-- ============================================================================
-- 1. ROOFING ENCYCLOPEDIA (Main Table)
-- ============================================================================
-- Central knowledge base for all roofing terminology

CREATE TABLE IF NOT EXISTS public.roofing_encyclopedia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core Identification
  term text NOT NULL, -- e.g., "ridge cap", "wind uplift", "RCV"
  category text NOT NULL CHECK (category IN (
    'component', 'material', 'damage_type', 'storm_indicator', 
    'insurance_term', 'sales_term', 'general'
  )),
  subcategory text, -- e.g., "flashing" for components, "asphalt" for materials
  
  -- Definition & Description
  definition text NOT NULL, -- Full definition
  short_description text, -- Brief 1-2 sentence description
  technical_details jsonb DEFAULT '{}'::jsonb, -- Technical specifications
  
  -- Relationships & Mappings
  related_terms jsonb DEFAULT '[]'::jsonb, -- Array of related term IDs
  synonyms jsonb DEFAULT '[]'::jsonb, -- Alternative names/spellings
  homeowner_phrases jsonb DEFAULT '[]'::jsonb, -- How homeowners describe this
  
  -- Usage Context1 Context
  usage_context text, -- When/where this term is used
  common_misconceptions jsonb DEFAULT '[]'::jsonb, -- Common misunderstandings
  
  -- Metadata
  importance_level text CHECK (importance_level IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_encyclopedia_term 
  ON public.roofing_encyclopedia USING gin(to_tsvector('english', term));
CREATE INDEX IF NOT EXISTS idx_roofing_encyclopedia_category 
  ON public.roofing_encyclopedia(category);
CREATE INDEX IF NOT EXISTS idx_roofing_encyclopedia_subcategory 
  ON public.roofing_encyclopedia(subcategory);

-- ============================================================================
-- 2. COMPONENTS TABLE
-- ============================================================================
-- Roofing components (ridge cap, valleys, flashing, etc.)

CREATE TABLE IF NOT EXISTS public.roofing_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encyclopedia_id uuid REFERENCES public.roofing_encyclopedia(id) ON DELETE SET NULL,
  
  -- Component Info
  component_name text NOT NULL UNIQUE, -- e.g., "ridge cap", "valley"
  component_type text NOT NULL CHECK (component_type IN (
    'ridge_cap', 'valley', 'drip_edge', 'eave', 'soffit', 'fascia',
    'flashing', 'pipe_boot', 'dormer', 'skylight', 'chimney', 
    'ice_water_shield', 'decking', 'underlayment', 'starter_strip',
    'hip_ridge_vent', 'box_vent', 'turbine_vent', 'gutter', 'downspout'
  )),
  
  -- Description
  description text NOT NULL,
  function_description text, -- What it does
  location_description text, -- Where it's located
  
  -- Common Failures
  common_failures jsonb DEFAULT '[]'::jsonb, -- Array of failure types
  failure_symptoms jsonb DEFAULT '[]'::jsonb, -- What to look for
  
  -- Inspection Points
  inspection_points jsonb DEFAULT '[]'::jsonb, -- What to check during inspection
  photo_angles jsonb DEFAULT '[]'::jsonb, -- Recommended photo angles
  
  -- Repair Info
  typical_repair_cost jsonb DEFAULT '{"min": null, "max": null}'::jsonb,
  typical_replacement_cost jsonb DEFAULT '{"min": null, "max": null}'::jsonb,
  repair_urgency text CHECK (repair_urgency IN ('emergency', 'high', 'medium', 'low')) DEFAULT 'medium',
  
  -- Material Compatibility
  compatible_materials jsonb DEFAULT '[]'::jsonb, -- Materials this component works with
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_components_name 
  ON public.roofing_components USING gin(to_tsvector('english', component_name));
CREATE INDEX IF NOT EXISTS idx_roofing_components_type 
  ON public.roofing_components(component_type);

-- ============================================================================
-- 3. MATERIALS TABLE
-- ============================================================================
-- Roofing materials (shingles, metal, tile, etc.)

CREATE TABLE IF NOT EXISTS public.roofing_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encyclopedia_id uuid REFERENCES public.roofing_encyclopedia(id) ON DELETE SET NULL,
  
  -- Material Info
  material_name text NOT NULL UNIQUE, -- e.g., "architectural shingles"
  material_type text NOT NULL CHECK (material_type IN (
    'asphalt_shingle', 'metal', 'tile', 'slate', 'wood_shake', 
    'tpo', 'epdm', 'torch_down', 'pvc', 'tar_gravel', 'modified_bitumen'
  )),
  shingle_type text CHECK (shingle_type IN ('3_tab', 'architectural', 'premium', 'impact_resistant')),
  metal_type text CHECK (metal_type IN ('standing_seam', 'r_panel', 'corrugated', 'ribbed')),
  tile_type text CHECK (tile_type IN ('clay', 'concrete', 'slate_look')),
  flat_type text CHECK (flat_type IN ('tpo', 'epdm', 'modified_bitumen', 'pvc', 'torch_down')),
  
  -- Specifications
  expected_lifespan_years integer, -- Typical lifespan
  typical_cost_per_sq jsonb DEFAULT '{"min": null, "max": null}'::jsonb,
  pitch_constraints jsonb DEFAULT '{"min_pitch": null, "max_pitch": null}'::jsonb,
  
  -- Storm Vulnerability
  storm_vulnerability text CHECK (storm_vulnerability IN ('high', 'medium', 'low')) DEFAULT 'medium',
  hail_resistance text CHECK (hail_resistance IN ('high', 'medium', 'low', 'none')) DEFAULT 'medium',
  wind_resistance text CHECK (wind_resistance IN ('high', 'medium', 'low')) DEFAULT 'medium',
  
  -- Detection & Inspection
  visual_characteristics jsonb DEFAULT '[]'::jsonb, -- How to identify it
  common_damage_types jsonb DEFAULT '[]'::jsonb, -- What damages it commonly
  inspect_points jsonb DEFAULT '[]'::jsonb, -- What to check
  
  -- Insurance & Code
  insurance_approval_likelihood text CHECK (insurance_approval_likelihood IN ('high', 'medium', 'low')) DEFAULT 'medium',
  code_requirements jsonb DEFAULT '[]'::jsonb, -- Code requirements for this material
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_materials_name 
  ON public.roofing_materials USING gin(to_tsvector('english', material_name));
CREATE INDEX IF NOT EXISTS idx_roofing_materials_type 
  ON public.roofing_materials(material_type);

-- ============================================================================
-- 4. DAMAGE TYPES TABLE
-- ============================================================================
-- Types of roof damage

CREATE TABLE IF NOT EXISTS public.roofing_damage_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encyclopedia_id uuid REFERENCES public.roofing_encyclopedia(id) ON DELETE SET NULL,
  
  -- Damage Info
  damage_name text NOT NULL UNIQUE, -- e.g., "wind uplift", "hail bruising"
  damage_type text NOT NULL CHECK (damage_type IN (
    'wind', 'hail', 'thermal', 'water', 'structural', 'wear_tear', 
    'installation_defect', 'manufacturer_defect', 'other'
  )),
  
  -- Description
  description text NOT NULL,
  visual_description text, -- What it looks like
  causes jsonb DEFAULT '[]'::jsonb, -- What causes this damage
  
  -- Insurance Mapping
  insurance_claim_category text CHECK (insurance_claim_category IN (
    'storm', 'wear_tear', 'manufacturer_defect', 'improper_installation', 
    'aging', 'emergency_leak', 'other'
  )),
  insurance_approval_probability text CHECK (insurance_approval_probability IN ('high', 'medium', 'low')) DEFAULT 'medium',
  
  -- Detection & Documentation
  recommended_photo_angles jsonb DEFAULT '[]'::jsonb, -- Best photo angles
  detection_methods jsonb DEFAULT '[]'::jsonb, -- How to detect it
  
  -- Cost & Action
  repair_cost_range jsonb DEFAULT '{"min": null, "max": null}'::jsonb,
  replacement_cost_range jsonb DEFAULT '{"min": null, "max": null}'::jsonb,
  urgency_level text CHECK (urgency_level IN ('emergency', 'high', 'medium', 'low')) DEFAULT 'medium',
  
  -- Supplement Potential
  supplement_potential text CHECK (supplement_potential IN ('high', 'medium', 'low', 'none')) DEFAULT 'low',
  code_requirements jsonb DEFAULT '[]'::jsonb, -- Code items that may apply
  
  -- Next Steps
  recommended_action text,
  next_step_messaging jsonb DEFAULT '[]'::jsonb, -- Suggested messaging
  
  -- Material Specificity
  affects_materials jsonb DEFAULT '[]'::jsonb, -- Which materials this affects
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_damage_types_name 
  ON public.roofing_damage_types USING gin(to_tsvector('english', damage_name));
CREATE INDEX IF NOT EXISTS idx_roofing_damage_types_type 
  ON public.roofing_damage_types(damage_type);
CREATE INDEX IF NOT EXISTS idx_roofing_damage_types_insurance 
  ON public.roofing_damage_types(insurance_claim_category);

-- ============================================================================
-- 5. STORM INDICATORS TABLE
-- ============================================================================
-- Storm-related indicators and measurements

CREATE TABLE IF NOT EXISTS public.roofing_storm_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encyclopedia_id uuid REFERENCES public.roofing_encyclopedia(id) ON DELETE SET NULL,
  
  -- Indicator Info
  indicator_name text NOT NULL UNIQUE, -- e.g., "hail size", "wind speed"
  indicator_type text NOT NULL CHECK (indicator_type IN (
    'hail_size', 'wind_speed', 'storm_direction', 'claim_density',
    'impact_marks', 'metal_denting', 'granule_displacement',
    'wind_pressure', 'debris_pattern', 'other'
  )),
  
  -- Description
  description text NOT NULL,
  measurement_units text, -- e.g., "inches", "mph", "direction"
  
  -- Values & Thresholds
  value_ranges jsonb DEFAULT '[]'::jsonb, -- Array of value ranges with meanings
  severity_mapping jsonb DEFAULT '{}'::jsonb, -- Map values to severity
  
  -- Detection
  detection_method text, -- How to detect/measure this
  visual_indicators jsonb DEFAULT '[]'::jsonb, -- What to look for
  
  -- Insurance Impact
  insurance_significance text, -- How this affects insurance claims
  claim_approval_correlation text CHECK (claim_approval_correlation IN ('high', 'medium', 'low')) DEFAULT 'medium',
  
  -- Documentation
  documentation_requirements jsonb DEFAULT '[]'::jsonb, -- What to document
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_storm_indicators_name 
  ON public.roofing_storm_indicators USING gin(to_tsvector('english', indicator_name));
CREATE INDEX IF NOT EXISTS idx_roofing_storm_indicators_type 
  ON public.roofing_storm_indicators(indicator_type);

-- ============================================================================
-- 6. INSURANCE TERMS TABLE
-- ============================================================================
-- Insurance terminology and definitions

CREATE TABLE IF NOT EXISTS public.roofing_insurance_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encyclopedia_id uuid REFERENCES public.roofing_encyclopedia(id) ON DELETE SET NULL,
  
  -- Term Info
  term_name text NOT NULL UNIQUE, -- e.g., "RCV", "ACV", "deductible"
  term_type text NOT NULL CHECK (term_type IN (
    'coverage_type', 'payment_type', 'claim_status', 'denial_reason',
    'adjuster_term', 'code_item', 'matching_rule', 'coverage_form', 'other'
  )),
  
  -- Definition
  definition text NOT NULL,
  detailed_explanation text, -- Full explanation
  homeowner_friendly_explanation text, -- How to explain to homeowners
  
  -- Legal & Compliance
  legal_status text CHECK (legal_status IN ('legal', 'illegal', 'varies_by_state', 'regulated')) DEFAULT 'legal',
  state_specific_rules jsonb DEFAULT '{}'::jsonb, -- State-by-state variations
  
  -- Usage Context
  when_used text, -- When this term appears
  common_misunderstandings jsonb DEFAULT '[]'::jsonb,
  
  -- Related Terms
  related_insurance_terms jsonb DEFAULT '[]'::jsonb,
  
  -- Messaging Guidance
  messaging_guidance text, -- How to use this term in messaging
  avoid_phrases jsonb DEFAULT '[]'::jsonb, -- Phrases to avoid
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_insurance_terms_name 
  ON public.roofing_insurance_terms USING gin(to_tsvector('english', term_name));
CREATE INDEX IF NOT EXISTS idx_roofing_insurance_terms_type 
  ON public.roofing_insurance_terms(term_type);
CREATE INDEX IF NOT EXISTS idx_roofing_insurance_terms_legal 
  ON public.roofing_insurance_terms(legal_status);

-- ============================================================================
-- 7. SALES TERMS TABLE
-- ============================================================================
-- Sales and process terminology

CREATE TABLE IF NOT EXISTS public.roofing_sales_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encyclopedia_id uuid REFERENCES public.roofing_encyclopedia(id) ON DELETE SET NULL,
  
  -- Term Info
  term_name text NOT NULL UNIQUE, -- e.g., "emergency appointment", "re-deck"
  term_type text NOT NULL CHECK (term_type IN (
    'inspection_type', 'appointment_type', 'sales_type', 'financing_option',
    'upsell', 'process_step', 'warranty', 'crew_staging', 'delivery', 'other'
  )),
  
  -- Definition
  definition text NOT NULL,
  context_description text, -- When/where this is used
  
  -- Sales Scripts
  script_templates jsonb DEFAULT '[]'::jsonb, -- Template scripts
  talking_points jsonb DEFAULT '[]'::jsonb, -- Key talking points
  
  -- Process Integration
  process_step_order integer, -- Where this fits in the process
  prerequisites jsonb DEFAULT '[]'::jsonb, -- What needs to happen first
  next_steps jsonb DEFAULT '[]'::jsonb, -- What comes next
  
  -- Value & Pricing
  typical_value_range jsonb DEFAULT '{"min": null, "max": null}'::jsonb,
  pricing_guidance text,
  
  -- Appointment Prep
  appointment_prep_checklist jsonb DEFAULT '[]'::jsonb, -- What to prepare
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_sales_terms_name 
  ON public.roofing_sales_terms USING gin(to_tsvector('english', term_name));
CREATE INDEX IF NOT EXISTS idx_roofing_sales_terms_type 
  ON public.roofing_sales_terms(term_type);

-- ============================================================================
-- 8. COMPONENT FAILURE MAPPINGS
-- ============================================================================
-- Maps components to their common failures

CREATE TABLE IF NOT EXISTS public.component_failure_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES public.roofing_components(id) ON DELETE CASCADE,
  damage_type_id uuid NOT NULL REFERENCES public.roofing_damage_types(id) ON DELETE CASCADE,
  
  -- Relationship Details
  frequency text CHECK (frequency IN ('very_common', 'common', 'occasional', 'rare')) DEFAULT 'common',
  severity_when_occurs text CHECK (severity_when_occurs IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  
  -- Detection
  detection_tips text,
  visual_indicators jsonb DEFAULT '[]'::jsonb,
  
  -- Repair Info
  typical_repair_approach text,
  repair_complexity text CHECK (repair_complexity IN ('simple', 'moderate', 'complex')) DEFAULT 'moderate',
  
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(component_id, damage_type_id)
);

CREATE INDEX IF NOT EXISTS idx_component_failure_mappings_component 
  ON public.component_failure_mappings(component_id);
CREATE INDEX IF NOT EXISTS idx_component_failure_mappings_damage 
  ON public.component_failure_mappings(damage_type_id);

-- ============================================================================
-- 9. MATERIAL DAMAGE MAPPINGS
-- ============================================================================
-- Maps materials to their common damage types

CREATE TABLE IF NOT EXISTS public.material_damage_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.roofing_materials(id) ON DELETE CASCADE,
  damage_type_id uuid NOT NULL REFERENCES public.roofing_damage_types(id) ON DELETE CASCADE,
  
  -- Relationship Details
  vulnerability_level text CHECK (vulnerability_level IN ('high', 'medium', 'low')) DEFAULT 'medium',
  typical_severity text CHECK (typical_severity IN ('severe', 'moderate', 'minor')) DEFAULT 'moderate',
  
  -- Detection
  detection_ease text CHECK (detection_ease IN ('easy', 'moderate', 'difficult')) DEFAULT 'moderate',
  detection_methods jsonb DEFAULT '[]'::jsonb,
  
  -- Repair/Replacement
  repair_feasibility text CHECK (repair_feasibility IN ('feasible', 'partial', 'replacement_required')) DEFAULT 'feasible',
  replacement_likelihood text CHECK (replacement_likelihood IN ('high', 'medium', 'low')) DEFAULT 'medium',
  
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(material_id, damage_type_id)
);

CREATE INDEX IF NOT EXISTS idx_material_damage_mappings_material 
  ON public.material_damage_mappings(material_id);
CREATE INDEX IF NOT EXISTS idx_material_damage_mappings_damage 
  ON public.material_damage_mappings(damage_type_id);

-- ============================================================================
-- 10. RLS POLICIES
-- ============================================================================

ALTER TABLE public.roofing_encyclopedia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_damage_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_storm_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_insurance_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_sales_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.component_failure_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_damage_mappings ENABLE ROW LEVEL SECURITY;

-- All encyclopedia tables are read-only for authenticated users (public knowledge base)
-- Service role can manage all

CREATE POLICY "Anyone authenticated can read encyclopedia"
  ON public.roofing_encyclopedia FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage encyclopedia"
  ON public.roofing_encyclopedia FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone authenticated can read components"
  ON public.roofing_components FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage components"
  ON public.roofing_components FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone authenticated can read materials"
  ON public.roofing_materials FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage materials"
  ON public.roofing_materials FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone authenticated can read damage types"
  ON public.roofing_damage_types FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage damage types"
  ON public.roofing_damage_types FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone authenticated can read storm indicators"
  ON public.roofing_storm_indicators FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage storm indicators"
  ON public.roofing_storm_indicators FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone authenticated can read insurance terms"
  ON public.roofing_insurance_terms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage insurance terms"
  ON public.roofing_insurance_terms FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone authenticated can read sales terms"
  ON public.roofing_sales_terms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage sales terms"
  ON public.roofing_sales_terms FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone authenticated can read component failure mappings"
  ON public.component_failure_mappings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage component failure mappings"
  ON public.component_failure_mappings FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone authenticated can read material damage mappings"
  ON public.material_damage_mappings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage material damage mappings"
  ON public.material_damage_mappings FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 11. FUNCTIONS
-- ============================================================================

-- Function to search encyclopedia
CREATE OR REPLACE FUNCTION public.search_roofing_encyclopedia(
  p_query text,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  term text,
  category text,
  definition text,
  short_description text,
  match_type text,
  match_score numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.term,
    e.category,
    e.definition,
    e.short_description,
    CASE
      WHEN lower(e.term) = lower(p_query) THEN 'exact'
      WHEN lower(e.term) LIKE lower(p_query) || '%' THEN 'prefix'
      WHEN lower(e.term) LIKE '%' || lower(p_query) || '%' THEN 'contains'
      ELSE 'related'
    END as match_type,
    CASE
      WHEN lower(e.term) = lower(p_query) THEN 100.0
      WHEN lower(e.term) LIKE lower(p_query) || '%' THEN 80.0
      WHEN lower(e.term) LIKE '%' || lower(p_query) || '%' THEN 60.0
      ELSE similarity(e.term, p_query) * 100
    END as match_score
  FROM public.roofing_encyclopedia e
  WHERE 
    (p_category IS NULL OR e.category = p_category)
    AND (
      lower(e.term) LIKE '%' || lower(p_query) || '%'
      OR lower(e.definition) LIKE '%' || lower(p_query) || '%'
      OR e.term % p_query -- Trigram similarity
    )
  ORDER BY match_score DESC, e.term
  LIMIT p_limit;
END;
$$;

-- Function to match term (fuzzy matching)
CREATE OR REPLACE FUNCTION public.match_roofing_term(
  p_input_text text,
  p_category text DEFAULT NULL
)
RETURNS TABLE (
  term_id uuid,
  term text,
  category text,
  match_confidence numeric,
  source text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as term_id,
    e.term,
    e.category,
    GREATEST(
      similarity(e.term, p_input_text) * 100,
      CASE WHEN lower(e.term) = lower(p_input_text) THEN 100.0 ELSE 0.0 END
    ) as match_confidence,
    'encyclopedia' as source
  FROM public.roofing_encyclopedia e
  WHERE 
    (p_category IS NULL OR e.category = p_category)
    AND (
      e.term % p_input_text
      OR lower(e.term) LIKE '%' || lower(p_input_text) || '%'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(e.synonyms) s
        WHERE lower(s) LIKE '%' || lower(p_input_text) || '%'
      )
    )
  ORDER BY match_confidence DESC
  LIMIT 5;
END;
$$;

-- Function to get knowledge graph (related terms)
CREATE OR REPLACE FUNCTION public.get_roofing_knowledge_graph(
  p_term_id uuid,
  p_depth integer DEFAULT 2
)
RETURNS TABLE (
  term_id uuid,
  term text,
  category text,
  relationship_type text,
  depth integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Simplified version: get related terms from the encyclopedia entry
  RETURN QUERY
  WITH RECURSIVE graph AS (
    -- Base case: the starting term
    SELECT 
      e.id as term_id,
      e.term,
      e.category,
      'self'::text as relationship_type,
      0 as depth,
      e.related_terms
    FROM public.roofing_encyclopedia e
    WHERE e.id = p_term_id
    
    UNION ALL
    
    -- Recursive case: related terms
    SELECT 
      e2.id as term_id,
      e2.term,
      e2.category,
      'related'::text as relationship_type,
      g.depth + 1,
      e2.related_terms
    FROM graph g
    CROSS JOIN LATERAL jsonb_array_elements_text(g.related_terms) AS related_id
    JOIN public.roofing_encyclopedia e2 ON e2.id::text = related_id
    WHERE g.depth < p_depth
  )
  SELECT DISTINCT 
    g.term_id,
    g.term,
    g.category,
    g.relationship_type,
    g.depth
  FROM graph g
  ORDER BY g.depth, g.term;
END;
$$;

-- ============================================================================
-- 12. TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_roofing_encyclopedia_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_roofing_encyclopedia_updated_at
  BEFORE UPDATE ON public.roofing_encyclopedia
  FOR EACH ROW
  EXECUTE FUNCTION public.update_roofing_encyclopedia_updated_at();

-- Create separate trigger functions for each table
CREATE OR REPLACE FUNCTION public.update_roofing_components_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_roofing_materials_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_roofing_damage_types_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_roofing_storm_indicators_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_roofing_insurance_terms_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_roofing_sales_terms_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_roofing_components_updated_at
  BEFORE UPDATE ON public.roofing_components
  FOR EACH ROW
  EXECUTE FUNCTION public.update_roofing_components_updated_at();

CREATE TRIGGER trg_update_roofing_materials_updated_at
  BEFORE UPDATE ON public.roofing_materials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_roofing_materials_updated_at();

CREATE TRIGGER trg_update_roofing_damage_types_updated_at
  BEFORE UPDATE ON public.roofing_damage_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_roofing_damage_types_updated_at();

CREATE TRIGGER trg_update_roofing_storm_indicators_updated_at
  BEFORE UPDATE ON public.roofing_storm_indicators
  FOR EACH ROW
  EXECUTE FUNCTION public.update_roofing_storm_indicators_updated_at();

CREATE TRIGGER trg_update_roofing_insurance_terms_updated_at
  BEFORE UPDATE ON public.roofing_insurance_terms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_roofing_insurance_terms_updated_at();

CREATE TRIGGER trg_update_roofing_sales_terms_updated_at
  BEFORE UPDATE ON public.roofing_sales_terms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_roofing_sales_terms_updated_at();

-- ============================================================================
-- 13. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roofing_encyclopedia IS 'Central knowledge base for all roofing terminology';
COMMENT ON TABLE public.roofing_components IS 'Roofing components (ridge cap, valleys, flashing, etc.)';
COMMENT ON TABLE public.roofing_materials IS 'Roofing materials (shingles, metal, tile, etc.)';
COMMENT ON TABLE public.roofing_damage_types IS 'Types of roof damage';
COMMENT ON TABLE public.roofing_storm_indicators IS 'Storm-related indicators and measurements';
COMMENT ON TABLE public.roofing_insurance_terms IS 'Insurance terminology and definitions';
COMMENT ON TABLE public.roofing_sales_terms IS 'Sales and process terminology';
COMMENT ON TABLE public.component_failure_mappings IS 'Maps components to their common failures';
COMMENT ON TABLE public.material_damage_mappings IS 'Maps materials to their common damage types';

