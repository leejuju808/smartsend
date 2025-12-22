-- =========================================================
-- Block 25380 — SmartSend Roofing Reporting & Analytics v1
-- (Lead Reports • Job Reports • Team Performance • Revenue Forecasting • Marketing ROI • Roofing Company Intelligence Dashboard)
-- =========================================================
--
-- THE ROOFING ANALYTICS ENGINE — ZERO FLUFF.
-- Roofers make decisions based on guessing, not data.
-- SmartSend Reporting & Analytics v1 gives roofers total visibility into every part of their business.
-- This is how SmartSend becomes the brain of the roofing company.
-- =========================================================

-- ============================================================================
-- PART 1: LEAD ANALYTICS TABLES & VIEWS
-- ============================================================================

-- Lead source tracking (enhance leads table if needed)
DO $$ 
BEGIN
  -- Add source tracking columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN source TEXT DEFAULT 'email_reply';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'source_detail'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN source_detail TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'first_reply_time_minutes'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN first_reply_time_minutes INTEGER;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'quality_score'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'assigned_to_user_id'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Lead conversion tracking
CREATE TABLE IF NOT EXISTS public.lead_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  
  -- Conversion stages
  inspection_scheduled_at TIMESTAMPTZ,
  inspection_completed_at TIMESTAMPTZ,
  quote_sent_at TIMESTAMPTZ,
  quote_approved_at TIMESTAMPTZ,
  job_won_at TIMESTAMPTZ,
  
  -- Stage durations (in hours)
  lead_to_inspection_hours NUMERIC(10, 2),
  inspection_to_quote_hours NUMERIC(10, 2),
  quote_to_approval_hours NUMERIC(10, 2),
  
  -- Conversion flags
  converted_to_inspection BOOLEAN DEFAULT false,
  converted_to_quote BOOLEAN DEFAULT false,
  converted_to_job BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_conversions_workspace 
  ON public.lead_conversions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_conversions_lead 
  ON public.lead_conversions(lead_id);

-- View: Lead Analytics by Source
CREATE OR REPLACE VIEW public.v_lead_analytics_by_source AS
SELECT 
  l.workspace_id,
  COALESCE(l.source, 'unknown') as source,
  COUNT(*) as total_leads,
  COUNT(*) FILTER (WHERE lc.converted_to_inspection = true) as inspections_scheduled,
  COUNT(*) FILTER (WHERE lc.converted_to_quote = true) as quotes_sent,
  COUNT(*) FILTER (WHERE lc.converted_to_job = true) as jobs_won,
  
  -- Conversion rates
  CASE 
    WHEN COUNT(*) > 0 THEN 
      (COUNT(*) FILTER (WHERE lc.converted_to_inspection = true)::NUMERIC / COUNT(*) * 100)
    ELSE 0 
  END as lead_to_inspection_rate,
  
  CASE 
    WHEN COUNT(*) FILTER (WHERE lc.converted_to_inspection = true) > 0 THEN 
      (COUNT(*) FILTER (WHERE lc.converted_to_quote = true)::NUMERIC / 
       COUNT(*) FILTER (WHERE lc.converted_to_inspection = true) * 100)
    ELSE 0 
  END as inspection_to_quote_rate,
  
  CASE 
    WHEN COUNT(*) FILTER (WHERE lc.converted_to_quote = true) > 0 THEN 
      (COUNT(*) FILTER (WHERE lc.converted_to_job = true)::NUMERIC / 
       COUNT(*) FILTER (WHERE lc.converted_to_quote = true) * 100)
    ELSE 0 
  END as quote_to_job_rate,
  
  -- Average response time
  AVG(l.first_reply_time_minutes) as avg_response_time_minutes,
  
  -- Average quality score
  AVG(l.quality_score) as avg_quality_score,
  
  -- Job value from won jobs
  COALESCE(SUM(rj.projected_job_value) FILTER (WHERE lc.converted_to_job = true), 0) as total_job_value
  
FROM public.leads l
LEFT JOIN public.lead_conversions lc ON l.id = lc.lead_id
LEFT JOIN public.roofing_jobs rj ON l.id = rj.lead_id AND rj.current_stage = 'COMPLETED'
GROUP BY l.workspace_id, COALESCE(l.source, 'unknown');

-- View: Sales Rep Performance
CREATE OR REPLACE VIEW public.v_sales_rep_performance AS
SELECT 
  l.workspace_id,
  l.assigned_to_user_id,
  u.email as rep_email,
  COUNT(DISTINCT l.id) as total_leads,
  COUNT(DISTINCT l.id) FILTER (WHERE lc.converted_to_inspection = true) as inspections_scheduled,
  COUNT(DISTINCT l.id) FILTER (WHERE lc.converted_to_quote = true) as quotes_sent,
  COUNT(DISTINCT l.id) FILTER (WHERE lc.converted_to_job = true) as jobs_won,
  
  -- Win rate
  CASE 
    WHEN COUNT(DISTINCT l.id) > 0 THEN 
      (COUNT(DISTINCT l.id) FILTER (WHERE lc.converted_to_job = true)::NUMERIC / COUNT(DISTINCT l.id) * 100)
    ELSE 0 
  END as win_rate_pct,
  
  -- Average job value
  AVG(rj.projected_job_value) FILTER (WHERE lc.converted_to_job = true) as avg_job_value,
  
  -- Total job value
  COALESCE(SUM(rj.projected_job_value) FILTER (WHERE lc.converted_to_job = true), 0) as total_job_value,
  
  -- Average response time
  AVG(l.first_reply_time_minutes) as avg_response_time_minutes,
  
  -- Average quality score
  AVG(l.quality_score) as avg_quality_score
  
FROM public.leads l
LEFT JOIN public.lead_conversions lc ON l.id = lc.lead_id
LEFT JOIN public.roofing_jobs rj ON l.id = rj.lead_id AND rj.current_stage = 'COMPLETED'
LEFT JOIN auth.users u ON l.assigned_to_user_id = u.id
WHERE l.assigned_to_user_id IS NOT NULL
GROUP BY l.workspace_id, l.assigned_to_user_id, u.email;

-- ============================================================================
-- PART 2: JOB ANALYTICS TABLES & VIEWS
-- ============================================================================

-- Job stage history tracking
CREATE TABLE IF NOT EXISTS public.job_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  
  stage roofing_job_stage NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exited_at TIMESTAMPTZ,
  duration_hours NUMERIC(10, 2),
  
  -- Delay tracking
  is_delayed BOOLEAN DEFAULT false,
  delay_reason TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_stage_history_job 
  ON public.job_stage_history(job_id, entered_at);
CREATE INDEX IF NOT EXISTS idx_job_stage_history_workspace 
  ON public.job_stage_history(workspace_id, entered_at DESC);

-- Job delays tracking
CREATE TABLE IF NOT EXISTS public.job_delays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  
  delay_type TEXT NOT NULL CHECK (delay_type IN ('weather', 'material_shortage', 'crew_late', 'insurance_delay', 'permit_delay', 'other')),
  delay_reason TEXT,
  delay_start TIMESTAMPTZ NOT NULL,
  delay_end TIMESTAMPTZ,
  delay_hours NUMERIC(10, 2),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_delays_job 
  ON public.job_delays(job_id, delay_start);
CREATE INDEX IF NOT EXISTS idx_job_delays_workspace 
  ON public.job_delays(workspace_id, delay_start DESC);

-- View: Job Stage Duration Analytics
CREATE OR REPLACE VIEW public.v_job_stage_durations AS
SELECT 
  rj.workspace_id,
  jsh.stage,
  COUNT(*) as job_count,
  AVG(jsh.duration_hours) as avg_duration_hours,
  AVG(jsh.duration_hours) / 24 as avg_duration_days,
  MIN(jsh.duration_hours) as min_duration_hours,
  MAX(jsh.duration_hours) as max_duration_hours,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY jsh.duration_hours) as median_duration_hours
  
FROM public.job_stage_history jsh
JOIN public.roofing_jobs rj ON jsh.job_id = rj.id
WHERE jsh.exited_at IS NOT NULL AND jsh.duration_hours IS NOT NULL
GROUP BY rj.workspace_id, jsh.stage;

-- View: Job Profitability Analytics
CREATE OR REPLACE VIEW public.v_job_profitability AS
SELECT 
  rj.workspace_id,
  rj.current_stage,
  rj.carrier,
  
  COUNT(*) as job_count,
  AVG(rj.projected_job_value) as avg_job_value,
  SUM(rj.projected_job_value) as total_job_value,
  
  -- Profitability (if cost tracking exists)
  AVG(rj.actual_margin_pct) FILTER (WHERE rj.actual_margin_pct IS NOT NULL) as avg_margin_pct,
  AVG(rj.actual_gross_profit) FILTER (WHERE rj.actual_gross_profit IS NOT NULL) as avg_profit,
  SUM(rj.actual_gross_profit) FILTER (WHERE rj.actual_gross_profit IS NOT NULL) as total_profit,
  
  -- Job type breakdown
  COUNT(*) FILTER (WHERE rj.carrier IS NOT NULL) as insurance_jobs,
  COUNT(*) FILTER (WHERE rj.carrier IS NULL) as retail_jobs,
  
  -- Average margin by type
  AVG(rj.actual_margin_pct) FILTER (WHERE rj.carrier IS NOT NULL AND rj.actual_margin_pct IS NOT NULL) as avg_insurance_margin,
  AVG(rj.actual_margin_pct) FILTER (WHERE rj.carrier IS NULL AND rj.actual_margin_pct IS NOT NULL) as avg_retail_margin
  
FROM public.roofing_jobs rj
WHERE rj.current_stage IN ('COMPLETED', 'IN_PROGRESS', 'SCHEDULED_INSTALL')
GROUP BY rj.workspace_id, rj.current_stage, rj.carrier;

-- View: Job Delays Summary
CREATE OR REPLACE VIEW public.v_job_delays_summary AS
SELECT 
  jd.workspace_id,
  jd.delay_type,
  COUNT(*) as delay_count,
  AVG(jd.delay_hours) as avg_delay_hours,
  SUM(jd.delay_hours) as total_delay_hours,
  COUNT(DISTINCT jd.job_id) as jobs_affected
  
FROM public.job_delays jd
WHERE jd.delay_end IS NOT NULL
GROUP BY jd.workspace_id, jd.delay_type;

-- ============================================================================
-- PART 3: TEAM PERFORMANCE ANALYTICS
-- ============================================================================

-- Crew performance tracking (enhance roofing_jobs if needed)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'roofing_jobs' AND column_name = 'crew_id'
  ) THEN
    ALTER TABLE public.roofing_jobs ADD COLUMN crew_id UUID;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'roofing_jobs' AND column_name = 'crew_name'
  ) THEN
    ALTER TABLE public.roofing_jobs ADD COLUMN crew_name TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'roofing_jobs' AND column_name = 'install_started_at'
  ) THEN
    ALTER TABLE public.roofing_jobs ADD COLUMN install_started_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'roofing_jobs' AND column_name = 'install_completed_at'
  ) THEN
    ALTER TABLE public.roofing_jobs ADD COLUMN install_completed_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'roofing_jobs' AND column_name = 'install_duration_hours'
  ) THEN
    ALTER TABLE public.roofing_jobs ADD COLUMN install_duration_hours NUMERIC(10, 2);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'roofing_jobs' AND column_name = 'quality_score'
  ) THEN
    ALTER TABLE public.roofing_jobs ADD COLUMN quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'roofing_jobs' AND column_name = 'callback_rate'
  ) THEN
    ALTER TABLE public.roofing_jobs ADD COLUMN callback_rate NUMERIC(5, 2) DEFAULT 0;
  END IF;
END $$;

-- View: Sales Team Performance
CREATE OR REPLACE VIEW public.v_sales_team_performance AS
SELECT 
  l.workspace_id,
  l.assigned_to_user_id,
  u.email as rep_email,
  
  -- Lead metrics
  COUNT(DISTINCT l.id) as total_leads,
  COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'won') as leads_won,
  
  -- Conversion metrics
  COUNT(DISTINCT lc.lead_id) FILTER (WHERE lc.converted_to_inspection = true) as inspections_scheduled,
  COUNT(DISTINCT lc.lead_id) FILTER (WHERE lc.converted_to_quote = true) as quotes_sent,
  COUNT(DISTINCT lc.lead_id) FILTER (WHERE lc.converted_to_job = true) as jobs_won,
  
  -- Win rate
  CASE 
    WHEN COUNT(DISTINCT l.id) > 0 THEN 
      (COUNT(DISTINCT l.id) FILTER (WHERE lc.converted_to_job = true)::NUMERIC / COUNT(DISTINCT l.id) * 100)
    ELSE 0 
  END as close_rate_pct,
  
  -- Average job size
  AVG(rj.projected_job_value) FILTER (WHERE lc.converted_to_job = true) as avg_job_size,
  
  -- Total revenue
  COALESCE(SUM(rj.projected_job_value) FILTER (WHERE lc.converted_to_job = true), 0) as total_revenue,
  
  -- Response time
  AVG(l.first_reply_time_minutes) as avg_response_time_minutes,
  
  -- Inspections per week (last 4 weeks)
  COUNT(DISTINCT lc.lead_id) FILTER (
    WHERE lc.inspection_scheduled_at >= NOW() - INTERVAL '4 weeks' 
    AND lc.converted_to_inspection = true
  ) / 4.0 as inspections_per_week
  
FROM public.leads l
LEFT JOIN public.lead_conversions lc ON l.id = lc.lead_id
LEFT JOIN public.roofing_jobs rj ON l.id = rj.lead_id
LEFT JOIN auth.users u ON l.assigned_to_user_id = u.id
WHERE l.assigned_to_user_id IS NOT NULL
GROUP BY l.workspace_id, l.assigned_to_user_id, u.email;

-- View: Crew Performance
CREATE OR REPLACE VIEW public.v_crew_performance AS
SELECT 
  rj.workspace_id,
  COALESCE(rj.crew_name, 'Unassigned') as crew_name,
  
  COUNT(*) FILTER (WHERE rj.current_stage = 'COMPLETED') as jobs_completed,
  COUNT(*) FILTER (WHERE rj.current_stage IN ('IN_PROGRESS', 'SCHEDULED_INSTALL')) as jobs_in_progress,
  
  -- Install speed
  AVG(rj.install_duration_hours) FILTER (WHERE rj.install_duration_hours IS NOT NULL) as avg_install_hours,
  AVG(rj.install_duration_hours / 24.0) FILTER (WHERE rj.install_duration_hours IS NOT NULL) as avg_install_days,
  
  -- Quality metrics
  AVG(rj.quality_score) FILTER (WHERE rj.quality_score IS NOT NULL) as avg_quality_score,
  AVG(rj.callback_rate) FILTER (WHERE rj.callback_rate IS NOT NULL) as avg_callback_rate,
  
  -- Profitability
  AVG(rj.actual_margin_pct) FILTER (WHERE rj.actual_margin_pct IS NOT NULL) as avg_margin_pct,
  SUM(rj.actual_gross_profit) FILTER (WHERE rj.actual_gross_profit IS NOT NULL) as total_profit,
  
  -- Labor hour variance (if tracked)
  COUNT(*) as total_jobs
  
FROM public.roofing_jobs rj
WHERE rj.crew_name IS NOT NULL OR rj.crew_id IS NOT NULL
GROUP BY rj.workspace_id, COALESCE(rj.crew_name, 'Unassigned');

-- ============================================================================
-- PART 4: REVENUE FORECASTING
-- ============================================================================

-- Revenue forecast tracking
CREATE TABLE IF NOT EXISTS public.revenue_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  
  forecast_month DATE NOT NULL,
  forecast_type TEXT NOT NULL CHECK (forecast_type IN ('current_month', 'next_month', 'quarter', 'year')),
  
  -- Forecast components
  current_month_revenue NUMERIC(12, 2) DEFAULT 0,
  pending_approvals_count INTEGER DEFAULT 0,
  pending_approvals_value NUMERIC(12, 2) DEFAULT 0,
  jobs_scheduled_count INTEGER DEFAULT 0,
  jobs_scheduled_value NUMERIC(12, 2) DEFAULT 0,
  jobs_completed_count INTEGER DEFAULT 0,
  jobs_completed_value NUMERIC(12, 2) DEFAULT 0,
  
  -- Projected revenue
  expected_revenue NUMERIC(12, 2) DEFAULT 0,
  projected_revenue NUMERIC(12, 2) DEFAULT 0,
  
  -- Forecast factors
  avg_close_rate NUMERIC(5, 2),
  pipeline_volume INTEGER,
  seasonality_factor NUMERIC(5, 2) DEFAULT 1.0,
  weather_impact_score NUMERIC(5, 2) DEFAULT 1.0,
  insurance_backlog_count INTEGER DEFAULT 0,
  
  -- Metadata
  forecasted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  forecasted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  UNIQUE(workspace_id, forecast_month, forecast_type)
);

CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_workspace 
  ON public.revenue_forecasts(workspace_id, forecast_month DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_forecasts_month 
  ON public.revenue_forecasts(forecast_month);

-- View: Current Revenue Forecast
CREATE OR REPLACE VIEW public.v_current_revenue_forecast AS
SELECT DISTINCT ON (workspace_id)
  rf.*
FROM public.revenue_forecasts rf
WHERE rf.forecast_type = 'current_month'
ORDER BY workspace_id, forecast_month DESC, forecasted_at DESC;

-- Function: Calculate Revenue Forecast
CREATE OR REPLACE FUNCTION public.calculate_revenue_forecast(
  p_workspace_id UUID,
  p_forecast_month DATE DEFAULT DATE_TRUNC('month', NOW())::DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_month_revenue NUMERIC(12, 2) := 0;
  v_pending_approvals_count INTEGER := 0;
  v_pending_approvals_value NUMERIC(12, 2) := 0;
  v_jobs_scheduled_count INTEGER := 0;
  v_jobs_scheduled_value NUMERIC(12, 2) := 0;
  v_jobs_completed_count INTEGER := 0;
  v_jobs_completed_value NUMERIC(12, 2) := 0;
  v_avg_close_rate NUMERIC(5, 2);
  v_pipeline_volume INTEGER;
  v_expected_revenue NUMERIC(12, 2);
  v_projected_revenue NUMERIC(12, 2);
BEGIN
  -- Current month revenue (completed jobs)
  SELECT 
    COUNT(*),
    COALESCE(SUM(projected_job_value), 0)
  INTO v_jobs_completed_count, v_jobs_completed_value
  FROM public.roofing_jobs
  WHERE workspace_id = p_workspace_id
    AND current_stage = 'COMPLETED'
    AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', p_forecast_month);
  
  -- Jobs scheduled for this month
  SELECT 
    COUNT(*),
    COALESCE(SUM(projected_job_value), 0)
  INTO v_jobs_scheduled_count, v_jobs_scheduled_value
  FROM public.roofing_jobs
  WHERE workspace_id = p_workspace_id
    AND current_stage = 'SCHEDULED_INSTALL'
    AND DATE_TRUNC('month', stage_changed_at) = DATE_TRUNC('month', p_forecast_month);
  
  -- Pending approvals
  SELECT 
    COUNT(*),
    COALESCE(SUM(projected_job_value), 0)
  INTO v_pending_approvals_count, v_pending_approvals_value
  FROM public.roofing_jobs
  WHERE workspace_id = p_workspace_id
    AND current_stage = 'CLAIM_PENDING';
  
  -- Average close rate (from historical data)
  SELECT 
    CASE 
      WHEN COUNT(*) > 0 THEN 
        (COUNT(*) FILTER (WHERE lc.converted_to_job = true)::NUMERIC / COUNT(*) * 100)
      ELSE 0 
    END
  INTO v_avg_close_rate
  FROM public.leads l
  LEFT JOIN public.lead_conversions lc ON l.id = lc.lead_id
  WHERE l.workspace_id = p_workspace_id
    AND l.created_at >= NOW() - INTERVAL '6 months';
  
  -- Pipeline volume
  SELECT COUNT(*)
  INTO v_pipeline_volume
  FROM public.roofing_jobs
  WHERE workspace_id = p_workspace_id
    AND current_stage IN ('CLAIM_PENDING', 'CLAIM_APPROVED', 'INSTALL_READY');
  
  -- Expected revenue = completed + scheduled + (pending * close_rate)
  v_expected_revenue := v_jobs_completed_value + v_jobs_scheduled_value + 
    (v_pending_approvals_value * COALESCE(v_avg_close_rate, 50) / 100);
  
  -- Projected revenue (with seasonality and other factors)
  v_projected_revenue := v_expected_revenue * 1.0; -- Can add seasonality_factor here
  
  RETURN jsonb_build_object(
    'current_month_revenue', v_jobs_completed_value,
    'pending_approvals_count', v_pending_approvals_count,
    'pending_approvals_value', v_pending_approvals_value,
    'jobs_scheduled_count', v_jobs_scheduled_count,
    'jobs_scheduled_value', v_jobs_scheduled_value,
    'jobs_completed_count', v_jobs_completed_count,
    'jobs_completed_value', v_jobs_completed_value,
    'expected_revenue', v_expected_revenue,
    'projected_revenue', v_projected_revenue,
    'avg_close_rate', v_avg_close_rate,
    'pipeline_volume', v_pipeline_volume
  );
END;
$$;

-- ============================================================================
-- PART 5: MARKETING ROI ANALYTICS
-- ============================================================================

-- Marketing ROI tracking
CREATE TABLE IF NOT EXISTS public.marketing_roi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Campaign metrics
  campaign_name TEXT,
  campaign_type TEXT CHECK (campaign_type IN ('cold_email', 'referral', 'storm_outreach', 'website_form', 'other')),
  
  -- Cost tracking
  campaign_cost NUMERIC(12, 2) DEFAULT 0,
  cost_per_lead NUMERIC(12, 2),
  cost_per_inspection NUMERIC(12, 2),
  cost_per_job NUMERIC(12, 2),
  
  -- Conversion metrics
  leads_generated INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  inspections_booked INTEGER DEFAULT 0,
  jobs_closed INTEGER DEFAULT 0,
  
  -- Revenue metrics
  total_job_value NUMERIC(12, 2) DEFAULT 0,
  avg_job_value NUMERIC(12, 2),
  
  -- ROI calculation
  roi_percentage NUMERIC(10, 2),
  roi_multiplier NUMERIC(10, 2),
  
  -- Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, campaign_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_marketing_roi_workspace 
  ON public.marketing_roi(workspace_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_roi_campaign 
  ON public.marketing_roi(campaign_id);

-- View: Marketing ROI Summary
CREATE OR REPLACE VIEW public.v_marketing_roi_summary AS
SELECT 
  mr.workspace_id,
  mr.campaign_type,
  COUNT(*) as campaign_count,
  SUM(mr.campaign_cost) as total_cost,
  SUM(mr.leads_generated) as total_leads,
  SUM(mr.inspections_booked) as total_inspections,
  SUM(mr.jobs_closed) as total_jobs,
  SUM(mr.total_job_value) as total_revenue,
  
  -- Average metrics
  AVG(mr.cost_per_lead) as avg_cost_per_lead,
  AVG(mr.cost_per_inspection) as avg_cost_per_inspection,
  AVG(mr.cost_per_job) as avg_cost_per_job,
  AVG(mr.avg_job_value) as avg_job_value,
  
  -- ROI
  CASE 
    WHEN SUM(mr.campaign_cost) > 0 THEN 
      ((SUM(mr.total_job_value) - SUM(mr.campaign_cost)) / SUM(mr.campaign_cost) * 100)
    ELSE 0 
  END as overall_roi_pct,
  
  CASE 
    WHEN SUM(mr.campaign_cost) > 0 THEN 
      (SUM(mr.total_job_value) / SUM(mr.campaign_cost))
    ELSE 0 
  END as overall_roi_multiplier
  
FROM public.marketing_roi mr
GROUP BY mr.workspace_id, mr.campaign_type;

-- ============================================================================
-- PART 6: OWNER ANALYTICS DASHBOARD VIEW
-- ============================================================================

-- View: Owner Master Dashboard
CREATE OR REPLACE VIEW public.v_owner_dashboard AS
SELECT 
  w.id as workspace_id,
  
  -- Monthly Revenue
  COALESCE(SUM(rj.projected_job_value) FILTER (
    WHERE rj.current_stage = 'COMPLETED' 
    AND DATE_TRUNC('month', rj.updated_at) = DATE_TRUNC('month', NOW())
  ), 0) as monthly_revenue,
  
  -- Profit Margin
  AVG(rj.actual_margin_pct) FILTER (
    WHERE rj.current_stage = 'COMPLETED' 
    AND rj.actual_margin_pct IS NOT NULL
  ) as avg_profit_margin,
  
  -- Hot Leads Count
  COUNT(*) FILTER (
    WHERE l.quality_score >= 70 
    AND l.status = 'new'
  ) as hot_leads_count,
  
  -- Jobs at Risk
  COUNT(*) FILTER (
    WHERE rj.current_stage IN ('CLAIM_PENDING', 'ADJUSTER_SCHEDULED')
    AND rj.stage_changed_at < NOW() - INTERVAL '14 days'
  ) as jobs_at_risk,
  
  -- Avg Days to Complete Jobs
  AVG(EXTRACT(EPOCH FROM (rj.updated_at - rj.created_at)) / 86400) FILTER (
    WHERE rj.current_stage = 'COMPLETED'
  ) as avg_days_to_complete,
  
  -- Material Waste Trends (if tracked)
  COUNT(*) FILTER (
    WHERE rj.actual_material_cost > rj.est_material_cost * 1.1
  ) as high_waste_jobs,
  
  -- Weather Impact Score (placeholder - can be enhanced)
  1.0 as weather_impact_score,
  
  -- Supplier Performance (placeholder - can be enhanced)
  0 as supplier_issues_count,
  
  -- Crew Efficiency
  AVG(rj.install_duration_hours) FILTER (
    WHERE rj.install_duration_hours IS NOT NULL
  ) as avg_crew_hours,
  
  -- Insurance Payout Speed (placeholder)
  0 as avg_insurance_payout_days,
  
  -- Sales Rep Rankings (top 3)
  (
    SELECT jsonb_agg(jsonb_build_object(
      'rep_email', rep_email,
      'total_revenue', total_revenue,
      'win_rate', close_rate_pct
    ) ORDER BY total_revenue DESC LIMIT 3)
    FROM public.v_sales_team_performance
    WHERE workspace_id = w.id
  ) as top_sales_reps
  
FROM public.workspaces w
LEFT JOIN public.leads l ON l.workspace_id = w.id
LEFT JOIN public.roofing_jobs rj ON rj.workspace_id = w.id
GROUP BY w.id;

-- ============================================================================
-- PART 7: ANALYTICS ALERTS SYSTEM
-- ============================================================================

-- Analytics alerts table
CREATE TABLE IF NOT EXISTS public.analytics_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'close_rate_drop',
    'crew_performance_issue',
    'material_cost_increase',
    'lead_volume_drop',
    'jobs_at_risk',
    'inspection_lag',
    'revenue_forecast_change',
    'marketing_roi_drop'
  )),
  
  alert_title TEXT NOT NULL,
  alert_message TEXT NOT NULL,
  alert_severity TEXT NOT NULL DEFAULT 'medium' CHECK (alert_severity IN ('low', 'medium', 'high', 'urgent')),
  
  -- Related entities
  job_id UUID REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Alert data
  metric_name TEXT,
  metric_value NUMERIC,
  metric_threshold NUMERIC,
  metric_change_pct NUMERIC,
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_analytics_alerts_workspace 
  ON public.analytics_alerts(workspace_id, created_at DESC, is_dismissed);
CREATE INDEX IF NOT EXISTS idx_analytics_alerts_type 
  ON public.analytics_alerts(alert_type, alert_severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_alerts_unread 
  ON public.analytics_alerts(workspace_id, is_read, is_dismissed) 
  WHERE is_read = false AND is_dismissed = false;

-- Function: Create Analytics Alert
CREATE OR REPLACE FUNCTION public.create_analytics_alert(
  p_workspace_id UUID,
  p_alert_type TEXT,
  p_alert_title TEXT,
  p_alert_message TEXT,
  p_alert_severity TEXT DEFAULT 'medium',
  p_metric_name TEXT DEFAULT NULL,
  p_metric_value NUMERIC DEFAULT NULL,
  p_metric_threshold NUMERIC DEFAULT NULL,
  p_metric_change_pct NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert_id UUID;
BEGIN
  INSERT INTO public.analytics_alerts (
    workspace_id,
    alert_type,
    alert_title,
    alert_message,
    alert_severity,
    metric_name,
    metric_value,
    metric_threshold,
    metric_change_pct
  ) VALUES (
    p_workspace_id,
    p_alert_type,
    p_alert_title,
    p_alert_message,
    p_alert_severity,
    p_metric_name,
    p_metric_value,
    p_metric_threshold,
    p_metric_change_pct
  )
  RETURNING id INTO v_alert_id;
  
  RETURN v_alert_id;
END;
$$;

-- ============================================================================
-- PART 8: RLS POLICIES
-- ============================================================================

ALTER TABLE public.lead_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_delays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_roi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_alerts ENABLE ROW LEVEL SECURITY;

-- Lead conversions: Users can view conversions for their workspace
CREATE POLICY "Users can view lead conversions"
  ON public.lead_conversions
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Job stage history: Users can view stage history for their workspace
CREATE POLICY "Users can view job stage history"
  ON public.job_stage_history
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Job delays: Users can view delays for their workspace
CREATE POLICY "Users can view job delays"
  ON public.job_delays
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Revenue forecasts: Users can view forecasts for their workspace
CREATE POLICY "Users can view revenue forecasts"
  ON public.revenue_forecasts
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create revenue forecasts"
  ON public.revenue_forecasts
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Marketing ROI: Users can view ROI for their workspace
CREATE POLICY "Users can view marketing ROI"
  ON public.marketing_roi
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Analytics alerts: Users can view and update alerts for their workspace
CREATE POLICY "Users can view analytics alerts"
  ON public.analytics_alerts
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update analytics alerts"
  ON public.analytics_alerts
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 9: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.lead_conversions IS 'Tracks lead conversion through sales funnel: lead → inspection → quote → job';
COMMENT ON TABLE public.job_stage_history IS 'Tracks time spent in each pipeline stage for job analytics';
COMMENT ON TABLE public.job_delays IS 'Tracks job delays by type (weather, materials, crew, insurance, etc.)';
COMMENT ON TABLE public.revenue_forecasts IS 'Revenue forecasting based on pipeline, close rates, and seasonality';
COMMENT ON TABLE public.marketing_roi IS 'Marketing ROI tracking by campaign type and source';
COMMENT ON TABLE public.analytics_alerts IS 'Proactive alerts based on analytics metrics (close rate drops, performance issues, etc.)';

COMMENT ON VIEW public.v_lead_analytics_by_source IS 'Lead analytics broken down by source (Google, Facebook, referrals, etc.)';
COMMENT ON VIEW public.v_sales_rep_performance IS 'Sales rep performance metrics: win rate, job value, response time';
COMMENT ON VIEW public.v_job_stage_durations IS 'Average time spent in each pipeline stage';
COMMENT ON VIEW public.v_job_profitability IS 'Job profitability by stage, carrier, and type';
COMMENT ON VIEW public.v_sales_team_performance IS 'Sales team performance dashboard';
COMMENT ON VIEW public.v_crew_performance IS 'Crew performance: install speed, quality, profitability';
COMMENT ON VIEW public.v_marketing_roi_summary IS 'Marketing ROI summary by campaign type';
COMMENT ON VIEW public.v_owner_dashboard IS 'Master dashboard for roofing company owners';




































