-- Block 66000 — SmartSend Roofing "Insurance Claim Assistant + Scope Verification AI System" v1
-- AI SCOPE CHECKER • MISSING LINE ITEM DETECTION • CLAIM DOCUMENT BUILDER • SUPPLEMENT RECOMMENDATIONS • INSURANCE COMPLIANCE CHECKS
-- 
-- This is one of the MOST VALUABLE revenue-generating systems for roofing companies.
-- Insurance jobs = biggest profit. Insurance mistakes = biggest losses.
--
-- Roofers lose THOUSANDS because:
-- - insurance scopes are missing items
-- - Xactimate scopes underpay
-- - adjusters miss damage
-- - supplements aren't submitted
-- - documentation is incomplete
-- - photos don't match the claim
-- - contractors don't know what's reimbursable
--
-- SmartSend fixes ALL of that automatically.

-- ============================================================
-- 1. INSURANCE_SCOPES TABLE
-- ============================================================
-- Stores uploaded insurance scope PDFs and extracted line items
CREATE TABLE IF NOT EXISTS public.insurance_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope_pdf_url text NOT NULL, -- Supabase storage path
  extracted_data jsonb, -- AI-extracted line items, quantities, prices
  insurance_company text,
  claim_number text,
  adjuster_name text,
  adjuster_email text,
  adjuster_phone text,
  total_scope_value numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_scopes_job ON public.insurance_scopes(job_id);
CREATE INDEX IF NOT EXISTS idx_insurance_scopes_workspace ON public.insurance_scopes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_scopes_claim_number ON public.insurance_scopes(claim_number);

-- ============================================================
-- 2. SCOPE_VERIFICATION TABLE
-- ============================================================
-- AI analysis comparing insurance scope vs. actual job requirements
CREATE TABLE IF NOT EXISTS public.scope_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  insurance_scope_id uuid REFERENCES public.insurance_scopes(id) ON DELETE CASCADE,
  
  -- Missing items detected by AI
  missing_items jsonb DEFAULT '[]'::jsonb, -- Array of {item, quantity, unit_price, reason, code_reference}
  
  -- Incorrect items (wrong quantity, wrong type, etc.)
  incorrect_items jsonb DEFAULT '[]'::jsonb, -- Array of {item, insurance_qty, actual_qty, difference, impact}
  
  -- Code violations (missing required items by building code)
  code_violations jsonb DEFAULT '[]'::jsonb, -- Array of {item, code_section, requirement, impact}
  
  -- AI-generated supplement recommendations
  recommended_supplements jsonb DEFAULT '[]'::jsonb, -- Array of {item, quantity, unit_price, justification, code_reference, photos}
  
  -- Financial impact analysis
  total_estimated_underpayment numeric DEFAULT 0,
  missing_items_value numeric DEFAULT 0,
  incorrect_items_value numeric DEFAULT 0,
  code_upgrade_value numeric DEFAULT 0,
  
  -- Xactimate comparison
  xactimate_comparison jsonb, -- {expected_scope, actual_scope, variance_percent, regional_avg}
  
  -- AI summary
  ai_summary text,
  verification_status text DEFAULT 'pending' CHECK (verification_status IN ('pending', 'analyzing', 'completed', 'error')),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scope_verification_job ON public.scope_verification(job_id);
CREATE INDEX IF NOT EXISTS idx_scope_verification_workspace ON public.scope_verification(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scope_verification_status ON public.scope_verification(verification_status);

-- ============================================================
-- 3. CLAIM_PACKETS TABLE
-- ============================================================
-- Generated PDF packets with all claim documentation
CREATE TABLE IF NOT EXISTS public.claim_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope_verification_id uuid REFERENCES public.scope_verification(id) ON DELETE SET NULL,
  packet_url text NOT NULL, -- Supabase storage path to generated PDF
  packet_type text DEFAULT 'full' CHECK (packet_type IN ('full', 'supplement_only', 'evidence_only')),
  includes_photos boolean DEFAULT true,
  includes_measurements boolean DEFAULT true,
  includes_supplements boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_packets_job ON public.claim_packets(job_id);
CREATE INDEX IF NOT EXISTS idx_claim_packets_workspace ON public.claim_packets(workspace_id);

-- ============================================================
-- 4. SUPPLEMENT_SUBMISSIONS TABLE
-- ============================================================
-- Track supplement submissions and their status
CREATE TABLE IF NOT EXISTS public.supplement_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope_verification_id uuid REFERENCES public.scope_verification(id) ON DELETE CASCADE,
  supplement_items jsonb NOT NULL, -- Array of items being submitted
  total_supplement_value numeric NOT NULL,
  submitted_to text, -- Insurance company or adjuster email
  submitted_at timestamptz,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'pending')),
  approval_amount numeric,
  approval_date date,
  rejection_reason text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplement_submissions_job ON public.supplement_submissions(job_id);
CREATE INDEX IF NOT EXISTS idx_supplement_submissions_workspace ON public.supplement_submissions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_supplement_submissions_status ON public.supplement_submissions(status);

-- ============================================================
-- 5. TRIGGERS
-- ============================================================

-- Update updated_at on insurance_scopes
CREATE OR REPLACE FUNCTION update_insurance_scopes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_insurance_scopes_updated_at ON public.insurance_scopes;
CREATE TRIGGER trg_insurance_scopes_updated_at
BEFORE UPDATE ON public.insurance_scopes
FOR EACH ROW
EXECUTE FUNCTION update_insurance_scopes_updated_at();

-- Update updated_at on scope_verification
CREATE OR REPLACE FUNCTION update_scope_verification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scope_verification_updated_at ON public.scope_verification;
CREATE TRIGGER trg_scope_verification_updated_at
BEFORE UPDATE ON public.scope_verification
FOR EACH ROW
EXECUTE FUNCTION update_scope_verification_updated_at();

-- Update updated_at on supplement_submissions
CREATE OR REPLACE FUNCTION update_supplement_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplement_submissions_updated_at ON public.supplement_submissions;
CREATE TRIGGER trg_supplement_submissions_updated_at
BEFORE UPDATE ON public.supplement_submissions
FOR EACH ROW
EXECUTE FUNCTION update_supplement_submissions_updated_at();

-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.insurance_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplement_submissions ENABLE ROW LEVEL SECURITY;

-- Insurance scopes: Workspace members can access
DROP POLICY IF EXISTS "insurance_scopes_workspace_member" ON public.insurance_scopes;
CREATE POLICY "insurance_scopes_workspace_member" ON public.insurance_scopes
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = insurance_scopes.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = insurance_scopes.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Scope verification: Workspace members can access
DROP POLICY IF EXISTS "scope_verification_workspace_member" ON public.scope_verification;
CREATE POLICY "scope_verification_workspace_member" ON public.scope_verification
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = scope_verification.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = scope_verification.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Claim packets: Workspace members can access
DROP POLICY IF EXISTS "claim_packets_workspace_member" ON public.claim_packets;
CREATE POLICY "claim_packets_workspace_member" ON public.claim_packets
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = claim_packets.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = claim_packets.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Supplement submissions: Workspace members can access
DROP POLICY IF EXISTS "supplement_submissions_workspace_member" ON public.supplement_submissions;
CREATE POLICY "supplement_submissions_workspace_member" ON public.supplement_submissions
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = supplement_submissions.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = supplement_submissions.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY IF NOT EXISTS "insurance_scopes_service_role_all" ON public.insurance_scopes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "scope_verification_service_role_all" ON public.scope_verification
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "claim_packets_service_role_all" ON public.claim_packets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "supplement_submissions_service_role_all" ON public.supplement_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 7. HELPER FUNCTIONS
-- ============================================================

-- Get insurance claim summary for a job
CREATE OR REPLACE FUNCTION get_insurance_claim_summary(p_job_id uuid)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'has_scope', EXISTS(SELECT 1 FROM public.insurance_scopes WHERE job_id = p_job_id),
    'has_verification', EXISTS(SELECT 1 FROM public.scope_verification WHERE job_id = p_job_id),
    'total_underpayment', COALESCE((
      SELECT total_estimated_underpayment 
      FROM public.scope_verification 
      WHERE job_id = p_job_id 
      ORDER BY created_at DESC 
      LIMIT 1
    ), 0),
    'missing_items_count', COALESCE((
      SELECT jsonb_array_length(missing_items)
      FROM public.scope_verification 
      WHERE job_id = p_job_id 
      ORDER BY created_at DESC 
      LIMIT 1
    ), 0),
    'supplements_pending', (
      SELECT COUNT(*) 
      FROM public.supplement_submissions 
      WHERE job_id = p_job_id 
      AND status IN ('draft', 'submitted', 'pending')
    ),
    'supplements_approved', (
      SELECT COUNT(*) 
      FROM public.supplement_submissions 
      WHERE job_id = p_job_id 
      AND status = 'approved'
    ),
    'total_recovered', COALESCE((
      SELECT SUM(approval_amount)
      FROM public.supplement_submissions 
      WHERE job_id = p_job_id 
      AND status = 'approved'
    ), 0)
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. STORAGE BUCKET FOR INSURANCE DOCUMENTS
-- ============================================================

-- Create storage bucket for insurance scope PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'insurance-scopes',
  'insurance-scopes',
  false, -- private bucket
  52428800, -- 50 MB limit per file
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for claim packets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'claim-packets',
  'claim-packets',
  false, -- private bucket
  52428800, -- 50 MB limit per file
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for insurance-scopes bucket
CREATE POLICY IF NOT EXISTS "insurance_scopes_workspace_member_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'insurance-scopes'
    AND EXISTS(
      SELECT 1 FROM public.insurance_scopes isc
      JOIN public.workspace_members wm ON isc.workspace_id = wm.workspace_id
      WHERE isc.id::text = (storage.foldername(name))[1]
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "insurance_scopes_workspace_member_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'insurance-scopes'
    AND EXISTS(
      SELECT 1 FROM public.insurance_scopes isc
      JOIN public.workspace_members wm ON isc.workspace_id = wm.workspace_id
      WHERE isc.scope_pdf_url = name
        AND wm.user_id = auth.uid()
    )
  );

-- Storage policies for claim-packets bucket
CREATE POLICY IF NOT EXISTS "claim_packets_workspace_member_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'claim-packets'
    AND EXISTS(
      SELECT 1 FROM public.claim_packets cp
      JOIN public.workspace_members wm ON cp.workspace_id = wm.workspace_id
      WHERE cp.id::text = (storage.foldername(name))[1]
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "claim_packets_workspace_member_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'claim-packets'
    AND EXISTS(
      SELECT 1 FROM public.claim_packets cp
      JOIN public.workspace_members wm ON cp.workspace_id = wm.workspace_id
      WHERE cp.packet_url = name
        AND wm.user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY IF NOT EXISTS "insurance_scopes_service_role_full_access"
  ON storage.objects
  TO service_role
  FOR ALL
  USING (bucket_id = 'insurance-scopes')
  WITH CHECK (bucket_id = 'insurance-scopes');

CREATE POLICY IF NOT EXISTS "claim_packets_service_role_full_access"
  ON storage.objects
  TO service_role
  FOR ALL
  USING (bucket_id = 'claim-packets')
  WITH CHECK (bucket_id = 'claim-packets');




























