-- ============================================================
-- Block 222000 — SmartSend Roofing "Insurance Scope Importer — Xactimate PDF → Auto Estimate Builder" v1
-- Full Sprint Step — No Bullshit. This is the real roofing superpower.
-- ============================================================
-- 
-- This block makes every roofer feel EMBARRASSINGLY STUPID not using SmartSend because insurance jobs are the most profitable…
-- yet the most chaotic.
--
-- Right now roofers manually re-type:
-- - Xactimate line items
-- - Quantities
-- - Codes
-- - Pricing
-- - Notes
-- - Waste calculations
--
-- It wastes HOURS per claim.
--
-- SmartSend turns a 30–60 min task into a 5-second upload.
--
-- This is one of the most valuable features in the whole system.
-- This is where SmartSend becomes elite roofing infrastructure.
-- ============================================================

-- ============================================================
-- 1. INSURANCE_IMPORTS TABLE
-- ============================================================
-- Stores uploaded Xactimate PDFs and their parsing status
CREATE TABLE IF NOT EXISTS public.insurance_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- File storage
  file_url text NOT NULL, -- Supabase Storage path
  file_name text,
  file_size_bytes bigint,
  
  -- Parsing stages
  raw_text text, -- Extracted text from PDF
  parsed_json jsonb, -- Full parsed structure from AI
  
  -- Status tracking
  status text DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'parsing', 'parsed', 'converted', 'error')),
  error_message text,
  
  -- Insurance metadata (extracted from PDF)
  insurance_company text,
  claim_number text,
  adjuster_name text,
  adjuster_email text,
  adjuster_phone text,
  total_scope_value numeric(12,2),
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_imports_company ON public.insurance_imports(company_id);
CREATE INDEX IF NOT EXISTS idx_insurance_imports_homeowner ON public.insurance_imports(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_imports_status ON public.insurance_imports(status);
CREATE INDEX IF NOT EXISTS idx_insurance_imports_created ON public.insurance_imports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_imports_created_by ON public.insurance_imports(created_by);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_insurance_imports_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_insurance_imports_updated_at ON public.insurance_imports;
CREATE TRIGGER trg_insurance_imports_updated_at
BEFORE UPDATE ON public.insurance_imports
FOR EACH ROW EXECUTE FUNCTION public.set_insurance_imports_updated_at();

-- ============================================================
-- 2. INSURANCE_LINE_ITEMS TABLE
-- ============================================================
-- Stores parsed line items BEFORE creating the estimate
-- This gives flexibility and editing
CREATE TABLE IF NOT EXISTS public.insurance_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.insurance_imports(id) ON DELETE CASCADE,
  
  -- Xactimate data
  code text, -- Xactimate code (e.g., "RFG300")
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 0,
  unit text, -- "sq", "lf", "ea", etc.
  unit_price numeric(12,2),
  total numeric(12,2),
  
  -- Additional metadata
  category text, -- "materials", "labor", "waste", "overhead", etc.
  notes text,
  waste_factor numeric(5,4), -- If waste is calculated separately
  
  -- Ordering
  display_order integer DEFAULT 0,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_line_items_import ON public.insurance_line_items(import_id);
CREATE INDEX IF NOT EXISTS idx_insurance_line_items_code ON public.insurance_line_items(code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_line_items_order ON public.insurance_line_items(import_id, display_order);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_insurance_line_items_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_insurance_line_items_updated_at ON public.insurance_line_items;
CREATE TRIGGER trg_insurance_line_items_updated_at
BEFORE UPDATE ON public.insurance_line_items
FOR EACH ROW EXECUTE FUNCTION public.set_insurance_line_items_updated_at();

-- ============================================================
-- 3. INSURANCE_IMPORT_ESTIMATE_LINKS TABLE
-- ============================================================
-- Links insurance imports to estimates (many-to-one: one import can create multiple estimates if edited)
CREATE TABLE IF NOT EXISTS public.insurance_import_estimate_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.insurance_imports(id) ON DELETE CASCADE,
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(import_id, estimate_id)
);

CREATE INDEX IF NOT EXISTS idx_import_estimate_links_import ON public.insurance_import_estimate_links(import_id);
CREATE INDEX IF NOT EXISTS idx_import_estimate_links_estimate ON public.insurance_import_estimate_links(estimate_id);

-- ============================================================
-- 4. ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Insurance Imports RLS
ALTER TABLE public.insurance_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insurance_imports_select_company_members"
  ON public.insurance_imports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = insurance_imports.company_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "insurance_imports_insert_company_members"
  ON public.insurance_imports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = insurance_imports.company_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "insurance_imports_update_company_members"
  ON public.insurance_imports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = insurance_imports.company_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "insurance_imports_delete_company_members"
  ON public.insurance_imports FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = insurance_imports.company_id
      AND rc.owner_id = auth.uid()
    )
  );

-- Insurance Line Items RLS
ALTER TABLE public.insurance_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insurance_line_items_select_company_members"
  ON public.insurance_line_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.insurance_imports ii
      JOIN public.roofing_companies rc ON rc.id = ii.company_id
      WHERE ii.id = insurance_line_items.import_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "insurance_line_items_insert_company_members"
  ON public.insurance_line_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.insurance_imports ii
      JOIN public.roofing_companies rc ON rc.id = ii.company_id
      WHERE ii.id = insurance_line_items.import_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "insurance_line_items_update_company_members"
  ON public.insurance_line_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.insurance_imports ii
      JOIN public.roofing_companies rc ON rc.id = ii.company_id
      WHERE ii.id = insurance_line_items.import_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "insurance_line_items_delete_company_members"
  ON public.insurance_line_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.insurance_imports ii
      JOIN public.roofing_companies rc ON rc.id = ii.company_id
      WHERE ii.id = insurance_line_items.import_id
      AND rc.owner_id = auth.uid()
    )
  );

-- Import Estimate Links RLS
ALTER TABLE public.insurance_import_estimate_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_estimate_links_select_company_members"
  ON public.insurance_import_estimate_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.insurance_imports ii
      JOIN public.roofing_companies rc ON rc.id = ii.company_id
      WHERE ii.id = insurance_import_estimate_links.import_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "import_estimate_links_insert_company_members"
  ON public.insurance_import_estimate_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.insurance_imports ii
      JOIN public.roofing_companies rc ON rc.id = ii.company_id
      WHERE ii.id = insurance_import_estimate_links.import_id
      AND rc.owner_id = auth.uid()
    )
  );

-- ============================================================
-- 5. HELPER FUNCTIONS
-- ============================================================

-- Function: Calculate total from line items for an import
CREATE OR REPLACE FUNCTION public.calculate_insurance_import_total(import_uuid uuid)
RETURNS numeric(12,2) LANGUAGE plpgsql AS $$
DECLARE
  v_total numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(total), 0)
  INTO v_total
  FROM public.insurance_line_items
  WHERE import_id = import_uuid;
  
  RETURN v_total;
END;
$$;

COMMENT ON TABLE public.insurance_imports IS 'Block 222000: Insurance scope PDF imports with parsing status';
COMMENT ON TABLE public.insurance_line_items IS 'Block 222000: Parsed line items from insurance scopes before estimate creation';
COMMENT ON TABLE public.insurance_import_estimate_links IS 'Block 222000: Links between insurance imports and created estimates';

























