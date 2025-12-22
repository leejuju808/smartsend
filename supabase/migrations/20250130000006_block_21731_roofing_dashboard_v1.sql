-- =========================================================
-- Block 21731 — SmartSend Roofing Lead Dashboard v1
-- (Owner View: Heat Score • Status Summary • Revenue Forecast)
-- =========================================================
-- 
-- This is the money screen for roofing owners.
-- This is where SmartSend proves its value instantly.
-- 
-- The dashboard answers:
-- 1. Who are the hottest leads right now?
-- 2. How many leads are hot / warm / cold?
-- 3. What is the projected revenue from active leads?
-- 4. What follow-ups happened today?
-- 5. Which estimator is moving the most leads?

-- ============================================================================
-- 1. ADD PROJECTED VALUE FIELD TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS projected_value NUMERIC DEFAULT 0;

-- Index for projected value queries
CREATE INDEX IF NOT EXISTS idx_leads_projected_value
ON public.leads (projected_value DESC)
WHERE projected_value > 0;

-- ============================================================================
-- 2. FUNCTION: Get Dashboard Summary
-- ============================================================================
-- Returns:
-- - total_leads: Total active leads
-- - hot: Count of hot leads
-- - warm: Count of warm leads
-- - cold: Count of cold leads
-- - avg_heat_score: Average heat score across all leads
-- - projected_revenue: Simple projection (hot * $12k + warm * $6k)

CREATE OR REPLACE FUNCTION public.dashboard_summary(p_workspace_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_leads INT;
  v_hot_count INT;
  v_warm_count INT;
  v_cold_count INT;
  v_avg_heat NUMERIC;
  v_projected_revenue NUMERIC;
BEGIN
  -- Total active leads
  SELECT COUNT(*)
  INTO v_total_leads
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND status NOT IN ('lost', 'won', 'not_interested', 'out_of_scope');

  -- Hot leads: heat_score >= 70 OR status = 'hot'
  SELECT COUNT(*)
  INTO v_hot_count
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND status NOT IN ('lost', 'won', 'not_interested', 'out_of_scope')
    AND (
      heat_score >= 70 
      OR status = 'hot'
    );

  -- Warm leads: heat_score >= 40 AND < 70 OR status = 'warm'
  SELECT COUNT(*)
  INTO v_warm_count
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND status NOT IN ('lost', 'won', 'not_interested', 'out_of_scope')
    AND (
      (heat_score >= 40 AND heat_score < 70)
      OR status = 'warm'
    )
    AND NOT (heat_score >= 70 OR status = 'hot'); -- Exclude hot leads

  -- Cold leads: everything else that's active (heat_score < 40 OR NULL, and not hot/warm)
  SELECT COUNT(*)
  INTO v_cold_count
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND status NOT IN ('lost', 'won', 'not_interested', 'out_of_scope')
    AND NOT (heat_score >= 70 OR status = 'hot')
    AND NOT ((heat_score >= 40 AND heat_score < 70) OR status = 'warm');

  -- Average heat score
  SELECT COALESCE(AVG(heat_score), 0)
  INTO v_avg_heat
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND status NOT IN ('lost', 'won', 'not_interested', 'out_of_scope')
    AND heat_score IS NOT NULL;

  -- v1 simple revenue projection model
  -- hot lead → $12,000
  -- warm lead → $6,000
  -- cold lead → $0
  SELECT 
    (v_hot_count * 12000) + 
    (v_warm_count * 6000)
  INTO v_projected_revenue;

  RETURN json_build_object(
    'total_leads', v_total_leads,
    'hot', v_hot_count,
    'warm', v_warm_count,
    'cold', v_cold_count,
    'avg_heat_score', ROUND(v_avg_heat, 1),
    'projected_revenue', v_projected_revenue
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.dashboard_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(UUID) TO service_role;

-- ============================================================================
-- 3. COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.leads.projected_value IS 'Projected revenue value for this lead (v1: hot=$12k, warm=$6k, cold=$0)';
COMMENT ON FUNCTION public.dashboard_summary IS 'Returns dashboard summary with lead counts, heat scores, and projected revenue for a workspace.';

