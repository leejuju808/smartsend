-- Block 95000 — Dynamic Coaching Agent + Action Scoring Model
-- Coaching Brain of SmartSend: Tells roofers exactly what to do every day

-- ============================================================================
-- 1️⃣ COACHING ACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS coaching_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  points INT NOT NULL,
  trigger_type TEXT NOT NULL, -- "no_replies", "hot_lead", "idle_user", "daily", etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coaching_actions_key ON coaching_actions(key);
CREATE INDEX IF NOT EXISTS idx_coaching_actions_trigger_type ON coaching_actions(trigger_type);
CREATE INDEX IF NOT EXISTS idx_coaching_actions_points ON coaching_actions(points DESC);

-- ============================================================================
-- 2️⃣ USER ACTIONS LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_actions_user_id ON user_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_actions_action_key ON user_actions(action_key);
CREATE INDEX IF NOT EXISTS idx_user_actions_created_at ON user_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_actions_user_created ON user_actions(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE user_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own actions
CREATE POLICY "user_actions_select_own" ON user_actions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_actions_insert_own" ON user_actions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "user_actions_service_role_all" ON user_actions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 3️⃣ SEED COACHING ACTIONS
-- ============================================================================

INSERT INTO coaching_actions (key, description, points, trigger_type) VALUES
  ('respond_to_hot_leads', 'You have hot leads waiting. Response time = money. Follow up now.', 100, 'hot_lead'),
  ('follow_up_old_leads', 'Old leads need attention. Bring these deals back to life.', 70, 'no_replies'),
  ('send_daily_batch', 'Keep your pipeline full. Send your daily outreach batch.', 50, 'daily'),
  ('personalize_opener', 'Personalize your opener to boost reply rates.', 40, 'daily'),
  ('complete_onboarding_step', 'Complete your onboarding to unlock more features.', 30, 'idle_user'),
  ('check_campaign_health', 'Check your campaign health to fix dead sequences.', 20, 'daily')
ON CONFLICT (key) DO NOTHING;


























