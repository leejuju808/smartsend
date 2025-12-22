-- Block 23541 — SmartSend Roofing Demo → Activation Flow v1
-- FULL PIPELINE. ZERO FLUFF. BUILT TO TURN ROOFERS INTO PAYING USERS FAST.
-- Tracks the 6-step activation pipeline from demo close to first campaign live

-- ============================================================================
-- 1. ROOFER ACTIVATION STATE TABLE
-- ============================================================================
-- Tracks where each roofer is in the activation pipeline

CREATE TABLE IF NOT EXISTS roofer_activation_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Step tracking
  step_completed INTEGER NOT NULL DEFAULT 0, -- 0-6 (0 = not started, 6 = complete)
  activation_started_at TIMESTAMPTZ,
  activation_completed_at TIMESTAMPTZ,
  
  -- Step 1: Decision Capture
  plan_selected TEXT CHECK (plan_selected IN ('starter', 'growth', 'domination')),
  plan_selected_at TIMESTAMPTZ,
  
  -- Step 2: Stripe Subscription
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  subscription_activated_at TIMESTAMPTZ,
  
  -- Step 3: Account Creation (auto-generated)
  account_created_at TIMESTAMPTZ,
  company_name TEXT,
  owner_name TEXT,
  default_timezone TEXT DEFAULT 'America/Los_Angeles',
  email_sending_domain TEXT,
  niche_profile TEXT DEFAULT 'roofing',
  
  -- Step 4: Foundation Setup
  foundation_setup_at TIMESTAMPTZ,
  primary_city TEXT,
  company_phone TEXT,
  estimate_type TEXT CHECK (estimate_type IN ('repair', 'replace', 'both')),
  has_email_list BOOLEAN,
  
  -- Step 5: Import Homeowner List
  list_imported_at TIMESTAMPTZ,
  contacts_imported_count INTEGER DEFAULT 0,
  import_method TEXT CHECK (import_method IN ('csv', 'crm', 'manual')),
  
  -- Step 6: Launch First Campaign
  first_campaign_launched_at TIMESTAMPTZ,
  first_campaign_id UUID REFERENCES campaigns(id),
  first_campaign_type TEXT CHECK (first_campaign_type IN ('homeowner_followup_revival', 'free_estimate_inspection')),
  
  -- Metadata
  demo_notes TEXT, -- Any notes from the demo call
  activated_by_user_id UUID REFERENCES auth.users(id), -- Sales rep who activated them
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_roofer_activation_workspace ON roofer_activation_state(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roofer_activation_user ON roofer_activation_state(user_id);
CREATE INDEX IF NOT EXISTS idx_roofer_activation_step ON roofer_activation_state(step_completed);
CREATE INDEX IF NOT EXISTS idx_roofer_activation_stripe_sub ON roofer_activation_state(stripe_subscription_id);

-- ============================================================================
-- 2. ACTIVATION CHECK-INS TABLE
-- ============================================================================
-- Tracks 48-hour and 7-day check-ins

CREATE TABLE IF NOT EXISTS activation_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activation_state_id UUID NOT NULL REFERENCES roofer_activation_state(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  checkin_type TEXT NOT NULL CHECK (checkin_type IN ('48_hour', '7_day', 'manual')),
  checkin_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checkin_message TEXT,
  checkin_response_received BOOLEAN DEFAULT FALSE,
  checkin_response_at TIMESTAMPTZ,
  checkin_response_text TEXT,
  
  -- Campaign stats at time of check-in
  campaign_replies_count INTEGER DEFAULT 0,
  campaign_leads_count INTEGER DEFAULT 0,
  campaign_open_rate NUMERIC(5,2),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activation_checkins_activation_state ON activation_checkins(activation_state_id);
CREATE INDEX IF NOT EXISTS idx_activation_checkins_workspace ON activation_checkins(workspace_id);
CREATE INDEX IF NOT EXISTS idx_activation_checkins_type ON activation_checkins(checkin_type);
CREATE INDEX IF NOT EXISTS idx_activation_checkins_sent_at ON activation_checkins(checkin_sent_at);

-- ============================================================================
-- 3. USAGE SCORE TABLE
-- ============================================================================
-- Tracks sending volume, replies, open rates for activation monitoring

CREATE TABLE IF NOT EXISTS activation_usage_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activation_state_id UUID NOT NULL REFERENCES roofer_activation_state(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Usage metrics
  emails_sent_count INTEGER DEFAULT 0,
  replies_received_count INTEGER DEFAULT 0,
  open_rate NUMERIC(5,2),
  reply_rate NUMERIC(5,2),
  
  -- Campaign activity
  campaigns_active_count INTEGER DEFAULT 0,
  campaigns_completed_count INTEGER DEFAULT 0,
  
  -- Calculated score (0-100)
  usage_score INTEGER DEFAULT 0, -- 0 = no usage, 100 = highly engaged
  
  -- Flags
  is_low_usage BOOLEAN DEFAULT FALSE,
  low_usage_notified_at TIMESTAMPTZ,
  
  -- Timestamps
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activation_usage_scores_activation_state ON activation_usage_scores(activation_state_id);
CREATE INDEX IF NOT EXISTS idx_activation_usage_scores_workspace ON activation_usage_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_activation_usage_scores_user ON activation_usage_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_activation_usage_scores_low_usage ON activation_usage_scores(is_low_usage) WHERE is_low_usage = TRUE;

-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_roofer_activation_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_roofer_activation_state_updated_at
BEFORE UPDATE ON roofer_activation_state
FOR EACH ROW
EXECUTE FUNCTION update_roofer_activation_state_updated_at();

CREATE OR REPLACE FUNCTION update_activation_usage_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activation_usage_scores_updated_at
BEFORE UPDATE ON activation_usage_scores
FOR EACH ROW
EXECUTE FUNCTION update_activation_usage_scores_updated_at();

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function to get activation state for a workspace
CREATE OR REPLACE FUNCTION get_roofer_activation_state(p_workspace_id UUID)
RETURNS TABLE (
  id UUID,
  workspace_id UUID,
  user_id UUID,
  step_completed INTEGER,
  plan_selected TEXT,
  activation_started_at TIMESTAMPTZ,
  activation_completed_at TIMESTAMPTZ,
  first_campaign_id UUID,
  first_campaign_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ras.id,
    ras.workspace_id,
    ras.user_id,
    ras.step_completed,
    ras.plan_selected,
    ras.activation_started_at,
    ras.activation_completed_at,
    ras.first_campaign_id,
    ras.first_campaign_type
  FROM roofer_activation_state ras
  WHERE ras.workspace_id = p_workspace_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate usage score
CREATE OR REPLACE FUNCTION calculate_activation_usage_score(p_workspace_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER := 0;
  v_emails_sent INTEGER;
  v_replies_received INTEGER;
  v_open_rate NUMERIC;
  v_campaigns_active INTEGER;
BEGIN
  -- Get email stats
  SELECT 
    COALESCE(COUNT(*), 0),
    COALESCE(SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END), 0),
    COALESCE(AVG(CASE WHEN opened_at IS NOT NULL THEN 1.0 ELSE 0.0 END) * 100, 0)
  INTO v_emails_sent, v_replies_received, v_open_rate
  FROM email_logs
  WHERE workspace_id = p_workspace_id
    AND sent_at >= now() - INTERVAL '30 days';
  
  -- Get active campaigns
  SELECT COUNT(*)
  INTO v_campaigns_active
  FROM campaigns
  WHERE workspace_id = p_workspace_id
    AND status IN ('active', 'scheduled');
  
  -- Calculate score (0-100)
  -- Base score from emails sent (max 40 points)
  v_score := LEAST(v_emails_sent / 10, 40);
  
  -- Add points for replies (max 30 points)
  IF v_replies_received > 0 THEN
    v_score := v_score + LEAST(v_replies_received * 3, 30);
  END IF;
  
  -- Add points for open rate (max 20 points)
  IF v_open_rate > 0 THEN
    v_score := v_score + LEAST((v_open_rate / 5)::INTEGER, 20);
  END IF;
  
  -- Add points for active campaigns (max 10 points)
  v_score := v_score + LEAST(v_campaigns_active * 5, 10);
  
  RETURN LEAST(v_score, 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

ALTER TABLE roofer_activation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE activation_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE activation_usage_scores ENABLE ROW LEVEL SECURITY;

-- Users can view their own activation state
CREATE POLICY "Users can view own activation state"
  ON roofer_activation_state
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all activation states
CREATE POLICY "Service role can manage activation states"
  ON roofer_activation_state
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Users can view their own check-ins
CREATE POLICY "Users can view own check-ins"
  ON activation_checkins
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all check-ins
CREATE POLICY "Service role can manage check-ins"
  ON activation_checkins
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Users can view their own usage scores
CREATE POLICY "Users can view own usage scores"
  ON activation_usage_scores
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all usage scores
CREATE POLICY "Service role can manage usage scores"
  ON activation_usage_scores
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE roofer_activation_state IS 'Block 23541: Tracks roofer activation pipeline state (6 steps from demo close to first campaign live)';
COMMENT ON TABLE activation_checkins IS 'Block 23541: Tracks 48-hour and 7-day check-ins with roofer activation progress';
COMMENT ON TABLE activation_usage_scores IS 'Block 23541: Tracks usage metrics and calculates engagement score for activation monitoring';
COMMENT ON FUNCTION get_roofer_activation_state(UUID) IS 'Block 23541: Get activation state for a workspace';
COMMENT ON FUNCTION calculate_activation_usage_score(UUID) IS 'Block 23541: Calculate usage score (0-100) based on emails sent, replies, open rate, and active campaigns';






































