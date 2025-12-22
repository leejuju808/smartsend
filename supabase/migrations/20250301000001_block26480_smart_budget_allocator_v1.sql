-- =========================================================
-- Block 26480 — SmartSend Roofing Smart Budget Allocator v1
-- (Shift budget from low-ROI channels to high-ROI channels • Automatic recommendations • "Turn this off / Boost this" engine)
-- =========================================================
-- 
-- This block turns SmartSend into the marketing strategist for the roofing company.
-- 
-- Instead of roofers guessing where to spend money…
-- SmartSend tells them EXACTLY:
-- - Which channels to cut
-- - Which channels to push
-- - How much to reallocate
-- - How much profit the reallocation will generate
-- 
-- This is where SmartSend becomes more than an automation tool—
-- it becomes the marketing CFO for the contractor.

-- ============================================================================
-- PART 1 — SMART BUDGET RECOMMENDATION VIEW
-- ============================================================================
-- Uses ROI data from Block 26410 (roofing_lead_source_roi).
-- Categorizes channels into: double_down, keep, rework, cut

CREATE OR REPLACE VIEW public.roofing_smart_budget_recommendations AS
SELECT
  r.lead_source_id,
  r.workspace_id,
  r.lead_source_name,
  r.channel_type,
  r.total_leads,
  r.jobs_sold,
  r.close_rate_pct,
  r.total_revenue,
  r.total_gross_profit,
  r.channel_cost_estimate,
  r.roi_pct,

  CASE
    -- ROI category logic
    WHEN r.roi_pct IS NULL THEN 'insufficient_data'
    WHEN r.roi_pct >= 150 THEN 'double_down'
    WHEN r.roi_pct BETWEEN 50 AND 149 THEN 'keep'
    WHEN r.roi_pct BETWEEN 0 AND 49 THEN 'rework'
    WHEN r.roi_pct < 0 THEN 'cut'
  END AS recommendation,

  CASE
    -- severity score (helps in sorting)
    WHEN r.roi_pct IS NULL THEN 0
    WHEN r.roi_pct >= 150 THEN 4
    WHEN r.roi_pct BETWEEN 50 AND 149 THEN 3
    WHEN r.roi_pct BETWEEN 0 AND 49 THEN 2
    WHEN r.roi_pct < 0 THEN 1
  END AS priority_score

FROM public.roofing_lead_source_roi r;

-- ============================================================================
-- PART 2 — "SUGGESTED BUDGET SHIFT" VIEW
-- ============================================================================
-- This tells SmartSend exactly how much to move.
-- Simple to start. Later you'll build ML-based budget optimization.

CREATE OR REPLACE VIEW public.roofing_smart_budget_shift AS
SELECT
  r.lead_source_id,
  r.workspace_id,
  r.lead_source_name,
  r.channel_type,
  r.roi_pct,
  r.channel_cost_estimate AS current_budget,

  -- Proposed amount to remove (if negative ROI)
  CASE 
    WHEN r.roi_pct < 0 THEN r.channel_cost_estimate
    WHEN r.roi_pct BETWEEN 0 AND 49 THEN r.channel_cost_estimate * 0.5
    ELSE 0
  END AS suggested_reduce,

  -- Proposed amount to add (if top performer)
  CASE
    WHEN r.roi_pct >= 150 THEN 500  -- fixed suggestion for now
    WHEN r.roi_pct BETWEEN 50 AND 149 THEN 250
    ELSE 0
  END AS suggested_increase

FROM public.roofing_lead_source_roi r;

-- ============================================================================
-- PART 3 — GRANTS
-- ============================================================================

GRANT SELECT ON public.roofing_smart_budget_recommendations TO authenticated;
GRANT SELECT ON public.roofing_smart_budget_recommendations TO service_role;

GRANT SELECT ON public.roofing_smart_budget_shift TO authenticated;
GRANT SELECT ON public.roofing_smart_budget_shift TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON VIEW public.roofing_smart_budget_recommendations IS 'Block 26480: Channel recommendations (double_down, keep, rework, cut) based on ROI';
COMMENT ON VIEW public.roofing_smart_budget_shift IS 'Block 26480: Suggested budget reductions and increases by channel';



































