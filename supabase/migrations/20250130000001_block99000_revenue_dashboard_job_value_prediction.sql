-- =========================================================
-- Block 99000 — SmartSend Roofing
-- "Revenue Dashboard + Job Value Prediction Engine" v1
-- =========================================================
-- This block gives SmartSend the ONE feature that roofers cannot get anywhere else:
-- A dashboard that shows EXACTLY how much money SmartSend is making them.
-- This is the retention engine. This is the "contractor crack."
-- This is what makes SmartSend indispensable.

-- =========================================================
-- 1. ADD PRICING FIELDS TO LEADS TABLE
-- =========================================================

-- Add estimated_job_value (predicted by AI)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS estimated_job_value numeric(12,2);

-- Add final_job_value (actual value when job is won)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS final_job_value numeric(12,2);

-- Add job_stage to track pipeline position
-- Note: This may already exist as 'status', but we'll ensure job_stage exists
-- and syncs with status for compatibility
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS job_stage text DEFAULT 'lead';

-- Update job_stage constraint
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'leads_job_stage_check' 
    AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads DROP CONSTRAINT leads_job_stage_check;
  END IF;
END $$;

-- Add check constraint for job_stage
ALTER TABLE public.leads
  ADD CONSTRAINT leads_job_stage_check 
  CHECK (job_stage IN (
    'lead',
    'estimate_booked',
    'estimate_completed',
    'won',
    'lost'
  ));

-- Add index for efficient queries on job_stage and estimated_job_value
CREATE INDEX IF NOT EXISTS idx_leads_job_stage 
  ON public.leads(job_stage) 
  WHERE job_stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_estimated_job_value 
  ON public.leads(estimated_job_value) 
  WHERE estimated_job_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_final_job_value 
  ON public.leads(final_job_value) 
  WHERE final_job_value IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.leads.estimated_job_value IS 'AI-predicted job value in dollars (set by prediction engine)';
COMMENT ON COLUMN public.leads.final_job_value IS 'Actual contract value when job is won (in dollars)';
COMMENT ON COLUMN public.leads.job_stage IS 'Pipeline stage: lead | estimate_booked | estimate_completed | won | lost';

-- =========================================================
-- 2. CREATE JOBS TABLE FOR FULLY WON DEALS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  homeowner_name text,
  address text,
  estimated_value numeric(12,2),
  final_value numeric(12,2),
  job_type text,            -- reroof, repair, inspection, gutter, etc.
  status text DEFAULT 'won' CHECK (status IN ('won', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for jobs table
CREATE INDEX IF NOT EXISTS idx_jobs_workspace_id 
  ON public.jobs(workspace_id);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id 
  ON public.jobs(user_id) 
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_lead_id 
  ON public.jobs(lead_id) 
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_status 
  ON public.jobs(status);

CREATE INDEX IF NOT EXISTS idx_jobs_created_at 
  ON public.jobs(created_at DESC);

-- Updated_at trigger for jobs
CREATE OR REPLACE FUNCTION public.set_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_jobs_updated_at ON public.jobs;

CREATE TRIGGER trg_set_jobs_updated_at
BEFORE UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_jobs_updated_at();

-- Enable RLS on jobs table
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see jobs from their workspaces
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'jobs'
      AND policyname = 'Jobs are scoped to workspace'
  ) THEN
    CREATE POLICY "Jobs are scoped to workspace"
    ON public.jobs
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- Add comments for documentation
COMMENT ON TABLE public.jobs IS 'Fully won deals - tracks actual revenue generated from SmartSend leads';
COMMENT ON COLUMN public.jobs.estimated_value IS 'Estimated job value at time of win (from leads.estimated_job_value)';
COMMENT ON COLUMN public.jobs.final_value IS 'Final contract value (actual revenue)';
COMMENT ON COLUMN public.jobs.job_type IS 'Type of roofing job: reroof, repair, inspection, gutter, etc.';

-- =========================================================
-- 3. AUTO-CREATE JOB RECORD WHEN LEAD IS MARKED "WON"
-- =========================================================

-- Function to auto-create job when lead is marked won
CREATE OR REPLACE FUNCTION public.auto_create_job_on_win()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_homeowner_name text;
  v_address text;
BEGIN
  -- Only trigger when status changes to 'won' or job_stage changes to 'won'
  IF (NEW.status = 'won' OR NEW.job_stage = 'won') 
     AND (OLD.status != 'won' AND OLD.job_stage != 'won') THEN
    
    -- Get user_id from workspace (get first owner/admin)
    SELECT wm.user_id INTO v_user_id
    FROM public.workspace_members wm
    WHERE wm.workspace_id = NEW.workspace_id
      AND wm.role IN ('owner', 'admin')
    LIMIT 1;
    
    -- Build homeowner name from lead data
    v_homeowner_name := COALESCE(
      NEW.name,
      TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''))
    );
    
    -- Get address from custom fields or notes
    v_address := COALESCE(
      (NEW.custom->>'address')::text,
      (NEW.custom->>'street_address')::text,
      NULL
    );
    
    -- Insert job record
    INSERT INTO public.jobs (
      workspace_id,
      user_id,
      lead_id,
      homeowner_name,
      address,
      estimated_value,
      final_value,
      job_type,
      status
    )
    VALUES (
      NEW.workspace_id,
      v_user_id,
      NEW.id,
      v_homeowner_name,
      v_address,
      NEW.estimated_job_value,
      COALESCE(NEW.final_job_value, NEW.estimated_job_value),
      (NEW.custom->>'job_type')::text,
      'won'
    )
    ON CONFLICT DO NOTHING; -- Prevent duplicates if trigger fires multiple times
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_auto_create_job_on_win ON public.leads;

CREATE TRIGGER trg_auto_create_job_on_win
AFTER UPDATE ON public.leads
FOR EACH ROW
WHEN (
  (NEW.status = 'won' OR NEW.job_stage = 'won') 
  AND (OLD.status != 'won' AND OLD.job_stage != 'won')
)
EXECUTE FUNCTION public.auto_create_job_on_win();

-- =========================================================
-- 4. HELPER FUNCTION: Get revenue metrics for dashboard
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_revenue_metrics(
  p_workspace_id uuid,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz;
  v_end_date timestamptz;
  v_result jsonb;
BEGIN
  -- Default to last 30 days if not provided
  v_end_date := COALESCE(p_end_date, now());
  v_start_date := COALESCE(p_start_date, v_end_date - INTERVAL '30 days');
  
  SELECT jsonb_build_object(
    'total_revenue_this_month', (
      SELECT COALESCE(SUM(final_value), 0)
      FROM public.jobs
      WHERE workspace_id = p_workspace_id
        AND status = 'won'
        AND created_at >= date_trunc('month', now())
        AND created_at < date_trunc('month', now()) + INTERVAL '1 month'
    ),
    'total_revenue_last_month', (
      SELECT COALESCE(SUM(final_value), 0)
      FROM public.jobs
      WHERE workspace_id = p_workspace_id
        AND status = 'won'
        AND created_at >= date_trunc('month', now() - INTERVAL '1 month')
        AND created_at < date_trunc('month', now())
    ),
    'pipeline_value', (
      SELECT COALESCE(SUM(estimated_job_value), 0)
      FROM public.leads
      WHERE workspace_id = p_workspace_id
        AND job_stage IN ('estimate_booked', 'estimate_completed')
        AND status != 'won'
        AND status != 'lost'
    ),
    'pipeline_count', (
      SELECT COUNT(*)
      FROM public.leads
      WHERE workspace_id = p_workspace_id
        AND job_stage IN ('estimate_booked', 'estimate_completed')
        AND status != 'won'
        AND status != 'lost'
    ),
    'total_jobs_won', (
      SELECT COUNT(*)
      FROM public.jobs
      WHERE workspace_id = p_workspace_id
        AND status = 'won'
        AND created_at >= v_start_date
        AND created_at < v_end_date
    ),
    'total_revenue_won', (
      SELECT COALESCE(SUM(final_value), 0)
      FROM public.jobs
      WHERE workspace_id = p_workspace_id
        AND status = 'won'
        AND created_at >= v_start_date
        AND created_at < v_end_date
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- =========================================================
-- 5. HELPER FUNCTION: Get revenue by campaign
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_revenue_by_campaign(
  p_workspace_id uuid,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  campaign_id uuid,
  campaign_name text,
  leads_count bigint,
  jobs_won_count bigint,
  revenue_won numeric,
  avg_job_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz;
  v_end_date timestamptz;
BEGIN
  v_end_date := COALESCE(p_end_date, now());
  v_start_date := COALESCE(p_start_date, v_end_date - INTERVAL '30 days');
  
  RETURN QUERY
  SELECT 
    c.id as campaign_id,
    c.name as campaign_name,
    COUNT(DISTINCT l.id) as leads_count,
    COUNT(DISTINCT j.id) as jobs_won_count,
    COALESCE(SUM(j.final_value), 0) as revenue_won,
    CASE 
      WHEN COUNT(DISTINCT j.id) > 0 
      THEN COALESCE(AVG(j.final_value), 0)
      ELSE 0
    END as avg_job_value
  FROM public.campaigns c
  LEFT JOIN public.leads l ON l.campaign_id = c.id
    AND l.created_at >= v_start_date
    AND l.created_at < v_end_date
  LEFT JOIN public.jobs j ON j.lead_id = l.id
    AND j.status = 'won'
  WHERE c.workspace_id = p_workspace_id
  GROUP BY c.id, c.name
  HAVING COUNT(DISTINCT l.id) > 0
  ORDER BY revenue_won DESC;
END;
$$;

COMMENT ON FUNCTION public.get_revenue_metrics IS 'Get revenue metrics for revenue dashboard';
COMMENT ON FUNCTION public.get_revenue_by_campaign IS 'Get revenue breakdown by campaign';


























