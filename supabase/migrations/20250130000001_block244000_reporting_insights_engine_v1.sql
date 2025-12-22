-- =========================================================
-- Block 244000 — SmartSend Roofing Reporting & Insights Engine v1
-- "THE BRAINS OF A ROOFING COMPANY"
-- =========================================================
-- 
-- This block gives SmartSend TRUE intelligence:
-- - Job Profitability Reports
-- - Sales Rep Performance Analytics
-- - Marketing Attribution + ROI
-- - Crew Efficiency Metrics
-- - Production Speed Analysis
-- - Customer Lifetime Value
-- - Payment Metrics
-- - AR & Cashflow Forecasting
-- - Lead Source Breakdown
-- - AI-Generated Daily Insights
-- - AI Predictive Alerts
-- =========================================================

-- ============================================================================
-- PART 1 — REPORTING TABLES (STORED SUMMARIES FOR FAST QUERIES)
-- ============================================================================

-- 1.1 Sales Rep Performance Reports
CREATE TABLE IF NOT EXISTS public.report_sales_reps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  rep_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rep_name text, -- Denormalized for historical accuracy
  period text NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  
  -- Lead metrics
  leads_assigned int DEFAULT 0,
  leads_contacted int DEFAULT 0,
  leads_responded int DEFAULT 0,
  contact_rate numeric(5,2), -- % of assigned leads contacted
  
  -- Estimate metrics
  estimates_sent int DEFAULT 0,
  estimates_viewed int DEFAULT 0,
  estimate_view_rate numeric(5,2),
  
  -- Sales metrics
  jobs_sold int DEFAULT 0,
  revenue numeric(12,2) DEFAULT 0,
  avg_ticket numeric(12,2) DEFAULT 0,
  close_rate numeric(5,2), -- % of estimates that became jobs
  conversion_rate numeric(5,2), -- % of leads that became jobs
  
  -- Performance scores
  performance_score numeric(5,2), -- 0-100 composite score
  rank_in_team int, -- Ranking among all reps
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure one report per rep per period
  UNIQUE(workspace_id, rep_id, period, period_start)
);

CREATE INDEX IF NOT EXISTS idx_report_sales_reps_workspace ON public.report_sales_reps(workspace_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_report_sales_reps_rep ON public.report_sales_reps(rep_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_report_sales_reps_company ON public.report_sales_reps(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_sales_reps_period ON public.report_sales_reps(period, period_start DESC);

-- 1.2 Job Profitability Reports
CREATE TABLE IF NOT EXISTS public.report_job_profit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  job_id uuid, -- References jobs or roofing_jobs (flexible)
  job_number text, -- Denormalized job identifier
  job_type text, -- reroof, repair, inspection, etc.
  
  -- Revenue
  revenue numeric(12,2) DEFAULT 0,
  estimated_revenue numeric(12,2) DEFAULT 0,
  
  -- Costs
  labor_cost numeric(12,2) DEFAULT 0,
  material_cost numeric(12,2) DEFAULT 0,
  equipment_cost numeric(12,2) DEFAULT 0,
  overhead_cost numeric(12,2) DEFAULT 0,
  total_cost numeric(12,2) DEFAULT 0,
  
  -- Profit metrics
  profit numeric(12,2) DEFAULT 0,
  margin numeric(5,2) DEFAULT 0, -- Percentage
  
  -- Variance analysis
  cost_variance numeric(12,2) DEFAULT 0, -- actual - estimated
  margin_variance numeric(5,2) DEFAULT 0,
  
  -- Job characteristics
  square_footage numeric(10,2),
  profit_per_square numeric(10,2),
  
  -- Status
  job_status text,
  completed_at timestamptz,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_job_profit_workspace ON public.report_job_profit(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_job_profit_company ON public.report_job_profit(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_job_profit_job ON public.report_job_profit(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_job_profit_margin ON public.report_job_profit(margin) WHERE margin < 20; -- Flag low-margin jobs
CREATE INDEX IF NOT EXISTS idx_report_job_profit_type ON public.report_job_profit(job_type);

-- 1.3 Marketing Channel Reports
CREATE TABLE IF NOT EXISTS public.report_marketing_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  channel text NOT NULL, -- 'google_ads', 'facebook', 'referral', 'direct', 'organic', etc.
  period text NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  
  -- Lead metrics
  leads int DEFAULT 0,
  qualified_leads int DEFAULT 0,
  leads_contacted int DEFAULT 0,
  
  -- Conversion metrics
  estimates_sent int DEFAULT 0,
  jobs_won int DEFAULT 0,
  conversions int DEFAULT 0, -- Generic conversion count
  conversion_rate numeric(5,2), -- % of leads that converted
  
  -- Financial metrics
  revenue numeric(12,2) DEFAULT 0,
  cost numeric(12,2) DEFAULT 0, -- Marketing spend
  profit numeric(12,2) DEFAULT 0,
  roi numeric(5,2), -- Return on investment %
  cost_per_lead numeric(10,2),
  cost_per_job numeric(10,2),
  revenue_per_lead numeric(10,2),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure one report per channel per period
  UNIQUE(workspace_id, channel, period, period_start)
);

CREATE INDEX IF NOT EXISTS idx_report_marketing_workspace ON public.report_marketing_channels(workspace_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_report_marketing_company ON public.report_marketing_channels(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_marketing_channel ON public.report_marketing_channels(channel, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_report_marketing_roi ON public.report_marketing_channels(roi) WHERE roi < 100; -- Flag low ROI channels

-- 1.4 Crew Performance Reports
CREATE TABLE IF NOT EXISTS public.report_crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  crew_name text, -- Denormalized
  period text NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  
  -- Job metrics
  jobs_completed int DEFAULT 0,
  jobs_scheduled int DEFAULT 0,
  jobs_on_time int DEFAULT 0,
  on_time_rate numeric(5,2), -- % of jobs completed on time
  
  -- Duration metrics
  avg_duration_hours numeric(10,2),
  avg_duration_days numeric(10,2),
  total_hours_worked numeric(10,2),
  efficiency_score numeric(5,2), -- 0-100
  
  -- Quality metrics
  issues_reported int DEFAULT 0,
  rework_count int DEFAULT 0,
  rework_rate numeric(5,2), -- % of jobs requiring rework
  customer_complaints int DEFAULT 0,
  quality_score numeric(5,2), -- 0-100
  
  -- Safety metrics
  safety_incidents int DEFAULT 0,
  safety_score numeric(5,2), -- 0-100
  
  -- Cost metrics
  labor_cost numeric(12,2) DEFAULT 0,
  material_waste_cost numeric(12,2) DEFAULT 0,
  total_cost numeric(12,2) DEFAULT 0,
  cost_per_job numeric(10,2),
  
  -- Performance composite
  performance_score numeric(5,2), -- 0-100 composite
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure one report per crew per period
  UNIQUE(workspace_id, crew_id, period, period_start)
);

CREATE INDEX IF NOT EXISTS idx_report_crews_workspace ON public.report_crews(workspace_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_report_crews_crew ON public.report_crews(crew_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_report_crews_company ON public.report_crews(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_crews_performance ON public.report_crews(performance_score) WHERE performance_score < 70; -- Flag underperforming crews

-- 1.5 Cashflow & AR Reports
CREATE TABLE IF NOT EXISTS public.report_cashflow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  
  -- Actual cashflow
  cash_in numeric(12,2) DEFAULT 0, -- Payments received
  cash_out numeric(12,2) DEFAULT 0, -- Expenses paid
  net_cashflow numeric(12,2) DEFAULT 0, -- cash_in - cash_out
  
  -- Projected cashflow
  projected_in numeric(12,2) DEFAULT 0, -- Expected payments
  projected_out numeric(12,2) DEFAULT 0, -- Expected expenses
  projected_net numeric(12,2) DEFAULT 0, -- projected_in - projected_out
  
  -- AR (Accounts Receivable)
  ar_total numeric(12,2) DEFAULT 0, -- Total outstanding
  ar_current numeric(12,2) DEFAULT 0, -- 0-30 days
  ar_overdue_30 numeric(12,2) DEFAULT 0, -- 31-60 days
  ar_overdue_60 numeric(12,2) DEFAULT 0, -- 61-90 days
  ar_overdue_90 numeric(12,2) DEFAULT 0, -- 90+ days
  
  -- AP (Accounts Payable)
  ap_total numeric(12,2) DEFAULT 0, -- Total payables
  ap_current numeric(12,2) DEFAULT 0, -- Due now
  ap_upcoming numeric(12,2) DEFAULT 0, -- Due in next 30 days
  
  -- Metrics
  days_sales_outstanding numeric(5,2), -- DSO
  collection_rate numeric(5,2), -- % of invoices collected on time
  cashflow_health_score numeric(5,2), -- 0-100
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure one report per period
  UNIQUE(workspace_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_report_cashflow_workspace ON public.report_cashflow(workspace_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_report_cashflow_company ON public.report_cashflow(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_cashflow_health ON public.report_cashflow(cashflow_health_score) WHERE cashflow_health_score < 50; -- Flag cashflow issues

-- ============================================================================
-- PART 2 — AI INSIGHTS & ALERTS TABLES
-- ============================================================================

-- 2.1 Daily AI Insights
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  insight_type text NOT NULL CHECK (insight_type IN ('daily_summary', 'trend_analysis', 'performance_alert', 'opportunity', 'risk_warning')),
  category text NOT NULL, -- 'sales', 'profit', 'crew', 'marketing', 'cashflow', 'production'
  title text NOT NULL,
  message text NOT NULL,
  severity text CHECK (severity IN ('info', 'warning', 'critical')),
  data jsonb DEFAULT '{}'::jsonb, -- Supporting data/metrics
  is_read boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_workspace ON public.ai_insights(workspace_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_company ON public.ai_insights(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON public.ai_insights(insight_type, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_unread ON public.ai_insights(workspace_id, is_read) WHERE is_read = false;

-- 2.2 Predictive Alerts
CREATE TABLE IF NOT EXISTS public.predictive_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('weather_delay', 'overbooking', 'budget_overrun', 'quality_issue', 'cashflow_dip', 'material_delay', 'crew_underperformance')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title text NOT NULL,
  message text NOT NULL,
  predicted_date date, -- When the issue is predicted to occur
  related_entity_type text, -- 'job', 'crew', 'invoice', etc.
  related_entity_id uuid,
  data jsonb DEFAULT '{}'::jsonb, -- Supporting data
  is_acknowledged boolean DEFAULT false,
  is_resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_predictive_alerts_workspace ON public.predictive_alerts(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictive_alerts_company ON public.predictive_alerts(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_predictive_alerts_type ON public.predictive_alerts(alert_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictive_alerts_unresolved ON public.predictive_alerts(workspace_id, is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_predictive_alerts_severity ON public.predictive_alerts(severity, created_at DESC) WHERE severity IN ('high', 'critical');

-- ============================================================================
-- PART 3 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.report_sales_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_job_profit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_marketing_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_cashflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictive_alerts ENABLE ROW LEVEL SECURITY;

-- Helper function to check workspace membership
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
    AND user_id = auth.uid()
  );
$$;

-- RLS Policies for all reporting tables
-- Sales Rep Reports
CREATE POLICY "report_sales_reps_select" ON public.report_sales_reps
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "report_sales_reps_insert" ON public.report_sales_reps
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "report_sales_reps_update" ON public.report_sales_reps
  FOR UPDATE USING (is_workspace_member(workspace_id));

-- Job Profit Reports
CREATE POLICY "report_job_profit_select" ON public.report_job_profit
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "report_job_profit_insert" ON public.report_job_profit
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "report_job_profit_update" ON public.report_job_profit
  FOR UPDATE USING (is_workspace_member(workspace_id));

-- Marketing Channel Reports
CREATE POLICY "report_marketing_channels_select" ON public.report_marketing_channels
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "report_marketing_channels_insert" ON public.report_marketing_channels
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "report_marketing_channels_update" ON public.report_marketing_channels
  FOR UPDATE USING (is_workspace_member(workspace_id));

-- Crew Reports
CREATE POLICY "report_crews_select" ON public.report_crews
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "report_crews_insert" ON public.report_crews
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "report_crews_update" ON public.report_crews
  FOR UPDATE USING (is_workspace_member(workspace_id));

-- Cashflow Reports
CREATE POLICY "report_cashflow_select" ON public.report_cashflow
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "report_cashflow_insert" ON public.report_cashflow
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "report_cashflow_update" ON public.report_cashflow
  FOR UPDATE USING (is_workspace_member(workspace_id));

-- AI Insights
CREATE POLICY "ai_insights_select" ON public.ai_insights
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "ai_insights_insert" ON public.ai_insights
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "ai_insights_update" ON public.ai_insights
  FOR UPDATE USING (is_workspace_member(workspace_id));

-- Predictive Alerts
CREATE POLICY "predictive_alerts_select" ON public.predictive_alerts
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "predictive_alerts_insert" ON public.predictive_alerts
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "predictive_alerts_update" ON public.predictive_alerts
  FOR UPDATE USING (is_workspace_member(workspace_id));

-- ============================================================================
-- PART 4 — HELPER FUNCTIONS FOR REPORT GENERATION
-- ============================================================================

-- Function: Generate sales rep report for a period
CREATE OR REPLACE FUNCTION public.generate_sales_rep_report(
  p_workspace_id uuid,
  p_rep_id uuid,
  p_period text,
  p_period_start date,
  p_period_end date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_report_id uuid;
  v_leads_assigned int;
  v_leads_contacted int;
  v_estimates_sent int;
  v_jobs_sold int;
  v_revenue numeric;
BEGIN
  -- Calculate metrics from leads/jobs data
  -- This is a simplified version - actual implementation would query leads, estimates, jobs tables
  SELECT COUNT(*)
  INTO v_leads_assigned
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND assigned_to = p_rep_id
    AND created_at >= p_period_start
    AND created_at <= p_period_end;
  
  -- Insert or update report
  INSERT INTO public.report_sales_reps (
    workspace_id,
    rep_id,
    period,
    period_start,
    period_end,
    leads_assigned,
    leads_contacted,
    estimates_sent,
    jobs_sold,
    revenue
  )
  VALUES (
    p_workspace_id,
    p_rep_id,
    p_period,
    p_period_start,
    p_period_end,
    COALESCE(v_leads_assigned, 0),
    COALESCE(v_leads_contacted, 0),
    COALESCE(v_estimates_sent, 0),
    COALESCE(v_jobs_sold, 0),
    COALESCE(v_revenue, 0)
  )
  ON CONFLICT (workspace_id, rep_id, period, period_start)
  DO UPDATE SET
    leads_assigned = EXCLUDED.leads_assigned,
    leads_contacted = EXCLUDED.leads_contacted,
    estimates_sent = EXCLUDED.estimates_sent,
    jobs_sold = EXCLUDED.jobs_sold,
    revenue = EXCLUDED.revenue,
    updated_at = now()
  RETURNING id INTO v_report_id;
  
  RETURN v_report_id;
END;
$$;

-- Function: Mark insight as read
CREATE OR REPLACE FUNCTION public.mark_insight_read(p_insight_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.ai_insights
  SET is_read = true
  WHERE id = p_insight_id
    AND is_workspace_member(workspace_id);
END;
$$;

-- Function: Acknowledge alert
CREATE OR REPLACE FUNCTION public.acknowledge_alert(p_alert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.predictive_alerts
  SET is_acknowledged = true,
      acknowledged_at = now()
  WHERE id = p_alert_id
    AND is_workspace_member(workspace_id);
END;
$$;

-- ============================================================================
-- PART 5 — TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_report_sales_reps_updated_at
  BEFORE UPDATE ON public.report_sales_reps
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_report_job_profit_updated_at
  BEFORE UPDATE ON public.report_job_profit
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_report_marketing_channels_updated_at
  BEFORE UPDATE ON public.report_marketing_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_report_crews_updated_at
  BEFORE UPDATE ON public.report_crews
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_report_cashflow_updated_at
  BEFORE UPDATE ON public.report_cashflow
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- PART 6 — COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.report_sales_reps IS 'Sales rep performance summaries by period (Block 244000)';
COMMENT ON TABLE public.report_job_profit IS 'Job profitability analysis (Block 244000)';
COMMENT ON TABLE public.report_marketing_channels IS 'Marketing channel ROI and attribution (Block 244000)';
COMMENT ON TABLE public.report_crews IS 'Crew performance and efficiency metrics (Block 244000)';
COMMENT ON TABLE public.report_cashflow IS 'Cashflow and AR/AP forecasting (Block 244000)';
COMMENT ON TABLE public.ai_insights IS 'AI-generated daily insights and recommendations (Block 244000)';
COMMENT ON TABLE public.predictive_alerts IS 'Predictive alerts for risks and opportunities (Block 244000)';

























