-- =========================================================
-- Block 36110 — SmartSend Roofing "Proposal Builder + Instant Quote Engine" v1
-- (Generate professional roofing proposals instantly • Auto-fill scope, materials, pricing • Track proposal views • Handle e-signature • Send follow-up automatically)
-- =========================================================

-- ============================================================================
-- PART 1 — EXTEND proposals TABLE FOR BLOCK 36110
-- ============================================================================

-- Add fields for proposal tracking and content
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS html_content text,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS viewed_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS token text UNIQUE, -- Public token for homeowner access
  ADD COLUMN IF NOT EXISTS expires_at timestamptz, -- Proposal expiration date
  ADD COLUMN IF NOT EXISTS material_selection jsonb DEFAULT '{}'::jsonb, -- Selected materials package
  ADD COLUMN IF NOT EXISTS warranty_details jsonb DEFAULT '{}'::jsonb, -- Warranty information
  ADD COLUMN IF NOT EXISTS financing_options jsonb DEFAULT '{}'::jsonb, -- Financing details
  ADD COLUMN IF NOT EXISTS before_photos text[], -- Array of photo URLs
  ADD COLUMN IF NOT EXISTS estimated_start_date date,
  ADD COLUMN IF NOT EXISTS quote_data jsonb DEFAULT '{}'::jsonb; -- Store quote calculation inputs/outputs

-- Update status enum to include 'expired' if not already present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'status'
  ) THEN
    -- Drop existing constraint if it exists
    ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
    
    -- Add new constraint with all statuses including 'expired'
    ALTER TABLE public.proposals 
      ADD CONSTRAINT proposals_status_check 
      CHECK (status IN (
        'draft', 'generated', 'sent', 'viewed', 'signed', 'approved', 'rejected', 'won', 'lost', 'considering', 'declined', 'expired'
      ));
  END IF;
END $$;

-- Create index for token lookups (public access)
CREATE INDEX IF NOT EXISTS idx_proposals_token ON public.proposals(token) WHERE token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_viewed_count ON public.proposals(viewed_count DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_last_viewed ON public.proposals(last_viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_status_lead ON public.proposals(status, lead_id);

-- ============================================================================
-- PART 2 — CREATE proposal_events TABLE (if not exists)
-- ============================================================================
-- Tracks all proposal interactions: views, signatures, reminders, etc.

CREATE TABLE IF NOT EXISTS public.proposal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'viewed',
    'signed',
    'reminder_sent',
    'financing_clicked',
    'warranty_viewed',
    'pricing_viewed',
    'photo_viewed',
    'comment_added',
    'question_asked',
    'expired'
  )),
  metadata jsonb DEFAULT '{}'::jsonb, -- Additional event data
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_events_proposal ON public.proposal_events(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_events_type ON public.proposal_events(event_type);
CREATE INDEX IF NOT EXISTS idx_proposal_events_created ON public.proposal_events(created_at DESC);

-- ============================================================================
-- PART 3 — CREATE proposal_signatures TABLE (if not exists)
-- ============================================================================
-- Stores e-signature data for proposals

CREATE TABLE IF NOT EXISTS public.proposal_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  signer_email text,
  signature_data text, -- Base64 encoded signature image or typed signature
  signature_type text CHECK (signature_type IN ('typed', 'drawn', 'uploaded')) DEFAULT 'typed',
  ip_address inet,
  user_agent text,
  signed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_signatures_proposal ON public.proposal_signatures(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_signatures_signed_at ON public.proposal_signatures(signed_at DESC);

-- ============================================================================
-- PART 4 — CREATE quote_calculations TABLE
-- ============================================================================
-- Stores instant quote calculations for reference and audit

CREATE TABLE IF NOT EXISTS public.quote_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Inputs
  roof_size_squares numeric NOT NULL,
  roof_pitch text, -- 'low', 'medium', 'high', 'steep'
  material_type text NOT NULL, -- 'asphalt', 'metal', 'tile', 'tpo', etc.
  layers_to_tear_off int DEFAULT 1,
  travel_distance_miles numeric DEFAULT 0,
  waste_factor_percent numeric DEFAULT 12.0,
  
  -- Calculated outputs
  material_cost numeric,
  labor_cost numeric,
  tear_off_cost numeric,
  disposal_cost numeric,
  travel_cost numeric,
  total_cost numeric,
  profit_margin_percent numeric DEFAULT 20.0,
  suggested_retail numeric,
  insurance_match_price numeric, -- Price to match insurance estimate
  
  -- Metadata
  calculation_metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_calculations_proposal ON public.quote_calculations(proposal_id);
CREATE INDEX IF NOT EXISTS idx_quote_calculations_lead ON public.quote_calculations(lead_id);
CREATE INDEX IF NOT EXISTS idx_quote_calculations_workspace ON public.quote_calculations(workspace_id);

-- ============================================================================
-- PART 5 — TRIGGERS
-- ============================================================================

-- Auto-update proposal status and viewed_count when viewed
CREATE OR REPLACE FUNCTION public.tg_proposal_viewed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update proposal viewed_count and last_viewed_at
  UPDATE public.proposals
  SET 
    viewed_count = COALESCE(viewed_count, 0) + 1,
    last_viewed_at = now(),
    status = CASE 
      WHEN status = 'sent' THEN 'viewed'
      ELSE status
    END
  WHERE id = NEW.proposal_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_proposal_viewed ON public.proposal_events;
CREATE TRIGGER tr_proposal_viewed
AFTER INSERT ON public.proposal_events
FOR EACH ROW
WHEN (NEW.event_type = 'viewed')
EXECUTE FUNCTION public.tg_proposal_viewed();

-- Auto-update proposal status when signed
CREATE OR REPLACE FUNCTION public.tg_proposal_signed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update proposal status
  UPDATE public.proposals
  SET 
    status = 'signed',
    signed_at = NEW.signed_at
  WHERE id = NEW.proposal_id;
  
  -- Update job stage if job_id exists
  IF EXISTS (SELECT 1 FROM public.proposals WHERE id = NEW.proposal_id AND job_id IS NOT NULL) THEN
    UPDATE public.jobs
    SET stage = 'approved'
    WHERE id = (SELECT job_id FROM public.proposals WHERE id = NEW.proposal_id);
  END IF;
  
  -- Update lead status if lead_id exists
  IF EXISTS (SELECT 1 FROM public.proposals WHERE id = NEW.proposal_id AND lead_id IS NOT NULL) THEN
    UPDATE public.leads
    SET status = 'won'
    WHERE id = (SELECT lead_id FROM public.proposals WHERE id = NEW.proposal_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_proposal_signed ON public.proposal_signatures;
CREATE TRIGGER tr_proposal_signed
AFTER INSERT ON public.proposal_signatures
FOR EACH ROW
EXECUTE FUNCTION public.tg_proposal_signed();

-- Auto-generate token for proposals
CREATE OR REPLACE FUNCTION public.generate_proposal_token()
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64url');
END;
$$;

-- Set default token on proposal creation
CREATE OR REPLACE FUNCTION public.tg_proposal_set_token()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.token IS NULL THEN
    NEW.token := public.generate_proposal_token();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_proposal_set_token ON public.proposals;
CREATE TRIGGER tr_proposal_set_token
BEFORE INSERT ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.tg_proposal_set_token();

-- ============================================================================
-- PART 6 — FUNCTION: calculate_instant_quote
-- ============================================================================
-- Instant quote engine: calculates pricing based on roof specs

CREATE OR REPLACE FUNCTION public.calculate_instant_quote(
  p_roof_size_squares numeric,
  p_roof_pitch text,
  p_material_type text,
  p_layers_to_tear_off int DEFAULT 1,
  p_travel_distance_miles numeric DEFAULT 0,
  p_waste_factor_percent numeric DEFAULT 12.0,
  p_profit_margin_percent numeric DEFAULT 20.0
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_material_cost_per_sq numeric;
  v_labor_cost_per_sq numeric;
  v_tear_off_cost_per_sq numeric;
  v_disposal_cost_per_sq numeric;
  v_travel_cost numeric;
  v_pitch_multiplier numeric;
  v_total_material_cost numeric;
  v_total_labor_cost numeric;
  v_total_tear_off_cost numeric;
  v_total_disposal_cost numeric;
  v_total_cost numeric;
  v_suggested_retail numeric;
  v_insurance_match_price numeric;
BEGIN
  -- Base material costs per square (adjust based on material type)
  v_material_cost_per_sq := CASE p_material_type
    WHEN 'asphalt' THEN 120.0
    WHEN 'metal' THEN 350.0
    WHEN 'tile' THEN 450.0
    WHEN 'tpo' THEN 280.0
    WHEN 'epdm' THEN 250.0
    ELSE 120.0
  END;
  
  -- Base labor costs per square
  v_labor_cost_per_sq := CASE p_material_type
    WHEN 'asphalt' THEN 80.0
    WHEN 'metal' THEN 120.0
    WHEN 'tile' THEN 150.0
    WHEN 'tpo' THEN 100.0
    WHEN 'epdm' THEN 95.0
    ELSE 80.0
  END;
  
  -- Tear-off cost per square (per layer)
  v_tear_off_cost_per_sq := 25.0 * p_layers_to_tear_off;
  
  -- Disposal cost per square
  v_disposal_cost_per_sq := 15.0;
  
  -- Pitch multiplier (steeper = more expensive)
  v_pitch_multiplier := CASE p_roof_pitch
    WHEN 'low' THEN 1.0
    WHEN 'medium' THEN 1.1
    WHEN 'high' THEN 1.25
    WHEN 'steep' THEN 1.4
    ELSE 1.0
  END;
  
  -- Apply waste factor to material cost
  v_total_material_cost := v_material_cost_per_sq * p_roof_size_squares * (1 + p_waste_factor_percent / 100.0);
  
  -- Calculate other costs
  v_total_labor_cost := v_labor_cost_per_sq * p_roof_size_squares * v_pitch_multiplier;
  v_total_tear_off_cost := v_tear_off_cost_per_sq * p_roof_size_squares;
  v_total_disposal_cost := v_disposal_cost_per_sq * p_roof_size_squares;
  
  -- Travel cost (if applicable)
  v_travel_cost := GREATEST(0, (p_travel_distance_miles - 25) * 2.0); -- Free within 25 miles, $2/mile after
  
  -- Total cost
  v_total_cost := v_total_material_cost + v_total_labor_cost + v_total_tear_off_cost + v_total_disposal_cost + v_travel_cost;
  
  -- Suggested retail (cost + profit margin)
  v_suggested_retail := v_total_cost * (1 + p_profit_margin_percent / 100.0);
  
  -- Insurance match price (typically 5-10% higher than retail for negotiation room)
  v_insurance_match_price := v_suggested_retail * 1.08;
  
  RETURN jsonb_build_object(
    'material_cost', ROUND(v_total_material_cost, 2),
    'labor_cost', ROUND(v_total_labor_cost, 2),
    'tear_off_cost', ROUND(v_total_tear_off_cost, 2),
    'disposal_cost', ROUND(v_total_disposal_cost, 2),
    'travel_cost', ROUND(v_travel_cost, 2),
    'total_cost', ROUND(v_total_cost, 2),
    'profit_margin_percent', p_profit_margin_percent,
    'suggested_retail', ROUND(v_suggested_retail, 2),
    'insurance_match_price', ROUND(v_insurance_match_price, 2),
    'breakdown', jsonb_build_object(
      'material_cost_per_sq', v_material_cost_per_sq,
      'labor_cost_per_sq', v_labor_cost_per_sq,
      'pitch_multiplier', v_pitch_multiplier,
      'waste_factor_percent', p_waste_factor_percent
    )
  );
END;
$$;

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE public.proposal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_calculations ENABLE ROW LEVEL SECURITY;

-- Proposal events: Users can view events for proposals in their workspace
CREATE POLICY "Users can view proposal events in their workspace"
  ON public.proposal_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = proposal_events.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

-- Proposal signatures: Users can view signatures for proposals in their workspace
CREATE POLICY "Users can view proposal signatures in their workspace"
  ON public.proposal_signatures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = proposal_signatures.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

-- Allow public access to proposals via token (for homeowner viewing)
CREATE POLICY "Public can view proposals by token"
  ON public.proposals FOR SELECT
  USING (token IS NOT NULL);

-- Quote calculations: Users can view calculations in their workspace
CREATE POLICY "Users can view quote calculations in their workspace"
  ON public.quote_calculations FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create quote calculations in their workspace"
  ON public.quote_calculations FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT ON public.proposal_events TO authenticated;
GRANT SELECT, INSERT ON public.proposal_signatures TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quote_calculations TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_instant_quote TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_proposal_token TO authenticated;

-- Allow public to read proposals by token (for homeowner access)
GRANT SELECT ON public.proposals TO anon;
GRANT SELECT ON public.proposal_events TO anon;
GRANT SELECT ON public.proposal_signatures TO anon;
































