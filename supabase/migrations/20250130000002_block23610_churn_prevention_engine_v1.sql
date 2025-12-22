-- Block 23610 — SmartSend Roofing Churn Prevention Engine v1
-- FULL RETENTION MACHINE — BUILT FOR ROOFERS, ZERO FLUFF.
-- This system eliminates churn by detecting early signals and proactively intervening.

-- ============================================================================
-- 1. USAGE MONITORING TABLE (LEVEL 1 — Automatic Tracking)
-- ============================================================================
-- Tracks campaigns sent, replies received, open rates, dashboard visits

CREATE TABLE IF NOT EXISTS roofer_usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Time period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  
  -- Usage metrics
  campaigns_launched INTEGER NOT NULL DEFAULT 0,
  campaigns_sent INTEGER NOT NULL DEFAULT 0,
  replies_received INTEGER NOT NULL DEFAULT 0,
  opens_count INTEGER NOT NULL DEFAULT 0,
  clicks_count INTEGER NOT NULL DEFAULT 0,
  dashboard_visits INTEGER NOT NULL DEFAULT 0,
  last_dashboard_visit TIMESTAMPTZ,
  
  -- Calculated metrics
  open_rate NUMERIC(5,2), -- percentage
  reply_rate NUMERIC(5,2), -- percentage
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Unique constraint: one metric per workspace per period
  UNIQUE(workspace_id, period_start, period_type)
);

CREATE INDEX IF NOT EXISTS idx_roofer_usage_workspace_period 
  ON roofer_usage_metrics(workspace_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_roofer_usage_user_period 
  ON roofer_usage_metrics(user_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_roofer_usage_last_dashboard 
  ON roofer_usage_metrics(workspace_id, last_dashboard_visit DESC NULLS LAST);

-- ============================================================================
-- 2. CHURN SIGNALS TABLE (Early Warning System — Week 1-2)
-- ============================================================================

CREATE TABLE IF NOT EXISTS churn_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Signal type
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'zero_campaigns_7d',
    'zero_replies_3d',
    'zero_replies_5d',
    'no_dashboard_visit',
    'no_email_list',
    'slow_checkin_reply',
    'busy_excuse',
    'missed_calls_2plus',
    'low_usage_45d',
    'subscription_cancelled'
  )),
  
  -- Signal details
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  metadata JSONB DEFAULT '{}'::jsonb, -- stores context like days_since_last_campaign, etc.
  
  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'intervened', 'resolved', 'dismissed')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_churn_signals_workspace_status 
  ON churn_signals(workspace_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_churn_signals_user_active 
  ON churn_signals(user_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_churn_signals_type 
  ON churn_signals(signal_type, detected_at DESC);

-- ============================================================================
-- 3. INTERVENTION HISTORY TABLE
-- ============================================================================
-- Tracks all interventions sent to roofers

CREATE TABLE IF NOT EXISTS retention_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Intervention details
  intervention_type TEXT NOT NULL CHECK (intervention_type IN (
    'script_a_easy_win',
    'script_b_low_reply',
    'script_c_dashboard_ghost',
    'script_d_busy_excuse',
    'monthly_checkin',
    'campaign_ladder_launch',
    '90_day_retention_play',
    'win_back_attempt'
  )),
  
  -- Script content (stores the actual message sent)
  script_template TEXT NOT NULL,
  message_sent TEXT NOT NULL,
  
  -- Delivery
  sent_via TEXT NOT NULL CHECK (sent_via IN ('email', 'sms', 'both')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Response tracking
  responded_at TIMESTAMPTZ,
  response_text TEXT,
  response_positive BOOLEAN, -- true if they engaged positively
  
  -- Outcome
  outcome TEXT CHECK (outcome IN ('engaged', 'no_response', 'cancelled', 'reactivated')),
  outcome_notes TEXT,
  
  -- Related entities
  related_campaign_id UUID REFERENCES campaigns(id),
  related_churn_signal_id UUID REFERENCES churn_signals(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interventions_workspace_sent 
  ON retention_interventions(workspace_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_user_type 
  ON retention_interventions(user_id, intervention_type);
CREATE INDEX IF NOT EXISTS idx_interventions_outcome 
  ON retention_interventions(outcome, sent_at DESC);

-- ============================================================================
-- 4. MONTHLY CHECK-IN TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS monthly_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Check-in period
  checkin_month DATE NOT NULL, -- First day of the month
  checkin_year INTEGER NOT NULL,
  
  -- Metrics sent
  replies_count INTEGER NOT NULL DEFAULT 0,
  leads_created INTEGER NOT NULL DEFAULT 0,
  estimated_job_value NUMERIC(12,2),
  
  -- Delivery
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_via TEXT NOT NULL CHECK (sent_via IN ('email', 'sms', 'both')),
  
  -- Response
  responded_at TIMESTAMPTZ,
  wants_next_campaign BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, checkin_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_checkins_workspace 
  ON monthly_checkins(workspace_id, checkin_month DESC);
CREATE INDEX IF NOT EXISTS idx_monthly_checkins_user 
  ON monthly_checkins(user_id, checkin_month DESC);

-- ============================================================================
-- 5. CAMPAIGN LADDER TRACKING
-- ============================================================================
-- Tracks which campaigns have been launched for each roofer

CREATE TABLE IF NOT EXISTS campaign_ladder_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Campaign details
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN (
    'lead_revival',
    'free_estimate',
    'storm_damage',
    'seasonal',
    'referral_booster',
    'review_5star',
    'upsell_gutters',
    'upsell_fascia',
    'upsell_siding'
  )),
  
  -- Launch details
  launched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  launched_by TEXT NOT NULL DEFAULT 'system' CHECK (launched_by IN ('system', 'user', 'support')),
  
  -- Results
  replies_count INTEGER DEFAULT 0,
  opens_count INTEGER DEFAULT 0,
  leads_created INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_ladder_workspace 
  ON campaign_ladder_history(workspace_id, launched_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_ladder_user 
  ON campaign_ladder_history(user_id, launched_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_ladder_type 
  ON campaign_ladder_history(campaign_type, launched_at DESC);

-- ============================================================================
-- 6. WIN-BACK ATTEMPTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS winback_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Cancellation details
  cancelled_at TIMESTAMPTZ NOT NULL,
  cancellation_reason TEXT,
  
  -- Win-back attempt
  attempt_number INTEGER NOT NULL DEFAULT 1,
  message_sent TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_via TEXT NOT NULL CHECK (sent_via IN ('email', 'sms', 'both')),
  
  -- Campaign launched for win-back
  winback_campaign_id UUID REFERENCES campaigns(id),
  
  -- Response
  responded_at TIMESTAMPTZ,
  reactivated BOOLEAN DEFAULT FALSE,
  reactivated_at TIMESTAMPTZ,
  
  -- Outcome
  outcome TEXT CHECK (outcome IN ('reactivated', 'no_response', 'declined', 'pending')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_winback_workspace 
  ON winback_attempts(workspace_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_winback_user 
  ON winback_attempts(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_winback_outcome 
  ON winback_attempts(outcome, sent_at DESC);

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Function to record usage metrics
CREATE OR REPLACE FUNCTION record_roofer_usage(
  p_workspace_id UUID,
  p_user_id UUID,
  p_metric_type TEXT, -- 'campaign_launched', 'campaign_sent', 'reply_received', 'open', 'click', 'dashboard_visit'
  p_count INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_period_type TEXT := 'daily';
BEGIN
  -- Set period to today
  v_period_start := date_trunc('day', now());
  v_period_end := v_period_start + interval '1 day';
  
  -- Upsert usage metrics
  INSERT INTO roofer_usage_metrics (
    workspace_id,
    user_id,
    period_start,
    period_end,
    period_type,
    campaigns_launched,
    campaigns_sent,
    replies_received,
    opens_count,
    clicks_count,
    dashboard_visits,
    last_dashboard_visit
  )
  VALUES (
    p_workspace_id,
    p_user_id,
    v_period_start,
    v_period_end,
    v_period_type,
    CASE WHEN p_metric_type = 'campaign_launched' THEN p_count ELSE 0 END,
    CASE WHEN p_metric_type = 'campaign_sent' THEN p_count ELSE 0 END,
    CASE WHEN p_metric_type = 'reply_received' THEN p_count ELSE 0 END,
    CASE WHEN p_metric_type = 'open' THEN p_count ELSE 0 END,
    CASE WHEN p_metric_type = 'click' THEN p_count ELSE 0 END,
    CASE WHEN p_metric_type = 'dashboard_visit' THEN p_count ELSE 0 END,
    CASE WHEN p_metric_type = 'dashboard_visit' THEN now() ELSE NULL END
  )
  ON CONFLICT (workspace_id, period_start, period_type)
  DO UPDATE SET
    campaigns_launched = roofer_usage_metrics.campaigns_launched + 
      CASE WHEN p_metric_type = 'campaign_launched' THEN p_count ELSE 0 END,
    campaigns_sent = roofer_usage_metrics.campaigns_sent + 
      CASE WHEN p_metric_type = 'campaign_sent' THEN p_count ELSE 0 END,
    replies_received = roofer_usage_metrics.replies_received + 
      CASE WHEN p_metric_type = 'reply_received' THEN p_count ELSE 0 END,
    opens_count = roofer_usage_metrics.opens_count + 
      CASE WHEN p_metric_type = 'open' THEN p_count ELSE 0 END,
    clicks_count = roofer_usage_metrics.clicks_count + 
      CASE WHEN p_metric_type = 'click' THEN p_count ELSE 0 END,
    dashboard_visits = roofer_usage_metrics.dashboard_visits + 
      CASE WHEN p_metric_type = 'dashboard_visit' THEN p_count ELSE 0 END,
    last_dashboard_visit = CASE 
      WHEN p_metric_type = 'dashboard_visit' THEN now()
      ELSE roofer_usage_metrics.last_dashboard_visit
    END,
    updated_at = now();
END;
$$;

-- Function to detect churn signals
CREATE OR REPLACE FUNCTION detect_churn_signals(p_workspace_id UUID)
RETURNS TABLE(signal_type TEXT, severity TEXT, metadata JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_days_since_signup INTEGER;
  v_campaigns_last_7d INTEGER;
  v_replies_last_3d INTEGER;
  v_replies_last_5d INTEGER;
  v_last_dashboard_visit TIMESTAMPTZ;
  v_has_email_list BOOLEAN;
  v_days_since_last_campaign INTEGER;
BEGIN
  -- Get workspace user
  SELECT owner_id INTO v_user_id
  FROM workspaces
  WHERE id = p_workspace_id;
  
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get days since signup
  SELECT EXTRACT(DAY FROM (now() - created_at))::INTEGER INTO v_days_since_signup
  FROM workspaces
  WHERE id = p_workspace_id;
  
  -- Only check signals for week 1-2 (days 1-14)
  IF v_days_since_signup > 14 THEN
    RETURN;
  END IF;
  
  -- Check: 0 campaigns launched in 7 days
  SELECT COALESCE(SUM(campaigns_launched), 0) INTO v_campaigns_last_7d
  FROM roofer_usage_metrics
  WHERE workspace_id = p_workspace_id
    AND period_start >= now() - interval '7 days';
  
  IF v_campaigns_last_7d = 0 THEN
    signal_type := 'zero_campaigns_7d';
    severity := 'high';
    metadata := jsonb_build_object('days_since_signup', v_days_since_signup);
    RETURN NEXT;
  END IF;
  
  -- Check: 0 replies in first 3-5 days
  SELECT COALESCE(SUM(replies_received), 0) INTO v_replies_last_3d
  FROM roofer_usage_metrics
  WHERE workspace_id = p_workspace_id
    AND period_start >= now() - interval '3 days';
  
  IF v_replies_last_3d = 0 AND v_days_since_signup >= 3 THEN
    signal_type := 'zero_replies_3d';
    severity := 'medium';
    metadata := jsonb_build_object('days_since_signup', v_days_since_signup);
    RETURN NEXT;
  END IF;
  
  SELECT COALESCE(SUM(replies_received), 0) INTO v_replies_last_5d
  FROM roofer_usage_metrics
  WHERE workspace_id = p_workspace_id
    AND period_start >= now() - interval '5 days';
  
  IF v_replies_last_5d = 0 AND v_days_since_signup >= 5 THEN
    signal_type := 'zero_replies_5d';
    severity := 'high';
    metadata := jsonb_build_object('days_since_signup', v_days_since_signup);
    RETURN NEXT;
  END IF;
  
  -- Check: User hasn't opened SmartSend dashboard
  SELECT MAX(last_dashboard_visit) INTO v_last_dashboard_visit
  FROM roofer_usage_metrics
  WHERE workspace_id = p_workspace_id;
  
  IF v_last_dashboard_visit IS NULL OR v_last_dashboard_visit < now() - interval '3 days' THEN
    signal_type := 'no_dashboard_visit';
    severity := 'medium';
    metadata := jsonb_build_object(
      'days_since_signup', v_days_since_signup,
      'last_visit', v_last_dashboard_visit
    );
    RETURN NEXT;
  END IF;
  
  -- Check: Added no email list (check contacts table)
  SELECT EXISTS(
    SELECT 1 FROM contacts WHERE workspace_id = p_workspace_id LIMIT 1
  ) INTO v_has_email_list;
  
  IF NOT v_has_email_list AND v_days_since_signup >= 2 THEN
    signal_type := 'no_email_list';
    severity := 'high';
    metadata := jsonb_build_object('days_since_signup', v_days_since_signup);
    RETURN NEXT;
  END IF;
  
  RETURN;
END;
$$;

-- Function to get monthly metrics for check-in
CREATE OR REPLACE FUNCTION get_monthly_checkin_metrics(p_workspace_id UUID, p_month_start DATE)
RETURNS TABLE(
  replies_count INTEGER,
  leads_created INTEGER,
  estimated_job_value NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_replies INTEGER;
  v_leads INTEGER;
  v_value NUMERIC;
BEGIN
  -- Get replies count for the month
  SELECT COALESCE(SUM(replies_received), 0)::INTEGER INTO v_replies
  FROM roofer_usage_metrics
  WHERE workspace_id = p_workspace_id
    AND period_start >= p_month_start
    AND period_start < p_month_start + interval '1 month';
  
  -- Get leads created (from leads table)
  SELECT COUNT(*)::INTEGER INTO v_leads
  FROM leads
  WHERE workspace_id = p_workspace_id
    AND created_at >= p_month_start
    AND created_at < p_month_start + interval '1 month';
  
  -- Estimate job value (placeholder - would need actual job/estimate data)
  v_value := v_leads * 5000.00; -- $5k average per lead estimate
  
  RETURN QUERY SELECT v_replies, v_leads, v_value;
END;
$$;

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================

ALTER TABLE roofer_usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE churn_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_ladder_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE winback_attempts ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "service_role_full_access_usage" ON roofer_usage_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_signals" ON churn_signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_interventions" ON retention_interventions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_checkins" ON monthly_checkins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_ladder" ON campaign_ladder_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_winback" ON winback_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Users can read their own data
CREATE POLICY "users_read_own_usage" ON roofer_usage_metrics
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_read_own_signals" ON churn_signals
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_read_own_interventions" ON retention_interventions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_read_own_checkins" ON monthly_checkins
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_read_own_ladder" ON campaign_ladder_history
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_read_own_winback" ON winback_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============================================================================
-- 9. TRIGGERS FOR AUTOMATIC TRACKING
-- ============================================================================

-- Trigger to track campaign launches
CREATE OR REPLACE FUNCTION track_campaign_launch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only track when campaign status changes to 'active' or 'running'
  IF NEW.status IN ('active', 'running') AND (OLD.status IS NULL OR OLD.status NOT IN ('active', 'running')) THEN
    PERFORM record_roofer_usage(
      NEW.workspace_id,
      (SELECT owner_id FROM workspaces WHERE id = NEW.workspace_id),
      'campaign_launched',
      1
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_track_campaign_launch
AFTER INSERT OR UPDATE ON campaigns
FOR EACH ROW
WHEN (NEW.status IN ('active', 'running'))
EXECUTE FUNCTION track_campaign_launch();

-- Trigger to track dashboard visits (would be called from application code)
-- This is a placeholder - actual implementation would track via API endpoint

-- ============================================================================
-- 10. GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION record_roofer_usage(UUID, UUID, TEXT, INTEGER) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION detect_churn_signals(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_monthly_checkin_metrics(UUID, DATE) TO service_role;






































