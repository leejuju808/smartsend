-- ============================================================
-- Block 57000 — SmartSend Roofing "Sales Proposal Builder + Digital Signing System" v1
-- (AI PROPOSALS • PRICE TEMPLATES • OPTIONAL UPSELLS • DIGITAL SIGNATURE • HOMEOWNER VIEW TRACKING • REVISION HISTORY)
-- ============================================================
-- 
-- This block arms roofing companies with a revenue-generating sales weapon inside SmartSend
-- — no more Word docs, no more PDFs, no more chaotic proposal workflows.
--
-- Roofers close AT LEAST 10–20% more deals with a professional digital proposal system.
-- This is HUGE for SmartSend. This is direct money.

-- ============================================================================
-- PART 1 — EXTEND proposals TABLE FOR BLOCK 57000
-- ============================================================================

-- Add Block 57000 specific fields to proposals table
ALTER TABLE public.proposals
  -- Job and homeowner references
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Pricing and upsells
  ADD COLUMN IF NOT EXISTS total_price numeric,
  ADD COLUMN IF NOT EXISTS upsells jsonb DEFAULT '[]'::jsonb, -- Array of selected upsells
  
  -- Digital signature
  ADD COLUMN IF NOT EXISTS signature jsonb, -- { type: 'typed'|'drawn'|'touch', data: '...', name: '...' }
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  
  -- View tracking
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  
  -- Template reference
  ADD COLUMN IF NOT EXISTS template_id uuid, -- References proposal_templates(id)
  
  -- Public access token (for homeowner viewing)
  ADD COLUMN IF NOT EXISTS public_token text UNIQUE,
  
  -- Revision tracking
  ADD COLUMN IF NOT EXISTS version_number int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL;

-- Update status enum to include all Block 57000 statuses
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'status'
  ) THEN
    -- Drop existing constraint if it exists
    ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
    
    -- Add new constraint with all statuses including Block 57000
    ALTER TABLE public.proposals 
      ADD CONSTRAINT proposals_status_check 
      CHECK (status IN (
        'draft', 'generated', 'sent', 'viewed', 'signed', 'approved', 'rejected', 
        'won', 'lost', 'considering', 'declined', 'expired'
      ));
  END IF;
END $$;

-- Create indexes for Block 57000 fields
CREATE INDEX IF NOT EXISTS idx_proposals_job_id_57000 ON public.proposals(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_homeowner_id_57000 ON public.proposals(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_contractor_id_57000 ON public.proposals(contractor_id) WHERE contractor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_template_id_57000 ON public.proposals(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_public_token_57000 ON public.proposals(public_token) WHERE public_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_parent_id_57000 ON public.proposals(parent_proposal_id) WHERE parent_proposal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_status_57000 ON public.proposals(status);

-- ============================================================================
-- PART 2 — CREATE proposal_templates TABLE
-- ============================================================================
-- Stores reusable proposal templates for different job types

CREATE TABLE IF NOT EXISTS public.proposal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contractor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Template details
  name text NOT NULL, -- e.g. "Roofing tear-off + install", "Repair proposal", "Storm replacement scope"
  description text,
  template_type text NOT NULL CHECK (template_type IN (
    'roof_replacement',
    'repair',
    'storm_replacement',
    'gutters_roof_combo',
    'metal_roof',
    'custom'
  )),
  
  -- Template content structure
  template_structure jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "sections": [
  --     { "type": "scope_of_work", "required": true },
  --     { "type": "materials", "required": true },
  --     { "type": "warranty", "required": true },
  --     { "type": "timeline", "required": true },
  --     { "type": "cleanup", "required": false }
  --   ],
  --   "default_line_items": [...],
  --   "default_upsells": [...]
  -- }
  
  -- Images and branding
  company_logo_url text,
  header_image_url text,
  
  -- Active status
  is_active boolean DEFAULT true,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_templates_workspace ON public.proposal_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_proposal_templates_type ON public.proposal_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_proposal_templates_active ON public.proposal_templates(workspace_id, is_active) WHERE is_active = true;

-- ============================================================================
-- PART 3 — CREATE proposal_versions TABLE
-- ============================================================================
-- Stores revision history for proposals

CREATE TABLE IF NOT EXISTS public.proposal_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  version int NOT NULL,
  
  -- Full proposal content snapshot
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Contains: scope_of_work, materials, pricing, upsells, etc.
  
  -- Version metadata
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  change_notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  
  -- Ensure unique version per proposal
  UNIQUE(proposal_id, version)
);

CREATE INDEX IF NOT EXISTS idx_proposal_versions_proposal ON public.proposal_versions(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_versions_version ON public.proposal_versions(proposal_id, version DESC);

-- ============================================================================
-- PART 4 — CREATE proposal_view_logs TABLE
-- ============================================================================
-- Tracks detailed viewing analytics for proposals

CREATE TABLE IF NOT EXISTS public.proposal_view_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  
  -- View details
  viewed_at timestamptz DEFAULT now(),
  device text, -- 'desktop', 'mobile', 'tablet'
  ip_address text,
  user_agent text,
  
  -- Engagement metrics
  scroll_depth_percent numeric(5,2), -- 0-100
  time_spent_seconds int,
  sections_viewed text[], -- Array of section names viewed
  
  -- Actions taken
  upsells_viewed text[], -- Array of upsell IDs viewed
  pricing_viewed boolean DEFAULT false,
  signature_area_viewed boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_proposal_view_logs_proposal ON public.proposal_view_logs(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_view_logs_viewed_at ON public.proposal_view_logs(viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_view_logs_device ON public.proposal_view_logs(device);

-- ============================================================================
-- PART 5 — CREATE proposal_upsells TABLE
-- ============================================================================
-- Stores optional add-on upsells that can be included in proposals

CREATE TABLE IF NOT EXISTS public.proposal_upsells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Upsell details
  name text NOT NULL, -- e.g. "Class 4 impact-resistant shingles", "Solar vent", "Extended warranty"
  description text,
  price numeric(10,2) NOT NULL,
  
  -- Visual
  image_url text,
  
  -- Category
  category text, -- 'materials', 'warranty', 'accessories', 'services'
  
  -- Active status
  is_active boolean DEFAULT true,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_upsells_workspace ON public.proposal_upsells(workspace_id);
CREATE INDEX IF NOT EXISTS idx_proposal_upsells_active ON public.proposal_upsells(workspace_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_proposal_upsells_category ON public.proposal_upsells(category);

-- ============================================================================
-- PART 6 — CREATE proposal_price_line_items TABLE
-- ============================================================================
-- Stores editable line items for proposal pricing

CREATE TABLE IF NOT EXISTS public.proposal_price_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  
  -- Line item details
  item_name text NOT NULL, -- e.g. "Shingles (labor + material)", "Ridge", "Underlayment"
  description text,
  quantity numeric(10,2) DEFAULT 1.0,
  unit text, -- 'square', 'linear_foot', 'each', 'sheet'
  unit_price numeric(10,2) NOT NULL,
  total_price numeric(10,2) NOT NULL,
  
  -- Category
  category text, -- 'materials', 'labor', 'tear_off', 'disposal', 'accessories', 'permit'
  
  -- Display order
  sort_order int DEFAULT 0,
  
  -- Discounts
  discount_percent numeric(5,2) DEFAULT 0,
  discount_amount numeric(10,2) DEFAULT 0,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_price_line_items_proposal ON public.proposal_price_line_items(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_price_line_items_sort ON public.proposal_price_line_items(proposal_id, sort_order);

-- ============================================================================
-- PART 7 — FUNCTIONS
-- ============================================================================

-- Function: Create new proposal version when proposal is updated
CREATE OR REPLACE FUNCTION public.create_proposal_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_version int;
  v_current_content jsonb;
BEGIN
  -- Only create version if content actually changed
  IF OLD.proposal_data IS DISTINCT FROM NEW.proposal_data 
     OR OLD.total_price IS DISTINCT FROM NEW.total_price
     OR OLD.upsells IS DISTINCT FROM NEW.upsells THEN
    
    -- Get next version number
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.proposal_versions
    WHERE proposal_id = NEW.id;
    
    -- Build content snapshot
    v_current_content := jsonb_build_object(
      'proposal_data', NEW.proposal_data,
      'total_price', NEW.total_price,
      'upsells', NEW.upsells,
      'version_number', NEW.version_number,
      'updated_at', NEW.updated_at
    );
    
    -- Insert version record
    INSERT INTO public.proposal_versions (
      proposal_id,
      version,
      content,
      changed_by
    ) VALUES (
      NEW.id,
      v_next_version,
      v_current_content,
      NEW.contractor_id
    );
    
    -- Update version number on proposal
    NEW.version_number := v_next_version;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger: Auto-create version on proposal update
DROP TRIGGER IF EXISTS trg_create_proposal_version ON public.proposals;
CREATE TRIGGER trg_create_proposal_version
BEFORE UPDATE ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.create_proposal_version();

-- Function: Generate public token for proposal
CREATE OR REPLACE FUNCTION public.generate_proposal_token()
RETURNS text
LANGUAGE sql
AS $$
  SELECT encode(gen_random_bytes(32), 'base64url');
$$;

-- Function: Track proposal view
CREATE OR REPLACE FUNCTION public.track_proposal_view(
  p_proposal_id uuid,
  p_device text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  -- Insert view log
  INSERT INTO public.proposal_view_logs (
    proposal_id,
    device,
    ip_address,
    user_agent
  ) VALUES (
    p_proposal_id,
    p_device,
    p_ip_address,
    p_user_agent
  ) RETURNING id INTO v_log_id;
  
  -- Update proposal viewed_at if first view
  UPDATE public.proposals
  SET 
    viewed_at = COALESCE(viewed_at, now()),
    status = CASE 
      WHEN status = 'sent' THEN 'viewed'
      ELSE status
    END
  WHERE id = p_proposal_id AND viewed_at IS NULL;
  
  RETURN v_log_id;
END;
$$;

-- Function: Calculate proposal total with upsells
CREATE OR REPLACE FUNCTION public.calculate_proposal_total(
  p_proposal_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_base_total numeric := 0;
  v_upsell_total numeric := 0;
  v_final_total numeric;
BEGIN
  -- Sum line items
  SELECT COALESCE(SUM(total_price), 0) INTO v_base_total
  FROM public.proposal_price_line_items
  WHERE proposal_id = p_proposal_id;
  
  -- Sum selected upsells
  SELECT COALESCE(SUM((u->>'price')::numeric), 0) INTO v_upsell_total
  FROM public.proposals p,
  jsonb_array_elements(p.upsells) u
  WHERE p.id = p_proposal_id;
  
  v_final_total := v_base_total + v_upsell_total;
  
  -- Update proposal total
  UPDATE public.proposals
  SET total_price = v_final_total
  WHERE id = p_proposal_id;
  
  RETURN v_final_total;
END;
$$;

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_view_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_upsells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_price_line_items ENABLE ROW LEVEL SECURITY;

-- Proposal templates: workspace members can view/create/update
CREATE POLICY "proposal_templates_select" ON public.proposal_templates
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "proposal_templates_insert" ON public.proposal_templates
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "proposal_templates_update" ON public.proposal_templates
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Proposal versions: same as proposals (workspace members)
CREATE POLICY "proposal_versions_select" ON public.proposal_versions
  FOR SELECT
  USING (
    proposal_id IN (
      SELECT id FROM public.proposals
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Proposal view logs: same as proposals
CREATE POLICY "proposal_view_logs_select" ON public.proposal_view_logs
  FOR SELECT
  USING (
    proposal_id IN (
      SELECT id FROM public.proposals
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Proposal upsells: workspace members
CREATE POLICY "proposal_upsells_select" ON public.proposal_upsells
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "proposal_upsells_insert" ON public.proposal_upsells
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "proposal_upsells_update" ON public.proposal_upsells
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Proposal price line items: same as proposals
CREATE POLICY "proposal_price_line_items_all" ON public.proposal_price_line_items
  FOR ALL
  USING (
    proposal_id IN (
      SELECT id FROM public.proposals
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- PART 9 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.proposal_templates IS 'Reusable proposal templates for different job types (Block 57000)';
COMMENT ON TABLE public.proposal_versions IS 'Revision history for proposals - tracks all changes (Block 57000)';
COMMENT ON TABLE public.proposal_view_logs IS 'Detailed viewing analytics for proposals (Block 57000)';
COMMENT ON TABLE public.proposal_upsells IS 'Optional add-on upsells that can be included in proposals (Block 57000)';
COMMENT ON TABLE public.proposal_price_line_items IS 'Editable line items for proposal pricing breakdown (Block 57000)';

COMMENT ON FUNCTION public.create_proposal_version() IS 'Automatically creates version snapshot when proposal is updated (Block 57000)';
COMMENT ON FUNCTION public.track_proposal_view() IS 'Tracks proposal views and updates proposal status (Block 57000)';
COMMENT ON FUNCTION public.calculate_proposal_total() IS 'Calculates total proposal price including line items and upsells (Block 57000)';
































