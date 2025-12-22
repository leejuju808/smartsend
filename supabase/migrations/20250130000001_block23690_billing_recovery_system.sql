-- Block 23690 — SmartSend Roofing Payment Recovery + Failed Billing Engine v1
-- FULL BILLING-DEFENSE SYSTEM — ZERO FLUFF
-- 
-- This migration creates the complete payment recovery system:
-- 1. Tracks billing recovery events and states
-- 2. Manages recovery flow stages
-- 3. Enables send queue locking on billing failures
-- 4. Tracks churn prediction scores

-- ============================================================================
-- 1. Billing Recovery States Table
-- ============================================================================
-- Tracks the current recovery state for each subscription/workspace
CREATE TABLE IF NOT EXISTS billing_recovery_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id TEXT, -- Stripe subscription ID
  stripe_customer_id TEXT NOT NULL,
  recovery_phase TEXT NOT NULL DEFAULT 'none', -- 'none', 'prevent', 'recover', 'win_back'
  recovery_stage INTEGER DEFAULT 0, -- Stage within phase (0-5 for recover, 1-3 for win_back)
  billing_failed_at TIMESTAMPTZ,
  first_failure_at TIMESTAMPTZ, -- First time payment failed
  last_recovery_attempt_at TIMESTAMPTZ,
  next_action_at TIMESTAMPTZ, -- When next recovery action should be taken
  recovery_completed_at TIMESTAMPTZ,
  send_queue_locked BOOLEAN DEFAULT FALSE, -- Lock send queue when billing fails
  billing_failed_tag_applied BOOLEAN DEFAULT FALSE,
  churn_score NUMERIC DEFAULT 0, -- 0-100 churn prediction score
  engagement_score NUMERIC DEFAULT 0, -- 0-100 engagement score
  campaign_activity_count INTEGER DEFAULT 0,
  last_campaign_activity_at TIMESTAMPTZ,
  recovery_metadata JSONB DEFAULT '{}'::jsonb, -- Store additional recovery data
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_billing_recovery_workspace ON billing_recovery_states(workspace_id);
CREATE INDEX IF NOT EXISTS idx_billing_recovery_user ON billing_recovery_states(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_recovery_subscription ON billing_recovery_states(subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_recovery_stripe_customer ON billing_recovery_states(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_billing_recovery_next_action ON billing_recovery_states(next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_recovery_phase ON billing_recovery_states(recovery_phase);

-- ============================================================================
-- 2. Billing Recovery Events Table
-- ============================================================================
-- Logs every recovery action taken (emails sent, SMS sent, calls made, etc.)
CREATE TABLE IF NOT EXISTS billing_recovery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_state_id UUID NOT NULL REFERENCES billing_recovery_states(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'pre_bill_reminder', 'sms_stage_1', 'email_stage_2', 'email_stage_3', 'phone_call', 'win_back_email_1', etc.
  channel TEXT NOT NULL, -- 'email', 'sms', 'in_app', 'phone'
  subject TEXT, -- For emails
  message TEXT NOT NULL, -- Message content
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ, -- For emails
  clicked_at TIMESTAMPTZ, -- For emails/SMS with links
  responded_at TIMESTAMPTZ, -- User responded/updated card
  metadata JSONB DEFAULT '{}'::jsonb, -- Store provider message IDs, errors, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for recovery events
CREATE INDEX IF NOT EXISTS idx_billing_recovery_events_state ON billing_recovery_events(recovery_state_id);
CREATE INDEX IF NOT EXISTS idx_billing_recovery_events_workspace ON billing_recovery_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_billing_recovery_events_user ON billing_recovery_events(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_recovery_events_type ON billing_recovery_events(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_recovery_events_sent_at ON billing_recovery_events(sent_at DESC);

-- ============================================================================
-- 3. Billing Update Links Table
-- ============================================================================
-- Stores secure, time-limited links for updating payment methods
CREATE TABLE IF NOT EXISTS billing_update_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_state_id UUID NOT NULL REFERENCES billing_recovery_states(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE, -- Secure token for the link
  stripe_customer_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for update links
CREATE INDEX IF NOT EXISTS idx_billing_update_links_token ON billing_update_links(token);
CREATE INDEX IF NOT EXISTS idx_billing_update_links_recovery_state ON billing_update_links(recovery_state_id);
CREATE INDEX IF NOT EXISTS idx_billing_update_links_expires_at ON billing_update_links(expires_at) WHERE expires_at > now();

-- ============================================================================
-- 4. Pre-Bill Reminders Table
-- ============================================================================
-- Tracks pre-bill reminders sent before renewal
CREATE TABLE IF NOT EXISTS pre_bill_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL,
  renewal_date TIMESTAMPTZ NOT NULL,
  reminder_type TEXT NOT NULL, -- 'email_3_days', 'banner_48_hours'
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pre_bill_reminders_renewal_date ON pre_bill_reminders(renewal_date);
CREATE INDEX IF NOT EXISTS idx_pre_bill_reminders_workspace ON pre_bill_reminders(workspace_id);

-- ============================================================================
-- 5. Helper Functions
-- ============================================================================

-- Function to create or update recovery state
CREATE OR REPLACE FUNCTION create_or_update_recovery_state(
  p_workspace_id UUID,
  p_user_id UUID,
  p_stripe_customer_id TEXT,
  p_subscription_id TEXT,
  p_phase TEXT DEFAULT 'recover',
  p_stage INTEGER DEFAULT 1
) RETURNS UUID AS $$
DECLARE
  v_recovery_state_id UUID;
BEGIN
  -- Try to find existing recovery state
  SELECT id INTO v_recovery_state_id
  FROM billing_recovery_states
  WHERE (workspace_id = p_workspace_id OR user_id = p_user_id)
    AND stripe_customer_id = p_stripe_customer_id
  LIMIT 1;

  IF v_recovery_state_id IS NULL THEN
    -- Create new recovery state
    INSERT INTO billing_recovery_states (
      workspace_id,
      user_id,
      subscription_id,
      stripe_customer_id,
      recovery_phase,
      recovery_stage,
      billing_failed_at,
      first_failure_at,
      send_queue_locked,
      billing_failed_tag_applied
    ) VALUES (
      p_workspace_id,
      p_user_id,
      p_subscription_id,
      p_stripe_customer_id,
      p_phase,
      p_stage,
      now(),
      now(),
      TRUE,
      TRUE
    ) RETURNING id INTO v_recovery_state_id;
  ELSE
    -- Update existing recovery state
    UPDATE billing_recovery_states
    SET recovery_phase = p_phase,
        recovery_stage = p_stage,
        billing_failed_at = COALESCE(billing_failed_at, now()),
        first_failure_at = COALESCE(first_failure_at, now()),
        send_queue_locked = TRUE,
        billing_failed_tag_applied = TRUE,
        updated_at = now()
    WHERE id = v_recovery_state_id;
  END IF;

  RETURN v_recovery_state_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log recovery event
CREATE OR REPLACE FUNCTION log_recovery_event(
  p_recovery_state_id UUID,
  p_event_type TEXT,
  p_channel TEXT,
  p_message TEXT,
  p_subject TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_workspace_id UUID;
  v_user_id UUID;
BEGIN
  -- Get workspace_id and user_id from recovery state
  SELECT workspace_id, user_id INTO v_workspace_id, v_user_id
  FROM billing_recovery_states
  WHERE id = p_recovery_state_id;

  INSERT INTO billing_recovery_events (
    recovery_state_id,
    workspace_id,
    user_id,
    event_type,
    channel,
    subject,
    message,
    metadata
  ) VALUES (
    p_recovery_state_id,
    v_workspace_id,
    v_user_id,
    p_event_type,
    p_channel,
    p_subject,
    p_message,
    p_metadata
  ) RETURNING id INTO v_event_id;

  -- Update recovery state last_recovery_attempt_at
  UPDATE billing_recovery_states
  SET last_recovery_attempt_at = now(),
      updated_at = now()
  WHERE id = p_recovery_state_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create billing update link
CREATE OR REPLACE FUNCTION create_billing_update_link(
  p_recovery_state_id UUID,
  p_stripe_customer_id TEXT,
  p_expires_hours INTEGER DEFAULT 168 -- 7 days default
) RETURNS TEXT AS $$
DECLARE
  v_token TEXT;
  v_workspace_id UUID;
  v_user_id UUID;
BEGIN
  -- Generate secure token
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Get workspace_id and user_id from recovery state
  SELECT workspace_id, user_id INTO v_workspace_id, v_user_id
  FROM billing_recovery_states
  WHERE id = p_recovery_state_id;

  INSERT INTO billing_update_links (
    recovery_state_id,
    workspace_id,
    user_id,
    token,
    stripe_customer_id,
    expires_at
  ) VALUES (
    p_recovery_state_id,
    v_workspace_id,
    v_user_id,
    v_token,
    p_stripe_customer_id,
    now() + (p_expires_hours || ' hours')::INTERVAL
  );

  RETURN v_token;
END;
$$ LANGUAGE plpgsql;

-- Function to get recovery stats for churn prediction
CREATE OR REPLACE FUNCTION get_recovery_stats(p_workspace_id UUID, p_user_id UUID)
RETURNS TABLE (
  engagement_score NUMERIC,
  campaign_activity_count INTEGER,
  last_campaign_activity_at TIMESTAMPTZ,
  days_since_last_activity INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN COUNT(DISTINCT c.id) > 0 THEN LEAST(100, (COUNT(DISTINCT c.id)::NUMERIC / 10.0) * 10)
      ELSE 0
    END as engagement_score,
    COUNT(DISTINCT c.id)::INTEGER as campaign_activity_count,
    MAX(c.updated_at) as last_campaign_activity_at,
    EXTRACT(DAY FROM (now() - MAX(c.updated_at)))::INTEGER as days_since_last_activity
  FROM campaigns c
  WHERE (c.workspace_id = p_workspace_id OR c.user_id = p_user_id)
    AND c.status IN ('running', 'active', 'sending')
  GROUP BY c.workspace_id, c.user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. RLS Policies
-- ============================================================================

ALTER TABLE billing_recovery_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_recovery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_update_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_bill_reminders ENABLE ROW LEVEL SECURITY;

-- Service role can manage all recovery data
CREATE POLICY "service_role_all_recovery_states" ON billing_recovery_states
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_recovery_events" ON billing_recovery_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_update_links" ON billing_update_links
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_pre_bill_reminders" ON pre_bill_reminders
  FOR ALL USING (auth.role() = 'service_role');

-- Users can view their own recovery data
CREATE POLICY "users_view_own_recovery_states" ON billing_recovery_states
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_view_own_recovery_events" ON billing_recovery_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_view_own_update_links" ON billing_update_links
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- 7. Triggers
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_billing_recovery_states_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_billing_recovery_states_updated_at
BEFORE UPDATE ON billing_recovery_states
FOR EACH ROW
EXECUTE FUNCTION update_billing_recovery_states_updated_at();

-- ============================================================================
-- 8. Comments
-- ============================================================================

COMMENT ON TABLE billing_recovery_states IS 'Tracks billing recovery state for each subscription/workspace. Part of Block 23690 - Payment Recovery System.';
COMMENT ON TABLE billing_recovery_events IS 'Logs all recovery actions (emails, SMS, calls) sent to users. Part of Block 23690 - Payment Recovery System.';
COMMENT ON TABLE billing_update_links IS 'Secure, time-limited links for updating payment methods. Part of Block 23690 - Payment Recovery System.';
COMMENT ON TABLE pre_bill_reminders IS 'Tracks pre-bill reminders sent before renewal. Part of Block 23690 - Payment Recovery System.';






































