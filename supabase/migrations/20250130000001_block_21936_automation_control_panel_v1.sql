-- =========================================================
-- Block 21936 — SmartSend Automation Control Panel v1
-- 🎛️ One Screen to Control ALL the Brains — Safe, Simple, Money-First
-- =========================================================
-- This migration creates the automation_settings table that gives roofing
-- owners clear, simple switches + sliders to control:
-- - What's automated
-- - When it fires
-- - How aggressive follow-ups are
-- - Who gets alerts
-- - Daily caps / safety limits
-- - Thresholds for hot, risky, and resurrected leads

-- ============================================================================
-- 1. CREATE automation_settings TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.automation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Lead scoring
  hot_lead_threshold INTEGER DEFAULT 80 CHECK (hot_lead_threshold >= 70 AND hot_lead_threshold <= 100),
  warm_lead_threshold INTEGER DEFAULT 50 CHECK (warm_lead_threshold >= 40 AND warm_lead_threshold <= 79),
  high_probability_threshold INTEGER DEFAULT 70 CHECK (high_probability_threshold >= 50 AND high_probability_threshold <= 100),
  high_value_threshold NUMERIC(12,2) DEFAULT 10000 CHECK (high_value_threshold >= 5000 AND high_value_threshold <= 50000),

  -- Follow-up & resurrection
  auto_followup_delay_hours INTEGER DEFAULT 24 CHECK (auto_followup_delay_hours IN (4, 8, 12, 24)),
  max_auto_followups INTEGER DEFAULT 3 CHECK (max_auto_followups >= 1 AND max_auto_followups <= 5),
  resurrect_never_replied BOOLEAN DEFAULT true,
  resurrect_ghosted BOOLEAN DEFAULT true,
  resurrect_past_customers BOOLEAN DEFAULT false,
  resurrection_cooldown_days INTEGER DEFAULT 30 CHECK (resurrection_cooldown_days >= 7 AND resurrection_cooldown_days <= 90),

  -- Routing & handoff
  auto_assign_new_leads BOOLEAN DEFAULT true,
  routing_mode TEXT DEFAULT 'balanced' CHECK (routing_mode IN ('balanced', 'performance', 'round_robin')),
  max_active_leads_per_estimator INTEGER DEFAULT 20 CHECK (max_active_leads_per_estimator >= 5 AND max_active_leads_per_estimator <= 50),
  missed_followups_before_handoff INTEGER DEFAULT 2 CHECK (missed_followups_before_handoff >= 1 AND missed_followups_before_handoff <= 5),

  -- Risk & alerts
  risk_engine_enabled BOOLEAN DEFAULT true,
  alert_on_high_risk BOOLEAN DEFAULT true,
  alert_on_critical_risk BOOLEAN DEFAULT true,
  alert_via_email BOOLEAN DEFAULT true,
  alert_via_sms BOOLEAN DEFAULT false,
  alert_via_inapp BOOLEAN DEFAULT true,

  -- Action queue
  max_tasks_per_estimator_daily INTEGER DEFAULT 15 CHECK (max_tasks_per_estimator_daily >= 5 AND max_tasks_per_estimator_daily <= 40),
  include_follow_up_hot BOOLEAN DEFAULT true,
  include_follow_up_warm BOOLEAN DEFAULT true,
  include_send_proposal BOOLEAN DEFAULT true,
  include_save_critical_job BOOLEAN DEFAULT true,
  include_resurrection BOOLEAN DEFAULT true,
  include_reply_angry BOOLEAN DEFAULT true,

  owner_only_high_value_threshold NUMERIC(12,2) DEFAULT 15000,

  -- Safety limits
  max_messages_per_day INTEGER DEFAULT 500 CHECK (max_messages_per_day >= 50 AND max_messages_per_day <= 5000),
  max_messages_per_lead_per_day INTEGER DEFAULT 2 CHECK (max_messages_per_lead_per_day >= 1 AND max_messages_per_lead_per_day <= 5),
  quiet_hours_start TIME DEFAULT '21:00',
  quiet_hours_end TIME DEFAULT '08:00',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique index: one row per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_settings_workspace_id 
  ON public.automation_settings(workspace_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_automation_settings_workspace 
  ON public.automation_settings(workspace_id);

-- ============================================================================
-- 2. TRIGGER: Update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_automation_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_automation_settings_updated_at ON public.automation_settings;
CREATE TRIGGER trg_automation_settings_updated_at
  BEFORE UPDATE ON public.automation_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_settings_updated_at();

-- ============================================================================
-- 3. FUNCTION: Get or create default settings for a workspace
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_automation_settings(p_workspace_id UUID)
RETURNS public.automation_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.automation_settings;
BEGIN
  -- Try to get existing settings
  SELECT * INTO v_settings
  FROM public.automation_settings
  WHERE workspace_id = p_workspace_id;

  -- If not found, create default settings
  IF NOT FOUND THEN
    INSERT INTO public.automation_settings (workspace_id)
    VALUES (p_workspace_id)
    RETURNING * INTO v_settings;
  END IF;

  RETURN v_settings;
END;
$$;

COMMENT ON FUNCTION public.get_automation_settings IS 'Block 21936: Gets or creates default automation settings for a workspace';

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Workspace members can view settings
CREATE POLICY "workspace_members_can_view_settings"
  ON public.automation_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = automation_settings.workspace_id
        AND user_id = auth.uid()
    )
  );

-- Policy: Workspace owners/admins can update settings
CREATE POLICY "workspace_admins_can_update_settings"
  ON public.automation_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = automation_settings.workspace_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = automation_settings.workspace_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Policy: Workspace owners/admins can insert settings
CREATE POLICY "workspace_admins_can_insert_settings"
  ON public.automation_settings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = automation_settings.workspace_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- 5. BACKFILL: Create default settings for existing workspaces
-- ============================================================================

INSERT INTO public.automation_settings (workspace_id)
SELECT id
FROM public.workspaces
WHERE id NOT IN (SELECT workspace_id FROM public.automation_settings)
ON CONFLICT (workspace_id) DO NOTHING;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.automation_settings IS 'Block 21936: Automation control panel settings - one row per workspace';
COMMENT ON COLUMN public.automation_settings.hot_lead_threshold IS 'Heat score threshold (70-100) where a lead is treated as HOT. Default: 80';
COMMENT ON COLUMN public.automation_settings.warm_lead_threshold IS 'Heat score threshold (40-79) where a lead is treated as WARM. Default: 50';
COMMENT ON COLUMN public.automation_settings.high_probability_threshold IS 'Job probability threshold (50-100%) where jobs are treated as likely to close. Default: 70';
COMMENT ON COLUMN public.automation_settings.high_value_threshold IS 'Job value threshold ($5K-$50K) for high-value job detection. Default: $10K';
COMMENT ON COLUMN public.automation_settings.auto_followup_delay_hours IS 'Hours to wait before auto-follow-up after no reply. Options: 4, 8, 12, 24. Default: 24';
COMMENT ON COLUMN public.automation_settings.max_auto_followups IS 'Maximum number of auto follow-ups per lead (1-5). Default: 3';
COMMENT ON COLUMN public.automation_settings.resurrect_never_replied IS 'Enable resurrection for leads who never replied. Default: true';
COMMENT ON COLUMN public.automation_settings.resurrect_ghosted IS 'Enable resurrection for ghosted leads. Default: true';
COMMENT ON COLUMN public.automation_settings.resurrect_past_customers IS 'Enable resurrection for past customers. Default: false';
COMMENT ON COLUMN public.automation_settings.resurrection_cooldown_days IS 'Days to wait between resurrection attempts (7-90). Default: 30';
COMMENT ON COLUMN public.automation_settings.auto_assign_new_leads IS 'Automatically assign new leads to estimators. Default: true';
COMMENT ON COLUMN public.automation_settings.routing_mode IS 'Lead routing mode: balanced, performance, round_robin. Default: balanced';
COMMENT ON COLUMN public.automation_settings.max_active_leads_per_estimator IS 'Maximum active leads per estimator (5-50). Default: 20';
COMMENT ON COLUMN public.automation_settings.missed_followups_before_handoff IS 'Number of missed follow-ups before handoff to another estimator (1-5). Default: 2';
COMMENT ON COLUMN public.automation_settings.risk_engine_enabled IS 'Enable risk engine for job risk detection. Default: true';
COMMENT ON COLUMN public.automation_settings.alert_on_high_risk IS 'Alert when job becomes high risk. Default: true';
COMMENT ON COLUMN public.automation_settings.alert_on_critical_risk IS 'Alert when job becomes critical risk. Default: true';
COMMENT ON COLUMN public.automation_settings.alert_via_email IS 'Send alerts via email. Default: true';
COMMENT ON COLUMN public.automation_settings.alert_via_sms IS 'Send alerts via SMS. Default: false';
COMMENT ON COLUMN public.automation_settings.alert_via_inapp IS 'Send alerts via in-app notifications. Default: true';
COMMENT ON COLUMN public.automation_settings.max_tasks_per_estimator_daily IS 'Maximum tasks per estimator per day (5-40). Default: 15';
COMMENT ON COLUMN public.automation_settings.include_follow_up_hot IS 'Include follow-up hot tasks in action queue. Default: true';
COMMENT ON COLUMN public.automation_settings.include_follow_up_warm IS 'Include follow-up warm tasks in action queue. Default: true';
COMMENT ON COLUMN public.automation_settings.include_send_proposal IS 'Include send proposal tasks in action queue. Default: true';
COMMENT ON COLUMN public.automation_settings.include_save_critical_job IS 'Include save critical job tasks in action queue. Default: true';
COMMENT ON COLUMN public.automation_settings.include_resurrection IS 'Include resurrection tasks in action queue. Default: true';
COMMENT ON COLUMN public.automation_settings.include_reply_angry IS 'Include reply to angry homeowner tasks in action queue. Default: true';
COMMENT ON COLUMN public.automation_settings.owner_only_high_value_threshold IS 'Job value threshold for owner-only tasks. Default: $15K';
COMMENT ON COLUMN public.automation_settings.max_messages_per_day IS 'Maximum outbound messages per day per workspace (50-5000). Default: 500';
COMMENT ON COLUMN public.automation_settings.max_messages_per_lead_per_day IS 'Maximum messages per lead per day (1-5). Default: 2';
COMMENT ON COLUMN public.automation_settings.quiet_hours_start IS 'Start of quiet hours (no messages sent). Default: 21:00 (9 PM)';
COMMENT ON COLUMN public.automation_settings.quiet_hours_end IS 'End of quiet hours (no messages sent). Default: 08:00 (8 AM)';









































