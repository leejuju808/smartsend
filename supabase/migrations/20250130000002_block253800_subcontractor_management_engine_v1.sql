-- =========================================================
-- Block 253800 — SmartSend Subcontractor Management Engine v1
-- "Sub Contacts, Work Orders, Sub Rates, Pay Schedules, QC Scores, Compliance Docs, Insurance Tracking"
-- =========================================================
-- 
-- This block gives roofers COMPLETE CONTROL over their subcontractors.
-- Roofers will say:
-- "SmartSend finally gave us control over our subcontractors."
-- "We actually know who our good subs are now."
-- "We'd be stupid not using this."
-- 
-- This is a MASSIVE selling point for contractors.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE sub_rates TABLE
-- ============================================================================
-- Rate engine: per square, per LF, per hour, per job
-- Critical for roofers - subs are paid differently

CREATE TABLE IF NOT EXISTS public.sub_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  job_type text NOT NULL,              -- shingle_install, tear_off, gutters, siding, deck_repair, ridge_cap
  rate numeric NOT NULL,               -- $85 per square, $35/hr, $2000 flat
  rate_type text NOT NULL CHECK (rate_type IN ('per_square', 'per_hour', 'per_job', 'per_lf', 'per_task')),
  effective_start date DEFAULT CURRENT_DATE,
  effective_end date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_rates_subcontractor ON public.sub_rates(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_sub_rates_job_type ON public.sub_rates(subcontractor_id, job_type);
CREATE INDEX IF NOT EXISTS idx_sub_rates_effective ON public.sub_rates(effective_start, effective_end) WHERE effective_end IS NOT NULL;

COMMENT ON TABLE public.sub_rates IS 'Rate engine for subcontractors - per square, per LF, per hour, per job (Block 253800)';
COMMENT ON COLUMN public.sub_rates.job_type IS 'Job type: shingle_install, tear_off, gutters, siding, deck_repair, ridge_cap';
COMMENT ON COLUMN public.sub_rates.rate_type IS 'Rate type: per_square, per_hour, per_job, per_lf, per_task';

-- ============================================================================
-- PART 2 — CREATE sub_work_orders TABLE
-- ============================================================================
-- Structured work orders with tasks, predicted cost, photo requirements

CREATE TABLE IF NOT EXISTS public.sub_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  subcontractor_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'approved', 'paid', 'cancelled')),
  scheduled_date date,
  total_estimated_cost numeric,
  total_actual_cost numeric,
  tasks jsonb DEFAULT '[]'::jsonb,  -- Array of tasks: [{task: "install", quantity: 30, rate: 85}, ...]
  photo_requirements jsonb DEFAULT '{}'::jsonb,  -- {before: 4, during: 6, after: 4, flashing_detail: true, ridge_cap_detail: true}
  photos_required_count int DEFAULT 0,
  photos_submitted_count int DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_work_orders_job ON public.sub_work_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_sub_work_orders_subcontractor ON public.sub_work_orders(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_sub_work_orders_status ON public.sub_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_sub_work_orders_scheduled ON public.sub_work_orders(scheduled_date) WHERE scheduled_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sub_work_orders_job_sub ON public.sub_work_orders(job_id, subcontractor_id);

COMMENT ON TABLE public.sub_work_orders IS 'Structured work orders for subcontractors with tasks, costs, photo requirements (Block 253800)';
COMMENT ON COLUMN public.sub_work_orders.status IS 'Status: assigned, in_progress, completed, approved, paid, cancelled';
COMMENT ON COLUMN public.sub_work_orders.tasks IS 'JSONB array of tasks with quantities and rates';
COMMENT ON COLUMN public.sub_work_orders.photo_requirements IS 'JSONB object with photo requirements: {before: 4, during: 6, after: 4, ...}';

-- ============================================================================
-- PART 3 — CREATE sub_wo_photos TABLE
-- ============================================================================
-- Photos required for pay release with AI QC scoring

CREATE TABLE IF NOT EXISTS public.sub_wo_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.sub_work_orders(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  photo_type text CHECK (photo_type IN ('before', 'during', 'after', 'flashing_detail', 'ridge_cap_detail', 'other')),
  ai_qc_score int CHECK (ai_qc_score >= 0 AND ai_qc_score <= 100),
  ai_flags text[],  -- Array of flags: ['exposed_nails', 'underlayment_wrinkles', 'ridge_cap_alignment_ok']
  ai_analysis jsonb,  -- Full AI analysis JSON
  uploaded_at timestamptz DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_wo_photos_work_order ON public.sub_wo_photos(work_order_id);
CREATE INDEX IF NOT EXISTS idx_sub_wo_photos_type ON public.sub_wo_photos(work_order_id, photo_type);
CREATE INDEX IF NOT EXISTS idx_sub_wo_photos_qc_score ON public.sub_wo_photos(ai_qc_score) WHERE ai_qc_score IS NOT NULL;

COMMENT ON TABLE public.sub_wo_photos IS 'Photos for work orders with AI QC scoring (Block 253800)';
COMMENT ON COLUMN public.sub_wo_photos.photo_type IS 'Photo type: before, during, after, flashing_detail, ridge_cap_detail, other';
COMMENT ON COLUMN public.sub_wo_photos.ai_flags IS 'Array of AI-detected issues/flags';

-- ============================================================================
-- PART 4 — CREATE sub_payments TABLE
-- ============================================================================
-- Payment workflow: pending → approved → released

CREATE TABLE IF NOT EXISTS public.sub_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.sub_work_orders(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'released', 'cancelled')),
  payment_method text,  -- check, ach, wire, cash
  check_number text,
  payment_date date,
  released_at timestamptz,
  released_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_payments_work_order ON public.sub_payments(work_order_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_status ON public.sub_payments(status);
CREATE INDEX IF NOT EXISTS idx_sub_payments_payment_date ON public.sub_payments(payment_date) WHERE payment_date IS NOT NULL;

COMMENT ON TABLE public.sub_payments IS 'Payment workflow for subcontractors (Block 253800)';
COMMENT ON COLUMN public.sub_payments.status IS 'Status: pending, approved, released, cancelled';

-- ============================================================================
-- PART 5 — CREATE sub_compliance_docs TABLE (Enhanced)
-- ============================================================================
-- Compliance document tracking with expiration alerts
-- Note: This extends the existing subcontractor_documents table

CREATE TABLE IF NOT EXISTS public.sub_compliance_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('W9', 'COI', 'Workers_Comp', 'License', 'Other')),
  file_url text NOT NULL,
  expires_on date,
  cert_number text,
  issuing_organization text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_compliance_docs_subcontractor ON public.sub_compliance_docs(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_sub_compliance_docs_type ON public.sub_compliance_docs(subcontractor_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_sub_compliance_docs_expires ON public.sub_compliance_docs(expires_on) WHERE expires_on IS NOT NULL;

COMMENT ON TABLE public.sub_compliance_docs IS 'Compliance documents for subcontractors with expiration tracking (Block 253800)';
COMMENT ON COLUMN public.sub_compliance_docs.doc_type IS 'Document type: W9, COI, Workers_Comp, License, Other';

-- ============================================================================
-- PART 6 — CREATE sub_performance_scores TABLE
-- ============================================================================
-- Detailed performance scoring: QC, on-time, professionalism, cleanup, safety

CREATE TABLE IF NOT EXISTS public.sub_performance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  work_order_id uuid REFERENCES public.sub_work_orders(id) ON DELETE SET NULL,
  qc_score int CHECK (qc_score >= 0 AND qc_score <= 100),
  on_time_score int CHECK (on_time_score >= 0 AND on_time_score <= 100),
  professionalism_score int CHECK (professionalism_score >= 0 AND professionalism_score <= 100),
  cleanup_score int CHECK (cleanup_score >= 0 AND cleanup_score <= 100),
  safety_score int CHECK (safety_score >= 0 AND safety_score <= 100),
  overall_score int CHECK (overall_score >= 0 AND overall_score <= 100),  -- Calculated average
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_performance_scores_subcontractor ON public.sub_performance_scores(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_sub_performance_scores_job ON public.sub_performance_scores(job_id);
CREATE INDEX IF NOT EXISTS idx_sub_performance_scores_work_order ON public.sub_performance_scores(work_order_id);
CREATE INDEX IF NOT EXISTS idx_sub_performance_scores_overall ON public.sub_performance_scores(subcontractor_id, overall_score);
CREATE INDEX IF NOT EXISTS idx_sub_performance_scores_created ON public.sub_performance_scores(created_at DESC);

COMMENT ON TABLE public.sub_performance_scores IS 'Detailed performance scores for subcontractors (Block 253800)';
COMMENT ON COLUMN public.sub_performance_scores.overall_score IS 'Calculated average of all scores (0-100)';

-- ============================================================================
-- PART 7 — HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate work order total cost from tasks
CREATE OR REPLACE FUNCTION public.calculate_work_order_cost(p_work_order_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total numeric := 0;
  v_tasks jsonb;
  v_task jsonb;
BEGIN
  SELECT tasks INTO v_tasks
  FROM public.sub_work_orders
  WHERE id = p_work_order_id;
  
  IF v_tasks IS NULL OR jsonb_array_length(v_tasks) = 0 THEN
    RETURN 0;
  END IF;
  
  FOR v_task IN SELECT * FROM jsonb_array_elements(v_tasks)
  LOOP
    v_total := v_total + COALESCE((v_task->>'quantity')::numeric, 0) * COALESCE((v_task->>'rate')::numeric, 0);
  END LOOP;
  
  RETURN v_total;
END;
$$;

-- Function to check if work order photos meet requirements
CREATE OR REPLACE FUNCTION public.check_work_order_photos(p_work_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_requirements jsonb;
  v_before_count int;
  v_during_count int;
  v_after_count int;
  v_flashing_detail boolean;
  v_ridge_cap_detail boolean;
BEGIN
  -- Get photo requirements
  SELECT photo_requirements INTO v_requirements
  FROM public.sub_work_orders
  WHERE id = p_work_order_id;
  
  IF v_requirements IS NULL THEN
    RETURN true;  -- No requirements = pass
  END IF;
  
  -- Count photos by type
  SELECT COUNT(*) INTO v_before_count
  FROM public.sub_wo_photos
  WHERE work_order_id = p_work_order_id AND photo_type = 'before';
  
  SELECT COUNT(*) INTO v_during_count
  FROM public.sub_wo_photos
  WHERE work_order_id = p_work_order_id AND photo_type = 'during';
  
  SELECT COUNT(*) INTO v_after_count
  FROM public.sub_wo_photos
  WHERE work_order_id = p_work_order_id AND photo_type = 'after';
  
  SELECT EXISTS(
    SELECT 1 FROM public.sub_wo_photos
    WHERE work_order_id = p_work_order_id AND photo_type = 'flashing_detail'
  ) INTO v_flashing_detail;
  
  SELECT EXISTS(
    SELECT 1 FROM public.sub_wo_photos
    WHERE work_order_id = p_work_order_id AND photo_type = 'ridge_cap_detail'
  ) INTO v_ridge_cap_detail;
  
  -- Check requirements
  IF COALESCE((v_requirements->>'before')::int, 0) > v_before_count THEN
    RETURN false;
  END IF;
  
  IF COALESCE((v_requirements->>'during')::int, 0) > v_during_count THEN
    RETURN false;
  END IF;
  
  IF COALESCE((v_requirements->>'after')::int, 0) > v_after_count THEN
    RETURN false;
  END IF;
  
  IF COALESCE((v_requirements->>'flashing_detail')::boolean, false) = true AND NOT v_flashing_detail THEN
    RETURN false;
  END IF;
  
  IF COALESCE((v_requirements->>'ridge_cap_detail')::boolean, false) = true AND NOT v_ridge_cap_detail THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Function to get subcontractor performance tier
CREATE OR REPLACE FUNCTION public.get_sub_performance_tier(p_subcontractor_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_avg_score numeric;
BEGIN
  SELECT AVG(overall_score) INTO v_avg_score
  FROM public.sub_performance_scores
  WHERE subcontractor_id = p_subcontractor_id;
  
  IF v_avg_score IS NULL THEN
    RETURN 'No Rating';
  END IF;
  
  IF v_avg_score >= 90 THEN
    RETURN 'Elite Subcontractor';
  ELSIF v_avg_score >= 80 THEN
    RETURN 'Approved Sub';
  ELSIF v_avg_score >= 70 THEN
    RETURN 'Monitor Closely';
  ELSE
    RETURN 'Do Not Use';
  END IF;
END;
$$;

-- Function to get subcontractor compliance status (enhanced)
CREATE OR REPLACE FUNCTION public.get_sub_compliance_status_v2(p_subcontractor_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_has_w9 boolean;
  v_has_coi boolean;
  v_coi_expired boolean;
  v_has_workers_comp boolean;
  v_workers_comp_expired boolean;
BEGIN
  -- Check for W9
  SELECT EXISTS(
    SELECT 1 FROM public.sub_compliance_docs
    WHERE subcontractor_id = p_subcontractor_id AND doc_type = 'W9'
  ) INTO v_has_w9;
  
  -- Check for COI
  SELECT EXISTS(
    SELECT 1 FROM public.sub_compliance_docs
    WHERE subcontractor_id = p_subcontractor_id AND doc_type = 'COI'
    AND (expires_on IS NULL OR expires_on >= CURRENT_DATE)
  ) INTO v_has_coi;
  
  -- Check if COI is expired
  SELECT EXISTS(
    SELECT 1 FROM public.sub_compliance_docs
    WHERE subcontractor_id = p_subcontractor_id
    AND doc_type = 'COI'
    AND expires_on IS NOT NULL
    AND expires_on < CURRENT_DATE
  ) INTO v_coi_expired;
  
  -- Check for Workers Comp
  SELECT EXISTS(
    SELECT 1 FROM public.sub_compliance_docs
    WHERE subcontractor_id = p_subcontractor_id AND doc_type = 'Workers_Comp'
    AND (expires_on IS NULL OR expires_on >= CURRENT_DATE)
  ) INTO v_has_workers_comp;
  
  -- Check if Workers Comp is expired
  SELECT EXISTS(
    SELECT 1 FROM public.sub_compliance_docs
    WHERE subcontractor_id = p_subcontractor_id
    AND doc_type = 'Workers_Comp'
    AND expires_on IS NOT NULL
    AND expires_on < CURRENT_DATE
  ) INTO v_workers_comp_expired;
  
  -- Return status
  IF NOT v_has_w9 OR NOT v_has_coi OR v_coi_expired OR NOT v_has_workers_comp OR v_workers_comp_expired THEN
    RETURN 'incomplete';
  END IF;
  
  RETURN 'compliant';
END;
$$;

-- Function to get expiring compliance documents
CREATE OR REPLACE FUNCTION public.get_expiring_sub_compliance_docs(p_company_id uuid, p_days_ahead integer DEFAULT 30)
RETURNS TABLE (
  subcontractor_id uuid,
  subcontractor_name text,
  doc_type text,
  expires_on date,
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
    scd.doc_type,
    scd.expires_on,
    (scd.expires_on - CURRENT_DATE)::integer as days_until_expiry
  FROM public.subcontractors s
  JOIN public.sub_compliance_docs scd ON scd.subcontractor_id = s.id
  WHERE s.company_id = p_company_id
    AND scd.expires_on IS NOT NULL
    AND scd.expires_on >= CURRENT_DATE
    AND scd.expires_on <= CURRENT_DATE + (p_days_ahead || ' days')::interval
  ORDER BY scd.expires_on ASC;
END;
$$;

-- ============================================================================
-- PART 8 — TRIGGERS
-- ============================================================================

-- Update updated_at timestamp for sub_rates
CREATE OR REPLACE FUNCTION public.set_sub_rates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sub_rates_updated_at
BEFORE UPDATE ON public.sub_rates
FOR EACH ROW
EXECUTE FUNCTION public.set_sub_rates_updated_at();

-- Update updated_at timestamp for sub_work_orders
CREATE OR REPLACE FUNCTION public.set_sub_work_orders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sub_work_orders_updated_at
BEFORE UPDATE ON public.sub_work_orders
FOR EACH ROW
EXECUTE FUNCTION public.set_sub_work_orders_updated_at();

-- Update updated_at timestamp for sub_payments
CREATE OR REPLACE FUNCTION public.set_sub_payments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sub_payments_updated_at
BEFORE UPDATE ON public.sub_payments
FOR EACH ROW
EXECUTE FUNCTION public.set_sub_payments_updated_at();

-- Update updated_at timestamp for sub_compliance_docs
CREATE OR REPLACE FUNCTION public.set_sub_compliance_docs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sub_compliance_docs_updated_at
BEFORE UPDATE ON public.sub_compliance_docs
FOR EACH ROW
EXECUTE FUNCTION public.set_sub_compliance_docs_updated_at();

-- Auto-calculate overall_score in sub_performance_scores
CREATE OR REPLACE FUNCTION public.calculate_overall_performance_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int := 0;
  v_total numeric := 0;
BEGIN
  IF NEW.qc_score IS NOT NULL THEN
    v_total := v_total + NEW.qc_score;
    v_count := v_count + 1;
  END IF;
  
  IF NEW.on_time_score IS NOT NULL THEN
    v_total := v_total + NEW.on_time_score;
    v_count := v_count + 1;
  END IF;
  
  IF NEW.professionalism_score IS NOT NULL THEN
    v_total := v_total + NEW.professionalism_score;
    v_count := v_count + 1;
  END IF;
  
  IF NEW.cleanup_score IS NOT NULL THEN
    v_total := v_total + NEW.cleanup_score;
    v_count := v_count + 1;
  END IF;
  
  IF NEW.safety_score IS NOT NULL THEN
    v_total := v_total + NEW.safety_score;
    v_count := v_count + 1;
  END IF;
  
  IF v_count > 0 THEN
    NEW.overall_score := ROUND(v_total / v_count);
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calculate_overall_performance_score
BEFORE INSERT OR UPDATE ON public.sub_performance_scores
FOR EACH ROW
EXECUTE FUNCTION public.calculate_overall_performance_score();

-- ============================================================================
-- PART 9 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.sub_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_wo_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_compliance_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_performance_scores ENABLE ROW LEVEL SECURITY;

-- Helper function to check company access (reuse existing)
-- Note: This assumes has_company_access() function exists from previous migrations

-- Sub rates policies
CREATE POLICY "sub_rates_select" ON public.sub_rates
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_rates_insert" ON public.sub_rates
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_rates_update" ON public.sub_rates
  FOR UPDATE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_rates_delete" ON public.sub_rates
  FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

-- Sub work orders policies
CREATE POLICY "sub_work_orders_select" ON public.sub_work_orders
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_work_orders_insert" ON public.sub_work_orders
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_work_orders_update" ON public.sub_work_orders
  FOR UPDATE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_work_orders_delete" ON public.sub_work_orders
  FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

-- Sub work order photos policies
CREATE POLICY "sub_wo_photos_select" ON public.sub_wo_photos
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.sub_work_orders swo
      JOIN public.subcontractors s ON s.id = swo.subcontractor_id
      WHERE swo.id = work_order_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_wo_photos_insert" ON public.sub_wo_photos
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.sub_work_orders swo
      JOIN public.subcontractors s ON s.id = swo.subcontractor_id
      WHERE swo.id = work_order_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_wo_photos_update" ON public.sub_wo_photos
  FOR UPDATE
  USING (
    EXISTS(
      SELECT 1 FROM public.sub_work_orders swo
      JOIN public.subcontractors s ON s.id = swo.subcontractor_id
      WHERE swo.id = work_order_id
      AND public.has_company_access(s.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.sub_work_orders swo
      JOIN public.subcontractors s ON s.id = swo.subcontractor_id
      WHERE swo.id = work_order_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_wo_photos_delete" ON public.sub_wo_photos
  FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM public.sub_work_orders swo
      JOIN public.subcontractors s ON s.id = swo.subcontractor_id
      WHERE swo.id = work_order_id
      AND public.has_company_access(s.company_id)
    )
  );

-- Sub payments policies
CREATE POLICY "sub_payments_select" ON public.sub_payments
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.sub_work_orders swo
      JOIN public.subcontractors s ON s.id = swo.subcontractor_id
      WHERE swo.id = work_order_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_payments_insert" ON public.sub_payments
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.sub_work_orders swo
      JOIN public.subcontractors s ON s.id = swo.subcontractor_id
      WHERE swo.id = work_order_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_payments_update" ON public.sub_payments
  FOR UPDATE
  USING (
    EXISTS(
      SELECT 1 FROM public.sub_work_orders swo
      JOIN public.subcontractors s ON s.id = swo.subcontractor_id
      WHERE swo.id = work_order_id
      AND public.has_company_access(s.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.sub_work_orders swo
      JOIN public.subcontractors s ON s.id = swo.subcontractor_id
      WHERE swo.id = work_order_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_payments_delete" ON public.sub_payments
  FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM public.sub_work_orders swo
      JOIN public.subcontractors s ON s.id = swo.subcontractor_id
      WHERE swo.id = work_order_id
      AND public.has_company_access(s.company_id)
    )
  );

-- Sub compliance docs policies
CREATE POLICY "sub_compliance_docs_select" ON public.sub_compliance_docs
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_compliance_docs_insert" ON public.sub_compliance_docs
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_compliance_docs_update" ON public.sub_compliance_docs
  FOR UPDATE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_compliance_docs_delete" ON public.sub_compliance_docs
  FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

-- Sub performance scores policies
CREATE POLICY "sub_performance_scores_select" ON public.sub_performance_scores
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_performance_scores_insert" ON public.sub_performance_scores
  FOR INSERT
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_performance_scores_update" ON public.sub_performance_scores
  FOR UPDATE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

CREATE POLICY "sub_performance_scores_delete" ON public.sub_performance_scores
  FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM public.subcontractors s
      WHERE s.id = subcontractor_id
      AND public.has_company_access(s.company_id)
    )
  );

-- ============================================================================
-- PART 10 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.sub_rates IS 'Rate engine for subcontractors - per square, per LF, per hour, per job (Block 253800)';
COMMENT ON TABLE public.sub_work_orders IS 'Structured work orders with tasks, costs, photo requirements (Block 253800)';
COMMENT ON TABLE public.sub_wo_photos IS 'Photos for work orders with AI QC scoring (Block 253800)';
COMMENT ON TABLE public.sub_payments IS 'Payment workflow for subcontractors (Block 253800)';
COMMENT ON TABLE public.sub_compliance_docs IS 'Compliance documents with expiration tracking (Block 253800)';
COMMENT ON TABLE public.sub_performance_scores IS 'Detailed performance scores for subcontractors (Block 253800)';
























