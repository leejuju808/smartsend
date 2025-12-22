-- =========================================================
-- Block 22960 — SmartSend Roofing KPI Dashboard v1
-- "Company Metrics, Crew Metrics, Margin Metrics, Trends."
-- =========================================================
-- 
-- This is the scoreboard. The place the owner goes to see the truth 
-- about the business in one glance.
-- 
-- This block builds the high-level analytics layer on top of everything:
-- - Sales → Estimates → Won Jobs
-- - Production → Schedule → Crew Output
-- - Finance → Payments → Profit → Margins
-- - Operations → Materials → Delays → Risks
-- - AI → Insights → Trends

-- ============================================================================
-- PART 1 — CREATE kpi_snapshots TABLE
-- ============================================================================
-- Store KPI results daily to enable trending charts

CREATE TABLE IF NOT EXISTS public.kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT current_date,
  metrics jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  
  -- Ensure one snapshot per workspace per day
  UNIQUE(workspace_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_workspace ON public.kpi_snapshots(workspace_id);
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_date ON public.kpi_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_workspace_date ON public.kpi_snapshots(workspace_id, snapshot_date DESC);

ALTER TABLE public.kpi_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view snapshots for their workspace
CREATE POLICY "kpi_snapshots_select" ON public.kpi_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = kpi_snapshots.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Service role can insert snapshots (for daily compute function)
CREATE POLICY "kpi_snapshots_insert" ON public.kpi_snapshots
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE public.kpi_snapshots IS 'Block 22960: Daily KPI snapshots for trending charts';

-- ============================================================================
-- PART 2 — CREATE KPI VIEW: Company Revenue Metrics
-- ============================================================================
-- Jobs sold this month, Jobs completed this month, Revenue collected,
-- A/R outstanding, Average job size, Year-to-date revenue

CREATE OR REPLACE VIEW public.kpi_company_revenue AS
SELECT
  rj.workspace_id,
  DATE_TRUNC('month', rj.created_at)::date as month,
  COUNT(*) FILTER (WHERE rj.status IN ('scheduled', 'in_progress', 'completed')) as jobs_sold_count,
  COUNT(*) FILTER (WHERE rj.status = 'completed') as jobs_completed_count,
  COALESCE(SUM(jp.amount), 0) as revenue_collected,
  COALESCE(SUM(rj.job_value), 0) - COALESCE(SUM(jp.amount), 0) as ar_outstanding,
  COALESCE(AVG(rj.job_value), 0) as avg_job_size,
  COALESCE(SUM(jp.amount) FILTER (WHERE DATE_TRUNC('year', jp.created_at) = DATE_TRUNC('year', CURRENT_DATE)), 0) as ytd_revenue
FROM public.roofing_jobs rj
LEFT JOIN public.job_payments jp ON jp.job_id = rj.id
GROUP BY rj.workspace_id, DATE_TRUNC('month', rj.created_at);

COMMENT ON VIEW public.kpi_company_revenue IS 'Block 22960: Company-level revenue KPIs by month';

-- ============================================================================
-- PART 3 — CREATE KPI VIEW: Job Margin Metrics
-- ============================================================================
-- Average gross margin per job, Jobs under 30% margin, Jobs over 45% margin,
-- Profit trend (month over month)

CREATE OR REPLACE VIEW public.kpi_job_margin AS
SELECT
  rj.workspace_id,
  rj.id as job_id,
  rj.job_value as revenue,
  COALESCE(rj.actual_material_cost, 0) + COALESCE(rj.actual_labor_cost, 0) + COALESCE(rj.actual_other_cost, 0) as costs,
  rj.job_value - (COALESCE(rj.actual_material_cost, 0) + COALESCE(rj.actual_labor_cost, 0) + COALESCE(rj.actual_other_cost, 0)) as profit,
  CASE 
    WHEN rj.job_value > 0 THEN 
      ((rj.job_value - (COALESCE(rj.actual_material_cost, 0) + COALESCE(rj.actual_labor_cost, 0) + COALESCE(rj.actual_other_cost, 0))) / rj.job_value * 100)
    ELSE 0
  END as margin_pct,
  DATE_TRUNC('month', rj.created_at)::date as month
FROM public.roofing_jobs rj
WHERE rj.status IN ('scheduled', 'in_progress', 'completed');

COMMENT ON VIEW public.kpi_job_margin IS 'Block 22960: Job-level margin and profit metrics';

-- ============================================================================
-- PART 4 — CREATE KPI VIEW: Crew Efficiency Metrics
-- ============================================================================
-- Avg hours per job, Avg jobs per week, Productivity score,
-- Crew $ per day generated, Crew time overruns

CREATE OR REPLACE VIEW public.kpi_crew_efficiency AS
SELECT
  c.id as crew_id,
  c.workspace_id,
  c.name as crew_name,
  COUNT(DISTINCT jfs.job_id) as total_jobs,
  COUNT(jfs.id) as total_sessions,
  COALESCE(AVG(jfs.progress_percent), 0) as avg_progress_percent,
  COALESCE(AVG(EXTRACT(EPOCH FROM (jfs.check_out_at - jfs.check_in_at)) / 3600), 0) as avg_hours_per_session,
  COALESCE(SUM(EXTRACT(EPOCH FROM (jfs.check_out_at - jfs.check_in_at)) / 3600), 0) as total_hours,
  COUNT(DISTINCT DATE_TRUNC('week', jfs.check_in_at)) as weeks_active,
  CASE 
    WHEN COUNT(DISTINCT DATE_TRUNC('week', jfs.check_in_at)) > 0 THEN
      COUNT(DISTINCT jfs.job_id)::numeric / COUNT(DISTINCT DATE_TRUNC('week', jfs.check_in_at))
    ELSE 0
  END as avg_jobs_per_week,
  -- Productivity score: combination of jobs completed, hours efficiency, progress rate
  CASE 
    WHEN COUNT(jfs.id) > 0 THEN
      LEAST(100, (
        (COUNT(DISTINCT jfs.job_id) * 10) +
        (AVG(jfs.progress_percent) * 0.5) +
        (CASE WHEN AVG(EXTRACT(EPOCH FROM (jfs.check_out_at - jfs.check_in_at)) / 3600) > 0 
          THEN LEAST(50, (COUNT(DISTINCT jfs.job_id) * 8 / AVG(EXTRACT(EPOCH FROM (jfs.check_out_at - jfs.check_in_at)) / 3600)))
          ELSE 0 END)
      ))
    ELSE 0
  END as productivity_score
FROM public.crews c
LEFT JOIN public.job_field_sessions jfs ON jfs.crew_id = c.id AND jfs.check_out_at IS NOT NULL
GROUP BY c.id, c.workspace_id, c.name;

COMMENT ON VIEW public.kpi_crew_efficiency IS 'Block 22960: Crew-level efficiency and productivity metrics';

-- ============================================================================
-- PART 5 — CREATE KPI VIEW: Sales Metrics
-- ============================================================================
-- Leads generated, Estimates sent, Close rate %, Revenue per lead,
-- Revenue per estimate

CREATE OR REPLACE VIEW public.kpi_sales_metrics AS
SELECT
  l.workspace_id,
  DATE_TRUNC('month', l.created_at)::date as month,
  COUNT(DISTINCT l.id) as leads_generated,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status IS NOT NULL) as estimates_sent,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress', 'completed')) as jobs_won,
  CASE 
    WHEN COUNT(DISTINCT p.id) FILTER (WHERE p.status IS NOT NULL) > 0 THEN
      (COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress', 'completed'))::numeric / 
       COUNT(DISTINCT p.id) FILTER (WHERE p.status IS NOT NULL)::numeric * 100)
    ELSE 0
  END as close_rate_pct,
  CASE 
    WHEN COUNT(DISTINCT l.id) > 0 THEN
      COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status IN ('scheduled', 'in_progress', 'completed')), 0) / COUNT(DISTINCT l.id)
    ELSE 0
  END as revenue_per_lead,
  CASE 
    WHEN COUNT(DISTINCT p.id) FILTER (WHERE p.status IS NOT NULL) > 0 THEN
      COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status IN ('scheduled', 'in_progress', 'completed')), 0) / COUNT(DISTINCT p.id) FILTER (WHERE p.status IS NOT NULL)
    ELSE 0
  END as revenue_per_estimate
FROM public.leads l
LEFT JOIN public.proposals p ON p.lead_id = l.id
LEFT JOIN public.roofing_jobs rj ON rj.lead_id = l.id
GROUP BY l.workspace_id, DATE_TRUNC('month', l.created_at);

COMMENT ON VIEW public.kpi_sales_metrics IS 'Block 22960: Sales funnel metrics (leads → estimates → jobs won)';

-- ============================================================================
-- PART 6 — CREATE KPI VIEW: Supplier Performance Metrics
-- ============================================================================
-- On-time delivery rate, Avg delay days, Material overrun trends,
-- Supplier causing the most margin loss

CREATE OR REPLACE VIEW public.kpi_supplier_performance AS
SELECT
  s.id as supplier_id,
  s.workspace_id,
  s.name as supplier_name,
  COUNT(mo.id) as total_orders,
  COUNT(mo.id) FILTER (WHERE mo.status = 'delivered') as delivered_orders,
  COUNT(mo.id) FILTER (
    WHERE mo.status = 'delivered'
      AND mo.actual_delivery_date IS NOT NULL
      AND mo.expected_delivery_date IS NOT NULL
      AND mo.actual_delivery_date <= mo.expected_delivery_date
  ) as on_time_deliveries,
  COUNT(mo.id) FILTER (
    WHERE mo.status = 'delivered'
      AND mo.actual_delivery_date IS NOT NULL
      AND mo.expected_delivery_date IS NOT NULL
      AND mo.actual_delivery_date > mo.expected_delivery_date
  ) as delayed_deliveries,
  CASE 
    WHEN COUNT(mo.id) FILTER (WHERE mo.status = 'delivered') > 0 THEN
      (COUNT(mo.id) FILTER (
        WHERE mo.status = 'delivered'
          AND mo.actual_delivery_date IS NOT NULL
          AND mo.expected_delivery_date IS NOT NULL
          AND mo.actual_delivery_date <= mo.expected_delivery_date
      )::numeric / COUNT(mo.id) FILTER (WHERE mo.status = 'delivered')::numeric * 100)
    ELSE 0
  END as on_time_rate,
  COALESCE(AVG(
    EXTRACT(EPOCH FROM (mo.actual_delivery_date - mo.expected_delivery_date)) / 86400.0
  ) FILTER (
    WHERE mo.status = 'delivered'
      AND mo.actual_delivery_date IS NOT NULL
      AND mo.expected_delivery_date IS NOT NULL
      AND mo.actual_delivery_date > mo.expected_delivery_date
  ), 0) as avg_delay_days,
  COALESCE(SUM(mo.total), 0) as total_order_value
FROM public.suppliers s
LEFT JOIN public.material_orders mo ON mo.supplier_id = s.id
GROUP BY s.id, s.workspace_id, s.name;

COMMENT ON VIEW public.kpi_supplier_performance IS 'Block 22960: Supplier reliability and performance metrics';

-- ============================================================================
-- PART 7 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.kpi_company_revenue TO authenticated;
GRANT SELECT ON public.kpi_job_margin TO authenticated;
GRANT SELECT ON public.kpi_crew_efficiency TO authenticated;
GRANT SELECT ON public.kpi_sales_metrics TO authenticated;
GRANT SELECT ON public.kpi_supplier_performance TO authenticated;

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON VIEW public.kpi_company_revenue IS 'Block 22960: Company revenue KPIs - jobs sold/completed, revenue collected, A/R, avg job size, YTD revenue';
COMMENT ON VIEW public.kpi_job_margin IS 'Block 22960: Job-level margin and profit breakdown';
COMMENT ON VIEW public.kpi_crew_efficiency IS 'Block 22960: Crew productivity metrics - hours, jobs per week, productivity score';
COMMENT ON VIEW public.kpi_sales_metrics IS 'Block 22960: Sales funnel metrics - leads, estimates, close rate, revenue per lead/estimate';
COMMENT ON VIEW public.kpi_supplier_performance IS 'Block 22960: Supplier reliability - on-time rate, delay days, order value';







































