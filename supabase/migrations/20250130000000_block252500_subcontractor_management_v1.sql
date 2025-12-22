-- =========================================================
-- Block 252500 — SmartSend Subcontractor Management System v1
-- "Subs Directory, Compliance Docs, Assign Jobs, Pay Sheets, Performance Ratings"
-- =========================================================
-- 
-- This block gives roofers COMPLETE CONTROL over their subcontractors.
-- Roofers will say:
-- "SmartSend finally gives us CONTROL over our subs.
-- We used to run blind — now we have a system."
-- 
-- This is the block that makes every roofing company feel 
-- embarrassingly outdated without SmartSend.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE subcontractors TABLE
-- ============================================================================
-- Directory of all subcontractors (tear-off crews, installers, gutter subs, siding subs)

CREATE TABLE IF NOT EXISTS public.subcontractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  trade text CHECK (trade IN ('roofing', 'gutters', 'siding', 'framing', 'tear_off', 'install', 'other')),
  status text CHECK (status IN ('active', 'banned', 'pending_docs')) DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subcontractors_company ON public.subcontractors(company_id);
CREATE INDEX IF NOT EXISTS idx_subcontractors_status ON public.subcontractors(company_id, status);
CREATE INDEX IF NOT EXISTS idx_subcontractors_trade ON public.subcontractors(company_id, trade);
CREATE INDEX IF NOT EXISTS idx_subcontractors_email ON public.subcontractors(email) WHERE email IS NOT NULL;

COMMENT ON TABLE public.subcontractors IS 'Directory of all subcontractors (Block 252500)';
COMMENT ON COLUMN public.subcontractors.trade IS 'Trade type: roofing, gutters, siding, framing, tear_off, install, other';
COMMENT ON COLUMN public.subcontractors.status IS 'Status: active, banned, pending_docs';

-- ============================================================================
-- PART 2 — CREATE subcontractor_documents TABLE
-- ============================================================================
-- Compliance vault: W9, COI, licenses, expiration tracking

CREATE TABLE IF NOT EXISTS public.subcontractor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('W9', 'COI', 'License', 'Other')),
  file_url text NOT NULL,
  expires_at date,
  uploaded_at timestamptz DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_subcontractor_documents_sub ON public.subcontractor_documents(sub_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_documents_type ON public.subcontractor_documents(sub_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_subcontractor_documents_expires ON public.subcontractor_documents(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE public.subcontractor_documents IS 'Compliance documents for subcontractors (W9, COI, licenses) (Block 252500)';
COMMENT ON COLUMN public.subcontractor_documents.doc_type IS 'Document type: W9, COI, License, Other';

-- ============================================================================
-- PART 3 — CREATE sub_job_assignments TABLE
-- ============================================================================
-- Track which subs are assigned to which jobs and their roles

CREATE TABLE IF NOT EXISTS public.sub_job_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  sub_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  role text,                -- tear-off, install, gutters, siding
  assigned_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')) DEFAULT 'assigned',
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_sub_job_assignments_job ON public.sub_job_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_sub_job_assignments_sub ON public.sub_job_assignments(sub_id);
CREATE INDEX IF NOT EXISTS idx_sub_job_assignments_status ON public.sub_job_assignments(status);
CREATE INDEX IF NOT EXISTS idx_sub_job_assignments_job_sub ON public.sub_job_assignments(job_id, sub_id);

COMMENT ON TABLE public.sub_job_assignments IS 'Subcontractor job assignments (Block 252500)';
COMMENT ON COLUMN public.sub_job_assignments.role IS 'Role: tear-off, install, gutters, siding, etc.';
COMMENT ON COLUMN public.sub_job_assignments.status IS 'Status: assigned, in_progress, completed, cancelled';

-- ============================================================================
-- PART 4 — CREATE sub_performance_reviews TABLE
-- ============================================================================
-- Performance ratings: speed, quality, professionalism

CREATE TABLE IF NOT EXISTS public.sub_performance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  rating_speed int CHECK (rating_speed >= 1 AND rating_speed <= 5),
  rating_quality int CHECK (rating_quality >= 1 AND rating_quality <= 5),
  rating_professionalism int CHECK (rating_professionalism >= 1 AND rating_professionalism <= 5),
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_performance_reviews_sub ON public.sub_performance_reviews(sub_id);
CREATE INDEX IF NOT EXISTS idx_sub_performance_reviews_job ON public.sub_performance_reviews(job_id);
CREATE INDEX IF NOT EXISTS idx_sub_performance_reviews_created ON public.sub_performance_reviews(created_at DESC);

COMMENT ON TABLE public.sub_performance_reviews IS 'Performance reviews for subcontractors (Block 252500)';
COMMENT ON COLUMN public.sub_performance_reviews.rating_speed IS 'Speed rating 1-5';
COMMENT ON COLUMN public.sub_performance_reviews.rating_quality IS 'Quality rating 1-5';
COMMENT ON COLUMN public.sub_performance_reviews.rating_professionalism IS 'Professionalism rating 1-5';

-- ============================================================================
-- PART 5 — CREATE sub_pay_sheets TABLE
-- ============================================================================
-- Flexible pay sheets: per-square, per-job, hourly

CREATE TABLE IF NOT EXISTS public.sub_pay_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  sub_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  pay_type text NOT NULL CHECK (pay_type IN ('per_square', 'hourly', 'flat_rate')),
  rate numeric NOT NULL,     -- $85 per square, $35/hr, $2000 flat
  quantity numeric,          -- 30 squares, 40 hours, 1 (for flat rate)
  total_pay numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_sub_pay_sheets_job ON public.sub_pay_sheets(job_id);
CREATE INDEX IF NOT EXISTS idx_sub_pay_sheets_sub ON public.sub_pay_sheets(sub_id);
CREATE INDEX IF NOT EXISTS idx_sub_pay_sheets_created ON public.sub_pay_sheets(created_at DESC);

COMMENT ON TABLE public.sub_pay_sheets IS 'Pay sheets for subcontractors (Block 252500)';
COMMENT ON COLUMN public.sub_pay_sheets.pay_type IS 'Payment type: per_square, hourly, flat_rate';
COMMENT ON COLUMN public.sub_pay_sheets.rate IS 'Rate: $85 per square, $35/hr, $2000 flat';
COMMENT ON COLUMN public.sub_pay_sheets.quantity IS 'Quantity: squares, hours, or 1 for flat rate';

-- ============================================================================
-- PART 6 — HELPER FUNCTIONS
-- ============================================================================

-- Function to get overall performance score for a sub
CREATE OR REPLACE FUNCTION public.get_sub_overall_score(p_sub_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_avg_score numeric;
BEGIN
  SELECT AVG((rating_speed + rating_quality + rating_professionalism) / 3.0)
  INTO v_avg_score
  FROM public.sub_performance_reviews
  WHERE sub_id = p_sub_id;
  
  RETURN COALESCE(v_avg_score, 0);
END;
$$;

-- Function to get compliance status for a sub
CREATE OR REPLACE FUNCTION public.get_sub_compliance_status(p_sub_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_has_w9 boolean;
  v_has_coi boolean;
  v_coi_expired boolean;
  v_has_license boolean;
BEGIN
  -- Check for W9
  SELECT EXISTS(SELECT 1 FROM public.subcontractor_documents WHERE sub_id = p_sub_id AND doc_type = 'W9')
  INTO v_has_w9;
  
  -- Check for COI
  SELECT EXISTS(SELECT 1 FROM public.subcontractor_documents WHERE sub_id = p_sub_id AND doc_type = 'COI')
  INTO v_has_coi;
  
  -- Check if COI is expired
  SELECT EXISTS(
    SELECT 1 FROM public.subcontractor_documents 
    WHERE sub_id = p_sub_id 
    AND doc_type = 'COI' 
    AND (expires_at IS NULL OR expires_at < CURRENT_DATE)
  )
  INTO v_coi_expired;
  
  -- Check for License
  SELECT EXISTS(SELECT 1 FROM public.subcontractor_documents WHERE sub_id = p_sub_id AND doc_type = 'License')
  INTO v_has_license;
  
  -- Return status
  IF NOT v_has_w9 OR NOT v_has_coi OR v_coi_expired OR NOT v_has_license THEN
    RETURN 'incomplete';
  END IF;
  
  RETURN 'compliant';
END;
$$;

-- Function to get expiring documents
CREATE OR REPLACE FUNCTION public.get_expiring_sub_documents(p_company_id uuid, p_days_ahead integer DEFAULT 30)
RETURNS TABLE (
  sub_id uuid,
  sub_name text,
  doc_type text,
  expires_at date,
  days_until_expiry integer
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    sd.doc_type,
    sd.expires_at,
    (sd.expires_at - CURRENT_DATE)::integer as days_until_expiry
  FROM public.subcontractors s
  JOIN public.subcontractor_documents sd ON sd.sub_id = s.id
  WHERE s.company_id = p_company_id
    AND sd.expires_at IS NOT NULL
    AND sd.expires_at >= CURRENT_DATE
    AND sd.expires_at <= CURRENT_DATE + (p_days_ahead || ' days')::interval
  ORDER BY sd.expires_at ASC;
END;
$$;

-- ============================================================================
-- PART 7 — TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_subcontractors_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_subcontractors_updated_at
BEFORE UPDATE ON public.subcontractors
FOR EACH ROW
EXECUTE FUNCTION public.set_subcontractors_updated_at();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_pay_sheets ENABLE ROW LEVEL SECURITY;

-- Helper function to check company access
CREATE OR REPLACE FUNCTION public.has_company_access(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.roofing_company_members rcm
    WHERE rcm.roofing_company_id = p_company_id
    AND rcm.user_id = auth.uid()
    AND rcm.is_active = true
  )
  OR EXISTS(
    SELECT 1 FROM public.roofing_companies rc
    WHERE rc.id = p_company_id
    AND rc.owner_id = auth.uid()
  );
$$;

-- Subcontractors policies
CREATE POLICY "subcontractors_select" ON public.subcontractors
  FOR SELECT
  USING (has_company_access(company_id));

CREATE POLICY "subcontractors_insert" ON public.subcontractors
  FOR INSERT
  WITH CHECK (has_company_access(company_id));

CREATE POLICY "subcontractors_update" ON public.subcontractors
  FOR UPDATE
  USING (has_company_access(company_id))
  WITH CHECK (has_company_access(company_id));

CREATE POLICY "subcontractors_delete" ON public.subcontractors
  FOR DELETE
  USING (has_company_access(company_id));

-- Subcontractor documents policies
CREATE POLICY "subcontractor_documents_select" ON public.subcontractor_documents
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

CREATE POLICY "subcontractor_documents_insert" ON public.subcontractor_documents
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

CREATE POLICY "subcontractor_documents_update" ON public.subcontractor_documents
  FOR UPDATE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

CREATE POLICY "subcontractor_documents_delete" ON public.subcontractor_documents
  FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

-- Sub job assignments policies
CREATE POLICY "sub_job_assignments_select" ON public.sub_job_assignments
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_job_assignments_insert" ON public.sub_job_assignments
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_job_assignments_update" ON public.sub_job_assignments
  FOR UPDATE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_job_assignments_delete" ON public.sub_job_assignments
  FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

-- Sub performance reviews policies
CREATE POLICY "sub_performance_reviews_select" ON public.sub_performance_reviews
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_performance_reviews_insert" ON public.sub_performance_reviews
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_performance_reviews_update" ON public.sub_performance_reviews
  FOR UPDATE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_performance_reviews_delete" ON public.sub_performance_reviews
  FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

-- Sub pay sheets policies
CREATE POLICY "sub_pay_sheets_select" ON public.sub_pay_sheets
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_pay_sheets_insert" ON public.sub_pay_sheets
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_pay_sheets_update" ON public.sub_pay_sheets
  FOR UPDATE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_pay_sheets_delete" ON public.sub_pay_sheets
  FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = sub_id
      AND has_company_access(s.company_id)
    )
  );

-- ============================================================================
-- PART 9 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.subcontractors IS 'Subcontractor directory - tear-off crews, installers, gutter subs, siding subs (Block 252500)';
COMMENT ON TABLE public.subcontractor_documents IS 'Compliance vault - W9, COI, licenses with expiration tracking (Block 252500)';
COMMENT ON TABLE public.sub_job_assignments IS 'Assign subs to jobs with role-based tracking (Block 252500)';
COMMENT ON TABLE public.sub_performance_reviews IS 'Performance ratings: speed, quality, professionalism (Block 252500)';
COMMENT ON TABLE public.sub_pay_sheets IS 'Flexible pay sheets: per-square, per-job, hourly (Block 252500)';
























