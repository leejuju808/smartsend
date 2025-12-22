-- Block 23720 — SmartSend Roofing Upsell + Expansion Engine v1
-- Upgrade triggers tracking and upsell system

-- =========================================================
-- 1) Upgrade Trigger Events Table
-- =========================================================
-- Tracks when upgrade triggers are detected to prevent spam

CREATE TABLE IF NOT EXISTS public.upgrade_trigger_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'campaign_limit_hit',
    'email_limit_approaching',
    'high_engagement',
    'crew_size_growth',
    'first_campaign_launched',
    'first_replies_received',
    'storm_season_detected',
    'multi_city_expansion'
  )),
  current_plan TEXT NOT NULL CHECK (current_plan IN ('starter', 'growth', 'domination')),
  suggested_plan TEXT NOT NULL CHECK (suggested_plan IN ('growth', 'domination')),
  trigger_data JSONB NOT NULL DEFAULT '{}'::jsonb, -- Stores context like campaign_count, email_usage, etc.
  shown_at TIMESTAMPTZ, -- When the upgrade modal was shown
  dismissed_at TIMESTAMPTZ, -- When user dismissed the upgrade prompt
  upgraded_at TIMESTAMPTZ, -- When user actually upgraded
  email_sent_at TIMESTAMPTZ, -- When upgrade email was sent
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upgrade_trigger_events_workspace 
  ON public.upgrade_trigger_events(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upgrade_trigger_events_user 
  ON public.upgrade_trigger_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upgrade_trigger_events_type 
  ON public.upgrade_trigger_events(trigger_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upgrade_trigger_events_not_upgraded 
  ON public.upgrade_trigger_events(workspace_id, trigger_type) 
  WHERE upgraded_at IS NULL AND dismissed_at IS NULL;

-- =========================================================
-- 2) Upgrade Email Templates Table
-- =========================================================

CREATE TABLE IF NOT EXISTS public.upgrade_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE, -- e.g. 'starter_to_growth_day5', 'growth_to_domination_storm'
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  from_plan TEXT NOT NULL CHECK (from_plan IN ('starter', 'growth', 'domination')),
  to_plan TEXT NOT NULL CHECK (to_plan IN ('growth', 'domination')),
  timing_days INTEGER, -- Days after trigger to send (null = immediate)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed upgrade email templates
INSERT INTO public.upgrade_email_templates (template_key, subject, body_html, body_text, from_plan, to_plan, timing_days)
VALUES
  (
    'starter_to_growth_day5',
    'Your campaigns are performing — want to level up?',
    '<p>You''re getting replies — great start.</p><p>Growth unlocks multi-campaign automation so you can run:</p><ul><li>Lead revival</li><li>Free estimate</li><li>Storm outreach</li></ul><p>…all at the same time.</p><p><a href="{{upgrade_url}}">Want me to upgrade your account?</a></p>',
    'You''re getting replies — great start.\n\nGrowth unlocks multi-campaign automation so you can run:\n\n• Lead revival\n• Free estimate\n• Storm outreach\n\n…all at the same time.\n\nWant me to upgrade your account? {{upgrade_url}}',
    'starter',
    'growth',
    5
  ),
  (
    'starter_limit_hit',
    'You''re close to your sending limit',
    '<p>To keep momentum going, I recommend moving to Growth which unlocks 2,000 emails and advanced follow-up.</p><p><a href="{{upgrade_url}}">Upgrade to Growth</a></p>',
    'To keep momentum going, I recommend moving to Growth which unlocks 2,000 emails and advanced follow-up.\n\nUpgrade to Growth: {{upgrade_url}}',
    'starter',
    'growth',
    NULL
  ),
  (
    'growth_to_domination',
    'You''re ready for full automation',
    '<p>You''ve outgrown the Growth plan — Domination gives you unlimited campaigns and full automation for storm season.</p><p><a href="{{upgrade_url}}">Upgrade to Domination</a></p>',
    'You''ve outgrown the Growth plan — Domination gives you unlimited campaigns and full automation for storm season.\n\nUpgrade to Domination: {{upgrade_url}}',
    'growth',
    'domination',
    NULL
  )
ON CONFLICT (template_key) DO NOTHING;

-- =========================================================
-- 3) Helper Functions
-- =========================================================

-- Function to check if upgrade trigger should be shown (prevents spam)
CREATE OR REPLACE FUNCTION public.should_show_upgrade_trigger(
  p_workspace_id UUID,
  p_trigger_type TEXT,
  p_cooldown_hours INTEGER DEFAULT 24
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_shown TIMESTAMPTZ;
BEGIN
  -- Check if this trigger was shown recently
  SELECT MAX(shown_at) INTO v_last_shown
  FROM public.upgrade_trigger_events
  WHERE workspace_id = p_workspace_id
    AND trigger_type = p_trigger_type
    AND upgraded_at IS NULL; -- Don't show if already upgraded
  
  -- If never shown, or shown more than cooldown_hours ago, allow
  IF v_last_shown IS NULL OR v_last_shown < now() - (p_cooldown_hours || ' hours')::INTERVAL THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Function to record upgrade trigger event
CREATE OR REPLACE FUNCTION public.record_upgrade_trigger(
  p_workspace_id UUID,
  p_user_id UUID,
  p_trigger_type TEXT,
  p_current_plan TEXT,
  p_suggested_plan TEXT,
  p_trigger_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.upgrade_trigger_events (
    workspace_id,
    user_id,
    trigger_type,
    current_plan,
    suggested_plan,
    trigger_data,
    shown_at
  )
  VALUES (
    p_workspace_id,
    p_user_id,
    p_trigger_type,
    p_current_plan,
    p_suggested_plan,
    p_trigger_data,
    now()
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- =========================================================
-- 4) RLS Policies
-- =========================================================

ALTER TABLE public.upgrade_trigger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upgrade_email_templates ENABLE ROW LEVEL SECURITY;

-- Users can view their own upgrade trigger events
CREATE POLICY "Users can view own upgrade triggers" ON public.upgrade_trigger_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role can manage all upgrade triggers
CREATE POLICY "Service role can manage upgrade triggers" ON public.upgrade_trigger_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Anyone can read email templates (they're public)
CREATE POLICY "Anyone can read upgrade email templates" ON public.upgrade_email_templates
  FOR SELECT TO authenticated
  USING (true);

-- Service role can manage templates
CREATE POLICY "Service role can manage upgrade email templates" ON public.upgrade_email_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);






































