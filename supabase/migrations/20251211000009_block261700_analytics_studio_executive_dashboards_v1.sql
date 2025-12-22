-- ============================================================================
-- Block 261700 — SmartSend Analytics Studio, Custom Reports & Executive Dashboards v1
-- (Custom Reports · No Spreadsheets · Owner-Level Truth)
-- ============================================================================
--
-- This block turns the existing reporting/analytics backbone into an
-- "Analytics Studio" and executive cockpit:
--   - Drag-and-drop custom report builder
--   - Saved executive dashboards with live filters
--   - Cross-module metrics (Sales + Ops + Cash)
--   - Exception-first analytics (bottom jobs, weak crews, slow AR, callbacks)
--   - Scheduled auto-reports (email / mobile)
--   - Owner “one-screen truth” view
--
-- IMPORTANT MAPPING:
--   "company" in the spec maps to public.companies (Block 271 — Company 360 v1),
--   which is itself scoped to a workspace via companies.workspace_id.
--
-- This migration deliberately:
--   - Stores only metadata/definitions for reports & dashboards
--   - Reuses existing fact tables/views:
--       * Block 244000  : report_* tables (sales reps, jobs, marketing, crews, cashflow)
--       * Block 25380   : v_* analytics views (lead, job, team, forecast)
--       * Block 257800  : division_profit, cost_per_square_report, job_profit
--       * Block 261500  : owner_marketing_command_view
--   - Exposes a single owner-level "truth" view built on those facts
--

-- ============================================================================
-- 1. TABLE: reports (per-company saved report definitions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Company context (ties back to a workspace via public.companies.workspace_id)
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Human-facing name shown in the Analytics Studio
  name text NOT NULL,

  -- Optional category / folder label (Owner, Sales, Ops, Finance, Marketing, etc.)
  category text,

  -- JSON definition used by the app to build SQL on top of existing report_* tables:
  -- Example shape:
  -- {
  --   "metric": "revenue",
  --   "dimensions": ["crew", "date"],
  --   "time_granularity": "day",
  --   "source": "report_job_profit",
  --   "filters": {
  --     "job_type": ["retail"],
  --     "date_range": {"type": "last_30_days"}
  --   },
  --   "visualization": {
  --     "type": "bar",
  --     "stacked": false
  --   }
  -- }
  definition jsonb NOT NULL,

  -- Creator (optional; stored for ownership/audit)
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_company_name
  ON public.reports (company_id, name);

CREATE INDEX IF NOT EXISTS idx_reports_company_category
  ON public.reports (company_id, COALESCE(category, ''));

COMMENT ON TABLE public.reports IS
  'Block 261700: Saved per-company analytics report definitions backing the drag-and-drop Analytics Studio.';

COMMENT ON COLUMN public.reports.definition IS
  'JSON definition for a custom report (metrics, dimensions, filters, visualization config, and data source hints).';


-- ============================================================================
-- 2. TABLE: dashboards (per-company saved executive dashboards)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  name text NOT NULL,

  -- Layout JSON drives the grid/drag-and-drop experience.
  -- Example:
  -- [
  --   {
  --     "widget_id": "rev_by_crew",
  --     "report_id": "<uuid-or-null>",
  --     "type": "chart",
  --     "position": {"x":0,"y":0,"w":6,"h":4},
  --     "props": {
  --       "metric": "revenue",
  --       "dimension": "crew",
  --       "time_granularity": "day",
  --       "filters": {"job_type":["retail"],"date_range":{"type":"last_30_days"}}
  --     }
  --   }
  -- ]
  layout jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Optional JSON blob for dashboard-level defaults (filters, time range, role, etc.)
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Simple role label: 'owner', 'sales', 'ops', 'finance', etc. (purely informational)
  role text,

  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboards_company_name
  ON public.dashboards (company_id, name);

CREATE INDEX IF NOT EXISTS idx_dashboards_company_role
  ON public.dashboards (company_id, COALESCE(role, ''));

COMMENT ON TABLE public.dashboards IS
  'Block 261700: Saved per-company executive dashboards composed of widgets over Analytics Studio reports.';


-- ============================================================================
-- 3. TABLE: dashboard_widgets (normalized widgets per dashboard)
-- ============================================================================
-- While dashboards.layout can store everything for fast reads, this table gives
-- us a normalized shape for querying and scheduling (which widgets feed which
-- metrics, which dashboards reference a given report, etc.).

CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  dashboard_id uuid NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,

  -- Optional link to a saved report; if NULL, widget may use its own inline definition.
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,

  -- Widget type: chart, metric, table, exception_list, kpi_row, etc.
  widget_type text NOT NULL,

  -- Positioning information for the grid layout
  position jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Widget-level configuration (metric, dimensions, filters, viz type, etc.)
  config jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_dashboard
  ON public.dashboard_widgets (dashboard_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_report
  ON public.dashboard_widgets (report_id)
  WHERE report_id IS NOT NULL;

COMMENT ON TABLE public.dashboard_widgets IS
  'Block 261700: Normalized dashboard widget definitions linking dashboards to reports and widget configs.';


-- ============================================================================
-- 4. TABLE: report_schedules (scheduled auto-reports)
-- ============================================================================
-- Powers “Daily 7am owner summary”, “Weekly crew performance”, etc.
-- This table stores *when* and *where* to deliver a report, not the rendered
-- payload itself. Rendering is done by backend workers using the `reports`
-- definition JSON.

CREATE TABLE IF NOT EXISTS public.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Which saved report to render; nullable to support “inline” definitions
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,

  -- Human-facing label shown in UI (e.g. "Owner Daily 7am", "Weekly Crew Performance")
  name text NOT NULL,

  -- Basic frequency enum; more complex rules live in schedule_config
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'custom')),

  -- JSON schedule configuration, example:
  -- {
  --   "time": "07:00",
  --   "timezone": "America/Chicago",
  --   "days_of_week": ["mon","tue","wed","thu","fri"],
  --   "day_of_month": null
  -- }
  schedule_config jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Delivery channels: ['email', 'mobile_push', 'sms', ...]
  channels text[] NOT NULL DEFAULT ARRAY['email'],

  -- Target recipients: could be user IDs, roles, or literal emails
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,

  is_active boolean NOT NULL DEFAULT true,

  -- Simple bookkeeping for workers
  last_run_at timestamptz,
  next_run_at timestamptz,

  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_company_active
  ON public.report_schedules (company_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run_at
  ON public.report_schedules (next_run_at)
  WHERE is_active = true AND next_run_at IS NOT NULL;

COMMENT ON TABLE public.report_schedules IS
  'Block 261700: Per-company scheduled auto-report definitions (frequency, channels, recipients, and next run timestamps).';


-- ============================================================================
-- 5. TIMESTAMP TRIGGERS (updated_at helpers)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
      AND pg_function_is_visible(oid)
  ) THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_updated_at ON public.reports;
CREATE TRIGGER trg_reports_updated_at
BEFORE UPDATE ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_dashboards_updated_at ON public.dashboards;
CREATE TRIGGER trg_dashboards_updated_at
BEFORE UPDATE ON public.dashboards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_dashboard_widgets_updated_at ON public.dashboard_widgets;
CREATE TRIGGER trg_dashboard_widgets_updated_at
BEFORE UPDATE ON public.dashboard_widgets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_report_schedules_updated_at ON public.report_schedules;
CREATE TRIGGER trg_report_schedules_updated_at
BEFORE UPDATE ON public.report_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 6. OWNER "ONE-SCREEN TRUTH" VIEW
-- ============================================================================
-- High-level, opinionated rollup per workspace that powers the
-- “Owner One-Screen Truth” mode:
--   - Today’s revenue
--   - Today’s cash in
--   - Jobs at risk (low margin / over-budget)
--   - Top win crew
--   - Top leak crew
--
-- NOTE:
--   - This view is WORKSPACE-SCOPED, not company-scoped, because the
--     underlying report_* tables are workspace-based.
--   - The app can further filter by company via joins to companies if needed.

CREATE OR REPLACE VIEW public.owner_one_screen_truth AS
WITH workspace_ids AS (
  SELECT DISTINCT workspace_id FROM public.report_job_profit
  UNION
  SELECT DISTINCT workspace_id FROM public.report_cashflow
  UNION
  SELECT DISTINCT workspace_id FROM public.report_crews
),
today_jobs AS (
  SELECT
    rjp.workspace_id,
    COALESCE(SUM(rjp.revenue), 0) AS revenue_today,
    COUNT(*) FILTER (
      WHERE
        COALESCE(rjp.margin, 0) < 20
        OR COALESCE(rjp.cost_variance, 0) > 0
    ) AS jobs_at_risk
  FROM public.report_job_profit rjp
  WHERE
    (rjp.completed_at::date = CURRENT_DATE
     OR rjp.created_at::date = CURRENT_DATE)
  GROUP BY rjp.workspace_id
),
latest_cash AS (
  SELECT DISTINCT ON (workspace_id)
    workspace_id,
    cash_in
  FROM public.report_cashflow
  ORDER BY workspace_id, period_start DESC
),
crew_perf AS (
  SELECT
    rc.workspace_id,
    rc.crew_name,
    rc.performance_score,
    ROW_NUMBER() OVER (
      PARTITION BY rc.workspace_id
      ORDER BY rc.performance_score DESC NULLS LAST
    ) AS rank_desc,
    ROW_NUMBER() OVER (
      PARTITION BY rc.workspace_id
      ORDER BY rc.performance_score ASC NULLS LAST
    ) AS rank_asc
  FROM public.report_crews rc
  WHERE
    rc.period_start >= CURRENT_DATE - INTERVAL '30 days'
),
agg AS (
  SELECT
    w.workspace_id,
    COALESCE(tj.revenue_today, 0) AS revenue_today,
    COALESCE(lc.cash_in, 0) AS cash_in_today,
    COALESCE(tj.jobs_at_risk, 0) AS jobs_at_risk
  FROM workspace_ids w
  LEFT JOIN today_jobs tj ON tj.workspace_id = w.workspace_id
  LEFT JOIN latest_cash lc ON lc.workspace_id = w.workspace_id
)
SELECT
  a.workspace_id,
  CURRENT_DATE AS snapshot_date,
  a.revenue_today,
  a.cash_in_today,
  a.jobs_at_risk,
  (
    SELECT cp.crew_name
    FROM crew_perf cp
    WHERE cp.workspace_id = a.workspace_id
      AND cp.rank_desc = 1
    LIMIT 1
  ) AS top_win_crew,
  (
    SELECT cp.crew_name
    FROM crew_perf cp
    WHERE cp.workspace_id = a.workspace_id
      AND cp.rank_asc = 1
    LIMIT 1
  ) AS top_leak_crew
FROM agg a;

COMMENT ON VIEW public.owner_one_screen_truth IS
  'Block 261700: Workspace-level owner "one-screen truth" snapshot (today revenue, cash in, jobs at risk, top win/leak crews) built on report_job_profit, report_cashflow, and report_crews.';

GRANT SELECT ON public.owner_one_screen_truth TO authenticated;


-- ============================================================================
-- 7. EXCEPTION-FIRST ANALYTICS VIEWS
-- ============================================================================
-- Lightweight helper views that surface the “bottom” of the business:
--   - Bottom-margin jobs
--   - Underperforming crews
--   - Cashflow / AR risk

-- 7.1 Bottom-margin jobs (per workspace)
CREATE OR REPLACE VIEW public.analytics_low_margin_jobs AS
SELECT
  rjp.workspace_id,
  rjp.job_id,
  rjp.job_number,
  rjp.job_type,
  rjp.revenue,
  rjp.total_cost,
  rjp.profit,
  rjp.margin,
  rjp.cost_variance,
  rjp.completed_at,
  rjp.created_at
FROM public.report_job_profit rjp
WHERE
  COALESCE(rjp.margin, 0) < 20
ORDER BY
  rjp.workspace_id,
  rjp.margin ASC NULLS FIRST,
  rjp.revenue DESC;

COMMENT ON VIEW public.analytics_low_margin_jobs IS
  'Block 261700: Exception-first view of low-margin jobs (margin < 20%) per workspace sourced from report_job_profit.';

GRANT SELECT ON public.analytics_low_margin_jobs TO authenticated;


-- 7.2 Underperforming crews (per workspace)
CREATE OR REPLACE VIEW public.analytics_underperforming_crews AS
SELECT
  rc.workspace_id,
  rc.crew_id,
  rc.crew_name,
  rc.period,
  rc.period_start,
  rc.period_end,
  rc.performance_score,
  rc.quality_score,
  rc.rework_rate,
  rc.safety_incidents,
  rc.jobs_completed,
  rc.jobs_on_time,
  rc.on_time_rate
FROM public.report_crews rc
WHERE
  COALESCE(rc.performance_score, 0) < 70
  OR COALESCE(rc.rework_rate, 0) > 15
ORDER BY
  rc.workspace_id,
  rc.performance_score ASC NULLS LAST,
  rc.rework_rate DESC NULLS FIRST;

COMMENT ON VIEW public.analytics_underperforming_crews IS
  'Block 261700: Exception-first view of underperforming crews (low performance_score or high rework_rate) per workspace sourced from report_crews.';

GRANT SELECT ON public.analytics_underperforming_crews TO authenticated;


-- 7.3 Cashflow / AR risk (per workspace)
CREATE OR REPLACE VIEW public.analytics_cashflow_risk AS
SELECT
  rc.workspace_id,
  rc.period_start,
  rc.period_end,
  rc.cash_in,
  rc.cash_out,
  rc.net_cashflow,
  rc.ar_total,
  rc.ar_overdue_30,
  rc.ar_overdue_60,
  rc.ar_overdue_90,
  CASE
    WHEN rc.ar_total > 0
      THEN ROUND((rc.ar_overdue_90 / NULLIF(rc.ar_total, 0)) * 100, 2)
    ELSE 0
  END AS ar_overdue_90_pct
FROM public.report_cashflow rc
WHERE
  rc.ar_total > 0
  AND rc.ar_overdue_90 > (rc.ar_total * 0.2);

COMMENT ON VIEW public.analytics_cashflow_risk IS
  'Block 261700: Exception-first view of cashflow risk where 90+ day AR exceeds 20% of total AR per workspace sourced from report_cashflow.';

GRANT SELECT ON public.analytics_cashflow_risk TO authenticated;


-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- We mirror the pattern used in Block 261600 (knowledge/SOP/training):
--   - service_role: full access for backend + AI engines
--   - authenticated: read-only via RPC/API; writes are mediated by backend

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

-- service_role: full control
CREATE POLICY "reports_service_role_all" ON public.reports
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "dashboards_service_role_all" ON public.dashboards
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "dashboard_widgets_service_role_all" ON public.dashboard_widgets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "report_schedules_service_role_all" ON public.report_schedules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- authenticated: read-only
CREATE POLICY "reports_select_authenticated" ON public.reports
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "dashboards_select_authenticated" ON public.dashboards
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "dashboard_widgets_select_authenticated" ON public.dashboard_widgets
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "report_schedules_select_authenticated" ON public.report_schedules
  FOR SELECT TO authenticated
  USING (true);


-- ============================================================================
-- 9. END Block 261700 — Analytics Studio & Executive Dashboards v1 (DB Layer)
-- ============================================================================













