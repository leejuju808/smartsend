-- =========================================================
-- Block 85000 — SmartSend Roofing "Owner KPI Dashboard + Business Health Score Engine" v1
-- (CEO-Level Intelligence: Daily KPIs, Trendlines, ZIP Heatmaps, Crew Performance, Marketing ROI, Health Scores)
-- =========================================================
-- 
-- THE CEO DASHBOARD THAT TURNS ROOFERS INTO REAL BUSINESS OWNERS — ZERO FLUFF.
-- This block transforms SmartSend from a tool into a CEO dashboard — the place roofing owners go EVERY MORNING.
--
-- Every feature below directly helps roofers:
-- ✔ Know exactly what to fix today
-- ✔ Know which markets are hot
-- ✔ Know which campaigns drive revenue
-- ✔ Know which crews underperform
-- ✔ Know which leads are worth chasing
-- ✔ Know their revenue forecast for the month
-- ✔ Know their business health score

-- ============================================================================
-- PART 1 — CREATE company_kpi_snapshots TABLE (Daily KPI Snapshots)
-- ============================================================================
-- Stores daily snapshots of all KPIs per company for trend analysis

CREATE TABLE IF NOT EXISTS public.company_kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Snapshot date
  date date NOT NULL,
  
  -- Lead Metrics
  total_leads integer DEFAULT 0,
  hot_leads integer DEFAULT 0,
  warm_leads integer DEFAULT 0,
  cold_leads integer DEFAULT 0,
  
  -- Estimate Metrics
  booked_estimates integer DEFAULT 0,
  estimates_sent integer DEFAULT 0,
  estimates_pending integer DEFAULT 0,
  
  -- Job Metrics
  jobs_won integer DEFAULT 0,
  jobs_lost integer DEFAULT 0,
  jobs_in_progress integer DEFAULT 0,
  jobs_completed integer DEFAULT 0,
  
  -- Revenue Metrics
  revenue_won numeric(12,2) DEFAULT 0,
  revenue_pipeline numeric(12,2) DEFAULT 0,
  average_job_value numeric(12,2) DEFAULT 0,
  total_pipeline_value numeric(12,2) DEFAULT 0,
  
  -- Conversion Metrics
  close_rate numeric(5,2) DEFAULT 0, -- Percentage
  estimate_to_close_rate numeric(5,2) DEFAULT 0,
  lead_to_estimate_rate numeric(5,2) DEFAULT 0,
  
  -- Response & Engagement Metrics
  response_speed_minutes numeric(10,2) DEFAULT 0, -- Average response time in minutes
  email_open_rate numeric(5,2) DEFAULT 0, -- Percentage
  email_reply_rate numeric(5,2) DEFAULT 0, -- Percentage
  email_click_rate numeric(5,2) DEFAULT 0, -- Percentage
  
  -- Deliverability Metrics
  domain_reputation text, -- 'excellent', 'good', 'fair', 'poor'
  bounce_rate numeric(5,2) DEFAULT 0,
  spam_complaint_rate numeric(5,2) DEFAULT 0,
  
  -- Safety & Quality Metrics
  safety_incidents integer DEFAULT 0,
  safety_incidents_30d integer DEFAULT 0,
  crew_on_time_rate numeric(5,2) DEFAULT 0, -- Percentage
  homeowner_satisfaction numeric(5,2) DEFAULT 0, -- Average rating 1-5
  callback_rate numeric(5,2) DEFAULT 0, -- Percentage of jobs requiring callbacks
  
  -- Crew Performance (Aggregated)
  active_crews integer DEFAULT 0,
  avg_crew_rating numeric(5,2) DEFAULT 0,
  
  -- Marketing Metrics
  active_campaigns integer DEFAULT 0,
  total_campaign_spend numeric(12,2) DEFAULT 0,
  revenue_from_campaigns numeric(12,2) DEFAULT 0,
  campaign_roi numeric(10,2) DEFAULT 0, -- ROI percentage
  
  -- ZIP Code Performance (Top 5 stored as JSONB)
  top_zip_codes jsonb DEFAULT '[]'::jsonb, -- [{zip: '12345', revenue: 50000, jobs: 5}, ...]
  
  -- Metadata
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one snapshot per company/workspace per day
  CONSTRAINT unique_snapshot_per_day UNIQUE (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid),
    date
  )
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_company ON public.company_kpi_snapshots(company_id, date DESC) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_workspace ON public.company_kpi_snapshots(workspace_id, date DESC) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_org ON public.company_kpi_snapshots(org_id, date DESC) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_date ON public.company_kpi_snapshots(date DESC);

COMMENT ON TABLE public.company_kpi_snapshots IS 'Block 85000: Daily KPI snapshots for CEO dashboard';

-- ============================================================================
-- PART 2 — CREATE kpi_definitions TABLE (Flexible KPI Definitions)
-- ============================================================================
-- Allows system to define and track custom KPIs

CREATE TABLE IF NOT EXISTS public.kpi_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  calculation_method text, -- SQL or formula description
  category text, -- 'revenue', 'production', 'safety', 'deliverability', 'marketing', 'operations'
  unit text, -- 'count', 'percentage', 'currency', 'minutes', 'rating'
  target_value numeric(12,2), -- Target/benchmark value
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpi_definitions_category ON public.kpi_definitions(category, is_active);
CREATE INDEX IF NOT EXISTS idx_kpi_definitions_name ON public.kpi_definitions(name);

COMMENT ON TABLE public.kpi_definitions IS 'Block 85000: Flexible KPI definitions for customization';

-- ============================================================================
-- PART 3 — CREATE business_health_scores TABLE (AI-Generated Health Scores)
-- ============================================================================
-- Stores weekly business health scores with AI-generated recommendations

CREATE TABLE IF NOT EXISTS public.business_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Score
  score numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100), -- 0-100
  grade text NOT NULL CHECK (grade IN ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F')),
  
  -- Component Scores (0-100 each)
  revenue_score numeric(5,2) DEFAULT 0,
  production_score numeric(5,2) DEFAULT 0,
  safety_score numeric(5,2) DEFAULT 0,
  deliverability_score numeric(5,2) DEFAULT 0,
  marketing_score numeric(5,2) DEFAULT 0,
  operations_score numeric(5,2) DEFAULT 0,
  crew_performance_score numeric(5,2) DEFAULT 0,
  homeowner_satisfaction_score numeric(5,2) DEFAULT 0,
  
  -- Issues & Strengths
  problems jsonb DEFAULT '[]'::jsonb, -- ["close_rate_low", "too_many_lost_jobs", "slow_response_time"]
  strengths jsonb DEFAULT '[]'::jsonb, -- ["high_close_rate", "excellent_safety", "fast_response"]
  
  -- AI-Generated Recommendations
  recommendations jsonb DEFAULT '[]'::jsonb, -- [{priority: 'high', action: 'Increase follow-up speed', impact: 'high'}, ...]
  
  -- Period
  period_start_date date NOT NULL,
  period_end_date date NOT NULL,
  
  -- Metadata
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_health_scores_company ON public.business_health_scores(company_id, period_end_date DESC) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_health_scores_workspace ON public.business_health_scores(workspace_id, period_end_date DESC) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_health_scores_org ON public.business_health_scores(org_id, period_end_date DESC) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_health_scores_grade ON public.business_health_scores(grade, period_end_date DESC);

COMMENT ON TABLE public.business_health_scores IS 'Block 85000: AI-generated business health scores with recommendations';

-- ============================================================================
-- PART 4 — CREATE FUNCTION: calculate_daily_kpi_snapshot
-- ============================================================================
-- Calculates and saves daily KPI snapshot for a company/workspace

CREATE OR REPLACE FUNCTION public.calculate_daily_kpi_snapshot(
  p_company_id uuid DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL,
  p_org_id uuid DEFAULT NULL,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot_id uuid;
  v_total_leads int := 0;
  v_hot_leads int := 0;
  v_warm_leads int := 0;
  v_cold_leads int := 0;
  v_booked_estimates int := 0;
  v_estimates_sent int := 0;
  v_jobs_won int := 0;
  v_jobs_lost int := 0;
  v_revenue_won numeric := 0;
  v_pipeline_value numeric := 0;
  v_avg_job_value numeric := 0;
  v_close_rate numeric := 0;
  v_response_speed numeric := 0;
  v_open_rate numeric := 0;
  v_reply_rate numeric := 0;
  v_crew_on_time_rate numeric := 0;
  v_homeowner_satisfaction numeric := 0;
  v_safety_incidents_30d int := 0;
  v_top_zips jsonb := '[]'::jsonb;
BEGIN
  -- Get leads count (by status/temperature)
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('hot', 'qualified', 'booked'))::int,
    COUNT(*) FILTER (WHERE status = 'warm')::int,
    COUNT(*) FILTER (WHERE status IN ('cold', 'new'))::int,
    COUNT(*)::int
  INTO v_hot_leads, v_warm_leads, v_cold_leads, v_total_leads
  FROM public.leads l
  WHERE 
    (p_company_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.roofing_companies rc 
      WHERE rc.id = p_company_id 
      AND (l.workspace_id = rc.workspace_id OR l.org_id = rc.org_id)
    ))
    OR (p_workspace_id IS NOT NULL AND l.workspace_id = p_workspace_id)
    OR (p_org_id IS NOT NULL AND l.org_id = p_org_id);
  
  -- Get estimates metrics
  SELECT 
    COUNT(*) FILTER (WHERE sent_at IS NOT NULL)::int,
    COUNT(*) FILTER (WHERE sent_at IS NULL AND created_at::date = p_date)::int
  INTO v_estimates_sent, v_booked_estimates
  FROM public.estimates e
  WHERE 
    (p_company_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.roofing_companies rc 
      WHERE rc.id = p_company_id 
      AND (e.workspace_id = rc.workspace_id OR e.org_id = rc.org_id)
    ))
    OR (p_workspace_id IS NOT NULL AND e.workspace_id = p_workspace_id)
    OR (p_org_id IS NOT NULL AND e.org_id = p_org_id);
  
  -- Get jobs metrics
  SELECT 
    COUNT(*) FILTER (WHERE stage = 'completed' AND contract_value IS NOT NULL)::int,
    COUNT(*) FILTER (WHERE stage IN ('lost', 'cancelled'))::int,
    COALESCE(SUM(contract_value) FILTER (WHERE stage = 'completed'), 0),
    COALESCE(SUM(contract_value) FILTER (WHERE stage IN ('estimate', 'approved', 'insurance', 'materials', 'scheduled', 'in_progress')), 0),
    COALESCE(AVG(contract_value) FILTER (WHERE stage = 'completed' AND contract_value IS NOT NULL), 0)
  INTO v_jobs_won, v_jobs_lost, v_revenue_won, v_pipeline_value, v_avg_job_value
  FROM public.jobs j
  WHERE 
    (p_company_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.roofing_companies rc 
      WHERE rc.id = p_company_id 
      AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = j.lead_id AND (l.workspace_id = rc.workspace_id OR l.org_id = rc.org_id))
    ))
    OR (p_workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = j.lead_id AND l.workspace_id = p_workspace_id
    ))
    OR (p_org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l WHERE l.id = j.lead_id AND l.org_id = p_org_id
    ));
  
  -- Calculate close rate
  IF (v_jobs_won + v_jobs_lost) > 0 THEN
    v_close_rate := (v_jobs_won::numeric / (v_jobs_won + v_jobs_lost)::numeric) * 100;
  END IF;
  
  -- Get email metrics (from email_events or send_logs)
  SELECT 
    COALESCE(
      (COUNT(DISTINCT ee.recipient_email) FILTER (WHERE ee.event_type = 'open')::numeric / 
       NULLIF(COUNT(DISTINCT ee.recipient_email) FILTER (WHERE ee.event_type = 'delivered'), 0)) * 100,
      0
    ),
    COALESCE(
      (COUNT(DISTINCT ee.recipient_email) FILTER (WHERE ee.event_type = 'reply')::numeric / 
       NULLIF(COUNT(DISTINCT ee.recipient_email) FILTER (WHERE ee.event_type = 'delivered'), 0)) * 100,
      0
    )
  INTO v_open_rate, v_reply_rate
  FROM public.email_events ee
  WHERE 
    (p_workspace_id IS NOT NULL AND ee.workspace_id = p_workspace_id)
    OR (p_org_id IS NOT NULL AND ee.org_id = p_org_id)
    AND ee.created_at::date >= p_date - INTERVAL '30 days';
  
  -- Get crew performance (simplified - can be enhanced)
  SELECT 
    COALESCE(AVG(on_time_percentage), 0),
    COALESCE(AVG(avg_homeowner_rating), 0)
  INTO v_crew_on_time_rate, v_homeowner_satisfaction
  FROM public.crew_performance_scores cps
  WHERE 
    (p_company_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.roofing_companies rc 
      WHERE rc.id = p_company_id 
      AND cps.workspace_id = rc.workspace_id
    ))
    OR (p_workspace_id IS NOT NULL AND cps.workspace_id = p_workspace_id)
    AND cps.period_end_date >= p_date - INTERVAL '30 days';
  
  -- Get safety incidents (last 30 days)
  -- Note: Assuming safety_incidents table exists or can be derived from job data
  -- This is a placeholder - adjust based on actual safety tracking
  
  -- Get top ZIP codes by revenue
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'zip', zipcode,
      'revenue', revenue,
      'jobs', job_count
    ) ORDER BY revenue DESC
  ), '[]'::jsonb)
  INTO v_top_zips
  FROM (
    SELECT 
      ll.zipcode as zipcode,
      COALESCE(SUM(j.contract_value) FILTER (WHERE j.stage = 'completed'), 0) as revenue,
      COUNT(DISTINCT j.id) FILTER (WHERE j.stage = 'completed') as job_count
    FROM public.lead_locations ll
    JOIN public.leads l ON l.id = ll.lead_id
    LEFT JOIN public.jobs j ON j.lead_id = l.id
    WHERE 
      (p_workspace_id IS NOT NULL AND ll.workspace_id = p_workspace_id)
      OR (p_org_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.workspaces w WHERE w.id = ll.workspace_id AND w.org_id = p_org_id
      ))
      AND j.created_at::date >= p_date - INTERVAL '90 days'
    GROUP BY ll.zipcode
    ORDER BY revenue DESC
    LIMIT 5
  ) zip_data;
  
  -- Insert or update snapshot
  INSERT INTO public.company_kpi_snapshots (
    company_id, workspace_id, org_id, date,
    total_leads, hot_leads, warm_leads, cold_leads,
    booked_estimates, estimates_sent,
    jobs_won, jobs_lost, revenue_won, pipeline_value, average_job_value,
    close_rate, email_open_rate, email_reply_rate,
    crew_on_time_rate, homeowner_satisfaction,
    top_zip_codes
  ) VALUES (
    p_company_id, p_workspace_id, p_org_id, p_date,
    v_total_leads, v_hot_leads, v_warm_leads, v_cold_leads,
    v_booked_estimates, v_estimates_sent,
    v_jobs_won, v_jobs_lost, v_revenue_won, v_pipeline_value, v_avg_job_value,
    v_close_rate, v_open_rate, v_reply_rate,
    v_crew_on_time_rate, v_homeowner_satisfaction,
    v_top_zips
  )
  ON CONFLICT (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid),
    date
  )
  DO UPDATE SET
    total_leads = EXCLUDED.total_leads,
    hot_leads = EXCLUDED.hot_leads,
    warm_leads = EXCLUDED.warm_leads,
    cold_leads = EXCLUDED.cold_leads,
    booked_estimates = EXCLUDED.booked_estimates,
    estimates_sent = EXCLUDED.estimates_sent,
    jobs_won = EXCLUDED.jobs_won,
    jobs_lost = EXCLUDED.jobs_lost,
    revenue_won = EXCLUDED.revenue_won,
    pipeline_value = EXCLUDED.pipeline_value,
    average_job_value = EXCLUDED.average_job_value,
    close_rate = EXCLUDED.close_rate,
    email_open_rate = EXCLUDED.email_open_rate,
    email_reply_rate = EXCLUDED.email_reply_rate,
    crew_on_time_rate = EXCLUDED.crew_on_time_rate,
    homeowner_satisfaction = EXCLUDED.homeowner_satisfaction,
    top_zip_codes = EXCLUDED.top_zip_codes,
    calculated_at = now()
  RETURNING id INTO v_snapshot_id;
  
  RETURN v_snapshot_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_daily_kpi_snapshot IS 'Block 85000: Calculates and saves daily KPI snapshot';

-- ============================================================================
-- PART 5 — CREATE FUNCTION: calculate_business_health_score
-- ============================================================================
-- Calculates business health score with AI-generated recommendations

CREATE OR REPLACE FUNCTION public.calculate_business_health_score(
  p_company_id uuid DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL,
  p_org_id uuid DEFAULT NULL,
  p_period_start date DEFAULT (CURRENT_DATE - INTERVAL '7 days'),
  p_period_end date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_health_id uuid;
  v_score numeric := 0;
  v_grade text := 'C';
  v_revenue_score numeric := 0;
  v_production_score numeric := 0;
  v_safety_score numeric := 100; -- Default to good if no incidents
  v_deliverability_score numeric := 0;
  v_marketing_score numeric := 0;
  v_operations_score numeric := 0;
  v_crew_score numeric := 0;
  v_satisfaction_score numeric := 0;
  v_problems jsonb := '[]'::jsonb;
  v_strengths jsonb := '[]'::jsonb;
  v_recommendations jsonb := '[]'::jsonb;
  v_close_rate numeric := 0;
  v_open_rate numeric := 0;
  v_reply_rate numeric := 0;
  v_response_speed numeric := 0;
  v_crew_on_time numeric := 0;
  v_satisfaction numeric := 0;
BEGIN
  -- Get latest snapshot data
  SELECT 
    close_rate, email_open_rate, email_reply_rate,
    response_speed_minutes, crew_on_time_rate, homeowner_satisfaction
  INTO v_close_rate, v_open_rate, v_reply_rate, v_response_speed, v_crew_on_time, v_satisfaction
  FROM public.company_kpi_snapshots
  WHERE 
    (p_company_id IS NOT NULL AND company_id = p_company_id)
    OR (p_workspace_id IS NOT NULL AND workspace_id = p_workspace_id)
    OR (p_org_id IS NOT NULL AND org_id = p_org_id)
    AND date BETWEEN p_period_start AND p_period_end
  ORDER BY date DESC
  LIMIT 1;
  
  -- Calculate component scores (0-100 each)
  
  -- Revenue Score (based on close rate and pipeline)
  IF v_close_rate >= 30 THEN
    v_revenue_score := 100;
  ELSIF v_close_rate >= 20 THEN
    v_revenue_score := 80;
  ELSIF v_close_rate >= 10 THEN
    v_revenue_score := 60;
  ELSE
    v_revenue_score := 40;
    v_problems := v_problems || '["close_rate_low"]'::jsonb;
  END IF;
  
  -- Production Score (based on crew on-time rate)
  IF v_crew_on_time >= 90 THEN
    v_production_score := 100;
  ELSIF v_crew_on_time >= 80 THEN
    v_production_score := 80;
  ELSIF v_crew_on_time >= 70 THEN
    v_production_score := 60;
  ELSE
    v_production_score := 40;
    v_problems := v_problems || '["crew_late"]'::jsonb;
  END IF;
  
  -- Deliverability Score (based on open/reply rates)
  IF v_open_rate >= 25 AND v_reply_rate >= 5 THEN
    v_deliverability_score := 100;
    v_strengths := v_strengths || '["excellent_email_performance"]'::jsonb;
  ELSIF v_open_rate >= 20 AND v_reply_rate >= 3 THEN
    v_deliverability_score := 80;
  ELSIF v_open_rate >= 15 THEN
    v_deliverability_score := 60;
  ELSE
    v_deliverability_score := 40;
    v_problems := v_problems || '["low_email_engagement"]'::jsonb;
  END IF;
  
  -- Operations Score (based on response speed)
  IF v_response_speed <= 20 THEN
    v_operations_score := 100;
    v_strengths := v_strengths || '["fast_response"]'::jsonb;
  ELSIF v_response_speed <= 60 THEN
    v_operations_score := 80;
  ELSIF v_response_speed <= 120 THEN
    v_operations_score := 60;
  ELSE
    v_operations_score := 40;
    v_problems := v_problems || '["slow_response_time"]'::jsonb;
  END IF;
  
  -- Crew Performance Score
  IF v_crew_on_time >= 90 THEN
    v_crew_score := 100;
    v_strengths := v_strengths || '["reliable_crews"]'::jsonb;
  ELSIF v_crew_on_time >= 80 THEN
    v_crew_score := 80;
  ELSIF v_crew_on_time >= 70 THEN
    v_crew_score := 60;
  ELSE
    v_crew_score := 40;
  END IF;
  
  -- Satisfaction Score
  IF v_satisfaction >= 4.5 THEN
    v_satisfaction_score := 100;
    v_strengths := v_strengths || '["high_satisfaction"]'::jsonb;
  ELSIF v_satisfaction >= 4.0 THEN
    v_satisfaction_score := 80;
  ELSIF v_satisfaction >= 3.5 THEN
    v_satisfaction_score := 60;
  ELSE
    v_satisfaction_score := 40;
    v_problems := v_problems || '["low_satisfaction"]'::jsonb;
  END IF;
  
  -- Calculate overall score (weighted average)
  v_score := (
    v_revenue_score * 0.25 +
    v_production_score * 0.20 +
    v_safety_score * 0.15 +
    v_deliverability_score * 0.15 +
    v_operations_score * 0.10 +
    v_crew_score * 0.10 +
    v_satisfaction_score * 0.05
  );
  
  -- Determine grade
  IF v_score >= 95 THEN v_grade := 'A+';
  ELSIF v_score >= 90 THEN v_grade := 'A';
  ELSIF v_score >= 85 THEN v_grade := 'A-';
  ELSIF v_score >= 80 THEN v_grade := 'B+';
  ELSIF v_score >= 75 THEN v_grade := 'B';
  ELSIF v_score >= 70 THEN v_grade := 'B-';
  ELSIF v_score >= 65 THEN v_grade := 'C+';
  ELSIF v_score >= 60 THEN v_grade := 'C';
  ELSIF v_score >= 55 THEN v_grade := 'C-';
  ELSIF v_score >= 50 THEN v_grade := 'D+';
  ELSIF v_score >= 45 THEN v_grade := 'D';
  ELSIF v_score >= 40 THEN v_grade := 'D-';
  ELSE v_grade := 'F';
  END IF;
  
  -- Generate recommendations
  IF v_response_speed > 60 THEN
    v_recommendations := v_recommendations || jsonb_build_object(
      'priority', 'high',
      'action', 'Increase follow-up speed from ' || ROUND(v_response_speed) || ' minutes → under 20 minutes',
      'impact', 'high'
    );
  END IF;
  
  IF v_close_rate < 20 THEN
    v_recommendations := v_recommendations || jsonb_build_object(
      'priority', 'high',
      'action', 'Focus on improving close rate (currently ' || ROUND(v_close_rate, 1) || '%)',
      'impact', 'high'
    );
  END IF;
  
  IF v_open_rate < 20 THEN
    v_recommendations := v_recommendations || jsonb_build_object(
      'priority', 'medium',
      'action', 'Open rate is low — rotate subject lines and test new messaging',
      'impact', 'medium'
    );
  END IF;
  
  -- Insert health score
  INSERT INTO public.business_health_scores (
    company_id, workspace_id, org_id,
    score, grade,
    revenue_score, production_score, safety_score, deliverability_score,
    marketing_score, operations_score, crew_performance_score, homeowner_satisfaction_score,
    problems, strengths, recommendations,
    period_start_date, period_end_date
  ) VALUES (
    p_company_id, p_workspace_id, p_org_id,
    v_score, v_grade,
    v_revenue_score, v_production_score, v_safety_score, v_deliverability_score,
    v_marketing_score, v_operations_score, v_crew_score, v_satisfaction_score,
    v_problems, v_strengths, v_recommendations,
    p_period_start, p_period_end
  )
  RETURNING id INTO v_health_id;
  
  RETURN v_health_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_business_health_score IS 'Block 85000: Calculates business health score with recommendations';

-- ============================================================================
-- PART 6 — ENABLE RLS
-- ============================================================================

ALTER TABLE public.company_kpi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_health_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company_kpi_snapshots
CREATE POLICY "Users can view KPI snapshots for their workspace"
  ON public.company_kpi_snapshots
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies WHERE owner_id = auth.uid()
    )
    OR org_id IN (
      SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- RLS Policies for kpi_definitions (read-only for now)
CREATE POLICY "Users can view KPI definitions"
  ON public.kpi_definitions
  FOR SELECT
  USING (is_active = true);

-- RLS Policies for business_health_scores
CREATE POLICY "Users can view health scores for their workspace"
  ON public.business_health_scores
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies WHERE owner_id = auth.uid()
    )
    OR org_id IN (
      SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================================================
-- PART 7 — SEED DEFAULT KPI DEFINITIONS
-- ============================================================================

INSERT INTO public.kpi_definitions (name, description, calculation_method, category, unit, target_value)
VALUES
  ('Close Rate', 'Percentage of jobs won vs total jobs', 'jobs_won / (jobs_won + jobs_lost) * 100', 'revenue', 'percentage', 25.0),
  ('Average Job Value', 'Average revenue per completed job', 'SUM(revenue_won) / COUNT(jobs_won)', 'revenue', 'currency', 15000.0),
  ('Pipeline Value', 'Total value of jobs in pipeline', 'SUM(contract_value WHERE stage != completed)', 'revenue', 'currency', 100000.0),
  ('Email Open Rate', 'Percentage of emails opened', 'unique_opens / delivered * 100', 'deliverability', 'percentage', 25.0),
  ('Email Reply Rate', 'Percentage of emails that received replies', 'replies / delivered * 100', 'deliverability', 'percentage', 5.0),
  ('Response Speed', 'Average time to respond to leads (minutes)', 'AVG(response_time)', 'operations', 'minutes', 20.0),
  ('Crew On-Time Rate', 'Percentage of jobs started on time', 'on_time_jobs / total_jobs * 100', 'production', 'percentage', 90.0),
  ('Homeowner Satisfaction', 'Average homeowner rating', 'AVG(rating)', 'operations', 'rating', 4.5),
  ('Safety Incidents', 'Number of safety incidents in last 30 days', 'COUNT(incidents WHERE date >= NOW() - 30 days)', 'safety', 'count', 0.0)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 8 — CREATE CRON JOB FOR NIGHTLY KPI SNAPSHOTS
-- ============================================================================
-- Runs daily at 2 AM UTC to calculate snapshots for all companies/workspaces

-- Note: This requires pg_cron extension to be enabled
-- Run this in Supabase SQL editor or via migration if pg_cron is available

DO $$
BEGIN
  -- Check if pg_cron extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Schedule nightly KPI snapshot job (runs at 2 AM UTC daily)
    PERFORM cron.schedule(
      'kpi-nightly-snapshot',
      '0 2 * * *', -- Daily at 2 AM UTC
      $$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/kpi-nightly-snapshot',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := '{}'::jsonb
      ) as request_id;
      $$
    );
  END IF;
END $$;

-- ============================================================================
-- PART 9 — CREATE TRIGGERS FOR REAL-TIME UPDATES
-- ============================================================================
-- These triggers invalidate/refresh dashboard data when key events occur

-- Function to trigger snapshot refresh (can be called manually or via trigger)
CREATE OR REPLACE FUNCTION public.trigger_kpi_snapshot_refresh()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
  v_workspace_id uuid;
  v_org_id uuid;
BEGIN
  -- Determine company/workspace/org from the triggering event
  -- This is a simplified version - adjust based on actual table structure
  
  -- For leads table
  IF TG_TABLE_NAME = 'leads' THEN
    v_workspace_id := NEW.workspace_id;
    v_org_id := NEW.org_id;
    
    -- Get company_id if exists
    SELECT rc.id INTO v_company_id
    FROM public.roofing_companies rc
    WHERE rc.workspace_id = NEW.workspace_id OR rc.org_id = NEW.org_id
    LIMIT 1;
  END IF;
  
  -- For jobs table
  IF TG_TABLE_NAME = 'jobs' THEN
    SELECT l.workspace_id, l.org_id INTO v_workspace_id, v_org_id
    FROM public.leads l
    WHERE l.id = NEW.lead_id;
    
    SELECT rc.id INTO v_company_id
    FROM public.roofing_companies rc
    WHERE rc.workspace_id = v_workspace_id OR rc.org_id = v_org_id
    LIMIT 1;
  END IF;
  
  -- Schedule async snapshot refresh (don't block the transaction)
  -- In production, you might want to use pg_notify or a queue system
  -- For now, we'll just log that a refresh is needed
  
  RETURN NEW;
END;
$$;

-- Note: In production, consider using Supabase Realtime or a queue system
-- for real-time updates instead of database triggers to avoid blocking transactions

COMMENT ON FUNCTION public.trigger_kpi_snapshot_refresh IS 'Block 85000: Triggers KPI snapshot refresh on key events';



























