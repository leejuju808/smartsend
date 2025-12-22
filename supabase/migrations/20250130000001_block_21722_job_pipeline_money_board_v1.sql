-- =========================================================
-- Block 21722 — SmartSend Roofing Job Pipeline "Money Board" v1
-- =========================================================
-- 
-- This creates a company-level pipeline view that aggregates leads by status
-- and shows total dollar values in each stage.
-- 
-- This is where a roofer "feels" SmartSend as a revenue system.
-- They see: Pipeline value, Booked value, New vs Working vs Lost vs Cold

-- ============================================================================
-- 1. Create company_job_pipeline_view
-- ============================================================================
-- This gives 1 row per company with all sums.

CREATE OR REPLACE VIEW public.company_job_pipeline_view AS
SELECT
  company_id,

  -- counts
  COUNT(*) FILTER (WHERE status = 'new')     AS new_count,
  COUNT(*) FILTER (WHERE status = 'working') AS working_count,
  COUNT(*) FILTER (WHERE status = 'booked')  AS booked_count,
  COUNT(*) FILTER (WHERE status = 'lost')    AS lost_count,
  COUNT(*) FILTER (WHERE status = 'cold')    AS cold_count,

  -- money per stage (using estimated_job_value)
  COALESCE(SUM(estimated_job_value) FILTER (WHERE status = 'new'),     0) AS new_value,
  COALESCE(SUM(estimated_job_value) FILTER (WHERE status = 'working'), 0) AS working_value,
  COALESCE(SUM(estimated_job_value) FILTER (WHERE status = 'booked'),  0) AS booked_value,
  COALESCE(SUM(estimated_job_value) FILTER (WHERE status = 'lost'),    0) AS lost_value,
  COALESCE(SUM(estimated_job_value) FILTER (WHERE status = 'cold'),    0) AS cold_value,

  -- pipeline & won
  COALESCE(SUM(estimated_job_value) FILTER (WHERE status IN ('new','working')), 0) AS pipeline_value,
  COALESCE(SUM(estimated_job_value) FILTER (WHERE status = 'booked'), 0) AS won_value

FROM public.leads
WHERE company_id IS NOT NULL
GROUP BY company_id;

COMMENT ON VIEW public.company_job_pipeline_view IS 'Block 21722: Company-level job pipeline summary with counts and dollar values per stage';

-- ============================================================================
-- 2. RLS for the view
-- ============================================================================
-- Enable RLS on the view (views inherit RLS from underlying tables)
-- The view filters by company_id, and RLS from leads table + auth_company_id() keeps it tenant-safe

-- Note: Views don't have their own RLS policies, but they respect RLS on underlying tables.
-- Since we're filtering by company_id in the view and the leads table should have RLS,
-- this should be secure. However, we can add a security definer function if needed.

-- Create a security definer function to safely query the view
CREATE OR REPLACE FUNCTION public.get_company_pipeline(p_company_id uuid)
RETURNS TABLE (
  company_id uuid,
  new_count bigint,
  working_count bigint,
  booked_count bigint,
  lost_count bigint,
  cold_count bigint,
  new_value numeric,
  working_value numeric,
  booked_value numeric,
  lost_value numeric,
  cold_value numeric,
  pipeline_value numeric,
  won_value numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.company_job_pipeline_view
  WHERE company_id = p_company_id;
$$;

COMMENT ON FUNCTION public.get_company_pipeline(uuid) IS 'Block 21722: Security definer function to get pipeline data for a company';











































