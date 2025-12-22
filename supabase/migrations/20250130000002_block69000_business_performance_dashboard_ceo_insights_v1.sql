-- =========================================================
-- Block 69000 — SmartSend Roofing "Business Performance Dashboard + CEO Insights" v1
-- (LIVE KPIs • PROFIT TRENDS • REVENUE FORECASTING • CREW EFFICIENCY METRICS • JOB PERFORMANCE INSIGHTS • CEO-LEVEL DECISION ENGINE)
-- =========================================================
-- 
-- THIS is the block that transforms SmartSend from just a tool…
-- into the brain of a roofing company.
--
-- This gives the owner EVERYTHING they need to run the company like a real CEO:
-- What's making money? What's losing money? What crews are elite?
-- What jobs are dragging profit down? Are we on pace to hit monthly revenue goals?
-- Where are we losing time? Where are we losing materials?
-- What's our lead conversion rate? What's our cash flow risk?
--
-- NO existing roofing CRM gives owners REAL CEO intelligence.
-- SmartSend will.

-- ============================================================================
-- PART 1 — CREATE business_kpis TABLE
-- ============================================================================
-- Daily aggregated KPIs for business performance tracking

CREATE TABLE IF NOT EXISTS public.business_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Date for this KPI snapshot
  date date NOT NULL,
  
  -- Revenue metrics
  total_revenue numeric(12,2) DEFAULT 0,
  revenue_this_month numeric(12,2) DEFAULT 0,
  revenue_this_year numeric(12,2) DEFAULT 0,
  revenue_per_job numeric(12,2) DEFAULT 0,
  
  -- Job metrics
  total_jobs int DEFAULT 0,
  jobs_sold_this_week int DEFAULT 0,
  jobs_completed int DEFAULT 0,
  jobs_in_progress int DEFAULT 0,
  jobs_scheduled int DEFAULT 0,
  
  -- Lead metrics
  leads_received int DEFAULT 0,
  conversion_rate numeric(5,2) DEFAULT 0, -- Percentage
  average_ticket_value numeric(12,2) DEFAULT 0,
  
  -- Profit metrics
  average_margin numeric(5,2) DEFAULT 0, -- Percentage
  total_profit numeric(12,2) DEFAULT 0,
  highest_profit_job_value numeric(12,2) DEFAULT 0,
  lowest_margin_job_value numeric(12,2) DEFAULT 0,
  
  -- Supplement revenue
  supplement_revenue numeric(12,2) DEFAULT 0,
  
  -- Quality metrics
  callback_rate numeric(5,2) DEFAULT 0, -- Percentage
  job_delay_trend numeric(5,2) DEFAULT 0, -- Percentage of jobs delayed
  homeowner_satisfaction numeric(5,2) DEFAULT 0, -- Average rating 1-5
  
  -- Collections
  collections_outstanding numeric(12,2) DEFAULT 0,
  collections_risk numeric(5,2) DEFAULT 0, -- Risk score 0-100
  
  -- Crew efficiency
  crew_efficiency_score numeric(5,2) DEFAULT 0, -- Average across all crews
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  
  -- Ensure one record per workspace per date
  UNIQUE(workspace_id, date)
);

CREATE INDEX IF NOT EXISTS idx_business_kpis_workspace_date ON public.business_kpis(workspace_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_business_kpis_date ON public.business_kpis(date DESC);

COMMENT ON TABLE public.business_kpis IS 'Block 69000: Daily aggregated business KPIs for CEO dashboard';
COMMENT ON COLUMN public.business_kpis.conversion_rate IS 'Block 69000: Lead to job conversion rate percentage';
COMMENT ON COLUMN public.business_kpis.collections_risk IS 'Block 69000: Risk score for collections (0-100, higher = more risk)';

-- ============================================================================
-- PART 2 — CREATE revenue_forecasts TABLE
-- ============================================================================
-- AI-powered revenue forecasting for 7/30/90 day windows

CREATE TABLE IF NOT EXISTS public.revenue_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Forecast date (the date this forecast was generated)
  forecast_date date NOT NULL,
  
  -- Forecast windows
  forecast_7_days numeric(12,2) DEFAULT 0,
  forecast_30_days numeric(12,2) DEFAULT 0,
  forecast_90_days numeric(12,2) DEFAULT 0,
  
  -- Confidence scores (0-100)
  confidence_7_days numeric(5,2) DEFAULT 0,
  confidence_30_days numeric(5,2) DEFAULT 0,
  confidence_90_days numeric(5,2) DEFAULT 0,
  
  -- Forecast factors (JSONB)
  forecast_factors jsonb DEFAULT '{}'::jsonb,
  -- Structure: {
  --   "jobs_in_pipeline": 15,
  --   "scheduled_jobs": 8,
  --   "close_rate": 0.65,
  --   "average_ticket_size": 12000,
  --   "homeowner_interactions": 23,
  --   "pipeline_value": 180000
  -- }
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  
  -- Ensure one forecast per workspace per day
  UNIQUE(workspace_id, forecast_date)
);

CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_workspace_date ON public.revenue_forecasts(workspace_id, forecast_date DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_date ON public.revenue_forecasts(forecast_date DESC);

COMMENT ON TABLE public.revenue_forecasts IS 'Block 69000: AI-powered revenue forecasts for 7/30/90 day windows';
COMMENT ON COLUMN public.revenue_forecasts.confidence_7_days IS 'Block 69000: Confidence score (0-100) for 7-day forecast';
COMMENT ON COLUMN public.revenue_forecasts.forecast_factors IS 'Block 69000: JSONB factors used in forecast calculation';

-- ============================================================================
-- PART 3 — CREATE ceo_insights TABLE
-- ============================================================================
-- Daily AI-generated CEO insights and recommendations

CREATE TABLE IF NOT EXISTS public.ceo_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Insight date
  insight_date date NOT NULL,
  
  -- Insights (JSONB array)
  insights jsonb DEFAULT '[]'::jsonb,
  -- Structure: [
  --   {
  --     "type": "profit_alert",
  --     "severity": "warning",
  --     "title": "Job #122 trending to low margin",
  --     "message": "Job #122 is currently at 18% margin, below your 30% threshold.",
  --     "action": "Review material costs and labor hours",
  --     "job_id": "uuid"
  --   },
  --   {
  --     "type": "crew_performance",
  --     "severity": "info",
  --     "title": "Crew A outperformed average by 19%",
  --     "message": "Crew A completed 3 jobs this week with 92% quality score.",
  --     "crew_id": "uuid"
  --   }
  -- ]
  
  -- Summary insights (concatenated for quick display)
  summary_text text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  
  -- Ensure one insight record per workspace per day
  UNIQUE(workspace_id, insight_date)
);

CREATE INDEX IF NOT EXISTS idx_ceo_insights_workspace_date ON public.ceo_insights(workspace_id, insight_date DESC);
CREATE INDEX IF NOT EXISTS idx_ceo_insights_date ON public.ceo_insights(insight_date DESC);

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_ceo_insights_insights_gin ON public.ceo_insights USING gin(insights);

COMMENT ON TABLE public.ceo_insights IS 'Block 69000: Daily AI-generated CEO insights and recommendations';
COMMENT ON COLUMN public.ceo_insights.insights IS 'Block 69000: JSONB array of insight objects with type, severity, title, message, action';

-- ============================================================================
-- PART 4 — CREATE crew_efficiency_leaderboard TABLE
-- ============================================================================
-- Snapshot of crew performance for leaderboard display

CREATE TABLE IF NOT EXISTS public.crew_efficiency_leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Snapshot date
  snapshot_date date NOT NULL,
  
  -- Crew ranking data (JSONB array)
  crew_rankings jsonb DEFAULT '[]'::jsonb,
  -- Structure: [
  --   {
  --     "crew_id": "uuid",
  --     "crew_name": "Crew A",
  --     "rank": 1,
  --     "speed_score": 92,
  --     "quality_score": 88,
  --     "callback_rate": 2.5,
  --     "profit_margin": 35.5,
  --     "homeowner_satisfaction": 4.8,
  --     "overall_score": 90,
  --     "jobs_completed": 12
  --   }
  -- ]
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  
  -- Ensure one snapshot per workspace per date
  UNIQUE(workspace_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_crew_efficiency_workspace_date ON public.crew_efficiency_leaderboard(workspace_id, snapshot_date DESC);

COMMENT ON TABLE public.crew_efficiency_leaderboard IS 'Block 69000: Snapshot of crew performance rankings for leaderboard display';

-- ============================================================================
-- PART 5 — CREATE job_performance_heatmap TABLE
-- ============================================================================
-- Job performance heatmap data for visual display

CREATE TABLE IF NOT EXISTS public.job_performance_heatmap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Snapshot date
  snapshot_date date NOT NULL,
  
  -- Heatmap data (JSONB array of job performance objects)
  heatmap_data jsonb DEFAULT '[]'::jsonb,
  -- Structure: [
  --   {
  --     "job_id": "uuid",
  --     "job_title": "Smith - Roof Replacement",
  --     "status": "in_progress",
  --     "performance_category": "excellent", // excellent, profitable, okay, low_margin, losing
  --     "margin": 42.5,
  --     "profit": 5100,
  --     "revenue": 12000,
  --     "delay_days": 0,
  --     "crew_name": "Crew A"
  --   }
  -- ]
  
  -- Performance distribution
  excellent_jobs_count int DEFAULT 0,
  profitable_jobs_count int DEFAULT 0,
  okay_jobs_count int DEFAULT 0,
  low_margin_jobs_count int DEFAULT 0,
  losing_jobs_count int DEFAULT 0,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  
  -- Ensure one snapshot per workspace per date
  UNIQUE(workspace_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_job_performance_workspace_date ON public.job_performance_heatmap(workspace_id, snapshot_date DESC);

COMMENT ON TABLE public.job_performance_heatmap IS 'Block 69000: Job performance heatmap data for visual display (red/green gradient)';

-- ============================================================================
-- PART 6 — CREATE lead_source_performance TABLE
-- ============================================================================
-- Performance tracking by lead source

CREATE TABLE IF NOT EXISTS public.lead_source_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Snapshot date
  snapshot_date date NOT NULL,
  
  -- Source performance data (JSONB array)
  source_performance jsonb DEFAULT '[]'::jsonb,
  -- Structure: [
  --   {
  --     "source": "referrals",
  --     "jobs_count": 8,
  --     "average_ticket_value": 15000,
  --     "profit_margin": 38.5,
  --     "close_rate": 72.5,
  --     "total_revenue": 120000,
  --     "leads_received": 11
  --   }
  -- ]
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  
  -- Ensure one snapshot per workspace per date
  UNIQUE(workspace_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_lead_source_performance_workspace_date ON public.lead_source_performance(workspace_id, snapshot_date DESC);

COMMENT ON TABLE public.lead_source_performance IS 'Block 69000: Performance tracking by lead source (referrals, google_ads, etc.)';

-- ============================================================================
-- PART 7 — CREATE red_flag_alerts TABLE
-- ============================================================================
-- Critical alerts that need immediate CEO attention

CREATE TABLE IF NOT EXISTS public.red_flag_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Alert details
  alert_type text NOT NULL CHECK (alert_type IN (
    'low_margin_job',
    'crew_efficiency_drop',
    'conversion_rate_drop',
    'revenue_risk',
    'collection_risk',
    'quality_issue',
    'delay_risk'
  )),
  
  severity text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')) DEFAULT 'warning',
  
  title text NOT NULL,
  message text NOT NULL,
  action_recommended text,
  
  -- Related entity IDs
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Alert metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Status
  status text CHECK (status IN ('active', 'acknowledged', 'resolved')) DEFAULT 'active',
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_red_flag_alerts_workspace ON public.red_flag_alerts(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_red_flag_alerts_status ON public.red_flag_alerts(workspace_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_red_flag_alerts_type ON public.red_flag_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_red_flag_alerts_severity ON public.red_flag_alerts(severity) WHERE severity IN ('critical', 'warning');

COMMENT ON TABLE public.red_flag_alerts IS 'Block 69000: Critical alerts requiring immediate CEO attention';
COMMENT ON COLUMN public.red_flag_alerts.alert_type IS 'Block 69000: Type of alert (low_margin_job, crew_efficiency_drop, etc.)';

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- business_kpis RLS
ALTER TABLE public.business_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view business KPIs in their workspace"
  ON public.business_kpis FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- revenue_forecasts RLS
ALTER TABLE public.revenue_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view revenue forecasts in their workspace"
  ON public.revenue_forecasts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ceo_insights RLS
ALTER TABLE public.ceo_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view CEO insights in their workspace"
  ON public.ceo_insights FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- crew_efficiency_leaderboard RLS
ALTER TABLE public.crew_efficiency_leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view crew leaderboard in their workspace"
  ON public.crew_efficiency_leaderboard FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- job_performance_heatmap RLS
ALTER TABLE public.job_performance_heatmap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view job heatmap in their workspace"
  ON public.job_performance_heatmap FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- lead_source_performance RLS
ALTER TABLE public.lead_source_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead source performance in their workspace"
  ON public.lead_source_performance FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- red_flag_alerts RLS
ALTER TABLE public.red_flag_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view red flag alerts in their workspace"
  ON public.red_flag_alerts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update red flag alerts in their workspace"
  ON public.red_flag_alerts FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 9 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.business_kpis TO authenticated;
GRANT SELECT ON public.revenue_forecasts TO authenticated;
GRANT SELECT ON public.ceo_insights TO authenticated;
GRANT SELECT ON public.crew_efficiency_leaderboard TO authenticated;
GRANT SELECT ON public.job_performance_heatmap TO authenticated;
GRANT SELECT ON public.lead_source_performance TO authenticated;
GRANT SELECT, UPDATE ON public.red_flag_alerts TO authenticated;

-- ============================================================================
-- PART 10 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.business_kpis IS 'Block 69000: Daily aggregated business KPIs for CEO dashboard';
COMMENT ON TABLE public.revenue_forecasts IS 'Block 69000: AI-powered revenue forecasts for 7/30/90 day windows';
COMMENT ON TABLE public.ceo_insights IS 'Block 69000: Daily AI-generated CEO insights and recommendations';
COMMENT ON TABLE public.crew_efficiency_leaderboard IS 'Block 69000: Snapshot of crew performance rankings for leaderboard display';
COMMENT ON TABLE public.job_performance_heatmap IS 'Block 69000: Job performance heatmap data for visual display';
COMMENT ON TABLE public.lead_source_performance IS 'Block 69000: Performance tracking by lead source';
COMMENT ON TABLE public.red_flag_alerts IS 'Block 69000: Critical alerts requiring immediate CEO attention';




























