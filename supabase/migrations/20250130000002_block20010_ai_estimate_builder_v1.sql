-- =========================================================
-- Block 20010 — SmartSend Inbox AI Estimate Builder v1
-- (Instant Repair/Replacement Quotes, AI Line Items, Material Detection, Labor Calculation, and On-the-Fly Pricing From Inbox)
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE estimate_templates TABLE
-- ============================================================================
-- Prebuilt templates for different roofing job types

CREATE TABLE IF NOT EXISTS public.estimate_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Template metadata
  template_name text NOT NULL,
  template_category text NOT NULL CHECK (template_category IN (
    'repair',
    'replacement',
    'insurance',
    'emergency'
  )),
  template_type text NOT NULL CHECK (template_type IN (
    -- Repairs
    'leak_patch',
    'shingle_replacement',
    'pipe_boot_replacement',
    'flashing_repair',
    'skylight_repair',
    'chimney_repair',
    'valley_repair',
    -- Replacements
    'full_tear_off',
    'partial_tear_off',
    'layover',
    'full_replacement_warranty',
    -- Insurance
    'code_items',
    'line_item_breakdown',
    'deductible_note',
    'supplement_suggestions'
  )),
  
  -- Template configuration
  default_line_items jsonb DEFAULT '[]'::jsonb, -- Array of default line items
  material_multipliers jsonb DEFAULT '{}'::jsonb, -- Material-specific pricing adjustments
  complexity_multipliers jsonb DEFAULT '{}'::jsonb, -- Complexity-based adjustments
  pitch_multipliers jsonb DEFAULT '{}'::jsonb, -- Pitch-based adjustments
  
  -- Template settings
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false, -- Default template for this category
  
  -- Metadata
  description text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_templates_workspace ON public.estimate_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_estimate_templates_category ON public.estimate_templates(template_category, is_active);
CREATE INDEX IF NOT EXISTS idx_estimate_templates_type ON public.estimate_templates(template_type);

-- ============================================================================
-- PART 2 — CREATE estimates TABLE
-- ============================================================================
-- Stores AI-generated estimates for threads

CREATE TABLE IF NOT EXISTS public.estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Template used
  template_id uuid REFERENCES public.estimate_templates(id) ON DELETE SET NULL,
  template_type text,
  
  -- Job classification
  job_type text CHECK (job_type IN (
    'roof_repair',
    'roof_replacement',
    'emergency_leak_repair',
    'storm_damage',
    'insurance_driven_claim',
    'gutter_repair_replacement',
    'inspection_only'
  )),
  job_subcategory text,
  severity_level text CHECK (severity_level IN ('low', 'medium', 'high')),
  
  -- Pricing
  estimated_total_min numeric(12,2),
  estimated_total_max numeric(12,2),
  estimated_total_avg numeric(12,2),
  price_range_text text, -- e.g., "$350 - $520"
  
  -- Roof measurements (from roof_measurements table)
  roof_squares_min integer,
  roof_squares_max integer,
  roof_squares_avg numeric(5,2),
  pitch_estimate text,
  pitch_category text CHECK (pitch_category IN ('low', 'medium', 'high', 'steep', 'flat', 'unknown')),
  
  -- Material detection
  material_type text, -- 'asphalt', 'metal', 'tile', 'flat_roof', '3_tab', 'architectural'
  shingle_type text,
  
  -- Complexity factors
  complexity_rating text CHECK (complexity_rating IN ('low', 'medium', 'high', 'very_high', 'unknown')),
  steep_pitch_multiplier numeric(5,2) DEFAULT 1.0,
  difficulty_multiplier numeric(5,2) DEFAULT 1.0,
  cut_up_roof_multiplier numeric(5,2) DEFAULT 1.0,
  flashing_complexity_multiplier numeric(5,2) DEFAULT 1.0,
  chimney_add_on numeric(12,2) DEFAULT 0,
  skylight_add_on numeric(12,2) DEFAULT 0,
  
  -- Region pricing
  zip_code text,
  region_pricing_multiplier numeric(5,2) DEFAULT 1.0,
  
  -- Insurance info
  insurance_likelihood text CHECK (insurance_likelihood IN ('high', 'medium', 'low', 'none')),
  deductible_amount numeric(12,2),
  
  -- Estimate status
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'sent',
    'approved',
    'rejected',
    'won',
    'lost'
  )),
  
  -- PDF generation
  pdf_url text,
  pdf_generated_at timestamptz,
  
  -- AI reasoning metadata
  ai_reasoning text, -- Explanation of how estimate was generated
  ai_confidence_score integer CHECK (ai_confidence_score >= 0 AND ai_confidence_score <= 100),
  generation_metadata jsonb DEFAULT '{}'::jsonb, -- Raw AI response, inputs used, etc.
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  approved_at timestamptz,
  
  -- Unique constraint: one active estimate per thread
  UNIQUE(thread_id, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_estimates_thread ON public.estimates(thread_id);
CREATE INDEX IF NOT EXISTS idx_estimates_contact ON public.estimates(contact_id);
CREATE INDEX IF NOT EXISTS idx_estimates_workspace ON public.estimates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON public.estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_job_type ON public.estimates(job_type);
CREATE INDEX IF NOT EXISTS idx_estimates_created ON public.estimates(created_at DESC);

-- ============================================================================
-- PART 3 — CREATE estimate_line_items TABLE
-- ============================================================================
-- Individual line items for each estimate

CREATE TABLE IF NOT EXISTS public.estimate_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  
  -- Line item details
  line_number integer NOT NULL,
  description text NOT NULL,
  category text CHECK (category IN (
    'materials',
    'labor',
    'removal',
    'disposal',
    'equipment',
    'permits',
    'warranty',
    'other'
  )),
  
  -- Quantities and pricing
  quantity numeric(10,2) DEFAULT 1.0,
  unit text DEFAULT 'each', -- 'each', 'square', 'hour', 'linear_foot', etc.
  unit_cost numeric(10,2) NOT NULL,
  labor_cost numeric(10,2) DEFAULT 0,
  material_cost numeric(10,2) DEFAULT 0,
  total_cost numeric(10,2) NOT NULL,
  
  -- Material-specific pricing
  material_type text, -- If this line item is material-specific
  region_adjusted_cost numeric(10,2), -- After region multiplier
  
  -- Metadata
  notes text,
  is_optional boolean DEFAULT false,
  ai_generated boolean DEFAULT true,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure unique line numbers per estimate
  UNIQUE(estimate_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_estimate_line_items_estimate ON public.estimate_line_items(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_category ON public.estimate_line_items(category);

-- ============================================================================
-- PART 4 — SEED DEFAULT ESTIMATE TEMPLATES
-- ============================================================================

-- Repair Templates
INSERT INTO public.estimate_templates (template_name, template_category, template_type, default_line_items, description)
VALUES
  ('Leak Patch', 'repair', 'leak_patch', '[
    {"description": "Locate and patch leak source", "category": "labor", "unit": "hour", "unit_cost": 85, "quantity": 2},
    {"description": "Roofing cement and sealant", "category": "materials", "unit": "each", "unit_cost": 45, "quantity": 1},
    {"description": "Flashing repair if needed", "category": "materials", "unit": "linear_foot", "unit_cost": 12, "quantity": 5, "is_optional": true}
  ]'::jsonb, 'Standard leak patch repair template'),
  
  ('Shingle Replacement', 'repair', 'shingle_replacement', '[
    {"description": "Remove damaged shingles", "category": "labor", "unit": "hour", "unit_cost": 85, "quantity": 1},
    {"description": "Install new shingles", "category": "labor", "unit": "hour", "unit_cost": 85, "quantity": 1.5},
    {"description": "Architectural shingles", "category": "materials", "unit": "square", "unit_cost": 120, "quantity": 1},
    {"description": "Underlayment replacement", "category": "materials", "unit": "square", "unit_cost": 45, "quantity": 1, "is_optional": true}
  ]'::jsonb, 'Shingle replacement repair template'),
  
  ('Pipe Boot Replacement', 'repair', 'pipe_boot_replacement', '[
    {"description": "Remove old pipe boot", "category": "labor", "unit": "hour", "unit_cost": 85, "quantity": 0.5},
    {"description": "Install new pipe boot", "category": "labor", "unit": "hour", "unit_cost": 85, "quantity": 0.5},
    {"description": "Pipe boot kit", "category": "materials", "unit": "each", "unit_cost": 35, "quantity": 1},
    {"description": "Roofing cement", "category": "materials", "unit": "each", "unit_cost": 15, "quantity": 1}
  ]'::jsonb, 'Pipe boot replacement template'),
  
  ('Flashing Repair', 'repair', 'flashing_repair', '[
    {"description": "Remove old flashing", "category": "labor", "unit": "hour", "unit_cost": 85, "quantity": 1},
    {"description": "Install new flashing", "category": "labor", "unit": "hour", "unit_cost": 85, "quantity": 1.5},
    {"description": "Aluminum flashing", "category": "materials", "unit": "linear_foot", "unit_cost": 8, "quantity": 10},
    {"description": "Roofing nails and sealant", "category": "materials", "unit": "each", "unit_cost": 25, "quantity": 1}
  ]'::jsonb, 'Flashing repair template'),
  
  ('Chimney Repair', 'repair', 'chimney_repair', '[
    {"description": "Chimney flashing removal and replacement", "category": "labor", "unit": "hour", "unit_cost": 95, "quantity": 3},
    {"description": "Step flashing and counter flashing", "category": "materials", "unit": "linear_foot", "unit_cost": 15, "quantity": 12},
    {"description": "Roofing cement and sealant", "category": "materials", "unit": "each", "unit_cost": 45, "quantity": 2}
  ]'::jsonb, 'Chimney repair template'),
  
  ('Skylight Repair', 'repair', 'skylight_repair', '[
    {"description": "Skylight seal inspection and repair", "category": "labor", "unit": "hour", "unit_cost": 95, "quantity": 2},
    {"description": "Flashing around skylight", "category": "materials", "unit": "linear_foot", "unit_cost": 12, "quantity": 8},
    {"description": "Sealant and caulk", "category": "materials", "unit": "each", "unit_cost": 35, "quantity": 2}
  ]'::jsonb, 'Skylight repair template'),
  
  ('Valley Repair', 'repair', 'valley_repair', '[
    {"description": "Valley flashing removal and replacement", "category": "labor", "unit": "hour", "unit_cost": 95, "quantity": 2.5},
    {"description": "Valley metal flashing", "category": "materials", "unit": "linear_foot", "unit_cost": 10, "quantity": 20},
    {"description": "Shingle replacement in valley", "category": "materials", "unit": "square", "unit_cost": 120, "quantity": 1, "is_optional": true}
  ]'::jsonb, 'Valley repair template'),

-- Replacement Templates
  ('Full Tear-Off Replacement', 'replacement', 'full_tear_off', '[
    {"description": "Remove and dispose old shingles", "category": "removal", "unit": "square", "unit_cost": 45, "quantity": 1},
    {"description": "Replace underlayment", "category": "materials", "unit": "square", "unit_cost": 45, "quantity": 1},
    {"description": "Install architectural shingles", "category": "materials", "unit": "square", "unit_cost": 320, "quantity": 1},
    {"description": "Labor per square", "category": "labor", "unit": "square", "unit_cost": 250, "quantity": 1},
    {"description": "Ridge cap installation", "category": "materials", "unit": "linear_foot", "unit_cost": 8, "quantity": 1},
    {"description": "Pipe boot replacement", "category": "materials", "unit": "each", "unit_cost": 35, "quantity": 1},
    {"description": "Debris removal", "category": "disposal", "unit": "square", "unit_cost": 15, "quantity": 1}
  ]'::jsonb, 'Full tear-off replacement template'),
  
  ('Partial Tear-Off Replacement', 'replacement', 'partial_tear_off', '[
    {"description": "Remove damaged section shingles", "category": "removal", "unit": "square", "unit_cost": 45, "quantity": 1},
    {"description": "Replace underlayment in damaged area", "category": "materials", "unit": "square", "unit_cost": 45, "quantity": 1},
    {"description": "Install architectural shingles", "category": "materials", "unit": "square", "unit_cost": 320, "quantity": 1},
    {"description": "Labor per square", "category": "labor", "unit": "square", "unit_cost": 250, "quantity": 1},
    {"description": "Blend with existing roof", "category": "labor", "unit": "hour", "unit_cost": 95, "quantity": 2}
  ]'::jsonb, 'Partial tear-off replacement template'),
  
  ('Layover Replacement', 'replacement', 'layover', '[
    {"description": "Install new shingles over existing", "category": "materials", "unit": "square", "unit_cost": 320, "quantity": 1},
    {"description": "Labor per square (layover)", "category": "labor", "unit": "square", "unit_cost": 200, "quantity": 1},
    {"description": "Ridge cap installation", "category": "materials", "unit": "linear_foot", "unit_cost": 8, "quantity": 1}
  ]'::jsonb, 'Layover replacement template (no tear-off)'),
  
  ('Full Replacement with Warranty Upgrade', 'replacement', 'full_replacement_warranty', '[
    {"description": "Remove and dispose old shingles", "category": "removal", "unit": "square", "unit_cost": 45, "quantity": 1},
    {"description": "Replace underlayment", "category": "materials", "unit": "square", "unit_cost": 45, "quantity": 1},
    {"description": "Install premium architectural shingles", "category": "materials", "unit": "square", "unit_cost": 380, "quantity": 1},
    {"description": "Labor per square", "category": "labor", "unit": "square", "unit_cost": 250, "quantity": 1},
    {"description": "Extended warranty (50 years)", "category": "warranty", "unit": "each", "unit_cost": 500, "quantity": 1},
    {"description": "Ridge cap installation", "category": "materials", "unit": "linear_foot", "unit_cost": 8, "quantity": 1}
  ]'::jsonb, 'Full replacement with extended warranty upgrade'),

-- Insurance Templates
  ('Code Items Breakdown', 'insurance', 'code_items', '[
    {"description": "Code-compliant underlayment upgrade", "category": "materials", "unit": "square", "unit_cost": 25, "quantity": 1},
    {"description": "Ice and water shield in valleys", "category": "materials", "unit": "linear_foot", "unit_cost": 5, "quantity": 1},
    {"description": "Ventilation upgrades per code", "category": "materials", "unit": "each", "unit_cost": 150, "quantity": 1}
  ]'::jsonb, 'Insurance code items template'),
  
  ('Deductible Note', 'insurance', 'deductible_note', '[]'::jsonb, 'Template for deductible explanation'),
  
  ('Supplement Suggestions', 'insurance', 'supplement_suggestions', '[]'::jsonb, 'Template for insurance supplement suggestions')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 5 — PRICING CALCULATION FUNCTIONS
-- ============================================================================

-- Function to calculate material cost per square
CREATE OR REPLACE FUNCTION public.get_material_cost_per_square(
  p_material_type text,
  p_shingle_type text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cost numeric;
BEGIN
  -- Base material costs per square
  CASE 
    WHEN p_material_type = 'asphalt' THEN
      CASE 
        WHEN p_shingle_type = '3_tab' THEN v_cost := 280.0; -- $250-$310/sq
        WHEN p_shingle_type = 'architectural' THEN v_cost := 320.0; -- $300-$350/sq
        WHEN p_shingle_type = 'premium' THEN v_cost := 380.0; -- $350-$420/sq
        ELSE v_cost := 320.0; -- Default architectural
      END;
    WHEN p_material_type = 'metal' THEN v_cost := 1100.0; -- $800-$1,400/sq
    WHEN p_material_type = 'tile' THEN v_cost := 1350.0; -- $900-$1,800/sq
    WHEN p_material_type = 'flat_roof' THEN v_cost := 650.0; -- $400-$900/sq (TPO/EPDM)
    ELSE v_cost := 320.0; -- Default to asphalt architectural
  END CASE;
  
  RETURN v_cost;
END;
$$;

-- Function to calculate labor cost per square
CREATE OR REPLACE FUNCTION public.get_labor_cost_per_square(
  p_material_type text,
  p_complexity text DEFAULT 'medium'
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_base_labor numeric;
  v_complexity_multiplier numeric;
BEGIN
  -- Base labor costs per square by material
  CASE 
    WHEN p_material_type = 'asphalt' THEN v_base_labor := 250.0; -- $200-$300/sq
    WHEN p_material_type = 'metal' THEN v_base_labor := 400.0; -- Higher labor for metal
    WHEN p_material_type = 'tile' THEN v_base_labor := 450.0; -- Higher labor for tile
    WHEN p_material_type = 'flat_roof' THEN v_base_labor := 300.0; -- Specialized flat roof labor
    ELSE v_base_labor := 250.0; -- Default asphalt
  END CASE;
  
  -- Apply complexity multiplier
  CASE 
    WHEN p_complexity = 'low' THEN v_complexity_multiplier := 0.9;
    WHEN p_complexity = 'medium' THEN v_complexity_multiplier := 1.0;
    WHEN p_complexity = 'high' THEN v_complexity_multiplier := 1.25;
    WHEN p_complexity = 'very_high' THEN v_complexity_multiplier := 1.4;
    ELSE v_complexity_multiplier := 1.0;
  END CASE;
  
  RETURN v_base_labor * v_complexity_multiplier;
END;
$$;

-- Function to calculate pitch multiplier
CREATE OR REPLACE FUNCTION public.get_pitch_multiplier(
  p_pitch_category text
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE 
    WHEN p_pitch_category = 'low' THEN 0.95
    WHEN p_pitch_category = 'medium' THEN 1.0
    WHEN p_pitch_category = 'high' THEN 1.15
    WHEN p_pitch_category = 'steep' THEN 1.35
    WHEN p_pitch_category = 'flat' THEN 0.9
    ELSE 1.0
  END;
END;
$$;

-- Function to calculate complexity multiplier
CREATE OR REPLACE FUNCTION public.get_complexity_multiplier(
  p_complexity_rating text,
  p_has_chimney boolean DEFAULT false,
  p_has_skylights boolean DEFAULT false,
  p_cut_up_roof boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_base_multiplier numeric;
  v_add_on_multiplier numeric := 1.0;
BEGIN
  -- Base complexity multiplier
  v_base_multiplier := CASE 
    WHEN p_complexity_rating = 'low' THEN 1.0
    WHEN p_complexity_rating = 'medium' THEN 1.1
    WHEN p_complexity_rating = 'high' THEN 1.25
    WHEN p_complexity_rating = 'very_high' THEN 1.4
    ELSE 1.0
  END;
  
  -- Add-on multipliers for specific features
  IF p_has_chimney THEN v_add_on_multiplier := v_add_on_multiplier * 1.05; END IF;
  IF p_has_skylights THEN v_add_on_multiplier := v_add_on_multiplier * 1.08; END IF;
  IF p_cut_up_roof THEN v_add_on_multiplier := v_add_on_multiplier * 1.15; END IF;
  
  RETURN v_base_multiplier * v_add_on_multiplier;
END;
$$;

-- Main function to calculate estimate total
CREATE OR REPLACE FUNCTION public.calculate_estimate_total(
  p_squares_avg numeric,
  p_material_type text,
  p_shingle_type text DEFAULT NULL,
  p_pitch_category text DEFAULT 'medium',
  p_complexity_rating text DEFAULT 'medium',
  p_region_multiplier numeric DEFAULT 1.0,
  p_has_chimney boolean DEFAULT false,
  p_has_skylights boolean DEFAULT false,
  p_cut_up_roof boolean DEFAULT false,
  p_job_type text DEFAULT 'roof_replacement'
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_material_cost_per_sq numeric;
  v_labor_cost_per_sq numeric;
  v_pitch_mult numeric;
  v_complexity_mult numeric;
  v_base_cost numeric;
  v_total_min numeric;
  v_total_max numeric;
  v_total_avg numeric;
  v_chimney_add_on numeric := 0;
  v_skylight_add_on numeric := 0;
BEGIN
  -- Get base costs
  v_material_cost_per_sq := public.get_material_cost_per_square(p_material_type, p_shingle_type);
  v_labor_cost_per_sq := public.get_labor_cost_per_square(p_material_type, p_complexity_rating);
  v_pitch_mult := public.get_pitch_multiplier(p_pitch_category);
  v_complexity_mult := public.get_complexity_multiplier(
    p_complexity_rating,
    p_has_chimney,
    p_has_skylights,
    p_cut_up_roof
  );
  
  -- Calculate base cost per square
  v_base_cost := (v_material_cost_per_sq + v_labor_cost_per_sq) * v_pitch_mult * v_complexity_mult * p_region_multiplier;
  
  -- Apply job type adjustments
  IF p_job_type = 'roof_repair' THEN
    -- Repairs are typically much smaller (0.5-2 squares)
    v_total_min := COALESCE(p_squares_avg, 0.5) * v_base_cost * 0.9;
    v_total_max := COALESCE(p_squares_avg, 2.0) * v_base_cost * 1.1;
  ELSE
    -- Replacements use full square count
    v_total_min := COALESCE(p_squares_avg, 20) * v_base_cost * 0.9;
    v_total_max := COALESCE(p_squares_avg, 20) * v_base_cost * 1.1;
  END IF;
  
  -- Add feature add-ons
  IF p_has_chimney THEN v_chimney_add_on := 450.0; END IF;
  IF p_has_skylights THEN v_skylight_add_on := 350.0; END IF;
  
  v_total_min := v_total_min + v_chimney_add_on + v_skylight_add_on;
  v_total_max := v_total_max + v_chimney_add_on + v_skylight_add_on;
  v_total_avg := (v_total_min + v_total_max) / 2.0;
  
  RETURN jsonb_build_object(
    'total_min', ROUND(v_total_min, 2),
    'total_max', ROUND(v_total_max, 2),
    'total_avg', ROUND(v_total_avg, 2),
    'material_cost_per_sq', v_material_cost_per_sq,
    'labor_cost_per_sq', v_labor_cost_per_sq,
    'pitch_multiplier', v_pitch_mult,
    'complexity_multiplier', v_complexity_mult,
    'region_multiplier', p_region_multiplier,
    'chimney_add_on', v_chimney_add_on,
    'skylight_add_on', v_skylight_add_on
  );
END;
$$;

-- ============================================================================
-- PART 6 — TRIGGERS AND UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_update_estimate_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_update_estimate_updated_at
BEFORE UPDATE ON public.estimates
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_estimate_updated_at();

CREATE TRIGGER tr_update_estimate_line_item_updated_at
BEFORE UPDATE ON public.estimate_line_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_estimate_updated_at();

CREATE TRIGGER tr_update_estimate_template_updated_at
BEFORE UPDATE ON public.estimate_templates
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_estimate_updated_at();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.estimate_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;

-- Policies for estimate_templates
CREATE POLICY "Users can view templates in their workspace"
  ON public.estimate_templates FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create templates in their workspace"
  ON public.estimate_templates FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update templates in their workspace"
  ON public.estimate_templates FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policies for estimates
CREATE POLICY "Users can view estimates in their workspace"
  ON public.estimates FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create estimates in their workspace"
  ON public.estimates FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update estimates in their workspace"
  ON public.estimates FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policies for estimate_line_items
CREATE POLICY "Users can view line items for estimates in their workspace"
  ON public.estimate_line_items FOR SELECT
  USING (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can create line items for estimates in their workspace"
  ON public.estimate_line_items FOR INSERT
  WITH CHECK (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update line items for estimates in their workspace"
  ON public.estimate_line_items FOR UPDATE
  USING (
    estimate_id IN (
      SELECT id FROM public.estimates
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.estimate_templates IS 'Prebuilt estimate templates for different roofing job types';
COMMENT ON TABLE public.estimates IS 'AI-generated estimates for inbox threads';
COMMENT ON TABLE public.estimate_line_items IS 'Individual line items for each estimate';
COMMENT ON FUNCTION public.calculate_estimate_total IS 'Main function to calculate estimate totals based on roof size, materials, complexity, and region';



















































