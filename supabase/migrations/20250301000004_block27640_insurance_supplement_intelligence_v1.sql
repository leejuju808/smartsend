-- =========================================================
-- Block 27640 — SmartSend Roofing Insurance Supplement Intelligence v1
-- (Detect underpaid claims • Recommend supplement line items • Track supplement revenue • Auto-generate insurer-ready documents)
-- =========================================================
-- 
-- This block turns SmartSend into the insurance brain for roofers.
-- 
-- Most roofing contractors who deal with insurance:
-- - Don't know when to supplement
-- - Miss thousands in unpaid line items
-- - Don't track supplement revenue
-- - Don't know which adjusters underpay the most
-- - Struggle creating supplement packets
-- 
-- SmartSend will now:
-- - Automatically detect underpaid insurance claims
-- - Recommend supplement line items
-- - Track supplement revenue
-- - Generate full supplement documents ready to send to adjusters
-- 
-- This is real money for roofers — supplements often add $1,000–$10,000 per claim.

-- ============================================================================
-- PART 1 — CREATE roofing_insurance_scopes TABLE
-- ============================================================================
-- Stores insurance scope data uploaded from PDF/Xactimate/etc.

CREATE TABLE IF NOT EXISTS public.roofing_insurance_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  raw_text text,                 -- parsed text from the uploaded PDF
  scope_source text,             -- 'pdf', 'xactimate', 'manual', 'copy_paste'
  
  -- Timestamps
  uploaded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_roofing_insurance_scopes_job_id ON public.roofing_insurance_scopes(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_insurance_scopes_workspace_id ON public.roofing_insurance_scopes(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_insurance_scopes_uploaded_at ON public.roofing_insurance_scopes(uploaded_at DESC);

-- ============================================================================
-- PART 2 — CREATE roofing_supplement_recommendations TABLE
-- ============================================================================
-- AI-generated supplement suggestions

CREATE TABLE IF NOT EXISTS public.roofing_supplement_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  line_item text NOT NULL,
  reason text,
  estimated_cost numeric,
  
  status text CHECK (status IN ('pending', 'submitted', 'approved', 'rejected')) DEFAULT 'pending',
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_roofing_supplement_recommendations_job_id ON public.roofing_supplement_recommendations(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_supplement_recommendations_workspace_id ON public.roofing_supplement_recommendations(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_supplement_recommendations_status ON public.roofing_supplement_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_roofing_supplement_recommendations_created_at ON public.roofing_supplement_recommendations(created_at DESC);

-- ============================================================================
-- PART 3 — CREATE roofing_supplement_revenue TABLE
-- ============================================================================
-- Tracks approved supplement amounts and adjuster performance

CREATE TABLE IF NOT EXISTS public.roofing_supplement_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  approved_amount numeric NOT NULL,
  adjuster_name text,
  adjuster_email text,
  
  approved_at timestamptz,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_roofing_supplement_revenue_job_id ON public.roofing_supplement_revenue(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_supplement_revenue_workspace_id ON public.roofing_supplement_revenue(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_supplement_revenue_adjuster_name ON public.roofing_supplement_revenue(adjuster_name) WHERE adjuster_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_supplement_revenue_approved_at ON public.roofing_supplement_revenue(approved_at DESC) WHERE approved_at IS NOT NULL;

-- ============================================================================
-- PART 4 — CREATE SUPPLEMENT REVENUE VIEWS
-- ============================================================================

-- Monthly supplement revenue view
CREATE OR REPLACE VIEW public.roofing_supplement_revenue_monthly AS
SELECT
  date_trunc('month', approved_at)::date AS month,
  workspace_id,
  SUM(approved_amount) AS total_supplement_revenue,
  COUNT(*) AS supplement_count
FROM public.roofing_supplement_revenue
WHERE approved_at IS NOT NULL
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- Adjuster performance view
CREATE OR REPLACE VIEW public.roofing_adjuster_performance AS
SELECT
  adjuster_name,
  workspace_id,
  COUNT(*) AS claims_count,
  SUM(approved_amount) AS supplement_total,
  AVG(approved_amount) AS avg_supplement,
  CASE
    WHEN AVG(approved_amount) > 2500 THEN 'Consistent Underpayer'
    WHEN AVG(approved_amount) > 1000 THEN 'Moderate Underpayer'
    ELSE 'Fair'
  END AS rating
FROM public.roofing_supplement_revenue
WHERE adjuster_name IS NOT NULL
  AND approved_at IS NOT NULL
GROUP BY adjuster_name, workspace_id;

-- ============================================================================
-- PART 5 — TRIGGERS
-- ============================================================================
-- Auto-update updated_at timestamps

CREATE OR REPLACE FUNCTION public.tg_update_roofing_insurance_scopes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_roofing_insurance_scopes_updated_at
BEFORE UPDATE ON public.roofing_insurance_scopes
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_roofing_insurance_scopes_updated_at();

CREATE OR REPLACE FUNCTION public.tg_update_roofing_supplement_recommendations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_roofing_supplement_recommendations_updated_at
BEFORE UPDATE ON public.roofing_supplement_recommendations
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_roofing_supplement_recommendations_updated_at();

CREATE OR REPLACE FUNCTION public.tg_update_roofing_supplement_revenue_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_roofing_supplement_revenue_updated_at
BEFORE UPDATE ON public.roofing_supplement_revenue
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_roofing_supplement_revenue_updated_at();

-- ============================================================================
-- PART 6 — RLS POLICIES
-- ============================================================================
-- Enable Row Level Security

ALTER TABLE public.roofing_insurance_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_supplement_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_supplement_revenue ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view insurance scopes for jobs in their workspace
CREATE POLICY "roofing insurance scopes select"
  ON public.roofing_insurance_scopes
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      WHERE rj.id = roofing_insurance_scopes.job_id
      AND (
        rj.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR rj.workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

-- Policy: Users can insert/update insurance scopes for jobs in their workspace
CREATE POLICY "roofing insurance scopes insert"
  ON public.roofing_insurance_scopes
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "roofing insurance scopes update"
  ON public.roofing_insurance_scopes
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Policy: Service role can do everything (for edge functions)
CREATE POLICY "roofing insurance scopes service role all"
  ON public.roofing_insurance_scopes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Users can view supplement recommendations for jobs in their workspace
CREATE POLICY "roofing supplement recommendations select"
  ON public.roofing_supplement_recommendations
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      WHERE rj.id = roofing_supplement_recommendations.job_id
      AND (
        rj.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR rj.workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

-- Policy: Users can insert/update supplement recommendations for jobs in their workspace
CREATE POLICY "roofing supplement recommendations insert"
  ON public.roofing_supplement_recommendations
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "roofing supplement recommendations update"
  ON public.roofing_supplement_recommendations
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Policy: Service role can do everything (for edge functions)
CREATE POLICY "roofing supplement recommendations service role all"
  ON public.roofing_supplement_recommendations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Users can view supplement revenue for jobs in their workspace
CREATE POLICY "roofing supplement revenue select"
  ON public.roofing_supplement_revenue
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      WHERE rj.id = roofing_supplement_revenue.job_id
      AND (
        rj.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR rj.workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

-- Policy: Users can insert/update supplement revenue for jobs in their workspace
CREATE POLICY "roofing supplement revenue insert"
  ON public.roofing_supplement_revenue
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "roofing supplement revenue update"
  ON public.roofing_supplement_revenue
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Policy: Service role can do everything (for edge functions)
CREATE POLICY "roofing supplement revenue service role all"
  ON public.roofing_supplement_revenue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 7 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roofing_insurance_scopes IS 'Block 27640: Insurance scope data uploaded from PDF/Xactimate/etc.';
COMMENT ON TABLE public.roofing_supplement_recommendations IS 'Block 27640: AI-generated supplement suggestions';
COMMENT ON TABLE public.roofing_supplement_revenue IS 'Block 27640: Tracks approved supplement amounts and adjuster performance';
COMMENT ON COLUMN public.roofing_supplement_recommendations.status IS 'Block 27640: Recommendation status: pending, submitted, approved, rejected';
COMMENT ON VIEW public.roofing_supplement_revenue_monthly IS 'Block 27640: Monthly supplement revenue by workspace';
COMMENT ON VIEW public.roofing_adjuster_performance IS 'Block 27640: Adjuster underpayment performance tracking';
