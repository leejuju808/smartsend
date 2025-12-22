-- ============================================================================
-- Block 23870 — SmartSend Roofing Analytics + Insights v1
-- Dashboard Metrics • Lead Insights • Revenue Tracking • Upgrade Prompts
-- ============================================================================

-- ============================================================================
-- PART 1: ANALYTICS METRICS TABLES
-- ============================================================================

-- Table to store calculated dashboard metrics per workspace/user
CREATE TABLE IF NOT EXISTS public.analytics_dashboard_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Core 6 Metrics
  replies_received INTEGER NOT NULL DEFAULT 0,
  leads_created INTEGER NOT NULL DEFAULT 0, -- HOT + WARM leads
  booked_estimates INTEGER NOT NULL DEFAULT 0,
  estimated_job_value NUMERIC(12, 2) NOT NULL DEFAULT 0, -- in dollars
  campaign_performance_score TEXT CHECK (campaign_performance_score IN ('A', 'B', 'C', 'D')),
  
  -- Breakdown metrics
  hot_leads_count INTEGER NOT NULL DEFAULT 0,
  warm_leads_count INTEGER NOT NULL DEFAULT 0,
  questions_count INTEGER NOT NULL DEFAULT 0,
  not_interested_count INTEGER NOT NULL DEFAULT 0,
  
  -- Period tracking
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'all_time' CHECK (period_type IN ('all_time', '7d', '30d', '90d', 'monthly')),
  
  -- Calculated at
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, period_start, period_end, period_type)
);

CREATE INDEX IF NOT EXISTS idx_analytics_dashboard_workspace 
  ON public.analytics_dashboard_metrics(workspace_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_dashboard_user 
  ON public.analytics_dashboard_metrics(user_id, period_start DESC);

-- ============================================================================
-- PART 2: CAMPAIGN PERFORMANCE SCORES
-- ============================================================================

-- Table to store campaign performance grades
CREATE TABLE IF NOT EXISTS public.analytics_campaign_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  
  -- Performance metrics
  open_rate NUMERIC(5, 2) NOT NULL DEFAULT 0, -- percentage
  reply_rate NUMERIC(5, 2) NOT NULL DEFAULT 0, -- percentage
  conversion_rate NUMERIC(5, 2) NOT NULL DEFAULT 0, -- percentage (replies -> booked)
  
  -- Grade (A, B, C, D)
  grade TEXT NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D')),
  
  -- Calculation details
  emails_sent INTEGER NOT NULL DEFAULT 0,
  emails_opened INTEGER NOT NULL DEFAULT 0,
  emails_replied INTEGER NOT NULL DEFAULT 0,
  leads_converted INTEGER NOT NULL DEFAULT 0,
  
  -- Period
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  UNIQUE(campaign_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_analytics_campaign_scores_campaign 
  ON public.analytics_campaign_scores(campaign_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_campaign_scores_workspace 
  ON public.analytics_campaign_scores(workspace_id, calculated_at DESC);

-- ============================================================================
-- PART 3: AI-GENERATED INSIGHTS
-- ============================================================================

-- Table to store AI-generated insights for roofers
CREATE TABLE IF NOT EXISTS public.analytics_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Insight details
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'performance_comparison',
    'growth_opportunity',
    'campaign_recommendation',
    'lead_alert',
    'storm_opportunity',
    'upgrade_prompt'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL, -- The actual insight text
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Related entities
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb, -- Store additional context
  
  -- Status
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ -- Some insights expire (e.g., storm alerts)
);

CREATE INDEX IF NOT EXISTS idx_analytics_insights_workspace 
  ON public.analytics_insights(workspace_id, created_at DESC, is_dismissed);
CREATE INDEX IF NOT EXISTS idx_analytics_insights_user 
  ON public.analytics_insights(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_insights_type 
  ON public.analytics_insights(insight_type, priority, created_at DESC);

-- ============================================================================
-- PART 4: ESTIMATED REVENUE TRACKING
-- ============================================================================

-- Table to track estimated revenue per lead/workspace
CREATE TABLE IF NOT EXISTS public.analytics_revenue_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Lead classification
  lead_classification TEXT NOT NULL CHECK (lead_classification IN ('HOT', 'WARM', 'COLD', 'NOT_INTERESTED')),
  
  -- Revenue calculation
  estimated_ticket_price NUMERIC(12, 2) NOT NULL DEFAULT 12000, -- Default $12k for roofing
  conversion_probability NUMERIC(5, 2) NOT NULL DEFAULT 1.0, -- 1.0 for HOT, 0.25 for WARM
  estimated_value NUMERIC(12, 2) NOT NULL, -- ticket_price * probability
  
  -- Status tracking
  is_booked BOOLEAN NOT NULL DEFAULT false,
  booked_at TIMESTAMPTZ,
  actual_value NUMERIC(12, 2), -- Actual job value if booked
  
  -- Timestamps
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_revenue_workspace 
  ON public.analytics_revenue_estimates(workspace_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_revenue_lead 
  ON public.analytics_revenue_estimates(lead_id);
CREATE INDEX IF NOT EXISTS idx_analytics_revenue_classification 
  ON public.analytics_revenue_estimates(lead_classification, is_booked);

-- ============================================================================
-- PART 5: ACTIVITY TIMELINE (Enhanced)
-- ============================================================================

-- Add workspace_id to lead_timeline_events if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'lead_timeline_events' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE lead_timeline_events ADD COLUMN workspace_id UUID;
  END IF;
END $$;

-- Add campaign_id if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'lead_timeline_events' AND column_name = 'campaign_id'
  ) THEN
    ALTER TABLE lead_timeline_events ADD COLUMN campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_timeline_workspace 
  ON lead_timeline_events(workspace_id, created_at DESC);

-- ============================================================================
-- PART 6: UPGRADE PROMPTS TRACKING
-- ============================================================================

-- Table to track upgrade prompts shown to users
CREATE TABLE IF NOT EXISTS public.analytics_upgrade_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Prompt details
  prompt_type TEXT NOT NULL CHECK (prompt_type IN (
    'starter_to_growth',
    'growth_to_domination',
    'email_limit_reached',
    'campaign_limit_reached',
    'high_performance',
    'storm_opportunity'
  )),
  current_plan TEXT NOT NULL,
  suggested_plan TEXT NOT NULL,
  
  -- Trigger metrics
  trigger_metric TEXT NOT NULL, -- e.g., 'replies_received', 'campaigns_active'
  trigger_value NUMERIC NOT NULL,
  
  -- Status
  is_shown BOOLEAN NOT NULL DEFAULT false,
  shown_at TIMESTAMPTZ,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  converted_to_plan TEXT, -- If they upgraded
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_upgrade_prompts_workspace 
  ON public.analytics_upgrade_prompts(workspace_id, created_at DESC, is_dismissed);
CREATE INDEX IF NOT EXISTS idx_analytics_upgrade_prompts_user 
  ON public.analytics_upgrade_prompts(user_id, is_shown, is_dismissed);

-- ============================================================================
-- PART 7: SECONDARY METRICS (Open Rate Trends, Reply Breakdowns)
-- ============================================================================

-- Table for daily metrics aggregation
CREATE TABLE IF NOT EXISTS public.analytics_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  date DATE NOT NULL,
  
  -- Email metrics
  emails_sent INTEGER NOT NULL DEFAULT 0,
  emails_opened INTEGER NOT NULL DEFAULT 0,
  emails_replied INTEGER NOT NULL DEFAULT 0,
  open_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  reply_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  
  -- Lead metrics
  hot_leads INTEGER NOT NULL DEFAULT 0,
  warm_leads INTEGER NOT NULL DEFAULT 0,
  questions INTEGER NOT NULL DEFAULT 0,
  not_interested INTEGER NOT NULL DEFAULT 0,
  
  -- Campaign activity
  campaigns_active INTEGER NOT NULL DEFAULT 0,
  campaigns_launched INTEGER NOT NULL DEFAULT 0,
  campaigns_paused INTEGER NOT NULL DEFAULT 0,
  
  -- Calculated at
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_metrics_workspace 
  ON public.analytics_daily_metrics(workspace_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_metrics_date_range 
  ON public.analytics_daily_metrics(workspace_id, date);

-- ============================================================================
-- PART 8: RLS POLICIES
-- ============================================================================

ALTER TABLE public.analytics_dashboard_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_campaign_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_revenue_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_upgrade_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_daily_metrics ENABLE ROW LEVEL SECURITY;

-- Dashboard metrics: Users can view their workspace metrics
CREATE POLICY "Users can view dashboard metrics"
  ON public.analytics_dashboard_metrics
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- Campaign scores: Users can view scores for campaigns they have access to
CREATE POLICY "Users can view campaign scores"
  ON public.analytics_campaign_scores
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Insights: Users can view insights for their workspace
CREATE POLICY "Users can view insights"
  ON public.analytics_insights
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Users can update insights"
  ON public.analytics_insights
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- Revenue estimates: Users can view revenue estimates for their workspace
CREATE POLICY "Users can view revenue estimates"
  ON public.analytics_revenue_estimates
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Upgrade prompts: Users can view and update their own prompts
CREATE POLICY "Users can manage upgrade prompts"
  ON public.analytics_upgrade_prompts
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- Daily metrics: Users can view daily metrics for their workspace
CREATE POLICY "Users can view daily metrics"
  ON public.analytics_daily_metrics
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 9: ADD AVERAGE TICKET PRICE TO USER SETTINGS
-- ============================================================================

-- Add average_ticket_price column to user_settings if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_settings' AND column_name = 'average_ticket_price'
  ) THEN
    ALTER TABLE public.user_settings ADD COLUMN average_ticket_price NUMERIC(12, 2) DEFAULT 12000;
  END IF;
END $$;

-- ============================================================================
-- PART 10: HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate campaign performance grade
CREATE OR REPLACE FUNCTION public.calculate_campaign_grade(
  p_open_rate NUMERIC,
  p_reply_rate NUMERIC,
  p_conversion_rate NUMERIC
) RETURNS TEXT AS $$
BEGIN
  -- Grade calculation:
  -- A: open_rate > 30% AND reply_rate > 5% AND conversion_rate > 2%
  -- B: open_rate > 20% AND reply_rate > 3% AND conversion_rate > 1%
  -- C: open_rate > 10% AND reply_rate > 1%
  -- D: Everything else
  
  IF p_open_rate >= 30 AND p_reply_rate >= 5 AND p_conversion_rate >= 2 THEN
    RETURN 'A';
  ELSIF p_open_rate >= 20 AND p_reply_rate >= 3 AND p_conversion_rate >= 1 THEN
    RETURN 'B';
  ELSIF p_open_rate >= 10 AND p_reply_rate >= 1 THEN
    RETURN 'C';
  ELSE
    RETURN 'D';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate estimated revenue for a lead
CREATE OR REPLACE FUNCTION public.calculate_lead_revenue(
  p_classification TEXT,
  p_default_ticket NUMERIC DEFAULT 12000
) RETURNS NUMERIC AS $$
DECLARE
  v_probability NUMERIC;
BEGIN
  -- HOT leads: 100% probability
  -- WARM leads: 25% probability
  -- COLD leads: 5% probability
  -- NOT_INTERESTED: 0% probability
  
  CASE p_classification
    WHEN 'HOT' THEN v_probability := 1.0;
    WHEN 'WARM' THEN v_probability := 0.25;
    WHEN 'COLD' THEN v_probability := 0.05;
    ELSE v_probability := 0.0;
  END CASE;
  
  RETURN p_default_ticket * v_probability;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get workspace_id from lead_id
CREATE OR REPLACE FUNCTION public.get_lead_workspace_id(p_lead_id UUID)
RETURNS UUID AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = p_lead_id;
  
  RETURN v_workspace_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- PART 11: VIEWS FOR EASY QUERYING
-- ============================================================================

-- View for current dashboard metrics (most recent period)
CREATE OR REPLACE VIEW public.v_dashboard_metrics_current AS
SELECT DISTINCT ON (workspace_id)
  *
FROM public.analytics_dashboard_metrics
ORDER BY workspace_id, calculated_at DESC;

-- View for campaign performance summary
CREATE OR REPLACE VIEW public.v_campaign_performance_summary AS
SELECT DISTINCT ON (campaign_id)
  campaign_id,
  workspace_id,
  grade,
  open_rate,
  reply_rate,
  conversion_rate,
  emails_sent,
  calculated_at
FROM public.analytics_campaign_scores
ORDER BY campaign_id, calculated_at DESC;

-- View for active insights (not dismissed, not expired)
CREATE OR REPLACE VIEW public.v_active_insights AS
SELECT *
FROM public.analytics_insights
WHERE is_dismissed = false
  AND (expires_at IS NULL OR expires_at > now())
ORDER BY 
  CASE priority
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  created_at DESC;

-- View for revenue summary by workspace
CREATE OR REPLACE VIEW public.v_revenue_summary AS
SELECT
  workspace_id,
  COUNT(*) FILTER (WHERE lead_classification = 'HOT') as hot_leads_count,
  COUNT(*) FILTER (WHERE lead_classification = 'WARM') as warm_leads_count,
  SUM(estimated_value) FILTER (WHERE lead_classification = 'HOT') as hot_leads_value,
  SUM(estimated_value) FILTER (WHERE lead_classification = 'WARM') as warm_leads_value,
  SUM(estimated_value) as total_estimated_value,
  COUNT(*) FILTER (WHERE is_booked = true) as booked_count,
  SUM(actual_value) FILTER (WHERE is_booked = true) as booked_value
FROM public.analytics_revenue_estimates
GROUP BY workspace_id;

