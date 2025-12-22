-- AUREV HQ - Revenue Forecasting & MRR Projections
-- Predictive revenue analytics for $100K+ MRR by mid-2026

-- =====================================================
-- 1. MRR Snapshots Table (daily snapshots)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.mrr_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day DATE NOT NULL,
  app TEXT NOT NULL CHECK (app IN ('smartsend','opsgrid','agentcloud')),
  org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  mrr NUMERIC(12, 2) NOT NULL DEFAULT 0, -- Monthly recurring revenue in USD
  component TEXT DEFAULT 'recurring' CHECK (component IN ('recurring','usage','discount')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(day, app, org_id, component)
);

CREATE INDEX IF NOT EXISTS idx_mrr_snap_day ON public.mrr_snapshots(day DESC);
CREATE INDEX IF NOT EXISTS idx_mrr_snap_app ON public.mrr_snapshots(app);
CREATE INDEX IF NOT EXISTS idx_mrr_snap_org ON public.mrr_snapshots(org_id);

-- =====================================================
-- 2. Monthly Rollups View (actuals)
-- =====================================================
CREATE OR REPLACE VIEW public.vw_mrr_monthly AS
SELECT 
  DATE_TRUNC('month', day)::DATE AS month,
  app,
  org_id,
  SUM(mrr) AS mrr
FROM public.mrr_snapshots
WHERE day >= (DATE_TRUNC('month', NOW()) - INTERVAL '18 months')
GROUP BY 1, 2, 3;

-- =====================================================
-- 3. MRR Components View (New/Expansion/Contraction/Churn)
-- =====================================================
CREATE OR REPLACE VIEW public.vw_mrr_components AS
WITH curr AS (
  SELECT month, app, org_id, mrr 
  FROM public.vw_mrr_monthly
),
prev AS (
  SELECT 
    (month + INTERVAL '1 month')::DATE AS month, 
    app, 
    org_id, 
    mrr AS prev_mrr
  FROM public.vw_mrr_monthly
)
SELECT 
  c.month::DATE AS month, 
  c.app, 
  c.org_id,
  GREATEST(c.mrr - COALESCE(p.prev_mrr, 0), 0) AS new_mrr,
  CASE 
    WHEN p.prev_mrr IS NULL OR c.mrr <= p.prev_mrr THEN 0
    ELSE GREATEST(c.mrr - p.prev_mrr, 0)
  END AS expansion_mrr,
  CASE 
    WHEN p.prev_mrr IS NULL OR c.mrr >= p.prev_mrr THEN 0
    ELSE GREATEST(p.prev_mrr - c.mrr, 0)
  END AS contraction_mrr,
  CASE 
    WHEN c.mrr = 0 AND COALESCE(p.prev_mrr, 0) > 0 THEN p.prev_mrr
    ELSE 0
  END AS churned_mrr,
  c.mrr AS ending_mrr
FROM curr c
LEFT JOIN prev p ON p.month = c.month AND p.app = c.app AND p.org_id = c.org_id;

-- =====================================================
-- 4. Aggregated Components View (per month, per app)
-- =====================================================
CREATE OR REPLACE VIEW public.vw_mrr_components_agg AS
SELECT 
  month,
  app,
  SUM(new_mrr) AS new_mrr,
  SUM(expansion_mrr) AS expansion_mrr,
  SUM(contraction_mrr) AS contraction_mrr,
  SUM(churned_mrr) AS churned_mrr,
  SUM(ending_mrr) AS ending_mrr
FROM public.vw_mrr_components
GROUP BY 1, 2
ORDER BY 1 ASC;

-- =====================================================
-- 5. MRR Rates View (Churn & Expansion %)
-- =====================================================
CREATE OR REPLACE VIEW public.vw_mrr_rates AS
WITH base AS (
  SELECT 
    month, 
    app,
    LAG(ending_mrr) OVER (PARTITION BY app ORDER BY month) AS start_mrr,
    new_mrr, 
    expansion_mrr, 
    contraction_mrr, 
    churned_mrr, 
    ending_mrr
  FROM public.vw_mrr_components_agg
)
SELECT 
  month, 
  app,
  ROUND(100.0 * churned_mrr / NULLIF(start_mrr, 0), 2) AS gross_churn_pct,
  ROUND(100.0 * expansion_mrr / NULLIF(start_mrr, 0), 2) AS expansion_pct,
  ROUND(100.0 * (ending_mrr - start_mrr - new_mrr) / NULLIF(start_mrr, 0), 2) AS net_churn_excl_new_pct,
  start_mrr, 
  ending_mrr, 
  new_mrr, 
  expansion_mrr, 
  contraction_mrr, 
  churned_mrr
FROM base;

-- =====================================================
-- 6. MRR KPIs View (90-day averages)
-- =====================================================
CREATE OR REPLACE VIEW public.vw_mrr_kpis AS
SELECT 
  r.app,
  ROUND(AVG(r.net_churn_excl_new_pct) FILTER (WHERE r.month >= DATE_TRUNC('month', NOW() - INTERVAL '90 days')), 2) AS net_churn_90d,
  ROUND(AVG(r.expansion_pct) FILTER (WHERE r.month >= DATE_TRUNC('month', NOW() - INTERVAL '90 days')), 2) AS expansion_90d,
  ROUND(AVG(r.ending_mrr / NULLIF(a.active_orgs, 0)) FILTER (WHERE r.month >= DATE_TRUNC('month', NOW() - INTERVAL '90 days')), 2) AS arpa
FROM public.vw_mrr_rates r
LEFT JOIN (
  SELECT 
    month, 
    app, 
    COUNT(DISTINCT org_id) AS active_orgs 
  FROM public.vw_mrr_components 
  GROUP BY 1, 2
) a ON a.month = r.month AND a.app = r.app
GROUP BY 1;

-- =====================================================
-- 7. User Preferences Table (for saved forecast inputs)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_prefs_user ON public.user_prefs(user_id);

-- =====================================================
-- 8. RLS Policies
-- =====================================================
ALTER TABLE public.mrr_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_prefs ENABLE ROW LEVEL SECURITY;

-- Org view: see own revenue; admin sees global
CREATE POLICY "org_mrr_select" ON public.mrr_snapshots 
  FOR SELECT USING (
    COALESCE(org_id::text, '') = COALESCE((auth.jwt()->>'org_id')::text, '') 
    OR (auth.jwt()->>'app_role') = 'admin'
  );

-- Service role can manage MRR snapshots (for backfills)
CREATE POLICY "service_role_manage_mrr" ON public.mrr_snapshots 
  FOR ALL USING (auth.role() = 'service_role');

-- Users can manage their own preferences
CREATE POLICY "user_prefs_own" ON public.user_prefs 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_prefs_update_own" ON public.user_prefs 
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- 9. Helper Function: Backfill MRR from billing_line_items
-- =====================================================
CREATE OR REPLACE FUNCTION public.backfill_mrr_snapshots(
  p_start_date DATE DEFAULT (DATE_TRUNC('month', NOW() - INTERVAL '12 months'))::DATE,
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_date DATE;
  v_mrr NUMERIC;
BEGIN
  -- For each day in the range, calculate MRR from billing_line_items
  FOR v_date IN 
    SELECT generate_series(p_start_date, p_end_date, INTERVAL '1 day')::DATE
  LOOP
    -- Calculate monthly MRR for recurring subscriptions active on this day
    -- Group by app and org_id
    INSERT INTO public.mrr_snapshots (day, app, org_id, mrr, component)
    SELECT 
      v_date AS day,
      bli.app,
      bli.org_id,
      SUM(bli.amount_total) / 100.0 / 30.0 AS mrr, -- Convert cents to USD, normalize to daily
      'recurring'::text AS component
    FROM public.billing_line_items bli
    WHERE bli.period_start <= v_date
      AND bli.period_end >= v_date
      AND bli.product IN ('starter', 'growth', 'pro', 'basic', 'scale')
      AND bli.quantity = 1
    GROUP BY bli.app, bli.org_id
    ON CONFLICT (day, app, org_id, component) 
    DO UPDATE SET 
      mrr = EXCLUDED.mrr,
      created_at = NOW();
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END LOOP;
  
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_mrr_snapshots(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_mrr_snapshots(DATE, DATE) TO service_role;

-- =====================================================
-- 10. Comments
-- =====================================================
COMMENT ON TABLE public.mrr_snapshots IS 'Daily MRR snapshots for historical tracking and forecasting';
COMMENT ON VIEW public.vw_mrr_monthly IS 'Monthly MRR rollups (actuals) for last 18 months';
COMMENT ON VIEW public.vw_mrr_components IS 'MRR decomposed into New/Expansion/Contraction/Churn per org/app';
COMMENT ON VIEW public.vw_mrr_components_agg IS 'Aggregated MRR components by month and app';
COMMENT ON VIEW public.vw_mrr_rates IS 'Churn and expansion rates calculated from MRR components';
COMMENT ON VIEW public.vw_mrr_kpis IS '90-day averages for churn, expansion, and ARPA metrics';
COMMENT ON TABLE public.user_prefs IS 'User preferences for saved forecast scenario inputs';
COMMENT ON FUNCTION public.backfill_mrr_snapshots IS 'Backfill MRR snapshots from billing_line_items for historical data';

