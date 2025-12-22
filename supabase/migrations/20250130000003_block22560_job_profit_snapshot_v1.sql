-- =========================================================
-- Block 22560 — SmartSend Roofing Job Profit Snapshot v1
-- (The Owner's Financial Control Center)
-- =========================================================
-- 
-- "Give the roofer ONE SCREEN that tells them if the job is making money or bleeding money."
-- 
-- This is where SmartSend stops being "email software" and becomes the roofing owner's financial control center.
-- No fluff. Just profit clarity.

-- ============================================================================
-- PART 1 — CREATE job_labor_costs TABLE
-- ============================================================================
-- V1 manual input for labor cost tracking

CREATE TABLE IF NOT EXISTS public.job_labor_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_name text,
  hours numeric(10,2) DEFAULT 0,
  hourly_rate numeric(10,2) DEFAULT 0,
  total_cost numeric(10,2) GENERATED ALWAYS AS (hours * hourly_rate) STORED,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_labor_costs_job_idx
  ON public.job_labor_costs(job_id);

CREATE INDEX IF NOT EXISTS job_labor_costs_workspace_idx
  ON public.job_labor_costs(workspace_id);

ALTER TABLE public.job_labor_costs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view labor costs for jobs in their workspace
CREATE POLICY "labor_select" ON public.job_labor_costs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_labor_costs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert labor costs for jobs in their workspace
CREATE POLICY "labor_insert" ON public.job_labor_costs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_labor_costs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can update labor costs for jobs in their workspace
CREATE POLICY "labor_update" ON public.job_labor_costs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_labor_costs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can delete labor costs for jobs in their workspace
CREATE POLICY "labor_delete" ON public.job_labor_costs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_labor_costs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 2 — CREATE job_change_orders TABLE
-- ============================================================================
-- Table for job-level supplemental revenue (change orders)

CREATE TABLE IF NOT EXISTS public.job_change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL,
  status text CHECK (status IN ('pending','approved','denied')) DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_change_orders_job_idx
  ON public.job_change_orders(job_id);

CREATE INDEX IF NOT EXISTS job_change_orders_workspace_idx
  ON public.job_change_orders(workspace_id);

CREATE INDEX IF NOT EXISTS job_change_orders_status_idx
  ON public.job_change_orders(status);

ALTER TABLE public.job_change_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view change orders for jobs in their workspace
CREATE POLICY "co_select" ON public.job_change_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_change_orders.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert change orders for jobs in their workspace
CREATE POLICY "co_insert" ON public.job_change_orders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_change_orders.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can update change orders for jobs in their workspace
CREATE POLICY "co_update" ON public.job_change_orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_change_orders.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can delete change orders for jobs in their workspace
CREATE POLICY "co_delete" ON public.job_change_orders
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_change_orders.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 3 — ADD supplement_amount TO roofing_jobs (if not exists)
-- ============================================================================
-- Optional field for supplement revenue tracking

ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS supplement_amount numeric(10,2) DEFAULT 0;

COMMENT ON COLUMN public.roofing_jobs.supplement_amount IS 'Block 22560: Supplement revenue amount for profit snapshot calculation';







































