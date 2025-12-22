-- ============================================================================
-- Block 22210 — SmartSend Roofing "Loss Reason Detector v1"
-- (🔍 AI System That Autopsies Every Lost Job — Reveals EXACTLY Why It Was Lost)
-- ============================================================================
-- FULL BLOCK. BRUTAL HONESTY.
-- This block gives owners the #1 thing they NEVER get from their team:
-- the truth about why jobs are lost.
-- ============================================================================

-- ============================================================================
-- PART 1 — ADD LOSS REASON DETAILS AND ANALYSIS COLUMNS TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS loss_reason_details text,
  ADD COLUMN IF NOT EXISTS loss_analysis jsonb;

-- Add comments for documentation
COMMENT ON COLUMN public.leads.loss_reason_details IS 'Block 22210: Detailed explanation of why this job was lost';
COMMENT ON COLUMN public.leads.loss_analysis IS 'Block 22210: Comprehensive AI analysis including estimator_factors, homeowner_factors, process_factors, and recommendations';

-- Create index for loss_analysis queries
CREATE INDEX IF NOT EXISTS idx_leads_loss_analysis ON public.leads USING gin(loss_analysis) WHERE loss_analysis IS NOT NULL;

-- ============================================================================
-- PART 2 — UPDATE EXISTING FUNCTION TO SUPPORT DETAILED ANALYSIS
-- ============================================================================
-- The edge function will populate these new fields when analyzing lost jobs

-- ============================================================================
-- PART 3 — CREATE VIEW FOR LOSS REASON ANALYTICS
-- ============================================================================

CREATE OR REPLACE VIEW public.loss_reason_analytics AS
SELECT
  workspace_id,
  DATE_TRUNC('month', updated_at) as month,
  loss_reason,
  COUNT(*) as count,
  COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY workspace_id, DATE_TRUNC('month', updated_at)), 0) as percentage,
  AVG(reason_confidence) as avg_confidence,
  SUM(estimated_job_value) as total_lost_value,
  -- Extract common factors from loss_analysis
  COUNT(*) FILTER (WHERE loss_analysis->'estimator_factors' IS NOT NULL) as has_estimator_factors,
  COUNT(*) FILTER (WHERE loss_analysis->'homeowner_factors' IS NOT NULL) as has_homeowner_factors,
  COUNT(*) FILTER (WHERE loss_analysis->'process_factors' IS NOT NULL) as has_process_factors
FROM public.leads
WHERE status = 'lost'
  AND loss_reason IS NOT NULL
GROUP BY workspace_id, DATE_TRUNC('month', updated_at), loss_reason;

COMMENT ON VIEW public.loss_reason_analytics IS 'Block 22210: Aggregated loss reason statistics for analytics and reporting';

-- ============================================================================
-- PART 4 — RPC FUNCTION TO GET TOP LOSS REASONS (ENHANCED)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_top_loss_reasons(
  p_workspace_id uuid,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 5
)
RETURNS TABLE(
  loss_reason text,
  count bigint,
  percentage numeric,
  avg_confidence numeric,
  total_lost_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz;
  v_end_date timestamptz;
  v_total_lost bigint;
BEGIN
  -- Set default date range to last 30 days if not provided
  v_start_date := COALESCE(p_start_date, NOW() - INTERVAL '30 days');
  v_end_date := COALESCE(p_end_date, NOW());

  -- Get total count for percentage calculation
  SELECT COUNT(*) INTO v_total_lost
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND status = 'lost'
    AND updated_at >= v_start_date
    AND updated_at <= v_end_date;

  -- Return top loss reasons
  RETURN QUERY
  SELECT
    l.loss_reason,
    COUNT(*)::bigint as count,
    CASE WHEN v_total_lost > 0 THEN (COUNT(*)::numeric / v_total_lost::numeric * 100) ELSE 0 END as percentage,
    AVG(l.reason_confidence)::numeric as avg_confidence,
    SUM(COALESCE(l.estimated_job_value, 0))::numeric as total_lost_value
  FROM public.leads l
  WHERE l.workspace_id = p_workspace_id
    AND l.status = 'lost'
    AND l.loss_reason IS NOT NULL
    AND l.updated_at >= v_start_date
    AND l.updated_at <= v_end_date
  GROUP BY l.loss_reason
  ORDER BY count DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_top_loss_reasons IS 'Block 22210: Get top loss reasons for a workspace with counts, percentages, and value totals';

-- ============================================================================
-- PART 5 — GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_top_loss_reasons(uuid, timestamptz, timestamptz, integer) TO authenticated;
GRANT SELECT ON public.loss_reason_analytics TO authenticated;









































