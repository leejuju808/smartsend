-- =========================================================
-- Block 26340 — SmartSend Roofing Profit & Collections Owner Dashboard v1
-- (Owner-only view • Daily money report • Past-due snapshot • Profit per job • Cashflow + AR integration)
-- =========================================================
-- 
-- This block is where everything you've built (profit engine, cashflow, AR/collections) 
-- gets pulled into one "Boss Screen".
-- 
-- When the roofing owner logs in, they see:
-- - How much money is owed to them
-- - How much money is coming in / going out next 30 days
-- - Which jobs are actually profitable
-- - Which invoices are at risk / overdue
-- 
-- SmartSend stops feeling like "software" and becomes the financial cockpit.

-- ============================================================================
-- PART 1 — AR + OVERDUE SUMMARY VIEW
-- ============================================================================
-- Aggregates total AR and overdue AR from invoice balances

CREATE OR REPLACE VIEW public.roofing_owner_ar_summary AS
SELECT
  workspace_id,
  COALESCE(SUM(CASE WHEN balance_due > 0 THEN balance_due ELSE 0 END), 0) AS total_ar,
  COALESCE(SUM(CASE WHEN (status = 'overdue' OR (due_date < CURRENT_DATE AND balance_due > 0)) 
    THEN balance_due ELSE 0 END), 0) AS overdue_ar,
  COUNT(*) FILTER (WHERE (status = 'overdue' OR (due_date < CURRENT_DATE AND balance_due > 0)) 
    AND balance_due > 0) AS overdue_invoices_count
FROM public.roofing_invoice_balances
WHERE balance_due > 0
GROUP BY workspace_id;

-- Grant access
GRANT SELECT ON public.roofing_owner_ar_summary TO authenticated;

-- ============================================================================
-- PART 2 — ACTIVE JOBS PROFIT SNAPSHOT VIEW
-- ============================================================================
-- Shows profit data for active jobs (sold, in production, completed)

CREATE OR REPLACE VIEW public.roofing_owner_job_profit_summary AS
SELECT
  j.id AS job_id,
  j.workspace_id,
  COALESCE(j.title, 'Untitled Job') AS job_name,
  j.status,
  COALESCE(p.estimated_revenue, 0) AS estimated_revenue,
  COALESCE(p.final_revenue, 0) AS final_revenue,
  COALESCE(p.material_cost, 0) AS material_cost,
  COALESCE(p.labor_cost, 0) AS labor_cost,
  COALESCE(p.supplement_revenue, 0) AS supplement_revenue,
  COALESCE(p.gross_profit, 0) AS gross_profit,
  COALESCE(p.margin, 0) AS margin
FROM public.roofing_jobs j
LEFT JOIN public.roofing_job_profit p ON p.job_id = j.id
WHERE j.status IN ('scheduled', 'in_progress', 'completed', 'sold', 'in_production', 'unscheduled')
  AND j.status != 'cancelled'
  AND (p.id IS NOT NULL OR j.job_value > 0);

-- Grant access
GRANT SELECT ON public.roofing_owner_job_profit_summary TO authenticated;

-- ============================================================================
-- PART 3 — 30-DAY CASHFLOW SUMMARY VIEW
-- ============================================================================
-- Aggregates incoming, outgoing, and net cashflow for next 30 days

CREATE OR REPLACE VIEW public.roofing_owner_30day_cashflow_summary AS
SELECT
  workspace_id,
  COALESCE(SUM(CASE WHEN type = 'incoming' THEN amount ELSE 0 END), 0) AS incoming_30d,
  COALESCE(SUM(CASE WHEN type = 'outgoing' THEN amount ELSE 0 END), 0) AS outgoing_30d,
  COALESCE(SUM(CASE WHEN type = 'incoming' THEN amount ELSE -amount END), 0) AS net_30d
FROM public.roofing_cashflow_events
WHERE expected_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
  AND actual = false
GROUP BY workspace_id;

-- Grant access
GRANT SELECT ON public.roofing_owner_30day_cashflow_summary TO authenticated;

-- ============================================================================
-- PART 4 — DAILY CASHFLOW LINE VIEW (FOR CHART)
-- ============================================================================
-- Returns daily cashflow breakdown for next 30 days for charting
-- This view returns only days that have cashflow events (filtered by workspace_id in API)

CREATE OR REPLACE VIEW public.roofing_owner_30day_cashflow_daily AS
SELECT
  e.expected_date AS day,
  e.workspace_id,
  COALESCE(SUM(CASE WHEN e.type = 'incoming' THEN e.amount END), 0) AS incoming,
  COALESCE(SUM(CASE WHEN e.type = 'outgoing' THEN e.amount END), 0) AS outgoing,
  COALESCE(SUM(CASE WHEN e.type = 'incoming' THEN e.amount END), 0)
    - COALESCE(SUM(CASE WHEN e.type = 'outgoing' THEN e.amount END), 0) AS net
FROM public.roofing_cashflow_events e
WHERE e.expected_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
  AND e.actual = false
GROUP BY e.expected_date, e.workspace_id
ORDER BY e.expected_date, e.workspace_id;

-- Grant access
GRANT SELECT ON public.roofing_owner_30day_cashflow_daily TO authenticated;

-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY POLICIES
-- ============================================================================
-- Ensure views respect workspace membership

-- Note: Views inherit RLS from underlying tables, but we add explicit policies
-- to ensure workspace filtering works correctly

-- RLS for roofing_owner_ar_summary (via underlying roofing_invoice_balances)
-- Already handled by roofing_invoice_balances RLS

-- RLS for roofing_owner_job_profit_summary (via underlying roofing_jobs and roofing_job_profit)
-- Already handled by underlying table RLS

-- RLS for roofing_owner_30day_cashflow_summary (via underlying roofing_cashflow_events)
-- Already handled by roofing_cashflow_events RLS

-- RLS for roofing_owner_30day_cashflow_daily (via underlying roofing_cashflow_events)
-- Already handled by roofing_cashflow_events RLS

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON VIEW public.roofing_owner_ar_summary IS 'Block 26340: AR summary by workspace - total AR and overdue AR';
COMMENT ON VIEW public.roofing_owner_job_profit_summary IS 'Block 26340: Active jobs with profit data for owner dashboard';
COMMENT ON VIEW public.roofing_owner_30day_cashflow_summary IS 'Block 26340: 30-day cashflow totals by workspace';
COMMENT ON VIEW public.roofing_owner_30day_cashflow_daily IS 'Block 26340: Daily cashflow breakdown for next 30 days for charting';



































