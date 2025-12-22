-- =========================================================
-- Block 27580 — SmartSend Roofing Owner Command Center v1
-- (The single most important page in SmartSend • Profit engine • Forecast • Collections • Pipeline • Capacity • Cashflow • Everything at a glance)
-- =========================================================
-- 
-- This block is the crown jewel of SmartSend.
-- 
-- This is the page where the roofing owner wakes up every morning, opens SmartSend, and instantly knows:
-- - Are we making money?
-- - Do we have enough jobs coming in?
-- - Who owes us money?
-- - Will next month be slow?
-- - Are crews overbooked or underbooked?
-- - Where are our best leads coming from?
-- - What needs attention RIGHT NOW?
-- 
-- This is the page that makes SmartSend feel like a full COO + CFO + Sales Manager.
-- This is the page that keeps the subscription forever.

-- ============================================================================
-- PART 1 — CREATE roofing_owner_command_center VIEW
-- ============================================================================
-- Meta view that aggregates summaries from all existing systems

CREATE OR REPLACE VIEW public.roofing_owner_command_center AS
SELECT
  w.id AS workspace_id,
  
  -- Profit Pulse (from roofing_job_profit)
  COALESCE((
    SELECT SUM(gross_profit) 
    FROM public.roofing_job_profit 
    WHERE workspace_id = w.id
  ), 0) AS total_projected_profit,
  
  COALESCE((
    SELECT SUM(estimated_revenue) 
    FROM public.roofing_job_profit 
    WHERE workspace_id = w.id
  ), 0) AS total_projected_revenue,
  
  -- Forecast Radar (30/60/90 days from roofing_revenue_projection_windows)
  COALESCE((
    SELECT total_projected 
    FROM public.roofing_revenue_projection_windows 
    WHERE workspace_id = w.id AND window_bucket = '30'
  ), 0) AS forecast_30,
  
  COALESCE((
    SELECT total_projected 
    FROM public.roofing_revenue_projection_windows 
    WHERE workspace_id = w.id AND window_bucket = '60'
  ), 0) AS forecast_60,
  
  COALESCE((
    SELECT total_projected 
    FROM public.roofing_revenue_projection_windows 
    WHERE workspace_id = w.id AND window_bucket = '90'
  ), 0) AS forecast_90,
  
  -- Collections (from roofing_payment_requests and roofing_collections_priority)
  -- Note: roofing_collections_priority doesn't have workspace_id, so we join through jobs
  COALESCE((
    SELECT SUM(pr.amount) 
    FROM public.roofing_payment_requests pr
    JOIN public.roofing_jobs j ON j.id = pr.job_id
    WHERE j.workspace_id = w.id AND pr.status = 'overdue'
  ), 0) AS total_overdue,
  
  COALESCE((
    SELECT COUNT(*) 
    FROM public.roofing_payment_requests pr
    JOIN public.roofing_jobs j ON j.id = pr.job_id
    WHERE j.workspace_id = w.id AND pr.status = 'overdue'
  ), 0) AS overdue_requests,
  
  COALESCE((
    SELECT COUNT(*) 
    FROM public.roofing_collections_priority cp
    JOIN public.roofing_jobs j ON j.id = cp.job_id
    WHERE j.workspace_id = w.id AND cp.severity = 'high'
  ), 0) AS high_risk_overdue_count,
  
  -- Pipeline (from roofing_jobs and roofing_pipeline_forecast)
  COALESCE((
    SELECT COUNT(*) 
    FROM public.roofing_jobs 
    WHERE workspace_id = w.id 
      AND current_stage IN ('lead', 'estimate_sent', 'negotiation', 'ADJUSTER_SCHEDULED', 'CLAIM_PENDING', 'CLAIM_APPROVED')
  ), 0) AS pipeline_leads,
  
  COALESCE((
    SELECT SUM(expected_value) 
    FROM public.roofing_pipeline_forecast 
    WHERE workspace_id = w.id
  ), 0) AS pipeline_expected_value,
  
  -- Capacity Load (next 30 days from roofing_install_load_by_week and roofing_install_capacity_by_week)
  COALESCE((
    SELECT SUM(total_squares) 
    FROM public.roofing_install_load_by_week 
    WHERE workspace_id = w.id 
      AND week_start <= CURRENT_DATE + INTERVAL '30 days'
  ), 0) AS next_30_squares,
  
  COALESCE((
    SELECT SUM(weekly_capacity_squares) 
    FROM public.roofing_install_capacity_by_week 
    WHERE workspace_id = w.id 
      AND week_start <= CURRENT_DATE + INTERVAL '30 days'
  ), 0) AS next_30_capacity,
  
  -- Marketing ROI (from roofing_marketing_roi)
  COALESCE((
    SELECT SUM(total_revenue) 
    FROM public.roofing_marketing_roi 
    WHERE workspace_id = w.id AND roi_multiplier > 1
  ), 0) AS profitable_marketing_revenue,
  
  COALESCE((
    SELECT SUM(total_revenue) 
    FROM public.roofing_marketing_roi 
    WHERE workspace_id = w.id AND source = 'smartsend_cold'
  ), 0) AS smartsend_cold_revenue

FROM public.workspaces w;

-- Grant access
GRANT SELECT ON public.roofing_owner_command_center TO authenticated;
GRANT SELECT ON public.roofing_owner_command_center TO service_role;

COMMENT ON VIEW public.roofing_owner_command_center IS 'Block 27580: Owner Command Center meta view aggregating profit, forecast, collections, pipeline, capacity, and marketing ROI';

-- ============================================================================
-- END OF BLOCK 27580
-- ============================================================================



































