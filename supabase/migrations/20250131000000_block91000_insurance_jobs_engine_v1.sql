-- =========================================================
-- Block 91000 — SmartSend Roofing Insurance Jobs Engine v1
-- "Insurance Jobs Engine + Scope Builder + Supplement System"
-- =========================================================
-- 
-- This block creates a complete insurance workflow system:
-- - Insurance claims tracking
-- - Damage documentation
-- - Auto-scope builder
-- - Supplement management
-- - Communication logging
--
-- This turns rookies into professionals overnight.

-- ============================================================================
-- PART 1 — INSURANCE CLAIMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  company_id uuid,
  workspace_id uuid, -- For workspace-based access control
  
  -- Claim Details
  claim_number text,
  carrier text,
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  
  -- Financials
  deductible numeric DEFAULT 0,
  rc_value numeric DEFAULT 0,   -- Replacement Cost estimate
  acv_value numeric DEFAULT 0,  -- Actual Cash Value
  depreciation numeric DEFAULT 0,
  
  -- Supplement Tracking
  supplements_sent numeric DEFAULT 0,
  supplements_approved numeric DEFAULT 0,
  
  -- Status
  claim_status text DEFAULT 'inspection_needed' CHECK (claim_status IN (
    'inspection_needed',
    'scope_created',
    'sent_to_carrier',
    'waiting_for_adjuster',
    'approved',
    'denied',
    'supplement_pending',
    'supplement_approved'
  )),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_insurance_claims_job_id ON public.insurance_claims(job_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_company_id ON public.insurance_claims(company_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_workspace_id ON public.insurance_claims(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON public.insurance_claims(claim_status);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_claim_number ON public.insurance_claims(claim_number);

-- ============================================================================
-- PART 2 — DAMAGE ITEMS TABLE (from inspection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.damage_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  
  -- Damage Details
  item_type text NOT NULL,   -- shingles, flashing, ridge, decking, soft_metal, ice_water, chimney
  severity text,             -- minor, moderate, severe, critical
  quantity numeric,
  unit text DEFAULT 'sq',     -- sq (square), lnft (linear feet), ea (each)
  
  -- Documentation
  photos jsonb DEFAULT '[]'::jsonb,  -- array of photo URLs
  notes text,
  
  -- Location/Details
  location_description text,  -- e.g., "North side, upper section"
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_damage_items_claim_id ON public.damage_items(claim_id);
CREATE INDEX IF NOT EXISTS idx_damage_items_item_type ON public.damage_items(item_type);

-- ============================================================================
-- PART 3 — INSURANCE SCOPES TABLE (auto-generated or edited)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  
  -- Scope Data (structured JSON)
  scope_json jsonb DEFAULT '[]'::jsonb,  -- array of line items
  
  -- Totals
  subtotal numeric DEFAULT 0,
  tax numeric DEFAULT 0,
  total numeric DEFAULT 0,
  
  -- Calculations
  rc_value numeric DEFAULT 0,
  acv_value numeric DEFAULT 0,
  depreciation numeric DEFAULT 0,
  
  -- Metadata
  generated_at timestamptz DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id),
  is_auto_generated boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_insurance_scopes_claim_id ON public.insurance_scopes(claim_id);
CREATE INDEX IF NOT EXISTS idx_insurance_scopes_generated_at ON public.insurance_scopes(generated_at DESC);

-- ============================================================================
-- PART 4 — SUPPLEMENT REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  
  -- Supplement Details
  reason text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  
  -- Documentation
  documentation jsonb DEFAULT '{}'::jsonb,  -- photos, explanation text, line items
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN (
    'pending',
    'submitted',
    'approved',
    'denied'
  )),
  
  -- Dates
  submitted_at timestamptz,
  approved_at timestamptz,
  denied_at timestamptz,
  denial_reason text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_supplements_claim_id ON public.supplements(claim_id);
CREATE INDEX IF NOT EXISTS idx_supplements_status ON public.supplements(status);
CREATE INDEX IF NOT EXISTS idx_supplements_submitted_at ON public.supplements(submitted_at DESC);

-- ============================================================================
-- PART 5 — INSURANCE COMMUNICATION LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  
  -- Communication Details
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  method text NOT NULL CHECK (method IN ('phone', 'email', 'note', 'file', 'meeting')),
  content text,
  
  -- Contact Info (for calls/emails)
  contact_name text,
  contact_phone text,
  contact_email text,
  
  -- File Attachments
  attachments jsonb DEFAULT '[]'::jsonb,  -- array of file URLs
  
  -- Metadata
  timestamp timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_insurance_communications_claim_id ON public.insurance_communications(claim_id);
CREATE INDEX IF NOT EXISTS idx_insurance_communications_timestamp ON public.insurance_communications(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_communications_direction ON public.insurance_communications(direction);
CREATE INDEX IF NOT EXISTS idx_insurance_communications_method ON public.insurance_communications(method);

-- ============================================================================
-- PART 6 — TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_insurance_claims_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_insurance_claims_updated_at
BEFORE UPDATE ON public.insurance_claims
FOR EACH ROW
EXECUTE FUNCTION update_insurance_claims_updated_at();

CREATE OR REPLACE FUNCTION update_damage_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_damage_items_updated_at
BEFORE UPDATE ON public.damage_items
FOR EACH ROW
EXECUTE FUNCTION update_damage_items_updated_at();

CREATE OR REPLACE FUNCTION update_insurance_scopes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_insurance_scopes_updated_at
BEFORE UPDATE ON public.insurance_scopes
FOR EACH ROW
EXECUTE FUNCTION update_insurance_scopes_updated_at();

CREATE OR REPLACE FUNCTION update_supplements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_supplements_updated_at
BEFORE UPDATE ON public.supplements
FOR EACH ROW
EXECUTE FUNCTION update_supplements_updated_at();

-- ============================================================================
-- PART 7 — AUTO-UPDATE SUPPLEMENT COUNTS
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_supplement_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.insurance_claims
  SET
    supplements_sent = (
      SELECT COALESCE(SUM(amount), 0)
      FROM public.supplements
      WHERE claim_id = COALESCE(NEW.claim_id, OLD.claim_id)
        AND status IN ('submitted', 'approved', 'denied')
    ),
    supplements_approved = (
      SELECT COALESCE(SUM(amount), 0)
      FROM public.supplements
      WHERE claim_id = COALESCE(NEW.claim_id, OLD.claim_id)
        AND status = 'approved'
    ),
    updated_at = now()
  WHERE id = COALESCE(NEW.claim_id, OLD.claim_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_supplement_counts
AFTER INSERT OR UPDATE OR DELETE ON public.supplements
FOR EACH ROW
EXECUTE FUNCTION sync_supplement_counts();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.damage_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_communications ENABLE ROW LEVEL SECURITY;

-- Insurance Claims Policies
CREATE POLICY "Users can view insurance claims in their workspace"
  ON public.insurance_claims FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT company_id FROM public.companies c
      JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create insurance claims in their workspace"
  ON public.insurance_claims FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT company_id FROM public.companies c
      JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update insurance claims in their workspace"
  ON public.insurance_claims FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT company_id FROM public.companies c
      JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete insurance claims in their workspace"
  ON public.insurance_claims FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT company_id FROM public.companies c
      JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- Damage Items Policies (inherit from claim access)
CREATE POLICY "Users can manage damage items for accessible claims"
  ON public.damage_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.insurance_claims ic
      WHERE ic.id = damage_items.claim_id
      AND (
        ic.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR ic.company_id IN (
          SELECT company_id FROM public.companies c
          JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
          WHERE wm.user_id = auth.uid()
        )
      )
    )
  );

-- Insurance Scopes Policies
CREATE POLICY "Users can manage scopes for accessible claims"
  ON public.insurance_scopes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.insurance_claims ic
      WHERE ic.id = insurance_scopes.claim_id
      AND (
        ic.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR ic.company_id IN (
          SELECT company_id FROM public.companies c
          JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
          WHERE wm.user_id = auth.uid()
        )
      )
    )
  );

-- Supplements Policies
CREATE POLICY "Users can manage supplements for accessible claims"
  ON public.supplements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.insurance_claims ic
      WHERE ic.id = supplements.claim_id
      AND (
        ic.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR ic.company_id IN (
          SELECT company_id FROM public.companies c
          JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
          WHERE wm.user_id = auth.uid()
        )
      )
    )
  );

-- Insurance Communications Policies
CREATE POLICY "Users can manage communications for accessible claims"
  ON public.insurance_communications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.insurance_claims ic
      WHERE ic.id = insurance_communications.claim_id
      AND (
        ic.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR ic.company_id IN (
          SELECT company_id FROM public.companies c
          JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
          WHERE wm.user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- PART 9 — HELPER FUNCTIONS
-- ============================================================================

-- Function to get claim summary
CREATE OR REPLACE FUNCTION get_insurance_claim_summary(p_claim_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'claim', row_to_json(ic.*),
    'damage_items_count', (SELECT COUNT(*) FROM public.damage_items WHERE claim_id = p_claim_id),
    'scopes_count', (SELECT COUNT(*) FROM public.insurance_scopes WHERE claim_id = p_claim_id),
    'supplements_count', (SELECT COUNT(*) FROM public.supplements WHERE claim_id = p_claim_id),
    'communications_count', (SELECT COUNT(*) FROM public.insurance_communications WHERE claim_id = p_claim_id),
    'pending_supplements', (
      SELECT COALESCE(SUM(amount), 0)
      FROM public.supplements
      WHERE claim_id = p_claim_id AND status = 'pending'
    ),
    'approved_supplements', (
      SELECT COALESCE(SUM(amount), 0)
      FROM public.supplements
      WHERE claim_id = p_claim_id AND status = 'approved'
    )
  ) INTO result
  FROM public.insurance_claims ic
  WHERE ic.id = p_claim_id;
  
  RETURN result;
END;
$$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.damage_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_scopes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_communications TO authenticated;
GRANT EXECUTE ON FUNCTION get_insurance_claim_summary(uuid) TO authenticated;

-- Comments
COMMENT ON TABLE public.insurance_claims IS 'Main insurance claims table tracking carrier, adjuster, financials, and status';
COMMENT ON TABLE public.damage_items IS 'Damage documentation from inspections with photos and details';
COMMENT ON TABLE public.insurance_scopes IS 'Auto-generated or manually edited insurance scopes with line items';
COMMENT ON TABLE public.supplements IS 'Supplement requests with documentation and status tracking';
COMMENT ON TABLE public.insurance_communications IS 'Complete log of all adjuster and carrier communications';



























