-- =========================================================
-- Block 21640 — SmartSend Roofing Revenue Dashboard v2
-- (Won Jobs • Close Rates • Estimate → Win Funnel • Plan ROI)
-- =========================================================
--
-- This block creates the "money dashboard" for roofing companies.
-- When roofers log in, they see actual job dollars, not email metrics.
-- This transforms SmartSend from "email app" → profit center.
-- =========================================================

-- ============================================================================
-- 1. CREATE won_jobs TABLE
-- ============================================================================
-- Stores actual job amounts when a roofer marks a job as Won

CREATE TABLE IF NOT EXISTS public.won_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  won_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS won_jobs_user_idx ON public.won_jobs (user_id, won_at);
CREATE INDEX IF NOT EXISTS won_jobs_lead_idx ON public.won_jobs (lead_id);
CREATE INDEX IF NOT EXISTS won_jobs_estimate_idx ON public.won_jobs (estimate_id) WHERE estimate_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.won_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own won jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'won_jobs' 
    AND policyname = 'Users can view their own won jobs'
  ) THEN
    CREATE POLICY "Users can view their own won jobs"
      ON public.won_jobs
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- RLS Policy: Users can insert their own won jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'won_jobs' 
    AND policyname = 'Users can insert their own won jobs'
  ) THEN
    CREATE POLICY "Users can insert their own won jobs"
      ON public.won_jobs
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- RLS Policy: Users can update their own won jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'won_jobs' 
    AND policyname = 'Users can update their own won jobs'
  ) THEN
    CREATE POLICY "Users can update their own won jobs"
      ON public.won_jobs
      FOR UPDATE
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Grant service role full access for edge functions
GRANT ALL ON public.won_jobs TO service_role;

-- ============================================================================
-- 2. CREATE revenue_dashboard VIEW
-- ============================================================================
-- This view calculates all KPI metrics for a roofer
-- Outputs a single row per user that powers the whole dashboard

CREATE OR REPLACE VIEW public.revenue_dashboard AS
SELECT
  u.id as user_id,

  -- 1. Total revenue from won jobs
  coalesce((
    select sum(amount)
    from won_jobs w
    where w.user_id = u.id
  ), 0) as total_won_revenue,

  -- 2. Won revenue this month
  coalesce((
    select sum(amount)
    from won_jobs w
    where w.user_id = u.id
      and date_trunc('month', w.won_at) = date_trunc('month', now())
  ), 0) as revenue_this_month,

  -- 3. Estimates scheduled (30 days)
  (
    select count(*)
    from estimates e
    where e.user_id = u.id
      and e.start_time >= now() - interval '30 days'
  ) as estimates_30d,

  -- 4. Estimates completed (30 days)
  (
    select count(*)
    from estimates e
    where e.user_id = u.id
      and e.status = 'completed'
      and e.start_time >= now() - interval '30 days'
  ) as completed_30d,

  -- 5. Jobs won (30 days)
  (
    select count(*)
    from won_jobs w
    where w.user_id = u.id
      and w.won_at >= now() - interval '30 days'
  ) as jobs_won_30d,

  -- 6. Close Rate = won_jobs / completed_estimates
  (
    select case
      when (select count(*) from estimates e where e.user_id = u.id and e.status='completed') = 0
      then 0
      else (
        (select count(*)::numeric 
         from won_jobs w 
         where w.user_id = u.id)
         /
        (select count(*)::numeric 
         from estimates e 
         where e.user_id = u.id and e.status='completed')
      ) * 100
    end
  ) as close_rate_percent,

  -- 7. Average Job Value
  (
    select avg(amount)
    from won_jobs w
    where w.user_id = u.id
  ) as avg_job_value,

  -- 8. Active Pipeline Value (expected value model v1)
  -- Uses job_value_estimates view (based on contacts) joined via email or contact_id
  (
    select sum(
      coalesce(j.base_amount, l.estimated_job_value, 0) * 
      case
        when l.pipeline_stage='interested' then 0.3
        when l.pipeline_stage='estimate_scheduled' then 0.5
        when l.pipeline_stage='estimate_completed' then 0.6
        when l.pipeline_stage='verbal_yes' then 0.8
        when l.pipeline_stage='contract_sent' then 0.9
        else 0
      end
    )
    from leads l
    left join contacts c on (
      (l.contact_id = c.id)
      or (l.contact_id is null and lower(l.email) = lower(c.email) and c.workspace_id = l.workspace_id)
    )
    left join job_value_estimates j on j.id = c.id
    where l.user_id = u.id
      and l.pipeline_stage not in ('won', 'lost', 'job_won')
  ) as expected_pipeline_value

from profiles u;

-- Add comment
COMMENT ON VIEW public.revenue_dashboard IS 
  'Revenue Dashboard v2: Aggregates won jobs, estimates, close rates, and pipeline value per user (Block 21640)';

-- Enable RLS on the view (inherits from underlying tables)
-- The view will automatically respect RLS policies from profiles, won_jobs, estimates, and leads

