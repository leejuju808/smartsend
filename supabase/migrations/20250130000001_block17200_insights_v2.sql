-- =========================================================
-- Block 17200 — SmartSend Insights v2
-- The Roofer Intelligence Dashboard: Lead Heat, Storm Impact, Insurance Signals, Reply Metrics, Conversion Paths & Operational Weak Spots
-- =========================================================

-- ============================================================================
-- 1. INSIGHTS_CACHE TABLE (Main cache for dashboard data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insights_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Cached data (JSONB for flexibility)
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Cache metadata
  cache_type text NOT NULL DEFAULT 'full', -- 'full', 'lead_intelligence', 'storm', 'insurance', 'replies', 'conversions'
  calculated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One cache per workspace per type
  UNIQUE(workspace_id, cache_type)
);

CREATE INDEX IF NOT EXISTS idx_insights_cache_workspace 
  ON public.insights_cache(workspace_id, cache_type);
CREATE INDEX IF NOT EXISTS idx_insights_cache_expires 
  ON public.insights_cache(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- 2. INSIGHTS_LEADS TABLE (Lead Intelligence Panel)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insights_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Lead Heat Metrics
  avg_lead_heat numeric(5,2) DEFAULT 0,
  hot_leads_count integer DEFAULT 0,
  warm_leads_count integer DEFAULT 0,
  cold_leads_count integer DEFAULT 0,
  
  -- Lead Status Breakdown
  leads_needing_reply integer DEFAULT 0,
  neglected_leads integer DEFAULT 0, -- no contact in 48+ hours
  high_value_leads integer DEFAULT 0, -- potential_job_value > $5000
  insurance_leads_count integer DEFAULT 0,
  storm_affected_leads integer DEFAULT 0,
  leads_with_photos integer DEFAULT 0,
  
  -- Breakdown data (JSONB for detailed lists)
  hot_leads_list jsonb DEFAULT '[]'::jsonb,
  warm_leads_list jsonb DEFAULT '[]'::jsonb,
  neglected_leads_list jsonb DEFAULT '[]'::jsonb,
  high_value_leads_list jsonb DEFAULT '[]'::jsonb,
  
  -- Calculated at
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One record per workspace
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_insights_leads_workspace 
  ON public.insights_leads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insights_leads_calculated 
  ON public.insights_leads(calculated_at DESC);

-- ============================================================================
-- 3. INSIGHTS_STORM TABLE (Storm Insights Panel)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insights_storm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Storm-Affected Areas
  storm_affected_zips text[] DEFAULT '{}',
  total_storm_homes integer DEFAULT 0,
  hot_storm_homes integer DEFAULT 0,
  
  -- Storm Measurements
  hail_sizes numeric[] DEFAULT '{}', -- array of hail sizes in inches
  wind_speeds numeric[] DEFAULT '{}', -- array of wind speeds in mph
  max_hail_size numeric(4,2),
  max_wind_speed numeric(5,2),
  
  -- Storm Revenue
  potential_storm_revenue numeric(12,2) DEFAULT 0,
  storm_jobs_in_pipeline integer DEFAULT 0,
  
  -- Storm Breakdown (JSONB)
  storm_breakdown jsonb DEFAULT '[]'::jsonb, -- [{zip, homes, revenue, storm_date, storm_type}]
  recommended_neighborhoods jsonb DEFAULT '[]'::jsonb,
  suggested_storm_sequences jsonb DEFAULT '[]'::jsonb,
  
  -- Calculated at
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One record per workspace
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_insights_storm_workspace 
  ON public.insights_storm(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insights_storm_calculated 
  ON public.insights_storm(calculated_at DESC);

-- ============================================================================
-- 4. INSIGHTS_INSURANCE TABLE (Insurance Intelligence Panel)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insights_insurance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Insurance Metrics
  insurance_interest_leads integer DEFAULT 0,
  filed_claims_count integer DEFAULT 0,
  pending_claims_count integer DEFAULT 0,
  approved_claims_count integer DEFAULT 0,
  
  -- Financial Metrics
  total_deductible_value numeric(12,2) DEFAULT 0,
  avg_deductible_value numeric(12,2) DEFAULT 0,
  expected_insurance_payout numeric(12,2) DEFAULT 0,
  
  -- Adjuster Metrics
  adjuster_scheduled_leads integer DEFAULT 0,
  adjuster_contacted_leads integer DEFAULT 0,
  
  -- Performance Metrics
  insurance_win_rate numeric(5,2) DEFAULT 0, -- % of insurance leads that convert
  insurance_follow_up_tasks integer DEFAULT 0,
  
  -- Timeline Weak Spots
  avg_days_to_follow_up numeric(5,2) DEFAULT 0,
  stalled_insurance_leads integer DEFAULT 0,
  
  -- Breakdown data
  insurance_leads_list jsonb DEFAULT '[]'::jsonb,
  filed_claims_list jsonb DEFAULT '[]'::jsonb,
  adjuster_scheduled_list jsonb DEFAULT '[]'::jsonb,
  
  -- Calculated at
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One record per workspace
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_insights_insurance_workspace 
  ON public.insights_insurance(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insights_insurance_calculated 
  ON public.insights_insurance(calculated_at DESC);

-- ============================================================================
-- 5. INSIGHTS_CAMPAIGNS TABLE (Campaign Insights)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insights_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Best Performers
  best_subject_line text,
  best_subject_line_open_rate numeric(5,2),
  best_template_id uuid,
  best_template_name text,
  best_template_reply_rate numeric(5,2),
  
  -- Timing Insights
  best_time_of_day text, -- e.g., "09:00", "14:00"
  best_day_of_week text, -- e.g., "Tuesday", "Wednesday"
  
  -- List Performance
  best_list_type text,
  best_list_id uuid,
  best_list_name text,
  
  -- Performance Distribution
  open_rate_distribution jsonb DEFAULT '{}'::jsonb,
  reply_rate_distribution jsonb DEFAULT '{}'::jsonb,
  booking_rate_by_template jsonb DEFAULT '{}'::jsonb,
  
  -- Storm vs Non-Storm
  storm_campaign_performance jsonb DEFAULT '{}'::jsonb,
  non_storm_campaign_performance jsonb DEFAULT '{}'::jsonb,
  
  -- Calculated at
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One record per workspace
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_insights_campaigns_workspace 
  ON public.insights_campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insights_campaigns_calculated 
  ON public.insights_campaigns(calculated_at DESC);

-- ============================================================================
-- 6. INSIGHTS_CONVERSIONS TABLE (Conversion Path Insights)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insights_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Stage-by-Stage Flow
  cold_to_warm_count integer DEFAULT 0,
  warm_to_hot_count integer DEFAULT 0,
  hot_to_appointment_count integer DEFAULT 0,
  appointment_to_quote_count integer DEFAULT 0,
  quote_to_won_count integer DEFAULT 0,
  
  -- Conversion Rates
  cold_to_warm_rate numeric(5,2) DEFAULT 0,
  warm_to_hot_rate numeric(5,2) DEFAULT 0,
  hot_to_appointment_rate numeric(5,2) DEFAULT 0,
  appointment_to_quote_rate numeric(5,2) DEFAULT 0,
  quote_to_won_rate numeric(5,2) DEFAULT 0,
  overall_conversion_rate numeric(5,2) DEFAULT 0,
  
  -- Drop-off Rates
  drop_off_at_warm numeric(5,2) DEFAULT 0,
  drop_off_at_hot numeric(5,2) DEFAULT 0,
  drop_off_at_appointment numeric(5,2) DEFAULT 0,
  drop_off_at_quote numeric(5,2) DEFAULT 0,
  
  -- Time Metrics (average days in stage)
  avg_days_in_cold numeric(5,2) DEFAULT 0,
  avg_days_in_warm numeric(5,2) DEFAULT 0,
  avg_days_in_hot numeric(5,2) DEFAULT 0,
  avg_days_in_appointment numeric(5,2) DEFAULT 0,
  avg_days_in_quote numeric(5,2) DEFAULT 0,
  
  -- Bottlenecks
  biggest_bottleneck text, -- stage name
  bottleneck_reason text,
  
  -- Suggested Improvements
  suggested_improvements jsonb DEFAULT '[]'::jsonb,
  
  -- Calculated at
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One record per workspace
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_insights_conversions_workspace 
  ON public.insights_conversions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insights_conversions_calculated 
  ON public.insights_conversions(calculated_at DESC);

-- ============================================================================
-- 7. INSIGHTS_DANGER_REPORT TABLE (Daily Danger Report)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insights_danger_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Danger Items (JSONB array)
  danger_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Format: [{type: 'hot_lead_not_contacted', count: 2, items: [...], priority: 'high'}]
  
  -- Summary
  total_danger_items integer DEFAULT 0,
  high_priority_count integer DEFAULT 0,
  medium_priority_count integer DEFAULT 0,
  low_priority_count integer DEFAULT 0,
  
  -- Revenue at Risk
  revenue_at_risk numeric(12,2) DEFAULT 0,
  
  -- Generated at
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One report per workspace per day
  UNIQUE(workspace_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_insights_danger_report_workspace 
  ON public.insights_danger_report(workspace_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_insights_danger_report_date 
  ON public.insights_danger_report(report_date DESC);

-- ============================================================================
-- 8. INSIGHTS_REPLY_METRICS TABLE (Reply & Follow-Up Insights)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insights_reply_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Reply Metrics
  reply_rate numeric(5,2) DEFAULT 0,
  open_rate numeric(5,2) DEFAULT 0,
  unread_messages_count integer DEFAULT 0,
  avg_response_time_hours numeric(5,2) DEFAULT 0,
  
  -- Conversation Health
  stalled_conversations integer DEFAULT 0,
  missed_booking_opportunities integer DEFAULT 0,
  messages_needing_follow_up integer DEFAULT 0,
  aging_replies integer DEFAULT 0, -- replies older than 24 hours
  
  -- Breakdown
  stalled_conversations_list jsonb DEFAULT '[]'::jsonb,
  missed_opportunities_list jsonb DEFAULT '[]'::jsonb,
  follow_up_needed_list jsonb DEFAULT '[]'::jsonb,
  
  -- Calculated at
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One record per workspace
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_insights_reply_metrics_workspace 
  ON public.insights_reply_metrics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insights_reply_metrics_calculated 
  ON public.insights_reply_metrics(calculated_at DESC);

-- ============================================================================
-- 9. INSIGHTS_APPOINTMENT_METRICS TABLE (Appointment Insights)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insights_appointment_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Booking Metrics
  booking_rate numeric(5,2) DEFAULT 0,
  no_show_rate numeric(5,2) DEFAULT 0,
  best_appointment_time text, -- e.g., "09:00"
  best_appointment_day text, -- e.g., "Tuesday"
  
  -- Time Metrics
  avg_time_to_book_hours numeric(5,2) DEFAULT 0,
  avg_time_to_close_after_appointment_days numeric(5,2) DEFAULT 0,
  
  -- Usage Metrics
  scheduler_usage_percent numeric(5,2) DEFAULT 0,
  
  -- Behavior Patterns
  homeowner_behavior_patterns jsonb DEFAULT '{}'::jsonb,
  
  -- Calculated at
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One record per workspace
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_insights_appointment_metrics_workspace 
  ON public.insights_appointment_metrics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insights_appointment_metrics_calculated 
  ON public.insights_appointment_metrics(calculated_at DESC);

-- ============================================================================
-- 10. INSIGHTS_TIMELINE TABLE (Timeline Insights)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insights_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Activity Patterns
  reply_spikes jsonb DEFAULT '[]'::jsonb, -- [{date, count, type}]
  campaign_peaks jsonb DEFAULT '[]'::jsonb,
  storm_events jsonb DEFAULT '[]'::jsonb,
  insurance_claim_waves jsonb DEFAULT '[]'::jsonb,
  
  -- Time Patterns
  busiest_hours jsonb DEFAULT '{}'::jsonb, -- {hour: count}
  quiet_hours jsonb DEFAULT '{}'::jsonb,
  weekend_performance jsonb DEFAULT '{}'::jsonb,
  
  -- Calculated at
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One record per workspace
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_insights_timeline_workspace 
  ON public.insights_timeline(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insights_timeline_calculated 
  ON public.insights_timeline(calculated_at DESC);

-- ============================================================================
-- 11. UPDATE TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_insights_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply triggers to all insights tables
CREATE TRIGGER trg_insights_cache_updated_at
  BEFORE UPDATE ON public.insights_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_insights_updated_at();

CREATE TRIGGER trg_insights_leads_updated_at
  BEFORE UPDATE ON public.insights_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_insights_updated_at();

CREATE TRIGGER trg_insights_storm_updated_at
  BEFORE UPDATE ON public.insights_storm
  FOR EACH ROW EXECUTE FUNCTION public.set_insights_updated_at();

CREATE TRIGGER trg_insights_insurance_updated_at
  BEFORE UPDATE ON public.insights_insurance
  FOR EACH ROW EXECUTE FUNCTION public.set_insights_updated_at();

CREATE TRIGGER trg_insights_campaigns_updated_at
  BEFORE UPDATE ON public.insights_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_insights_updated_at();

CREATE TRIGGER trg_insights_conversions_updated_at
  BEFORE UPDATE ON public.insights_conversions
  FOR EACH ROW EXECUTE FUNCTION public.set_insights_updated_at();

CREATE TRIGGER trg_insights_danger_report_updated_at
  BEFORE UPDATE ON public.insights_danger_report
  FOR EACH ROW EXECUTE FUNCTION public.set_insights_updated_at();

CREATE TRIGGER trg_insights_reply_metrics_updated_at
  BEFORE UPDATE ON public.insights_reply_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_insights_updated_at();

CREATE TRIGGER trg_insights_appointment_metrics_updated_at
  BEFORE UPDATE ON public.insights_appointment_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_insights_updated_at();

CREATE TRIGGER trg_insights_timeline_updated_at
  BEFORE UPDATE ON public.insights_timeline
  FOR EACH ROW EXECUTE FUNCTION public.set_insights_updated_at();

-- ============================================================================
-- 12. RLS POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.insights_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_storm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_insurance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_danger_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_reply_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_appointment_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_timeline ENABLE ROW LEVEL SECURITY;

-- Policies: Users can read insights for their workspace
CREATE POLICY "Users can view insights for their workspace"
  ON public.insights_cache FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view lead insights for their workspace"
  ON public.insights_leads FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view storm insights for their workspace"
  ON public.insights_storm FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view insurance insights for their workspace"
  ON public.insights_insurance FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view campaign insights for their workspace"
  ON public.insights_campaigns FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view conversion insights for their workspace"
  ON public.insights_conversions FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view danger report for their workspace"
  ON public.insights_danger_report FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view reply metrics for their workspace"
  ON public.insights_reply_metrics FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view appointment metrics for their workspace"
  ON public.insights_appointment_metrics FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view timeline insights for their workspace"
  ON public.insights_timeline FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Service role can write (for background workers)
CREATE POLICY "Service role can write insights"
  ON public.insights_cache FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can write lead insights"
  ON public.insights_leads FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can write storm insights"
  ON public.insights_storm FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can write insurance insights"
  ON public.insights_insurance FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can write campaign insights"
  ON public.insights_campaigns FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can write conversion insights"
  ON public.insights_conversions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can write danger report"
  ON public.insights_danger_report FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can write reply metrics"
  ON public.insights_reply_metrics FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can write appointment metrics"
  ON public.insights_appointment_metrics FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can write timeline insights"
  ON public.insights_timeline FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 13. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.insights_cache IS 'Main cache table for insights dashboard data';
COMMENT ON TABLE public.insights_leads IS 'Lead Intelligence Panel: Heat scores, lead status, high-value leads';
COMMENT ON TABLE public.insights_storm IS 'Storm Insights Panel: Storm-affected areas, hail/wind data, storm revenue';
COMMENT ON TABLE public.insights_insurance IS 'Insurance Intelligence Panel: Claims, adjusters, insurance win rates';
COMMENT ON TABLE public.insights_campaigns IS 'Campaign Insights: Best performers, timing, list performance';
COMMENT ON TABLE public.insights_conversions IS 'Conversion Path Insights: Stage-by-stage flow, bottlenecks, improvements';
COMMENT ON TABLE public.insights_danger_report IS 'Daily Danger Report: Priority list of issues needing attention';
COMMENT ON TABLE public.insights_reply_metrics IS 'Reply & Follow-Up Insights: Reply rates, response times, stalled conversations';
COMMENT ON TABLE public.insights_appointment_metrics IS 'Appointment Insights: Booking rates, no-shows, best times';
COMMENT ON TABLE public.insights_timeline IS 'Timeline Insights: Activity patterns, busiest hours, weekend performance';





















































