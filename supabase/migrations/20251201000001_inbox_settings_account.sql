-- =========================================================
-- Block 20160 — SmartSend Inbox Settings & SLA Controls v1
-- (Let the roofing owner "tune" the inbox so it matches how their office actually works.)
-- =========================================================

-- Create inbox_settings table per account
CREATE TABLE IF NOT EXISTS inbox_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE,
  business_timezone TEXT DEFAULT 'America/Los_Angeles',
  business_hours_start TIME DEFAULT '08:00', -- 8am
  business_hours_end TIME DEFAULT '17:00',   -- 5pm

  hot_sla_hours INTEGER DEFAULT 4,          -- hot lead max wait
  warm_sla_hours INTEGER DEFAULT 24,        -- warm lead max wait

  default_follow_up_days_small INTEGER DEFAULT 1,
  default_follow_up_days_medium INTEGER DEFAULT 3,
  default_follow_up_days_long INTEGER DEFAULT 7,

  email_signature TEXT,                     -- appended to replies later
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_settings_account
ON inbox_settings (account_id);

-- Add RLS policies (if accounts table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'accounts') THEN
    -- Enable RLS
    ALTER TABLE inbox_settings ENABLE ROW LEVEL SECURITY;

    -- Policy: Users can read their account's settings
    CREATE POLICY IF NOT EXISTS "Users can read their account inbox settings"
      ON inbox_settings
      FOR SELECT
      USING (
        account_id IN (
          SELECT account_id FROM account_members
          WHERE user_id = auth.uid() AND (is_active IS NULL OR is_active = true)
        )
      );

    -- Policy: Account owners can update their account's settings
    CREATE POLICY IF NOT EXISTS "Account owners can update their account inbox settings"
      ON inbox_settings
      FOR ALL
      USING (
        account_id IN (
          SELECT account_id FROM account_members
          WHERE user_id = auth.uid() 
            AND (is_active IS NULL OR is_active = true)
            AND role = 'owner'
        )
      );
  END IF;
END $$;

COMMENT ON TABLE inbox_settings IS 'Account-level inbox settings for business hours, SLA thresholds, and follow-up defaults';
COMMENT ON COLUMN inbox_settings.business_timezone IS 'Timezone for business hours (e.g., America/Los_Angeles)';
COMMENT ON COLUMN inbox_settings.business_hours_start IS 'Start time of business hours (e.g., 08:00)';
COMMENT ON COLUMN inbox_settings.business_hours_end IS 'End time of business hours (e.g., 17:00)';
COMMENT ON COLUMN inbox_settings.hot_sla_hours IS 'Maximum hours to reply to hot leads before flagging';
COMMENT ON COLUMN inbox_settings.warm_sla_hours IS 'Maximum hours to reply to warm leads before flagging';
COMMENT ON COLUMN inbox_settings.default_follow_up_days_small IS 'Default small follow-up delay in days';
COMMENT ON COLUMN inbox_settings.default_follow_up_days_medium IS 'Default medium follow-up delay in days';
COMMENT ON COLUMN inbox_settings.default_follow_up_days_long IS 'Default long follow-up delay in days';
COMMENT ON COLUMN inbox_settings.email_signature IS 'Email signature to append to replies';

















































