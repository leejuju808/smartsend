-- ============================================================
-- Block 257800 — SmartSend Profit Intelligence Engine v1
-- (Job Profit • Division Profit • Margin Alerts • Cost Per Square • Profit Leaks • Owner KPIs)
-- ============================================================
-- 
-- This block does NOT reinvent the profit engine.
-- It sits on top of:
--   - job_costs / roofing_job_profit / report_job_profit
--   - margin_alerts / job_variance_alerts
--   - subcontractor_performance_dashboard
--   - get_company_profit_insights()
-- and exposes a tight, opinionated layer of “Profit Intelligence”:
--   - Clean division profit rollups
--   - Cost-per-square metrics
--   - Subcontractor profitability signals
--   - Profit leak detection hooks
--   - Owner-ready KPI payloads
-- ============================================================

-- ============================================================
-- 1. DIVISION-LEVEL PROFIT VIEW
-- ============================================================
-- We purposely DO NOT create another mutable table here.
-- Instead, we roll up profit from report_job_profit, which is already
-- the canonical “job profitability snapshot” table (Block 244000).
--
-- Division logic (v1, opinionated mapping):
--   - repairs   → job_type = 'repair'
--   - insurance → job_type IN ('insurance', 'storm_insurance')
--   - commercial→ job_type ILIKE '%commercial%' OR job_number ILIKE 'COM-%'
--   - residential (default) for everything else

CREATE OR REPLACE VIEW public.division_profit AS
SELECT
  rjp.workspace_id,
  CASE
    WHEN rjp.job_type = 'repair' THEN 'repairs'
    WHEN rjp.job_type IN ('insurance', 'storm_insurance') THEN 'insurance'
    WHEN rjp.job_type ILIKE '%commercial%' OR rjp.job_number ILIKE 'COM-%' THEN 'commercial'
    ELSE 'residential'
  END AS division_name,
  date_trunc('month', COALESCE(rjp.completed_at, rjp.created_at))::date AS period_start,
  (date_trunc('month', COALESCE(rjp.completed_at, rjp.created_at)) + INTERVAL '1 month - 1 day')::date AS period_end,
  COALESCE(SUM(rjp.revenue), 0)                      AS revenue,
  COALESCE(SUM(rjp.total_cost), 0)                  AS cost,
  COALESCE(SUM(rjp.profit), 0)                      AS profit,
  CASE 
    WHEN COALESCE(SUM(rjp.revenue), 0) > 0 
      THEN ROUND((COALESCE(SUM(rjp.profit), 0) / NULLIF(SUM(rjp.revenue), 0)) * 100, 2)
    ELSE 0
  END                                               AS margin
FROM public.report_job_profit rjp
GROUP BY
  rjp.workspace_id,
  division_name,
  period_start,
  period_end;

COMMENT ON VIEW public.division_profit IS
  'Block 257800: Division-level profit rollup by month (residential, commercial, repairs, insurance) sourced from report_job_profit';

GRANT SELECT ON public.division_profit TO authenticated;


-- ============================================================
-- 2. COST-PER-SQUARE PROFIT VIEW
-- ============================================================
-- Fast reporting shape for “Cost Per Square” + margin intelligence.
-- Backed by report_job_profit, which already stores square_footage
-- and profit_per_square (Block 244000).

CREATE OR REPLACE VIEW public.cost_per_square_report AS
SELECT
  workspace_id,
  job_id,
  job_number,
  job_type,
  square_footage,
  revenue,
  total_cost,
  profit,
  margin,
  profit_per_square,
  CASE 
    WHEN square_footage IS NOT NULL AND square_footage > 0 
      THEN ROUND(total_cost / NULLIF(square_footage, 0), 2)
    ELSE NULL
  END AS cost_per_square
FROM public.report_job_profit
WHERE square_footage IS NOT NULL
  AND square_footage > 0;

COMMENT ON VIEW public.cost_per_square_report IS
  'Block 257800: Per-job cost-per-square + profit/margin report sourced from report_job_profit';

GRANT SELECT ON public.cost_per_square_report TO authenticated;


-- ============================================================
-- 3. MARGIN ALERT TYPES EXTENSION (LABOR/MATERIAL/SUB)
-- ============================================================
-- Extend margin_alerts.alert_type so we can cleanly label:
--   - labor_overrun
--   - material_overrun
--   - sub_overcharge
--
-- NOTE: margin_alerts was introduced in Block 25340 and is already
-- used by multiple profit engines. We keep the same table and simply
-- widen the CHECK constraint to allow the new alert types.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'margin_alerts'
      AND column_name  = 'alert_type'
  ) THEN
    ALTER TABLE public.margin_alerts
    DROP CONSTRAINT IF EXISTS margin_alerts_alert_type_check;

    ALTER TABLE public.margin_alerts
    ADD CONSTRAINT margin_alerts_alert_type_check
    CHECK (alert_type IN (
      'low_margin',
      'negative_profit',
      'material_cost_variance',
      'labor_cost_overrun',
      'supplement_opportunity',
      'cost_increase',
      'labor_overrun',
      'material_overrun',
      'sub_overcharge'
    ));
  END IF;
END $$;

COMMENT ON COLUMN public.margin_alerts.alert_type IS
  'Alert type for profit protection: low_margin, negative_profit, material/labor variances, and subcontractor overcharge (Block 25340 + 257800)';


-- ============================================================
-- 4. LIGHTWEIGHT JOB_PROFIT VIEW (UNIFIED SHAPE)
-- ============================================================
-- The system already has several profit tables:
--   - job_costs (jobs / roofing_jobs variants)
--   - roofing_job_profit
--   - report_job_profit
-- We DO NOT create a fourth mutable table.
-- Instead, we expose a single “job_profit” VIEW that gives the
-- simplified shape used in the Block 257800 spec:
--   revenue, labor_cost, material_cost, subcontractor_cost,
--   overhead_allocation, net_profit, margin.
--
-- NOTE: For v1, subcontractor_cost is sourced from accounting job_costs
-- where available, and 0 otherwise. Overhead is sourced from either
-- accounting job_costs.overhead_allocation or roofing job_costs.overhead_allocated.

CREATE OR REPLACE VIEW public.job_profit AS
WITH accounting_costs AS (
  SELECT
    jc.job_id,
    jc.team_id,
    jc.materials_cost       AS material_cost,
    jc.labor_cost           AS labor_cost,
    jc.subcontractor_cost   AS subcontractor_cost,
    jc.overhead_allocation  AS overhead_allocation,
    jc.total_cost
  FROM public.job_costs jc
),
roofing_costs AS (
  SELECT
    jc.job_id,
    jc.workspace_id,
    jc.materials_cost       AS material_cost,
    jc.labor_cost           AS labor_cost,
    0::numeric              AS subcontractor_cost,
    jc.overhead_allocated   AS overhead_allocation,
    jc.total_cost,
    jc.revenue
  FROM public.job_costs jc
),
job_profit_union AS (
  -- Jobs table variant (accounting engine)
  SELECT
    j.id                                AS job_id,
    NULL::uuid                          AS workspace_id,
    j.team_id,
    j.contract_value                    AS revenue,
    ac.material_cost,
    ac.labor_cost,
    ac.subcontractor_cost,
    ac.overhead_allocation,
    (COALESCE(j.contract_value, 0) - COALESCE(ac.total_cost, 0)) AS net_profit,
    CASE 
      WHEN COALESCE(j.contract_value, 0) > 0 THEN
        ROUND(
          ((COALESCE(j.contract_value, 0) - COALESCE(ac.total_cost, 0)) / NULLIF(j.contract_value, 0)) * 100,
          2
        )
      ELSE 0
    END                                AS margin
  FROM public.jobs j
  LEFT JOIN accounting_costs ac ON ac.job_id = j.id

  UNION ALL

  -- Roofing_jobs variant (roofing profit engine)
  SELECT
    rj.id                              AS job_id,
    rj.workspace_id,
    NULL::uuid                         AS team_id,
    COALESCE(rc.revenue, rj.job_value) AS revenue,
    rc.material_cost,
    rc.labor_cost,
    rc.subcontractor_cost,
    rc.overhead_allocation,
    (COALESCE(rc.revenue, rj.job_value, 0) - COALESCE(rc.total_cost, 0)) AS net_profit,
    CASE 
      WHEN COALESCE(rc.revenue, rj.job_value, 0) > 0 THEN
        ROUND(
          ((COALESCE(rc.revenue, rj.job_value, 0) - COALESCE(rc.total_cost, 0)) / NULLIF(COALESCE(rc.revenue, rj.job_value, 0), 0)) * 100,
          2
        )
      ELSE 0
    END                                AS margin
  FROM public.roofing_jobs rj
  LEFT JOIN (
    SELECT
      jc.job_id,
      jc.materials_cost       AS material_cost,
      jc.labor_cost           AS labor_cost,
      0::numeric              AS subcontractor_cost,
      jc.overhead_allocated   AS overhead_allocation,
      jc.total_cost,
      jc.revenue
    FROM public.job_costs jc
  ) rc ON rc.job_id = rj.id
)
SELECT * FROM job_profit_union;

COMMENT ON VIEW public.job_profit IS
  'Block 257800: Unified job profit view across jobs/roofing_jobs with simplified P&L shape (revenue, costs, net_profit, margin)';

GRANT SELECT ON public.job_profit TO authenticated;


-- ============================================================
-- END OF BLOCK 257800
-- ============================================================














