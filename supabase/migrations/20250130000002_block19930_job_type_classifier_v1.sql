-- =========================================================
-- Block 19930 — SmartSend Inbox AI Repair/Replacement Classifier v1
-- (Job Type Detection, Severity Analysis, Insurance vs Retail, Roofing Scope Prediction, and Instant Project Categorization)
-- =========================================================

-- ============================================================================
-- PART 1 — Add Job Type Classification Fields to inbox_threads
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  -- Primary job type classification
  ADD COLUMN IF NOT EXISTS job_type text DEFAULT NULL CHECK (job_type IN (
    'roof_repair',
    'roof_replacement',
    'emergency_leak_repair',
    'storm_damage',
    'insurance_driven_claim',
    'gutter_repair_replacement',
    'inspection_only',
    'general_question',
    'not_roofing'
  )),
  
  -- Job subcategory (specific type within primary category)
  ADD COLUMN IF NOT EXISTS job_subcategory text DEFAULT NULL,
  
  -- Severity level (low, medium, high)
  ADD COLUMN IF NOT EXISTS severity_level text DEFAULT NULL CHECK (severity_level IN ('low', 'medium', 'high')),
  
  -- Insurance vs Retail classification
  ADD COLUMN IF NOT EXISTS insurance_vs_retail text DEFAULT NULL CHECK (insurance_vs_retail IN ('insurance', 'retail', 'unclear')),
  
  -- Missing information detection (JSONB array of missing fields)
  ADD COLUMN IF NOT EXISTS missing_information jsonb DEFAULT '[]'::jsonb,
  
  -- Job type classification metadata (confidence scores, keywords, etc.)
  ADD COLUMN IF NOT EXISTS job_type_metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Classification timestamp
  ADD COLUMN IF NOT EXISTS job_type_classified_at timestamptz DEFAULT NULL;

-- Indexes for job type queries
CREATE INDEX IF NOT EXISTS idx_threads_job_type ON public.inbox_threads(job_type) WHERE job_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_severity ON public.inbox_threads(severity_level) WHERE severity_level IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_insurance_retail ON public.inbox_threads(insurance_vs_retail) WHERE insurance_vs_retail IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_campaign_job_type ON public.inbox_threads(campaign_id, job_type) WHERE job_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_job_type_classified ON public.inbox_threads(job_type_classified_at) WHERE job_type_classified_at IS NOT NULL;

-- ============================================================================
-- PART 2 — Job Type Revenue Analytics View
-- ============================================================================

CREATE OR REPLACE VIEW public.inbox_job_type_revenue AS
SELECT 
  campaign_id,
  job_type,
  job_subcategory,
  severity_level,
  insurance_vs_retail,
  COUNT(*) as job_count,
  COALESCE(SUM(thread_estimated_value), 0) as total_revenue,
  COALESCE(AVG(thread_estimated_value), 0) as avg_revenue,
  COALESCE(AVG(close_probability_score), 0) as avg_probability,
  COUNT(*) FILTER (WHERE pipeline_stage = 'won') as jobs_won_count,
  COALESCE(SUM(thread_estimated_value) FILTER (WHERE pipeline_stage = 'won'), 0) as revenue_won
FROM public.inbox_threads
WHERE job_type IS NOT NULL
GROUP BY campaign_id, job_type, job_subcategory, severity_level, insurance_vs_retail;

-- ============================================================================
-- PART 3 — Job Type Summary by Campaign (Last 30 Days)
-- ============================================================================

CREATE OR REPLACE VIEW public.inbox_job_type_summary_30d AS
SELECT 
  campaign_id,
  job_type,
  COUNT(*) as job_count,
  COALESCE(SUM(thread_estimated_value), 0) as total_revenue,
  COUNT(*) FILTER (WHERE pipeline_stage = 'won') as jobs_won,
  COALESCE(SUM(thread_estimated_value) FILTER (WHERE pipeline_stage = 'won'), 0) as revenue_won
FROM public.inbox_threads
WHERE job_type IS NOT NULL
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY campaign_id, job_type
ORDER BY total_revenue DESC;

-- ============================================================================
-- PART 4 — Insurance vs Retail Revenue Breakdown
-- ============================================================================

CREATE OR REPLACE VIEW public.inbox_insurance_vs_retail_revenue AS
SELECT 
  campaign_id,
  insurance_vs_retail,
  COUNT(*) as job_count,
  COALESCE(SUM(thread_estimated_value), 0) as total_revenue,
  COALESCE(AVG(thread_estimated_value), 0) as avg_revenue,
  COUNT(*) FILTER (WHERE pipeline_stage = 'won') as jobs_won,
  COALESCE(SUM(thread_estimated_value) FILTER (WHERE pipeline_stage = 'won'), 0) as revenue_won
FROM public.inbox_threads
WHERE insurance_vs_retail IS NOT NULL
  AND job_type IS NOT NULL
GROUP BY campaign_id, insurance_vs_retail;

-- ============================================================================
-- PART 5 — Severity Level Distribution View
-- ============================================================================

CREATE OR REPLACE VIEW public.inbox_severity_distribution AS
SELECT 
  campaign_id,
  severity_level,
  COUNT(*) as job_count,
  COALESCE(SUM(thread_estimated_value), 0) as total_revenue,
  COALESCE(AVG(thread_estimated_value), 0) as avg_revenue,
  COALESCE(AVG(close_probability_score), 0) as avg_probability
FROM public.inbox_threads
WHERE severity_level IS NOT NULL
GROUP BY campaign_id, severity_level;

-- ============================================================================
-- PART 6 — Missing Information Detection View
-- ============================================================================

CREATE OR REPLACE VIEW public.inbox_missing_information_summary AS
SELECT 
  campaign_id,
  job_type,
  jsonb_array_elements_text(missing_information) as missing_field,
  COUNT(*) as thread_count
FROM public.inbox_threads
WHERE jsonb_array_length(missing_information) > 0
  AND job_type IS NOT NULL
GROUP BY campaign_id, job_type, jsonb_array_elements_text(missing_information);

-- ============================================================================
-- PART 7 — Function to Get Job Type Analytics for Campaign
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_job_type_analytics(
  p_campaign_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  job_type text,
  job_count bigint,
  total_revenue numeric,
  revenue_won numeric,
  jobs_won bigint,
  avg_revenue numeric,
  avg_probability numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.job_type,
    COUNT(*)::bigint as job_count,
    COALESCE(SUM(t.thread_estimated_value), 0) as total_revenue,
    COALESCE(SUM(t.thread_estimated_value) FILTER (WHERE t.pipeline_stage = 'won'), 0) as revenue_won,
    COUNT(*) FILTER (WHERE t.pipeline_stage = 'won')::bigint as jobs_won,
    COALESCE(AVG(t.thread_estimated_value), 0) as avg_revenue,
    COALESCE(AVG(t.close_probability_score), 0) as avg_probability
  FROM public.inbox_threads t
  WHERE t.campaign_id = p_campaign_id
    AND t.job_type IS NOT NULL
    AND t.created_at >= NOW() - (p_days || ' days')::interval
  GROUP BY t.job_type
  ORDER BY total_revenue DESC;
END;
$$;

-- ============================================================================
-- PART 8 — Function to Get Revenue by Job Type and Insurance Status
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_revenue_by_job_type_insurance(
  p_campaign_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  job_type text,
  insurance_vs_retail text,
  job_count bigint,
  total_revenue numeric,
  revenue_won numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.job_type,
    t.insurance_vs_retail,
    COUNT(*)::bigint as job_count,
    COALESCE(SUM(t.thread_estimated_value), 0) as total_revenue,
    COALESCE(SUM(t.thread_estimated_value) FILTER (WHERE t.pipeline_stage = 'won'), 0) as revenue_won
  FROM public.inbox_threads t
  WHERE t.campaign_id = p_campaign_id
    AND t.job_type IS NOT NULL
    AND t.insurance_vs_retail IS NOT NULL
    AND t.created_at >= NOW() - (p_days || ' days')::interval
  GROUP BY t.job_type, t.insurance_vs_retail
  ORDER BY total_revenue DESC;
END;
$$;

-- ============================================================================
-- PART 9 — Comments
-- ============================================================================

COMMENT ON COLUMN public.inbox_threads.job_type IS 'Primary job type: roof_repair, roof_replacement, emergency_leak_repair, storm_damage, insurance_driven_claim, gutter_repair_replacement, inspection_only, general_question, not_roofing';
COMMENT ON COLUMN public.inbox_threads.job_subcategory IS 'Specific subcategory within job type (e.g., shingle_repair, chimney_leak, hail_damage)';
COMMENT ON COLUMN public.inbox_threads.severity_level IS 'Severity level: low, medium, high';
COMMENT ON COLUMN public.inbox_threads.insurance_vs_retail IS 'Classification: insurance (claim-driven), retail (out-of-pocket), unclear';
COMMENT ON COLUMN public.inbox_threads.missing_information IS 'JSONB array of missing information fields needed for this job type';
COMMENT ON COLUMN public.inbox_threads.job_type_metadata IS 'JSONB metadata: confidence scores, detected keywords, AI reasoning, etc.';
COMMENT ON COLUMN public.inbox_threads.job_type_classified_at IS 'Timestamp when job type was classified by AI';



















































