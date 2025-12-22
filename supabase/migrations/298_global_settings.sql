-- Block 279 — Global Settings v1
-- Centralized Workspace Config: Sending, Scoring, Permissions, Playbooks, Branding

-- Create workspace_settings table (key-value style with nested JSONB)
CREATE TABLE IF NOT EXISTS public.workspace_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{
    "workspace": {
      "default_timezone": "America/Los_Angeles",
      "week_start": "monday"
    },
    "sending": {
      "respect_local_timezones": true,
      "business_hours": { "start": "09:00", "end": "17:00" },
      "avoid_weekends": true,
      "max_daily_sends": 300
    },
    "scoring": {
      "email_open": 2,
      "email_click": 5,
      "reply": 15,
      "meeting_intent": 25,
      "deal_created": 10,
      "deal_stage_moved": 5,
      "deal_won": 40,
      "daily_decay": -1,
      "min": 0,
      "max": 100
    },
    "permissions": {
      "member_can_merge_leads": false,
      "member_can_create_playbooks": false,
      "member_can_edit_campaigns": true,
      "member_can_launch_campaigns": false,
      "member_can_change_company_owners": true,
      "read_only_can_view_company_360": false,
      "read_only_can_view_deals": true,
      "read_only_can_view_templates": true
    },
    "playbooks": {
      "enabled_playbooks": [],
      "default_recommended": null
    },
    "branding": {
      "logo_url": null,
      "accent_color": "#3b82f6",
      "email_footer_html": "<p>Sent with <a href=\"https://smartsend.ai\">SmartSend</a></p>"
    }
  }'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_workspace_settings_workspace ON public.workspace_settings(workspace_id);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_workspace_settings_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_workspace_settings_timestamp ON public.workspace_settings;
CREATE TRIGGER trg_update_workspace_settings_timestamp
BEFORE UPDATE ON public.workspace_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_workspace_settings_timestamp();

-- Enable RLS
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Workspace members can view settings
CREATE POLICY "workspace_settings: select workspace members"
  ON public.workspace_settings FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_settings.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Only Owners/Admins can update settings
CREATE POLICY "workspace_settings: update by owner/admin"
  ON public.workspace_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.workspace_id = workspace_settings.workspace_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
        AND tm.status = 'active'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_settings.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.workspace_id = workspace_settings.workspace_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
        AND tm.status = 'active'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_settings.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- RLS Policy: Only Owners/Admins can insert settings
CREATE POLICY "workspace_settings: insert by owner/admin"
  ON public.workspace_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.workspace_id = workspace_settings.workspace_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
        AND tm.status = 'active'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_settings.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Grant access
GRANT SELECT, INSERT, UPDATE ON public.workspace_settings TO authenticated;

-- Helper function to get workspace settings with defaults
CREATE OR REPLACE FUNCTION public.get_workspace_settings(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT settings FROM public.workspace_settings WHERE workspace_id = p_workspace_id),
    '{
      "workspace": {
        "default_timezone": "America/Los_Angeles",
        "week_start": "monday"
      },
      "sending": {
        "respect_local_timezones": true,
        "business_hours": { "start": "09:00", "end": "17:00" },
        "avoid_weekends": true,
        "max_daily_sends": 300
      },
      "scoring": {
        "email_open": 2,
        "email_click": 5,
        "reply": 15,
        "meeting_intent": 25,
        "deal_created": 10,
        "deal_stage_moved": 5,
        "deal_won": 40,
        "daily_decay": -1,
        "min": 0,
        "max": 100
      },
      "permissions": {
        "member_can_merge_leads": false,
        "member_can_create_playbooks": false,
        "member_can_edit_campaigns": true,
        "member_can_launch_campaigns": false,
        "member_can_change_company_owners": true,
        "read_only_can_view_company_360": false,
        "read_only_can_view_deals": true,
        "read_only_can_view_templates": true
      },
      "playbooks": {
        "enabled_playbooks": [],
        "default_recommended": null
      },
      "branding": {
        "logo_url": null,
        "accent_color": "#3b82f6",
        "email_footer_html": "<p>Sent with <a href=\"https://smartsend.ai\">SmartSend</a></p>"
      }
    }'::jsonb
  );
$$;

COMMENT ON TABLE public.workspace_settings IS 'Centralized workspace configuration for sending, scoring, permissions, playbooks, and branding';
COMMENT ON COLUMN public.workspace_settings.settings IS 'Nested JSONB object containing all workspace settings';








