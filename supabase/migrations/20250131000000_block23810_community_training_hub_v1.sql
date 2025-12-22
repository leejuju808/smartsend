-- Block 23810 — SmartSend Roofing Community + Training Hub v1
-- Private Roofer Community • Training Hub • Live Calls • Retention & Upgrade Engine

-- ============================================================================
-- 1. COMMUNITY POSTS (Slack/Circle Integration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('wins', 'campaign-ideas', 'support', 'training-videos', 'leaderboard', 'storms')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  video_url TEXT, -- For training-videos channel
  external_id TEXT, -- Slack/Circle message ID for sync
  external_url TEXT, -- Link to Slack/Circle post
  likes_count INT NOT NULL DEFAULT 0,
  replies_count INT NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE, -- For story highlights
  metadata JSONB DEFAULT '{}'::jsonb, -- Store campaign_id, booked_estimates, revenue, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_posts_channel ON community_posts(channel);
CREATE INDEX IF NOT EXISTS idx_community_posts_org ON community_posts(org_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_featured ON community_posts(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(created_at DESC);

-- Community post replies
CREATE TABLE IF NOT EXISTS community_post_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  external_id TEXT, -- Slack/Circle reply ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_replies_post ON community_post_replies(post_id);
CREATE INDEX IF NOT EXISTS idx_community_replies_user ON community_post_replies(user_id);

-- Community post likes
CREATE TABLE IF NOT EXISTS community_post_likes (
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- ============================================================================
-- 2. TRAINING HUB MODULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS training_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_number INT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  video_url TEXT,
  video_duration_seconds INT, -- Duration in seconds
  content TEXT, -- Additional text content
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Training module progress tracking
CREATE TABLE IF NOT EXISTS training_module_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ,
  progress_percentage INT NOT NULL DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  last_watched_at TIMESTAMPTZ,
  watch_time_seconds INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_training_progress_user ON training_module_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_training_progress_module ON training_module_progress(module_id);
CREATE INDEX IF NOT EXISTS idx_training_progress_org ON training_module_progress(org_id);

-- ============================================================================
-- 3. WEEKLY LIVE CALLS ("SmartSend Roofing Lab")
-- ============================================================================

CREATE TABLE IF NOT EXISTS live_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  theme TEXT NOT NULL, -- 'seasonal-campaign', 'storm-prep', 'inspection-leads', 'follow-up', 'dashboard'
  zoom_url TEXT NOT NULL,
  zoom_meeting_id TEXT,
  zoom_password TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 25,
  recording_url TEXT, -- After call ends
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_calls_scheduled ON live_calls(scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_calls_active ON live_calls(is_active) WHERE is_active = TRUE;

-- Live call registrations
CREATE TABLE IF NOT EXISTS live_call_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES live_calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  attended BOOLEAN NOT NULL DEFAULT FALSE,
  attended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(call_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_call_registrations_call ON live_call_registrations(call_id);
CREATE INDEX IF NOT EXISTS idx_call_registrations_user ON live_call_registrations(user_id);

-- ============================================================================
-- 4. MONTHLY CAMPAIGN LAUNCH DAYS
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaign_launch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Monthly SmartSend Roofing Campaign Launch',
  description TEXT NOT NULL,
  campaign_template_id UUID, -- Reference to campaign template
  message_template TEXT NOT NULL,
  target_homeowners TEXT, -- Description of target audience
  timing TEXT, -- When to send
  automation_config JSONB DEFAULT '{}'::jsonb, -- Automation settings
  follow_up_config JSONB DEFAULT '{}'::jsonb, -- Follow-up sequence
  scheduled_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_launch_events_scheduled ON campaign_launch_events(scheduled_at DESC);

-- Campaign launch participants (roofers who want the campaign launched for them)
CREATE TABLE IF NOT EXISTS campaign_launch_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES campaign_launch_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  campaign_id UUID, -- Created campaign ID after launch
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'campaign_created', 'launched')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_launch_participants_event ON campaign_launch_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_launch_participants_user ON campaign_launch_participants(user_id);

-- ============================================================================
-- 5. LEADERBOARDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL, -- Start of leaderboard period (monthly/weekly)
  period_end TIMESTAMPTZ NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('replies', 'booked_estimates', 'revenue_generated')),
  score INT NOT NULL DEFAULT 0,
  rank_position INT,
  metadata JSONB DEFAULT '{}'::jsonb, -- Store detailed stats
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_start, period_end, category)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_period ON leaderboard_entries(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_leaderboard_category ON leaderboard_entries(category);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank ON leaderboard_entries(category, period_start, period_end, rank_position);

-- Leaderboard winners (top 3 per category per period)
CREATE TABLE IF NOT EXISTS leaderboard_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES leaderboard_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  rank_position INT NOT NULL CHECK (rank_position IN (1, 2, 3)),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  reward_type TEXT CHECK (reward_type IN ('campaign_review', 'spotlight_post', 'bonus_templates')),
  reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_winners_period ON leaderboard_winners(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_leaderboard_winners_category ON leaderboard_winners(category, rank_position);

-- ============================================================================
-- 6. STORY HIGHLIGHTS (Success Stories)
-- ============================================================================

CREATE TABLE IF NOT EXISTS story_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  highlight_type TEXT NOT NULL CHECK (highlight_type IN ('booked_estimates', 'revenue', 'campaign_success', 'storm_success')),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb, -- { booked_estimates: 6, revenue: 28000, etc. }
  featured_image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  featured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_highlights_active ON story_highlights(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_story_highlights_featured ON story_highlights(featured_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_highlights_user ON story_highlights(user_id);

-- ============================================================================
-- 7. ASK-ME-ANYTHING (AMA) SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS ama_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  zoom_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ama_sessions_scheduled ON ama_sessions(scheduled_at DESC);

-- AMA questions
CREATE TABLE IF NOT EXISTS ama_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ama_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  category TEXT CHECK (category IN ('sales', 'follow-up', 'messaging', 'scaling', 'general')),
  answered BOOLEAN NOT NULL DEFAULT FALSE,
  answer TEXT,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ama_questions_session ON ama_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_ama_questions_user ON ama_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_ama_questions_answered ON ama_questions(answered) WHERE answered = FALSE;

-- ============================================================================
-- 8. STORM ALERTS (Community Channel Integration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS storm_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_regions TEXT[] NOT NULL, -- Array of cities/states
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('hurricane', 'hail', 'wind', 'tornado', 'snow', 'ice')),
  alert_date DATE NOT NULL,
  campaign_template_id UUID, -- Suggested campaign template
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  posted_to_community BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storm_alerts_date ON storm_alerts(alert_date DESC);
CREATE INDEX IF NOT EXISTS idx_storm_alerts_active ON storm_alerts(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_storm_alerts_severity ON storm_alerts(severity);

-- Storm alert views (track which roofers saw the alert)
CREATE TABLE IF NOT EXISTS storm_alert_views (
  alert_id UUID NOT NULL REFERENCES storm_alerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  campaign_launched BOOLEAN NOT NULL DEFAULT FALSE,
  campaign_id UUID, -- If they launched a campaign from this alert
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_storm_views_user ON storm_alert_views(user_id);

-- ============================================================================
-- 9. COMMUNITY INTEGRATION SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS community_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('slack', 'circle')),
  workspace_id TEXT NOT NULL, -- Slack workspace ID or Circle space ID
  access_token TEXT NOT NULL, -- Encrypted token
  webhook_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_community_integrations_org ON community_integrations(org_id);

-- ============================================================================
-- 10. UPGRADE TRACKING (Social Proof-Driven Upgrades)
-- ============================================================================

CREATE TABLE IF NOT EXISTS upgrade_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  from_plan TEXT NOT NULL,
  to_plan TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('community_social_proof', 'leaderboard', 'campaign_launch', 'training_completion', 'manual')),
  trigger_metadata JSONB DEFAULT '{}'::jsonb, -- What specifically triggered the upgrade
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upgrade_events_user ON upgrade_events(user_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_events_trigger ON upgrade_events(trigger_type);

-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================

-- Update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_community_posts_updated_at
  BEFORE UPDATE ON community_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_community_replies_updated_at
  BEFORE UPDATE ON community_post_replies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_training_modules_updated_at
  BEFORE UPDATE ON training_modules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_training_progress_updated_at
  BEFORE UPDATE ON training_module_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_live_calls_updated_at
  BEFORE UPDATE ON live_calls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_launch_events_updated_at
  BEFORE UPDATE ON campaign_launch_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_launch_participants_updated_at
  BEFORE UPDATE ON campaign_launch_participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_leaderboard_entries_updated_at
  BEFORE UPDATE ON leaderboard_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_story_highlights_updated_at
  BEFORE UPDATE ON story_highlights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_ama_sessions_updated_at
  BEFORE UPDATE ON ama_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_storm_alerts_updated_at
  BEFORE UPDATE ON storm_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_community_integrations_updated_at
  BEFORE UPDATE ON community_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update reply count on community posts
CREATE OR REPLACE FUNCTION update_community_post_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET replies_count = replies_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET replies_count = GREATEST(0, replies_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_reply_count
  AFTER INSERT OR DELETE ON community_post_replies
  FOR EACH ROW EXECUTE FUNCTION update_community_post_reply_count();

-- Update like count on community posts
CREATE OR REPLACE FUNCTION update_community_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_like_count
  AFTER INSERT OR DELETE ON community_post_likes
  FOR EACH ROW EXECUTE FUNCTION update_community_post_like_count();

-- ============================================================================
-- SEED DATA: Training Modules
-- ============================================================================

INSERT INTO training_modules (module_number, title, description, video_duration_seconds, content, order_index) VALUES
  (1, 'Launch Your First Campaign', 
   'Learn how to create your first campaign, import your list, edit templates, and understand open/reply rates. Get immediate wins and build confidence.',
   300, -- 5 minutes
   'This module covers:
- How to create a campaign in SmartSend
- Importing your contact list
- Editing and customizing email templates
- Understanding open rates and reply rates
- Best practices for your first campaign',
   1),
  
  (2, 'Storm Campaign Mastery',
   'Master storm campaigns - the highest revenue weeks of the year. Learn what messages to send, when storm templates work, and how to position offers.',
   600, -- 10 minutes
   'This module covers:
- Identifying storm opportunities
- What messages to send during storms
- When storm templates are most effective
- How to position your offers
- Timing your storm campaigns for maximum impact',
   2),
  
  (3, 'Lead Revival Blueprint',
   'Turn dead leads into booked estimates. Revival campaigns ALWAYS produce fast wins.',
   480, -- 8 minutes
   'This module covers:
- Identifying dead leads worth reviving
- Crafting revival campaign messages
- Timing your revival campaigns
- Following up effectively
- Converting revived leads into booked estimates',
   3),
  
  (4, 'Reply Handling 101',
   'Learn what to say to common replies. Close more jobs and stay subscribed longer.',
   720, -- 12 minutes
   'This module covers:
- What to say to "How much?"
- What to say to "Maybe next week"
- Handling repair vs replacement questions
- Responding to price objections
- Closing techniques that work',
   4),
  
  (5, 'Scaling to Domination Plan',
   'Run multiple campaigns, build your pipeline, and hire crews when SmartSend fills your calendar.',
   900, -- 15 minutes
   'This module covers:
- Running multiple campaigns simultaneously
- Building a consistent pipeline
- Scaling your operations
- Hiring crews when demand increases
- Becoming a big roofing company',
   5)
ON CONFLICT (module_number) DO NOTHING;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Community Posts: Users can read all posts, create their own, update/delete their own
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_posts_select_all"
  ON community_posts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "community_posts_insert_own"
  ON community_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_posts_update_own"
  ON community_posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = community_posts.org_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  ));

CREATE POLICY "community_posts_delete_own"
  ON community_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = community_posts.org_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  ));

-- Community Post Replies
ALTER TABLE community_post_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_replies_select_all"
  ON community_post_replies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "community_replies_insert_own"
  ON community_post_replies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_replies_update_own"
  ON community_post_replies FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "community_replies_delete_own"
  ON community_post_replies FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Community Post Likes
ALTER TABLE community_post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_likes_select_all"
  ON community_post_likes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "community_likes_insert_own"
  ON community_post_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_likes_delete_own"
  ON community_post_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Training Modules: Public read, admin write
ALTER TABLE training_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_modules_select_all"
  ON training_modules FOR SELECT
  TO authenticated
  USING (true);

-- Training Progress: Users can only see their own progress
ALTER TABLE training_module_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_progress_select_own"
  ON training_module_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = training_module_progress.org_id
    AND om.user_id = auth.uid()
  ));

CREATE POLICY "training_progress_insert_own"
  ON training_module_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "training_progress_update_own"
  ON training_module_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Live Calls: Public read, admin write
ALTER TABLE live_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_calls_select_all"
  ON live_calls FOR SELECT
  TO authenticated
  USING (true);

-- Live Call Registrations: Users can see their own registrations
ALTER TABLE live_call_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_registrations_select_own"
  ON live_call_registrations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = live_call_registrations.org_id
    AND om.user_id = auth.uid()
  ));

CREATE POLICY "call_registrations_insert_own"
  ON live_call_registrations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "call_registrations_update_own"
  ON live_call_registrations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Campaign Launch Events: Public read
ALTER TABLE campaign_launch_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "launch_events_select_all"
  ON campaign_launch_events FOR SELECT
  TO authenticated
  USING (true);

-- Campaign Launch Participants: Users can see their own participation
ALTER TABLE campaign_launch_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "launch_participants_select_own"
  ON campaign_launch_participants FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = campaign_launch_participants.org_id
    AND om.user_id = auth.uid()
  ));

CREATE POLICY "launch_participants_insert_own"
  ON campaign_launch_participants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "launch_participants_update_own"
  ON campaign_launch_participants FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Leaderboard Entries: Public read
ALTER TABLE leaderboard_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leaderboard_entries_select_all"
  ON leaderboard_entries FOR SELECT
  TO authenticated
  USING (true);

-- Leaderboard Winners: Public read
ALTER TABLE leaderboard_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leaderboard_winners_select_all"
  ON leaderboard_winners FOR SELECT
  TO authenticated
  USING (true);

-- Story Highlights: Public read
ALTER TABLE story_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_highlights_select_all"
  ON story_highlights FOR SELECT
  TO authenticated
  USING (true);

-- AMA Sessions: Public read
ALTER TABLE ama_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ama_sessions_select_all"
  ON ama_sessions FOR SELECT
  TO authenticated
  USING (true);

-- AMA Questions: Users can see all questions, insert their own, update their own
ALTER TABLE ama_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ama_questions_select_all"
  ON ama_questions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ama_questions_insert_own"
  ON ama_questions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ama_questions_update_own"
  ON ama_questions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Storm Alerts: Public read
ALTER TABLE storm_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "storm_alerts_select_all"
  ON storm_alerts FOR SELECT
  TO authenticated
  USING (true);

-- Storm Alert Views: Users can see their own views
ALTER TABLE storm_alert_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "storm_views_select_own"
  ON storm_alert_views FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "storm_views_insert_own"
  ON storm_alert_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Community Integrations: Users can see their org's integrations
ALTER TABLE community_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_integrations_select_org"
  ON community_integrations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = community_integrations.org_id
    AND om.user_id = auth.uid()
  ));

-- Upgrade Events: Users can see their own upgrade events
ALTER TABLE upgrade_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "upgrade_events_select_own"
  ON upgrade_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = upgrade_events.org_id
    AND om.user_id = auth.uid()
  ));

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE community_posts IS 'Community posts from Slack/Circle integration - drives engagement and social proof';
COMMENT ON TABLE training_modules IS 'Training Hub modules - 5 core modules for roofer education';
COMMENT ON TABLE live_calls IS 'Weekly SmartSend Roofing Lab calls - 20-25 minute focused sessions';
COMMENT ON TABLE campaign_launch_events IS 'Monthly campaign launch days - community-driven campaign creation';
COMMENT ON TABLE leaderboard_entries IS 'Leaderboards for replies, booked estimates, revenue - drives competition';
COMMENT ON TABLE story_highlights IS 'Success stories from roofers - creates validation and FOMO';
COMMENT ON TABLE ama_sessions IS 'Ask-Me-Anything sessions - builds loyalty and provides support';
COMMENT ON TABLE storm_alerts IS 'Storm alerts posted to community - helps roofers launch campaigns faster';
COMMENT ON TABLE upgrade_events IS 'Tracks upgrades triggered by community social proof';






































