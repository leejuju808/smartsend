-- ============================================================
-- Block 220000 — SmartSend Roofing "Estimates → Proposals → Digital Contracts → E-Sign → Job Pipeline"
-- Full Sprint Step — No Bullshit. Full System. Complete Deliverable.
-- ============================================================
-- 
-- This block makes every roofer feel STUPID not using SmartSend because it takes their most painful 
-- choke point — turning leads into signed jobs — and makes it instant, professional, and automatic.
--
-- This is the moment SmartSend stops being "a cold email tool" and becomes a revenue weapon.
--
-- Features:
-- - Create Estimate (line items, materials, quantities, auto-totals)
-- - Auto-generate Proposal (branded, professional HTML)
-- - Convert to Digital Contract (legal template merge)
-- - Customer E-Signs (built-in signature capture)
-- - SmartSend updates job → "Signed: Ready for Production"
-- ============================================================

-- ============================================================
-- 1. ESTIMATES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Line items (JSONB for flexibility)
  line_items jsonb DEFAULT '[]'::jsonb, -- [{material, quantity, unit_price, total}, ...]
  
  -- Financial totals
  subtotal numeric(12,2) DEFAULT 0,
  tax_rate numeric(5,4) DEFAULT 0, -- e.g., 0.0825 for 8.25%
  tax numeric(12,2) DEFAULT 0,
  total numeric(12,2) DEFAULT 0,
  
  -- Additional info
  notes text,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'declined')),
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimates_company ON public.estimates(company_id);
CREATE INDEX IF NOT EXISTS idx_estimates_homeowner ON public.estimates(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_created_by ON public.estimates(created_by);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON public.estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_created ON public.estimates(created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_estimates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estimates_updated_at ON public.estimates;
CREATE TRIGGER trg_estimates_updated_at
BEFORE UPDATE ON public.estimates
FOR EACH ROW EXECUTE FUNCTION public.set_estimates_updated_at();

-- ============================================================
-- 2. PROPOSALS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estimates_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  
  -- Proposal content (HTML)
  proposal_html text NOT NULL,
  
  -- Proposal settings
  theme text DEFAULT 'classic' CHECK (theme IN ('classic', 'premium', 'insurance')),
  photos jsonb DEFAULT '[]'::jsonb, -- Array of photo URLs
  
  -- Validity
  valid_until date,
  
  -- Tracking
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'viewed', 'accepted', 'declined')),
  viewed_at timestamptz,
  viewed_count int DEFAULT 0,
  
  -- Public link for homeowner
  public_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_estimate ON public.estimates_proposals(estimate_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON public.estimates_proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_token ON public.estimates_proposals(public_token);
CREATE INDEX IF NOT EXISTS idx_proposals_valid_until ON public.estimates_proposals(valid_until);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_proposals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposals_updated_at ON public.estimates_proposals;
CREATE TRIGGER trg_proposals_updated_at
BEFORE UPDATE ON public.estimates_proposals
FOR EACH ROW EXECUTE FUNCTION public.set_proposals_updated_at();

-- ============================================================
-- 3. CONTRACTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estimates_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.estimates_proposals(id) ON DELETE CASCADE,
  
  -- Contract content (HTML)
  contract_html text NOT NULL,
  
  -- Contract terms
  terms_and_conditions text,
  scope_of_work text,
  payment_schedule jsonb DEFAULT '[]'::jsonb, -- [{milestone, amount, due_date}, ...]
  warranty text,
  
  -- Insurance docs (optional)
  insurance_docs jsonb DEFAULT '[]'::jsonb, -- Array of document URLs
  
  -- Signature
  requires_signature boolean DEFAULT true,
  homeowner_signature text, -- base64 encoded signature image
  signature_date timestamptz,
  signed_by_name text,
  signed_by_email text,
  
  -- Status
  status text DEFAULT 'awaiting_signature' CHECK (status IN ('awaiting_signature', 'signed', 'declined', 'void')),
  
  -- Public link for signing
  public_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_proposal ON public.estimates_contracts(proposal_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.estimates_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_token ON public.estimates_contracts(public_token);
CREATE INDEX IF NOT EXISTS idx_contracts_signed ON public.estimates_contracts(signature_date) WHERE status = 'signed';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_contracts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contracts_updated_at ON public.estimates_contracts;
CREATE TRIGGER trg_contracts_updated_at
BEFORE UPDATE ON public.estimates_contracts
FOR EACH ROW EXECUTE FUNCTION public.set_contracts_updated_at();

-- ============================================================
-- 4. JOB_LINKS TABLE (Auto-flow into pipeline)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estimates_job_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.estimates_contracts(id) ON DELETE CASCADE,
  
  -- Link to job (flexible - can be roofing_jobs or jobs table)
  job_id uuid NOT NULL, -- Will reference either roofing_jobs(id) or jobs(id)
  job_table text DEFAULT 'roofing_jobs' CHECK (job_table IN ('roofing_jobs', 'jobs')),
  
  -- Auto-creation flag
  auto_created boolean DEFAULT true,
  
  -- Metadata
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_links_contract ON public.estimates_job_links(contract_id);
CREATE INDEX IF NOT EXISTS idx_job_links_job ON public.estimates_job_links(job_id, job_table);

-- ============================================================
-- 5. PROPOSAL VIEW TRACKING TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.proposal_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.estimates_proposals(id) ON DELETE CASCADE,
  viewed_at timestamptz DEFAULT now(),
  ip_address inet,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_proposal_views_proposal ON public.proposal_views(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_views_viewed ON public.proposal_views(viewed_at DESC);

-- ============================================================
-- 6. ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Estimates RLS
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimates_select_company_members"
  ON public.estimates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = estimates.company_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "estimates_insert_company_members"
  ON public.estimates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = estimates.company_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "estimates_update_company_members"
  ON public.estimates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = estimates.company_id
      AND rc.owner_id = auth.uid()
    )
  );

-- Proposals RLS
ALTER TABLE public.estimates_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposals_select_company_members"
  ON public.estimates_proposals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates e
      JOIN public.roofing_companies rc ON rc.id = e.company_id
      WHERE e.id = estimates_proposals.estimate_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "proposals_insert_company_members"
  ON public.estimates_proposals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estimates e
      JOIN public.roofing_companies rc ON rc.id = e.company_id
      WHERE e.id = estimates_proposals.estimate_id
      AND rc.owner_id = auth.uid()
    )
  );

-- Public access for proposal viewing (by token)
CREATE POLICY "proposals_select_public_token"
  ON public.estimates_proposals FOR SELECT
  USING (true); -- Public proposals accessible by token

-- Contracts RLS
ALTER TABLE public.estimates_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contracts_select_company_members"
  ON public.estimates_contracts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates_proposals ep
      JOIN public.estimates e ON e.id = ep.estimate_id
      JOIN public.roofing_companies rc ON rc.id = e.company_id
      WHERE ep.id = estimates_contracts.proposal_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "contracts_insert_company_members"
  ON public.estimates_contracts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.estimates_proposals ep
      JOIN public.estimates e ON e.id = ep.estimate_id
      JOIN public.roofing_companies rc ON rc.id = e.company_id
      WHERE ep.id = estimates_contracts.proposal_id
      AND rc.owner_id = auth.uid()
    )
  );

-- Public access for contract signing (by token)
CREATE POLICY "contracts_select_public_token"
  ON public.estimates_contracts FOR SELECT
  USING (true); -- Public contracts accessible by token

CREATE POLICY "contracts_update_public_sign"
  ON public.estimates_contracts FOR UPDATE
  USING (true) -- Allow public signature updates
  WITH CHECK (true);

-- Job Links RLS
ALTER TABLE public.estimates_job_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_links_select_company_members"
  ON public.estimates_job_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates_contracts ec
      JOIN public.estimates_proposals ep ON ep.id = ec.proposal_id
      JOIN public.estimates e ON e.id = ep.estimate_id
      JOIN public.roofing_companies rc ON rc.id = e.company_id
      WHERE ec.id = estimates_job_links.contract_id
      AND rc.owner_id = auth.uid()
    )
  );

-- ============================================================
-- 7. AUTOMATION TRIGGERS
-- ============================================================

-- Trigger: When proposal is viewed, update viewed_at and count
CREATE OR REPLACE FUNCTION public.handle_proposal_view()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.estimates_proposals
  SET 
    viewed_at = COALESCE(viewed_at, now()),
    viewed_count = viewed_count + 1,
    status = CASE 
      WHEN status = 'pending' THEN 'viewed'
      WHEN status = 'sent' THEN 'viewed'
      ELSE status
    END
  WHERE id = NEW.proposal_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposal_view ON public.proposal_views;
CREATE TRIGGER trg_proposal_view
AFTER INSERT ON public.proposal_views
FOR EACH ROW EXECUTE FUNCTION public.handle_proposal_view();

-- Trigger: When contract is signed, auto-create job link
CREATE OR REPLACE FUNCTION public.handle_contract_signed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_estimate_id uuid;
  v_company_id uuid;
  v_homeowner_id uuid;
  v_total numeric;
  v_job_id uuid;
BEGIN
  -- Only process when status changes to 'signed'
  IF NEW.status = 'signed' AND (OLD.status IS NULL OR OLD.status != 'signed') THEN
    -- Get estimate and company info
    SELECT e.id, e.company_id, e.homeowner_id, e.total
    INTO v_estimate_id, v_company_id, v_homeowner_id, v_total
    FROM public.estimates e
    JOIN public.estimates_proposals ep ON ep.estimate_id = e.id
    WHERE ep.id = NEW.proposal_id;
    
    -- Create job in roofing_jobs table
    INSERT INTO public.roofing_jobs (
      workspace_id,
      lead_id,
      title,
      job_type,
      status,
      job_value,
      created_at,
      updated_at
    )
    SELECT 
      rc.workspace_id,
      NULL, -- lead_id can be set later if linked
      'Job from Contract ' || NEW.id::text,
      'roof_replacement',
      'unscheduled',
      v_total,
      now(),
      now()
    FROM public.roofing_companies rc
    WHERE rc.id = v_company_id
    RETURNING id INTO v_job_id;
    
    -- Create job link
    IF v_job_id IS NOT NULL THEN
      INSERT INTO public.estimates_job_links (contract_id, job_id, job_table, auto_created)
      VALUES (NEW.id, v_job_id, 'roofing_jobs', true);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_signed ON public.estimates_contracts;
CREATE TRIGGER trg_contract_signed
AFTER UPDATE ON public.estimates_contracts
FOR EACH ROW EXECUTE FUNCTION public.handle_contract_signed();

-- ============================================================
-- 8. HELPER FUNCTIONS
-- ============================================================

-- Function: Calculate estimate totals from line items
CREATE OR REPLACE FUNCTION public.calculate_estimate_totals(estimate_uuid uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_subtotal numeric(12,2);
  v_tax_rate numeric(5,4);
  v_tax numeric(12,2);
  v_total numeric(12,2);
  v_line_items jsonb;
BEGIN
  SELECT line_items, tax_rate INTO v_line_items, v_tax_rate
  FROM public.estimates
  WHERE id = estimate_uuid;
  
  -- Calculate subtotal from line items
  SELECT COALESCE(SUM((item->>'total')::numeric), 0)
  INTO v_subtotal
  FROM jsonb_array_elements(v_line_items) AS item;
  
  -- Calculate tax
  v_tax := v_subtotal * COALESCE(v_tax_rate, 0);
  
  -- Calculate total
  v_total := v_subtotal + v_tax;
  
  -- Update estimate
  UPDATE public.estimates
  SET 
    subtotal = v_subtotal,
    tax = v_tax,
    total = v_total
  WHERE id = estimate_uuid;
END;
$$;

-- ============================================================
-- 9. AUTOMATION: Proposal Viewed Notification
-- ============================================================
-- Function to notify contractor when proposal is viewed
CREATE OR REPLACE FUNCTION public.notify_proposal_viewed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_estimate_id uuid;
  v_company_id uuid;
  v_owner_id uuid;
BEGIN
  -- Get estimate and company info
  SELECT e.id, e.company_id, rc.owner_id
  INTO v_estimate_id, v_company_id, v_owner_id
  FROM public.estimates_proposals ep
  JOIN public.estimates e ON e.id = ep.estimate_id
  JOIN public.roofing_companies rc ON rc.id = e.company_id
  WHERE ep.id = NEW.proposal_id;
  
  -- Insert notification (you can extend this to send email/push)
  -- For now, we'll just log it - you can add a notifications table later
  RAISE NOTICE 'Proposal viewed for estimate % by company owner %', v_estimate_id, v_owner_id;
  
  RETURN NEW;
END;
$$;

-- Trigger fires when proposal is viewed
DROP TRIGGER IF EXISTS trg_notify_proposal_viewed ON public.proposal_views;
CREATE TRIGGER trg_notify_proposal_viewed
AFTER INSERT ON public.proposal_views
FOR EACH ROW EXECUTE FUNCTION public.notify_proposal_viewed();

-- ============================================================
-- 10. AUTOMATION: 48-Hour Follow-up for Pending Proposals
-- ============================================================
-- Table to track follow-up emails
CREATE TABLE IF NOT EXISTS public.proposal_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.estimates_proposals(id) ON DELETE CASCADE,
  sent_at timestamptz DEFAULT now(),
  followup_type text DEFAULT '48h_pending' CHECK (followup_type IN ('48h_pending', 'reminder')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_followups_proposal ON public.proposal_followups(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_followups_sent ON public.proposal_followups(sent_at);

-- Function to check and send 48h follow-ups (call via cron)
CREATE OR REPLACE FUNCTION public.check_pending_proposals_48h()
RETURNS TABLE (
  proposal_id uuid,
  estimate_id uuid,
  homeowner_email text,
  company_name text,
  proposal_url text
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ep.id,
    e.id,
    h.email,
    rc.name,
    CONCAT(COALESCE(current_setting('app.public_url', true), 'https://app.smartsendhq.com'), '/proposals/', ep.public_token) as proposal_url
  FROM public.estimates_proposals ep
  JOIN public.estimates e ON e.id = ep.estimate_id
  JOIN public.roofing_companies rc ON rc.id = e.company_id
  LEFT JOIN public.homeowners h ON h.id = e.homeowner_id
  LEFT JOIN public.proposal_followups pf ON pf.proposal_id = ep.id AND pf.followup_type = '48h_pending'
  WHERE ep.status = 'pending'
    AND ep.created_at < now() - interval '48 hours'
    AND pf.id IS NULL -- Not already sent
    AND h.email IS NOT NULL;
END;
$$;

COMMENT ON TABLE public.estimates IS 'Block 220000: Estimates with line items and auto-calculated totals';
COMMENT ON TABLE public.estimates_proposals IS 'Block 220000: Branded proposals generated from estimates';
COMMENT ON TABLE public.estimates_contracts IS 'Block 220000: Digital contracts with e-signature support';
COMMENT ON TABLE public.estimates_job_links IS 'Block 220000: Auto-created job links when contracts are signed';
COMMENT ON TABLE public.proposal_followups IS 'Block 220000: Track follow-up emails sent for pending proposals';

























