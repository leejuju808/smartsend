-- ============================================================
-- Block 256600 — SmartSend Insurance Supplement Engine v1
-- AI Scope Comparison, Missing Line Items Detection, 
-- Pricing Corrections, Profit Optimization for Insurance Jobs
-- ============================================================
-- 
-- This block is PURE MONEY.
-- It turns SmartSend into the roofing company's insurance profit weapon —
-- automatically spotting every missing item the insurance adjuster left out.
--
-- Roofers lose $2,000–$12,000 PER JOB because:
-- - insurance scopes are ALWAYS missing items
-- - reps don't know how to supplement correctly
-- - PMs forget line items
-- - insurance companies underpay
-- - companies don't catch everything
-- - supplementing takes too long
-- - owners don't have time to review scopes
-- - no one knows Xactimate pricing
-- - supplement letters are poorly written
--
-- SmartSend fixes ALL OF IT.
-- ============================================================

-- ============================================================================
-- PART 1 — INSURANCE SCOPES TABLE
-- ============================================================================
-- Stores insurance scope PDFs and parsed structured data

CREATE TABLE IF NOT EXISTS public.insurance_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  -- Insurance carrier info
  carrier text NOT NULL, -- e.g. "State Farm", "Allstate"
  claim_number text,
  policy_number text,
  adjuster_name text,
  adjuster_email text,
  adjuster_phone text,
  
  -- PDF storage
  raw_pdf_url text, -- URL to original PDF in storage
  raw_pdf_path text, -- Storage path for original PDF
  
  -- Parsed scope data (structured JSON)
  parsed_scope jsonb DEFAULT '{}'::jsonb, -- Full parsed scope structure
  line_items jsonb DEFAULT '[]'::jsonb, -- Array of line items extracted
  
  -- Financial summary
  total_paid numeric(12,2) DEFAULT 0,
  total_acv numeric(12,2) DEFAULT 0, -- Actual Cash Value
  total_rcv numeric(12,2) DEFAULT 0, -- Replacement Cost Value
  depreciation numeric(12,2) DEFAULT 0,
  deductible numeric(12,2) DEFAULT 0,
  o_p numeric(12,2) DEFAULT 0, -- Overhead & Profit
  
  -- Scope metadata
  scope_date date,
  region text, -- For Xactimate pricing lookup
  roof_squares numeric(10,2),
  roof_pitch numeric(5,2), -- e.g. 6.0 for 6/12 pitch
  roof_type text, -- "shingles", "tile", "metal", etc.
  
  -- Processing status
  parsing_status text DEFAULT 'pending' CHECK (parsing_status IN (
    'pending',
    'processing',
    'completed',
    'failed'
  )),
  parsing_error text,
  parsed_at timestamptz,
  
  -- Analysis flags
  has_missing_items boolean DEFAULT false,
  supplement_opportunity_score int DEFAULT 0 CHECK (supplement_opportunity_score >= 0 AND supplement_opportunity_score <= 100),
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for insurance_scopes
CREATE INDEX IF NOT EXISTS idx_insurance_scopes_job ON public.insurance_scopes(job_id);
CREATE INDEX IF NOT EXISTS idx_insurance_scopes_customer ON public.insurance_scopes(customer_id);
CREATE INDEX IF NOT EXISTS idx_insurance_scopes_team ON public.insurance_scopes(team_id);
CREATE INDEX IF NOT EXISTS idx_insurance_scopes_workspace ON public.insurance_scopes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_scopes_company ON public.insurance_scopes(company_id);
CREATE INDEX IF NOT EXISTS idx_insurance_scopes_carrier ON public.insurance_scopes(carrier);
CREATE INDEX IF NOT EXISTS idx_insurance_scopes_claim_number ON public.insurance_scopes(claim_number);
CREATE INDEX IF NOT EXISTS idx_insurance_scopes_parsing_status ON public.insurance_scopes(parsing_status);
CREATE INDEX IF NOT EXISTS idx_insurance_scopes_opportunity_score ON public.insurance_scopes(supplement_opportunity_score DESC) WHERE has_missing_items = true;

-- ============================================================================
-- PART 2 — SUPPLEMENT LINE ITEMS TABLE
-- ============================================================================
-- Individual missing line items detected from scope comparison

CREATE TABLE IF NOT EXISTS public.supplement_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id uuid NOT NULL REFERENCES public.insurance_scopes(id) ON DELETE CASCADE,
  supplement_request_id uuid REFERENCES public.supplement_requests(id) ON DELETE SET NULL,
  
  -- Line item identification
  code text, -- Xactimate code or custom code
  description text NOT NULL,
  category text, -- "code_required", "missing_standard", "pricing_correction", "waste_factor", etc.
  
  -- Quantities and pricing
  quantity numeric(10,2) DEFAULT 1,
  unit text DEFAULT 'EA', -- "SQ", "LF", "EA", "ROLL", etc.
  unit_price numeric(10,2) DEFAULT 0,
  total_price numeric(12,2) DEFAULT 0,
  
  -- Pricing comparison (if applicable)
  carrier_paid_price numeric(10,2), -- What carrier paid (if item exists but underpaid)
  xactimate_price numeric(10,2), -- Correct Xactimate price
  price_difference numeric(10,2) DEFAULT 0,
  
  -- Detection reason
  reason text NOT NULL, -- Why this item is missing/needed
  reason_type text CHECK (reason_type IN (
    'code_required',
    'missing_standard',
    'pricing_correction',
    'waste_factor',
    'steep_charge',
    'high_wind_zone',
    'manufacturer_requirement',
    'property_protection',
    'other'
  )),
  
  -- Evidence
  evidence_photos jsonb DEFAULT '[]'::jsonb, -- Array of photo URLs/IDs that prove this item
  code_reference text, -- Building code reference if code_required
  
  -- Status tracking
  status text DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Detected but not yet in supplement request
    'in_request',   -- Included in a supplement request
    'submitted',    -- Supplement request submitted to carrier
    'approved',     -- Approved by adjuster
    'denied',       -- Denied by adjuster
    'negotiating'   -- Under negotiation
  )),
  
  -- Approval tracking
  approved_at timestamptz,
  approved_amount numeric(12,2), -- May be less than requested
  denied_reason text,
  
  -- Metadata
  detected_by_ai boolean DEFAULT true,
  confidence_score numeric(5,2) DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for supplement_line_items
CREATE INDEX IF NOT EXISTS idx_supplement_line_items_scope ON public.supplement_line_items(scope_id);
CREATE INDEX IF NOT EXISTS idx_supplement_line_items_request ON public.supplement_line_items(supplement_request_id);
CREATE INDEX IF NOT EXISTS idx_supplement_line_items_status ON public.supplement_line_items(status);
CREATE INDEX IF NOT EXISTS idx_supplement_line_items_category ON public.supplement_line_items(category);
CREATE INDEX IF NOT EXISTS idx_supplement_line_items_reason_type ON public.supplement_line_items(reason_type);

-- ============================================================================
-- PART 3 — SUPPLEMENT REQUESTS TABLE
-- ============================================================================
-- Complete supplement requests sent to insurance carriers

CREATE TABLE IF NOT EXISTS public.supplement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  scope_id uuid NOT NULL REFERENCES public.insurance_scopes(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  -- Request identification
  supplement_number int DEFAULT 1, -- 1st supplement, 2nd supplement, etc.
  request_date date DEFAULT CURRENT_DATE,
  
  -- Items included
  items jsonb DEFAULT '[]'::jsonb, -- Array of supplement_line_items IDs or full item data
  
  -- Generated documents
  letter_url text, -- URL to generated supplement letter PDF
  letter_path text, -- Storage path for supplement letter PDF
  evidence_pack_url text, -- URL to evidence photo pack
  evidence_pack_path text, -- Storage path for evidence pack
  
  -- Financial summary
  total_requested numeric(12,2) DEFAULT 0,
  total_approved numeric(12,2) DEFAULT 0,
  total_denied numeric(12,2) DEFAULT 0,
  
  -- Status tracking
  status text DEFAULT 'draft' CHECK (status IN (
    'draft',           -- Being prepared
    'submitted',       -- Sent to adjuster
    'under_review',    -- Adjuster reviewing
    'approved',        -- Fully approved
    'partially_approved', -- Some items approved
    'denied',          -- Fully denied
    'negotiating'      -- Back and forth
  )),
  
  -- Communication tracking
  submitted_at timestamptz,
  submitted_to text, -- Adjuster name/email
  submitted_via text, -- "email", "portal", "fax", etc.
  response_received_at timestamptz,
  response_notes text,
  
  -- Follow-up automation
  last_follow_up_at timestamptz,
  next_follow_up_due timestamptz,
  follow_up_count int DEFAULT 0,
  auto_escalate boolean DEFAULT false,
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for supplement_requests
CREATE INDEX IF NOT EXISTS idx_supplement_requests_job ON public.supplement_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_supplement_requests_scope ON public.supplement_requests(scope_id);
CREATE INDEX IF NOT EXISTS idx_supplement_requests_team ON public.supplement_requests(team_id);
CREATE INDEX IF NOT EXISTS idx_supplement_requests_workspace ON public.supplement_requests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_supplement_requests_company ON public.supplement_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_supplement_requests_status ON public.supplement_requests(status);
CREATE INDEX IF NOT EXISTS idx_supplement_requests_next_followup ON public.supplement_requests(next_follow_up_due) WHERE status IN ('submitted', 'under_review', 'negotiating');

-- ============================================================================
-- PART 4 — SUPPLEMENT FOLLOW-UP TIMELINE TABLE
-- ============================================================================
-- Automated follow-up tracking and reminders

CREATE TABLE IF NOT EXISTS public.supplement_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplement_request_id uuid NOT NULL REFERENCES public.supplement_requests(id) ON DELETE CASCADE,
  
  -- Follow-up details
  follow_up_type text NOT NULL CHECK (follow_up_type IN (
    'initial_submission',
    'day_3_reminder',
    'day_7_escalation',
    'day_14_supervisor',
    'custom'
  )),
  scheduled_for timestamptz NOT NULL,
  completed_at timestamptz,
  
  -- Action taken
  action_taken text, -- "email_sent", "call_made", "portal_message", etc.
  action_details jsonb DEFAULT '{}'::jsonb,
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN (
    'pending',
    'completed',
    'skipped',
    'cancelled'
  )),
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for supplement_follow_ups
CREATE INDEX IF NOT EXISTS idx_supplement_follow_ups_request ON public.supplement_follow_ups(supplement_request_id);
CREATE INDEX IF NOT EXISTS idx_supplement_follow_ups_scheduled ON public.supplement_follow_ups(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_supplement_follow_ups_status ON public.supplement_follow_ups(status);

-- ============================================================================
-- PART 5 — PHOTO EVIDENCE MATCHING TABLE
-- ============================================================================
-- Links photos to supplement line items with AI analysis

CREATE TABLE IF NOT EXISTS public.supplement_photo_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplement_line_item_id uuid NOT NULL REFERENCES public.supplement_line_items(id) ON DELETE CASCADE,
  
  -- Photo reference
  photo_url text NOT NULL,
  photo_path text,
  photo_id uuid, -- Reference to photos table if exists
  
  -- AI analysis
  ai_analysis jsonb DEFAULT '{}'::jsonb, -- AI analysis of photo
  ai_confidence numeric(5,2) DEFAULT 0 CHECK (ai_confidence >= 0 AND ai_confidence <= 100),
  ai_findings text, -- What AI detected in photo
  ai_recommendation text, -- AI recommendation based on photo
  
  -- Manual override
  manual_label text, -- Manual label if AI is wrong
  is_primary_evidence boolean DEFAULT false, -- Primary photo for this line item
  
  -- Metadata
  uploaded_at timestamptz DEFAULT now(),
  analyzed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes for supplement_photo_evidence
CREATE INDEX IF NOT EXISTS idx_supplement_photo_evidence_item ON public.supplement_photo_evidence(supplement_line_item_id);
CREATE INDEX IF NOT EXISTS idx_supplement_photo_evidence_primary ON public.supplement_photo_evidence(supplement_line_item_id, is_primary_evidence) WHERE is_primary_evidence = true;

-- ============================================================================
-- PART 6 — TRIGGERS AND FUNCTIONS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_insurance_scopes_updated_at
  BEFORE UPDATE ON public.insurance_scopes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_supplement_line_items_updated_at
  BEFORE UPDATE ON public.supplement_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_supplement_requests_updated_at
  BEFORE UPDATE ON public.supplement_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_supplement_follow_ups_updated_at
  BEFORE UPDATE ON public.supplement_follow_ups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate total_price for supplement_line_items
CREATE OR REPLACE FUNCTION calculate_line_item_total()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_price = COALESCE(NEW.quantity, 1) * COALESCE(NEW.unit_price, 0);
  IF NEW.carrier_paid_price IS NOT NULL AND NEW.xactimate_price IS NOT NULL THEN
    NEW.price_difference = NEW.xactimate_price - NEW.carrier_paid_price;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_supplement_line_item_total
  BEFORE INSERT OR UPDATE ON public.supplement_line_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_line_item_total();

-- Function to update supplement_opportunity_score on insurance_scopes
CREATE OR REPLACE FUNCTION update_supplement_opportunity_score()
RETURNS TRIGGER AS $$
DECLARE
  missing_count int;
  total_value numeric;
  score int;
BEGIN
  -- Count missing items and calculate total value
  SELECT COUNT(*), COALESCE(SUM(total_price), 0)
  INTO missing_count, total_value
  FROM public.supplement_line_items
  WHERE scope_id = NEW.scope_id
    AND status IN ('pending', 'in_request');
  
  -- Calculate score (0-100) based on count and value
  -- Score = (count * 10) + (value / 100), capped at 100
  score := LEAST(100, (missing_count * 10) + LEAST(50, (total_value / 100)::int));
  
  -- Update scope
  UPDATE public.insurance_scopes
  SET 
    supplement_opportunity_score = score,
    has_missing_items = (missing_count > 0)
  WHERE id = NEW.scope_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_scope_opportunity_score
  AFTER INSERT OR UPDATE ON public.supplement_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_supplement_opportunity_score();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.insurance_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplement_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplement_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplement_photo_evidence ENABLE ROW LEVEL SECURITY;

-- RLS Policies for insurance_scopes
CREATE POLICY "insurance_scopes_team_access"
  ON public.insurance_scopes
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "insurance_scopes_workspace_access"
  ON public.insurance_scopes
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for supplement_line_items
CREATE POLICY "supplement_line_items_scope_access"
  ON public.supplement_line_items
  FOR ALL
  USING (
    scope_id IN (
      SELECT id FROM public.insurance_scopes
      WHERE team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
         OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    )
  );

-- RLS Policies for supplement_requests
CREATE POLICY "supplement_requests_team_access"
  ON public.supplement_requests
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "supplement_requests_workspace_access"
  ON public.supplement_requests
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for supplement_follow_ups
CREATE POLICY "supplement_follow_ups_request_access"
  ON public.supplement_follow_ups
  FOR ALL
  USING (
    supplement_request_id IN (
      SELECT id FROM public.supplement_requests
      WHERE team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
         OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    )
  );

-- RLS Policies for supplement_photo_evidence
CREATE POLICY "supplement_photo_evidence_item_access"
  ON public.supplement_photo_evidence
  FOR ALL
  USING (
    supplement_line_item_id IN (
      SELECT id FROM public.supplement_line_items
      WHERE scope_id IN (
        SELECT id FROM public.insurance_scopes
        WHERE team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
           OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
      )
    )
  );

-- Service role bypass (for internal operations)
CREATE POLICY "insurance_scopes_service_role_all"
  ON public.insurance_scopes
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "supplement_line_items_service_role_all"
  ON public.supplement_line_items
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "supplement_requests_service_role_all"
  ON public.supplement_requests
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "supplement_follow_ups_service_role_all"
  ON public.supplement_follow_ups
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "supplement_photo_evidence_service_role_all"
  ON public.supplement_photo_evidence
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================





















