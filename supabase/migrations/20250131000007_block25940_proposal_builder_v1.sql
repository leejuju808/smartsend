-- =========================================================
-- Block 25940 — SmartSend Roofing Proposal Builder v1
-- (Beautiful Proposals • Visual Options • Good/Better/Best Pricing • 
--  Inspection-Driven Proposals • Homeowner Psychology Built-In)
-- =========================================================

-- ============================================================================
-- PART 1 — EXTEND proposals TABLE FOR V1 FEATURES
-- ============================================================================

-- Add pricing tier support (Good/Better/Best)
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS pricing_tier_model jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "good": {
  --     "name": "Economy Option",
  --     "price": 18000,
  --     "description": "Basic shingles, standard underlayment, basic warranty",
  --     "features": ["3-tab shingles", "Standard underlayment", "Basic workmanship warranty"],
  --     "selected": false
  --   },
  --   "better": {
  --     "name": "Most Popular",
  --     "price": 22680,
  --     "description": "Architectural shingles, synthetic underlayment, upgraded ventilation",
  --     "features": ["Architectural shingles", "Synthetic underlayment", "Ridge vent upgrade", "Extended warranty"],
  --     "selected": true,
  --     "is_popular": true
  --   },
  --   "best": {
  --     "name": "Premium Option",
  --     "price": 28500,
  --     "description": "Impact-resistant shingles, full ice & water, maximum warranty",
  --     "features": ["Impact-resistant shingles", "Full ice & water shield", "Ridge vent upgrade", "Maximum warranty", "Financing options"],
  --     "selected": false
  --   }
  -- }

  -- Visual proposal elements
  ADD COLUMN IF NOT EXISTS visual_elements jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "before_after_photos": [{"url": "...", "caption": "..."}],
  --   "problem_areas": [{"url": "...", "description": "...", "severity": "..."}],
  --   "solution_diagrams": [{"type": "ventilation", "url": "...", "description": "..."}],
  --   "shingle_color_swatches": [{"color": "Charcoal", "image_url": "...", "brand": "GAF"}],
  --   "product_visuals": [{"product": "Architectural Shingles", "image_url": "...", "brand": "GAF"}],
  --   "brand_logos": ["GAF", "Owens Corning", "CertainTeed"],
  --   "warranty_badges": [{"type": "workmanship", "years": 10, "image_url": "..."}]
  -- }

  -- Inspection-driven sections
  ADD COLUMN IF NOT EXISTS inspection_sections jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "inspection_summary": "Clear explanation of roof condition",
  --   "what_we_found": [
  --     {"photo_url": "...", "description": "...", "severity": "..."}
  --   ],
  --   "recommended_repairs": "Professional recommendations",
  --   "why_fix_now": "Urgency messaging",
  --   "whats_included": ["Item 1", "Item 2"],
  --   "whats_not_included": ["Item 1", "Item 2"],
  --   "installation_process": "Homeowner education → trust"
  -- }

  -- Insurance-specific mode
  ADD COLUMN IF NOT EXISTS insurance_mode jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "is_insurance_claim": true,
  --   "deductible_explanation": "...",
  --   "acv_vs_rcv": {
  --     "acv": 17200,
  --     "rcv": 28500,
  --     "explanation": "..."
  --   },
  --   "depreciation_logic": "...",
  --   "upgrade_opportunities": ["..."],
  --   "supplement_explanation": "...",
  --   "color_choices": ["..."],
  --   "required_code_items": ["..."],
  --   "timeline_expectations": "..."
  -- }

  -- Upgrade & add-on engine
  ADD COLUMN IF NOT EXISTS upgrade_options jsonb DEFAULT '[]'::jsonb,
  -- Structure:
  -- [
  --   {
  --     "id": "ridge_vent_upgrade",
  --     "name": "Ridge Vent Upgrade",
  --     "description": "Improved attic ventilation",
  --     "price": 450,
  --     "category": "ventilation",
  --     "selected": false,
  --     "image_url": "..."
  --   },
  --   {
  --     "id": "underlayment_upgrade",
  --     "name": "Synthetic Underlayment Upgrade",
  --     "description": "Better protection against water",
  --     "price": 680,
  --     "category": "materials",
  --     "selected": false
  --   }
  -- ]

  -- Warranty visualization
  ADD COLUMN IF NOT EXISTS warranty_details jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "workmanship_warranty": {
  --     "years": 10,
  --     "description": "...",
  --     "coverage": ["..."]
  --   },
  --   "manufacturer_warranty": {
  --     "years": 30,
  --     "description": "...",
  --     "coverage": ["..."]
  --   },
  --   "extended_warranty_options": [
  --     {"name": "...", "years": 15, "price": 500}
  --   ]
  -- }

  -- Financing options (future integration)
  ADD COLUMN IF NOT EXISTS financing_options jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "enabled": false,
  --   "monthly_payment_estimate": 450,
  --   "financing_benefits": ["..."],
  --   "payment_breakdown": {...}
  -- }

  -- Signature & approval
  ADD COLUMN IF NOT EXISTS signature_data jsonb DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "signed": false,
  --   "signed_at": null,
  --   "signed_by": null,
  --   "signature_image_url": null,
  --   "selected_tier": "better",
  --   "selected_upgrades": ["ridge_vent_upgrade"],
  --   "final_price": 23130,
  --   "deposit_amount": 4626,
  --   "deposit_paid": false
  -- }

  -- Proposal analytics
  ADD COLUMN IF NOT EXISTS analytics jsonb DEFAULT '{}'::jsonb;
  -- Structure:
  -- {
  --   "views": 0,
  --   "first_viewed_at": null,
  --   "last_viewed_at": null,
  --   "total_time_seconds": 0,
  --   "tier_views": {
  --     "good": 2,
  --     "better": 5,
  --     "best": 1
  --   },
  --   "photo_views": {
  --     "photo_id": 3
  --   },
  --   "upgrade_interest": {
  --     "ridge_vent_upgrade": 2
  --   },
  --   "page_sections_viewed": ["inspection_summary", "pricing_tiers"]
  -- }

-- ============================================================================
-- PART 2 — CREATE proposal_upgrades TABLE
-- ============================================================================
-- Tracks upgrade selections and add-ons

CREATE TABLE IF NOT EXISTS public.proposal_upgrades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  upgrade_id text NOT NULL, -- e.g., "ridge_vent_upgrade"
  upgrade_name text NOT NULL,
  upgrade_description text,
  category text CHECK (category IN (
    'ventilation',
    'materials',
    'underlayment',
    'shingle_upgrade',
    'gutter_replacement',
    'soffit_fascia',
    'skylight_replacement',
    'other'
  )),
  price numeric(12,2) NOT NULL,
  selected boolean DEFAULT false,
  selected_at timestamptz,
  image_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_upgrades_proposal ON public.proposal_upgrades(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_upgrades_category ON public.proposal_upgrades(category);
CREATE INDEX IF NOT EXISTS idx_proposal_upgrades_selected ON public.proposal_upgrades(selected) WHERE selected = true;

-- ============================================================================
-- PART 3 — CREATE proposal_analytics TABLE
-- ============================================================================
-- Detailed analytics tracking for proposals

CREATE TABLE IF NOT EXISTS public.proposal_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  
  -- View tracking
  view_count integer DEFAULT 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  total_view_time_seconds integer DEFAULT 0,
  
  -- Tier interaction
  tier_viewed text CHECK (tier_viewed IN ('good', 'better', 'best')),
  tier_viewed_at timestamptz,
  
  -- Photo interaction
  photo_viewed_url text,
  photo_viewed_at timestamptz,
  
  -- Upgrade interest
  upgrade_id text,
  upgrade_viewed_at timestamptz,
  
  -- Section tracking
  section_viewed text, -- 'inspection_summary', 'pricing_tiers', 'warranty', etc.
  section_viewed_at timestamptz,
  
  -- Action tracking
  action_type text CHECK (action_type IN (
    'view',
    'tier_select',
    'tier_view',
    'photo_view',
    'upgrade_view',
    'upgrade_add',
    'upgrade_remove',
    'section_view',
    'signature_start',
    'signature_complete',
    'deposit_paid'
  )),
  action_metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_analytics_proposal ON public.proposal_analytics(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_analytics_action_type ON public.proposal_analytics(action_type);
CREATE INDEX IF NOT EXISTS idx_proposal_analytics_created_at ON public.proposal_analytics(created_at DESC);

-- ============================================================================
-- PART 4 — CREATE proposal_signatures TABLE
-- ============================================================================
-- Digital signatures and approvals

CREATE TABLE IF NOT EXISTS public.proposal_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Signature data
  signature_image_url text,
  signature_data_url text, -- Base64 signature data
  signed_by_name text,
  signed_by_email text,
  
  -- Approval details
  selected_tier text CHECK (selected_tier IN ('good', 'better', 'best')),
  selected_upgrades text[] DEFAULT '{}',
  final_price numeric(12,2),
  deposit_amount numeric(12,2),
  deposit_percent numeric(5,2),
  
  -- Payment tracking
  deposit_paid boolean DEFAULT false,
  deposit_paid_at timestamptz,
  deposit_payment_method text,
  deposit_payment_id text,
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'signed',
    'deposit_paid',
    'approved',
    'cancelled'
  )),
  
  -- Metadata
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  signed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_proposal_signatures_proposal ON public.proposal_signatures(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_signatures_contact ON public.proposal_signatures(contact_id);
CREATE INDEX IF NOT EXISTS idx_proposal_signatures_status ON public.proposal_signatures(status);

-- ============================================================================
-- PART 5 — CREATE proposal_photos TABLE
-- ============================================================================
-- Organized proposal photos (before/after, problem areas, etc.)

CREATE TABLE IF NOT EXISTS public.proposal_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  attachment_id uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  
  -- Photo categorization
  photo_type text NOT NULL CHECK (photo_type IN (
    'before',
    'after',
    'problem_area',
    'solution_diagram',
    'shingle_color_swatch',
    'product_visual',
    'warranty_badge',
    'brand_logo',
    'other'
  )),
  
  -- Photo details
  photo_url text NOT NULL,
  thumbnail_url text,
  caption text,
  description text,
  order_index integer DEFAULT 0,
  
  -- Problem area specific
  problem_type text,
  problem_severity text CHECK (problem_severity IN ('minor', 'moderate', 'severe', 'critical')),
  
  -- Solution diagram specific
  diagram_type text, -- 'ventilation', 'underlayment', 'shingle_layers', etc.
  
  -- Color swatch specific
  color_name text,
  color_brand text,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_photos_proposal ON public.proposal_photos(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_photos_type ON public.proposal_photos(photo_type);
CREATE INDEX IF NOT EXISTS idx_proposal_photos_order ON public.proposal_photos(proposal_id, order_index);

-- ============================================================================
-- PART 6 — TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_update_proposal_upgrade_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_update_proposal_upgrade_updated_at
BEFORE UPDATE ON public.proposal_upgrades
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_proposal_upgrade_updated_at();

CREATE OR REPLACE FUNCTION public.tg_update_proposal_signature_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_update_proposal_signature_updated_at
BEFORE UPDATE ON public.proposal_signatures
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_proposal_signature_updated_at();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.proposal_upgrades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_photos ENABLE ROW LEVEL SECURITY;

-- Proposal upgrades policies
CREATE POLICY "Users can view upgrades in their workspace"
  ON public.proposal_upgrades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = proposal_upgrades.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage upgrades in their workspace"
  ON public.proposal_upgrades FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = proposal_upgrades.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

-- Proposal analytics policies (read-only for workspace members, insert allowed for service role)
CREATE POLICY "Users can view analytics in their workspace"
  ON public.proposal_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = proposal_analytics.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert analytics"
  ON public.proposal_analytics FOR INSERT
  WITH CHECK (true);

-- Proposal signatures policies
CREATE POLICY "Users can view signatures in their workspace"
  ON public.proposal_signatures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = proposal_signatures.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage signatures in their workspace"
  ON public.proposal_signatures FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = proposal_signatures.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

-- Proposal photos policies
CREATE POLICY "Users can view photos in their workspace"
  ON public.proposal_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = proposal_photos.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage photos in their workspace"
  ON public.proposal_photos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = proposal_photos.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.proposal_upgrades IS 'Upgrade options and add-ons for proposals (Block 25940)';
COMMENT ON TABLE public.proposal_analytics IS 'Analytics tracking for proposal views and interactions (Block 25940)';
COMMENT ON TABLE public.proposal_signatures IS 'Digital signatures and approvals for proposals (Block 25940)';
COMMENT ON TABLE public.proposal_photos IS 'Organized photos for proposals (before/after, problem areas, etc.) (Block 25940)';

COMMENT ON COLUMN public.proposals.pricing_tier_model IS 'Good/Better/Best pricing tiers with features and pricing (Block 25940)';
COMMENT ON COLUMN public.proposals.visual_elements IS 'Visual elements for proposal (photos, diagrams, swatches, logos) (Block 25940)';
COMMENT ON COLUMN public.proposals.inspection_sections IS 'Inspection-driven proposal sections (Block 25940)';
COMMENT ON COLUMN public.proposals.insurance_mode IS 'Insurance-specific proposal mode data (Block 25940)';
COMMENT ON COLUMN public.proposals.upgrade_options IS 'Available upgrade options and add-ons (Block 25940)';
COMMENT ON COLUMN public.proposals.warranty_details IS 'Warranty visualization and details (Block 25940)';
COMMENT ON COLUMN public.proposals.financing_options IS 'Financing options and payment estimates (Block 25940)';
COMMENT ON COLUMN public.proposals.signature_data IS 'Signature and approval data (Block 25940)';
COMMENT ON COLUMN public.proposals.analytics IS 'Proposal analytics summary (Block 25940)';




































