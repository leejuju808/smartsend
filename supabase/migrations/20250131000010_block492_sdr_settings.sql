-- Block 492 — AI SDR Tuner v1
-- SDR settings per workspace/org for controlling AI SDR aggressiveness and auto-send rules

CREATE TABLE IF NOT EXISTS sdr_settings (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Autopilot mode: 'off' = no AI SDR sends, 'assist' = queue suggestions, 'auto' = full AI send
  autopilot_mode TEXT NOT NULL DEFAULT 'assist' CHECK (autopilot_mode IN ('off', 'assist', 'auto')),
  
  -- Aggressiveness: 1 = conservative, 2 = balanced, 3 = aggressive
  aggressiveness INTEGER NOT NULL DEFAULT 2 CHECK (aggressiveness >= 1 AND aggressiveness <= 3),
  
  -- Limits
  max_autopilot_emails_per_lead INTEGER NOT NULL DEFAULT 5 CHECK (max_autopilot_emails_per_lead > 0),
  min_minutes_between_autopilot INTEGER NOT NULL DEFAULT 480 CHECK (min_minutes_between_autopilot >= 0), -- 8 hours default
  
  -- Send window (24h clock)
  send_window_start_hour INTEGER NOT NULL DEFAULT 8 CHECK (send_window_start_hour >= 0 AND send_window_start_hour <= 23),
  send_window_end_hour INTEGER NOT NULL DEFAULT 17 CHECK (send_window_end_hour >= 0 AND send_window_end_hour <= 23),
  weekdays_only BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Per-intent auto-send toggles
  auto_send_ready_to_meet BOOLEAN NOT NULL DEFAULT TRUE,
  auto_send_needs_info BOOLEAN NOT NULL DEFAULT TRUE,
  auto_send_follow_up_later BOOLEAN NOT NULL DEFAULT TRUE,
  auto_send_open_to_chat BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_sdr_settings_org ON sdr_settings(org_id);

-- RLS policies
ALTER TABLE sdr_settings ENABLE ROW LEVEL SECURITY;

-- Allow org members to view settings
DROP POLICY IF EXISTS "sdr_settings.select.member" ON sdr_settings;
CREATE POLICY "sdr_settings.select.member"
ON sdr_settings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_settings.org_id
    AND user_id = auth.uid()
  )
);

-- Allow admins to insert/update settings
DROP POLICY IF EXISTS "sdr_settings.insert.admin" ON sdr_settings;
CREATE POLICY "sdr_settings.insert.admin"
ON sdr_settings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_settings.org_id
    AND user_id = auth.uid()
    AND role IN ('admin', 'member')
  )
);

DROP POLICY IF EXISTS "sdr_settings.update.admin" ON sdr_settings;
CREATE POLICY "sdr_settings.update.admin"
ON sdr_settings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_settings.org_id
    AND user_id = auth.uid()
    AND role IN ('admin', 'member')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_settings.org_id
    AND user_id = auth.uid()
    AND role IN ('admin', 'member')
  )
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON sdr_settings TO authenticated;

-- Seed default settings for existing orgs (optional)
INSERT INTO sdr_settings (org_id)
SELECT id FROM organizations
ON CONFLICT (org_id) DO NOTHING;

