-- =========================================================
-- Block 40850 — SmartSend Roofing "AI Proposal Engine + Dynamic Estimate Builder" v1
-- (Auto-generate roofing proposals • Good/Better/Best options • Exact pricing logic • Material selections • Financing options • E-signature • Proposal tracking)
-- =========================================================

-- ============================================================================
-- PART 1 — EXTEND proposals TABLE FOR BLOCK 40850
-- ============================================================================

-- Add Good/Better/Best package fields
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS good_option jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS better_option jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS best_option jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_option text CHECK (selected_option IN ('good', 'better', 'best')),
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- Ensure status includes all required values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'status'
  ) THEN
    -- Drop existing constraint if it exists
    ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
    
    -- Add new constraint with all statuses
    ALTER TABLE public.proposals 
      ADD CONSTRAINT proposals_status_check 
      CHECK (status IN (
        'draft', 'generated', 'sent', 'viewed', 'signed', 'approved', 'rejected', 
        'won', 'lost', 'considering', 'declined', 'expired'
      ));
  END IF;
END $$;

-- Create indexes for Good/Better/Best queries
CREATE INDEX IF NOT EXISTS idx_proposals_selected_option ON public.proposals(selected_option) WHERE selected_option IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_job_id ON public.proposals(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON public.proposals(lead_id) WHERE lead_id IS NOT NULL;

-- ============================================================================
-- PART 2 — CREATE proposal_pricing_config TABLE
-- ============================================================================
-- Stores contractor's pricing configuration for line-item calculations

CREATE TABLE IF NOT EXISTS public.proposal_pricing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Per-square pricing
  price_per_square numeric(10,2) DEFAULT 240.00,
  
  -- Tear-off pricing
  tear_off_per_square numeric(10,2) DEFAULT 25.00,
  
  -- Disposal pricing
  disposal_per_square numeric(10,2) DEFAULT 15.00,
  
  -- Underlayment pricing
  underlayment_per_square numeric(10,2) DEFAULT 45.00,
  
  -- Drip edge pricing
  drip_edge_per_linear_foot numeric(10,2) DEFAULT 3.50,
  
  -- Ridge vent pricing
  ridge_vent_per_linear_foot numeric(10,2) DEFAULT 4.50,
  
  -- Decking replacement (per sheet)
  decking_per_sheet numeric(10,2) DEFAULT 85.00,
  
  -- Chimney flashing
  chimney_flashing_fixed numeric(10,2) DEFAULT 450.00,
  
  -- Skylight replacement
  skylight_replacement_fixed numeric(10,2) DEFAULT 650.00,
  
  -- Material multipliers for Good/Better/Best
  good_material_multiplier numeric(5,2) DEFAULT 1.0,
  better_material_multiplier numeric(5,2) DEFAULT 1.3,
  best_material_multiplier numeric(5,2) DEFAULT 1.6,
  
  -- Labor multipliers
  good_labor_multiplier numeric(5,2) DEFAULT 1.0,
  better_labor_multiplier numeric(5,2) DEFAULT 1.15,
  best_labor_multiplier numeric(5,2) DEFAULT 1.3,
  
  -- Profit margin
  profit_margin_percent numeric(5,2) DEFAULT 20.0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_proposal_pricing_config_workspace ON public.proposal_pricing_config(workspace_id);

-- ============================================================================
-- PART 3 — CREATE proposal_line_items TABLE
-- ============================================================================
-- Stores detailed line-item breakdown for each proposal option

CREATE TABLE IF NOT EXISTS public.proposal_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  option_tier text NOT NULL CHECK (option_tier IN ('good', 'better', 'best')),
  
  -- Line item details
  item_name text NOT NULL,
  item_description text,
  quantity numeric(10,2) NOT NULL,
  unit text NOT NULL, -- 'square', 'linear_foot', 'sheet', 'each'
  unit_price numeric(10,2) NOT NULL,
  total_price numeric(10,2) NOT NULL,
  
  -- Category
  category text, -- 'materials', 'labor', 'tear_off', 'disposal', 'accessories', 'warranty'
  
  sort_order int DEFAULT 0,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_line_items_proposal ON public.proposal_line_items(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_tier ON public.proposal_line_items(proposal_id, option_tier);

-- ============================================================================
-- PART 4 — CREATE proposal_tracking_events TABLE
-- ============================================================================
-- Enhanced tracking for proposal interactions

CREATE TABLE IF NOT EXISTS public.proposal_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  
  event_type text NOT NULL CHECK (event_type IN (
    'viewed',
    'shared',
    'section_viewed', -- Which section (pricing, warranty, financing, etc.)
    'package_clicked', -- Which package (good/better/best)
    'addon_selected',
    'financing_calculator_used',
    'time_spent', -- Time spent on proposal
    'abandoned',
    'signed',
    'approved'
  )),
  
  metadata jsonb DEFAULT '{}'::jsonb, -- Additional event data
  -- Example metadata:
  -- {
  --   "section": "pricing",
  --   "package": "better",
  --   "time_seconds": 45,
  --   "scroll_depth": 75
  -- }
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_tracking_events_proposal ON public.proposal_tracking_events(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_tracking_events_type ON public.proposal_tracking_events(event_type);
CREATE INDEX IF NOT EXISTS idx_proposal_tracking_events_created ON public.proposal_tracking_events(created_at DESC);

-- ============================================================================
-- PART 5 — CREATE proposal_followup_sequences TABLE
-- ============================================================================
-- Manages automated follow-up sequences

CREATE TABLE IF NOT EXISTS public.proposal_followup_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  
  sequence_step int NOT NULL, -- 1, 2, 3, 4 (Day 1, 3, 5, 7)
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  message_type text NOT NULL CHECK (message_type IN (
    'questions_check',
    'options_discussion',
    'upgrade_credit',
    'final_reminder'
  )),
  
  message_content text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_followup_sequences_proposal ON public.proposal_followup_sequences(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_followup_sequences_scheduled ON public.proposal_followup_sequences(scheduled_for) WHERE sent_at IS NULL;

-- ============================================================================
-- PART 6 — FUNCTIONS
-- ============================================================================

-- Function: Calculate proposal pricing based on inputs
CREATE OR REPLACE FUNCTION public.calculate_proposal_pricing(
  p_workspace_id uuid,
  p_squares numeric,
  p_pitch text DEFAULT 'medium',
  p_material_type text DEFAULT 'asphalt',
  p_insurance boolean DEFAULT false,
  p_addons jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_config public.proposal_pricing_config%ROWTYPE;
  v_good_price numeric;
  v_better_price numeric;
  v_best_price numeric;
  v_base_material_cost numeric;
  v_base_labor_cost numeric;
  v_tear_off_cost numeric;
  v_disposal_cost numeric;
  v_pitch_multiplier numeric;
  v_addon_cost numeric := 0;
BEGIN
  -- Get pricing config
  SELECT * INTO v_config
  FROM public.proposal_pricing_config
  WHERE workspace_id = p_workspace_id
  LIMIT 1;
  
  -- If no config, use defaults
  IF NOT FOUND THEN
    v_config.price_per_square := 240.00;
    v_config.tear_off_per_square := 25.00;
    v_config.disposal_per_square := 15.00;
    v_config.good_material_multiplier := 1.0;
    v_config.better_material_multiplier := 1.3;
    v_config.best_material_multiplier := 1.6;
    v_config.good_labor_multiplier := 1.0;
    v_config.better_labor_multiplier := 1.15;
    v_config.best_labor_multiplier := 1.3;
    v_config.profit_margin_percent := 20.0;
  END IF;
  
  -- Pitch multiplier
  v_pitch_multiplier := CASE p_pitch
    WHEN 'low' THEN 1.0
    WHEN 'medium' THEN 1.1
    WHEN 'high' THEN 1.25
    WHEN 'steep' THEN 1.4
    ELSE 1.0
  END;
  
  -- Base costs
  v_base_material_cost := v_config.price_per_square * p_squares;
  v_base_labor_cost := v_config.price_per_square * 0.4 * p_squares * v_pitch_multiplier; -- Labor is ~40% of material
  v_tear_off_cost := v_config.tear_off_per_square * p_squares;
  v_disposal_cost := v_config.disposal_per_square * p_squares;
  
  -- Calculate addon costs
  IF p_addons ? 'ridge_vent' THEN
    v_addon_cost := v_addon_cost + (v_config.ridge_vent_per_linear_foot * (p_addons->>'ridge_vent')::numeric);
  END IF;
  IF p_addons ? 'decking_repair' THEN
    v_addon_cost := v_addon_cost + (v_config.decking_per_sheet * (p_addons->>'decking_repair')::numeric);
  END IF;
  IF p_addons ? 'chimney_flashing' THEN
    v_addon_cost := v_addon_cost + v_config.chimney_flashing_fixed;
  END IF;
  IF p_addons ? 'skylight_replacement' THEN
    v_addon_cost := v_addon_cost + (v_config.skylight_replacement_fixed * (p_addons->>'skylight_replacement')::numeric);
  END IF;
  
  -- Calculate Good/Better/Best prices
  v_good_price := (
    (v_base_material_cost * v_config.good_material_multiplier) +
    (v_base_labor_cost * v_config.good_labor_multiplier) +
    v_tear_off_cost +
    v_disposal_cost +
    v_addon_cost
  ) * (1 + v_config.profit_margin_percent / 100.0);
  
  v_better_price := (
    (v_base_material_cost * v_config.better_material_multiplier) +
    (v_base_labor_cost * v_config.better_labor_multiplier) +
    v_tear_off_cost +
    v_disposal_cost +
    v_addon_cost
  ) * (1 + v_config.profit_margin_percent / 100.0);
  
  v_best_price := (
    (v_base_material_cost * v_config.best_material_multiplier) +
    (v_base_labor_cost * v_config.best_labor_multiplier) +
    v_tear_off_cost +
    v_disposal_cost +
    v_addon_cost
  ) * (1 + v_config.profit_margin_percent / 100.0);
  
  -- Insurance pricing (typically 5-10% higher)
  IF p_insurance THEN
    v_good_price := v_good_price * 1.08;
    v_better_price := v_better_price * 1.08;
    v_best_price := v_best_price * 1.08;
  END IF;
  
  RETURN jsonb_build_object(
    'good_price', ROUND(v_good_price, 2),
    'better_price', ROUND(v_better_price, 2),
    'best_price', ROUND(v_best_price, 2),
    'breakdown', jsonb_build_object(
      'base_material_cost', ROUND(v_base_material_cost, 2),
      'base_labor_cost', ROUND(v_base_labor_cost, 2),
      'tear_off_cost', ROUND(v_tear_off_cost, 2),
      'disposal_cost', ROUND(v_disposal_cost, 2),
      'addon_cost', ROUND(v_addon_cost, 2),
      'pitch_multiplier', v_pitch_multiplier
    )
  );
END;
$$;

-- Function: Get proposal analytics
CREATE OR REPLACE FUNCTION public.get_proposal_analytics(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'proposal_id', p_proposal_id,
    'total_views', (
      SELECT COUNT(*) FROM public.proposal_tracking_events
      WHERE proposal_id = p_proposal_id AND event_type = 'viewed'
    ),
    'time_spent_seconds', (
      SELECT COALESCE(SUM((metadata->>'time_seconds')::numeric), 0)
      FROM public.proposal_tracking_events
      WHERE proposal_id = p_proposal_id AND event_type = 'time_spent'
    ),
    'most_clicked_package', (
      SELECT metadata->>'package'
      FROM public.proposal_tracking_events
      WHERE proposal_id = p_proposal_id AND event_type = 'package_clicked'
      GROUP BY metadata->>'package'
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ),
    'sections_viewed', (
      SELECT jsonb_agg(DISTINCT metadata->>'section')
      FROM public.proposal_tracking_events
      WHERE proposal_id = p_proposal_id AND event_type = 'section_viewed'
    ),
    'abandoned', (
      SELECT COUNT(*) > 0 FROM public.proposal_tracking_events
      WHERE proposal_id = p_proposal_id AND event_type = 'abandoned'
    ),
    'last_viewed_at', (
      SELECT MAX(created_at) FROM public.proposal_tracking_events
      WHERE proposal_id = p_proposal_id AND event_type = 'viewed'
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 7 — TRIGGERS
-- ============================================================================

-- Auto-update updated_at on proposal_pricing_config
CREATE OR REPLACE FUNCTION public.tg_update_proposal_pricing_config_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_update_proposal_pricing_config_updated_at
BEFORE UPDATE ON public.proposal_pricing_config
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_proposal_pricing_config_updated_at();

-- Auto-schedule follow-up sequences when proposal is sent
CREATE OR REPLACE FUNCTION public.tg_schedule_proposal_followups()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only schedule if status changed to 'sent'
  IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent') THEN
    -- Schedule Day 1 follow-up
    INSERT INTO public.proposal_followup_sequences (proposal_id, sequence_step, scheduled_for, message_type)
    VALUES (NEW.id, 1, now() + interval '1 day', 'questions_check');
    
    -- Schedule Day 3 follow-up
    INSERT INTO public.proposal_followup_sequences (proposal_id, sequence_step, scheduled_for, message_type)
    VALUES (NEW.id, 2, now() + interval '3 days', 'options_discussion');
    
    -- Schedule Day 5 follow-up
    INSERT INTO public.proposal_followup_sequences (proposal_id, sequence_step, scheduled_for, message_type)
    VALUES (NEW.id, 3, now() + interval '5 days', 'upgrade_credit');
    
    -- Schedule Day 7 follow-up
    INSERT INTO public.proposal_followup_sequences (proposal_id, sequence_step, scheduled_for, message_type)
    VALUES (NEW.id, 4, now() + interval '7 days', 'final_reminder');
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_schedule_proposal_followups ON public.proposals;
CREATE TRIGGER tr_schedule_proposal_followups
AFTER UPDATE OF status ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.tg_schedule_proposal_followups();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.proposal_pricing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_followup_sequences ENABLE ROW LEVEL SECURITY;

-- Pricing config: Workspace members can access
CREATE POLICY "pricing_config_workspace_members"
  ON public.proposal_pricing_config FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Line items: Workspace members can access
CREATE POLICY "line_items_workspace_members"
  ON public.proposal_line_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = proposal_line_items.proposal_id
      AND p.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Tracking events: Workspace members can view, public can insert (for homeowner tracking)
CREATE POLICY "tracking_events_workspace_members"
  ON public.proposal_tracking_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = proposal_tracking_events.proposal_id
      AND p.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "tracking_events_public_insert"
  ON public.proposal_tracking_events FOR INSERT
  WITH CHECK (true); -- Allow public inserts for homeowner tracking

-- Follow-up sequences: Workspace members can access
CREATE POLICY "followup_sequences_workspace_members"
  ON public.proposal_followup_sequences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = proposal_followup_sequences.proposal_id
      AND p.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- PART 9 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.proposal_pricing_config TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.proposal_line_items TO authenticated;
GRANT SELECT, INSERT ON public.proposal_tracking_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.proposal_followup_sequences TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_proposal_pricing TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_proposal_analytics TO authenticated;

-- Allow public to insert tracking events (for homeowner tracking)
GRANT INSERT ON public.proposal_tracking_events TO anon;

-- ============================================================================
-- PART 10 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.proposal_pricing_config IS 'Pricing configuration for proposal calculations (Block 40850)';
COMMENT ON TABLE public.proposal_line_items IS 'Line-item breakdown for proposal options (Block 40850)';
COMMENT ON TABLE public.proposal_tracking_events IS 'Enhanced proposal tracking and analytics (Block 40850)';
COMMENT ON TABLE public.proposal_followup_sequences IS 'Automated follow-up sequences for proposals (Block 40850)';
COMMENT ON FUNCTION public.calculate_proposal_pricing IS 'Calculates Good/Better/Best pricing based on inputs (Block 40850)';
COMMENT ON FUNCTION public.get_proposal_analytics IS 'Returns analytics for a proposal (Block 40850)';
































