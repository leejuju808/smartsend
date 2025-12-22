-- =========================================================
-- Block 26800 — SmartSend Roofing Executive Summary Report v1
-- (Weekly email to owner • Cashflow forecast • Profit summary • Jobs at risk • Top opportunities • "State of the Business" report)
-- =========================================================
-- 
-- This block turns SmartSend into the roofer's virtual COO.
-- 
-- Every week, the owner receives ONE email that tells them EXACTLY:
-- - How much money they made
-- - How much cash is coming
-- - Which jobs are at risk
-- - Which leads will close
-- - What needs attention NOW
-- 
-- This is the feature that makes SmartSend feel like you're running their business with them.

-- ============================================================================
-- PART 1 — EXECUTIVE SUMMARY DATA VIEW (SQL)
-- ============================================================================
-- Pulls from all previous blocks to create a unified executive summary
-- Note: If roofing_renewal_opportunities table doesn't exist, pending_renewals will be 0

CREATE OR REPLACE FUNCTION public.get_pending_renewals(p_workspace_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Check if table exists and get count
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'roofing_renewal_opportunities'
  ) THEN
    SELECT COUNT(*) INTO v_count
    FROM public.roofing_renewal_opportunities
    WHERE workspace_id = p_workspace_id 
    AND status = 'pending';
  END IF;
  
  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE VIEW public.roofing_executive_summary AS
SELECT
  w.id AS workspace_id,
  
  -- Cashflow (30-day forecast)
  COALESCE(cf.net_30d, 0) AS net_cashflow_30d,
  COALESCE(cf.incoming_30d, 0) AS incoming_cashflow_30d,
  COALESCE(cf.outgoing_30d, 0) AS outgoing_cashflow_30d,

  -- Profit Summary
  COALESCE(profit.total_projected_profit, 0) AS total_projected_profit,
  COALESCE(profit.total_projected_revenue, 0) AS total_projected_revenue,

  -- Collections (AR)
  COALESCE(ar.total_ar, 0) AS total_ar,
  COALESCE(ar.overdue_ar, 0) AS overdue_ar,

  -- Renewal Opportunities (safe function call that handles missing table)
  public.get_pending_renewals(w.id) AS pending_renewals
FROM public.workspaces w
LEFT JOIN public.roofing_owner_30day_cashflow_summary cf ON cf.workspace_id = w.id
LEFT JOIN (
  SELECT 
    workspace_id,
    SUM(gross_profit) AS total_projected_profit,
    SUM(COALESCE(final_revenue, estimated_revenue)) AS total_projected_revenue
  FROM public.roofing_job_profit
  GROUP BY workspace_id
) profit ON profit.workspace_id = w.id
LEFT JOIN (
  SELECT 
    workspace_id,
    SUM(CASE WHEN balance_due > 0 THEN balance_due ELSE 0 END) AS total_ar,
    SUM(CASE WHEN status = 'overdue' THEN balance_due ELSE 0 END) AS overdue_ar
  FROM public.roofing_invoice_balances
  GROUP BY workspace_id
) ar ON ar.workspace_id = w.id
WHERE w.is_active = true;

-- Grant access
GRANT SELECT ON public.roofing_executive_summary TO authenticated;
GRANT SELECT ON public.roofing_executive_summary TO service_role;
GRANT EXECUTE ON FUNCTION public.get_pending_renewals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_renewals(uuid) TO service_role;

-- ============================================================================
-- PART 2 — EXECUTIVE REPORTS TABLE (HISTORICAL STORAGE)
-- ============================================================================
-- Stores each weekly report so owners can view past summaries

CREATE TABLE IF NOT EXISTS public.roofing_executive_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  html text NOT NULL,
  summary_data jsonb DEFAULT '{}'::jsonb, -- Store raw data for reference
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_roofing_executive_reports_workspace 
  ON public.roofing_executive_reports(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_roofing_executive_reports_created_at 
  ON public.roofing_executive_reports(created_at DESC);

-- RLS
ALTER TABLE public.roofing_executive_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view reports for their workspace
CREATE POLICY "Users can view reports in their workspace"
  ON public.roofing_executive_reports FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Service role can insert reports
CREATE POLICY "Service role can insert reports"
  ON public.roofing_executive_reports FOR INSERT
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON public.roofing_executive_reports TO authenticated;
GRANT INSERT ON public.roofing_executive_reports TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON VIEW public.roofing_executive_summary IS 'Block 26800: Executive summary view aggregating cashflow, profit, AR, and renewal opportunities';
COMMENT ON TABLE public.roofing_executive_reports IS 'Block 26800: Historical storage for weekly executive summary reports';
COMMENT ON COLUMN public.roofing_executive_reports.summary_data IS 'Block 26800: Raw JSON data used to generate the report for reference';
COMMENT ON FUNCTION public.get_pending_renewals(uuid) IS 'Block 26800: Safely gets pending renewal count, returns 0 if table does not exist';



































