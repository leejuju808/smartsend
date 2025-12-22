-- Mailbox Rotation + Per-Domain Throttling + Open/Click Tracking
-- Migration: 20250120_add_mailbox_rotation_and_tracking.sql

-- 1. Mailboxes table for rotation
CREATE TABLE IF NOT EXISTS mailboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_username TEXT,
  smtp_password TEXT,
  daily_cap INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Mailbox usage counters (daily)
CREATE TABLE IF NOT EXISTS mailbox_daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mailbox_id, date)
);

-- 3. Per-domain daily caps
CREATE TABLE IF NOT EXISTS domain_daily_caps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  daily_cap INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, domain),
  UNIQUE(workspace_id, domain)
);

-- 4. Domain usage counters (daily)
CREATE TABLE IF NOT EXISTS domain_daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  date DATE NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, domain, date),
  UNIQUE(workspace_id, domain, date)
);

-- 5. Tracking tokens for opens/clicks
CREATE TABLE IF NOT EXISTS tracking_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('open', 'click')),
  url TEXT, -- for click tracking
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Tracking events
CREATE TABLE IF NOT EXISTS tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  token_id UUID NOT NULL REFERENCES tracking_tokens(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('open', 'click')),
  ip_address INET,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Deliverability settings
CREATE TABLE IF NOT EXISTS deliverability_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  default_domain_cap INTEGER NOT NULL DEFAULT 20,
  send_window_start TIME DEFAULT '09:00:00',
  send_window_end TIME DEFAULT '17:00:00',
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(workspace_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mailboxes_user_active ON mailboxes(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_mailboxes_workspace_active ON mailboxes(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_mailbox_daily_usage_date ON mailbox_daily_usage(date);
CREATE INDEX IF NOT EXISTS idx_domain_daily_usage_date ON domain_daily_usage(date);
CREATE INDEX IF NOT EXISTS idx_tracking_tokens_expires ON tracking_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_tracking_events_campaign ON tracking_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_recipient ON tracking_events(recipient_id);

-- RPC functions for atomic increments
CREATE OR REPLACE FUNCTION increment_mailbox_daily_usage(
  p_mailbox_id UUID,
  p_date DATE,
  p_increment INTEGER DEFAULT 1
) RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO mailbox_daily_usage (mailbox_id, date, sent_count)
  VALUES (p_mailbox_id, p_date, p_increment)
  ON CONFLICT (mailbox_id, date)
  DO UPDATE SET 
    sent_count = mailbox_daily_usage.sent_count + p_increment,
    updated_at = NOW()
  RETURNING sent_count INTO new_count;
  
  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_domain_daily_usage(
  p_user_id UUID,
  p_workspace_id UUID,
  p_domain TEXT,
  p_date DATE,
  p_increment INTEGER DEFAULT 1
) RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO domain_daily_usage (user_id, workspace_id, domain, date, sent_count)
  VALUES (p_user_id, p_workspace_id, p_domain, p_date, p_increment)
  ON CONFLICT (user_id, domain, date)
  DO UPDATE SET 
    sent_count = domain_daily_usage.sent_count + p_increment,
    updated_at = NOW()
  RETURNING sent_count INTO new_count;
  
  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- Helper function to get least used mailbox under cap
CREATE OR REPLACE FUNCTION get_least_used_mailbox(
  p_user_id UUID,
  p_workspace_id UUID,
  p_date DATE
) RETURNS UUID AS $$
DECLARE
  mailbox_id UUID;
BEGIN
  SELECT m.id INTO mailbox_id
  FROM mailboxes m
  LEFT JOIN mailbox_daily_usage mdu ON m.id = mdu.mailbox_id AND mdu.date = p_date
  WHERE m.is_active = true
    AND (m.user_id = p_user_id OR m.workspace_id = p_workspace_id)
    AND COALESCE(mdu.sent_count, 0) < m.daily_cap
  ORDER BY COALESCE(mdu.sent_count, 0) ASC, m.created_at ASC
  LIMIT 1;
  
  RETURN mailbox_id;
END;
$$ LANGUAGE plpgsql;

-- Helper function to check domain cap
CREATE OR REPLACE FUNCTION check_domain_cap(
  p_user_id UUID,
  p_workspace_id UUID,
  p_domain TEXT,
  p_date DATE
) RETURNS BOOLEAN AS $$
DECLARE
  cap INTEGER;
  current_count INTEGER;
BEGIN
  -- Get domain cap (user-specific or workspace-specific)
  SELECT daily_cap INTO cap
  FROM domain_daily_caps
  WHERE (user_id = p_user_id OR workspace_id = p_workspace_id)
    AND domain = p_domain;
  
  -- If no cap set, use default
  IF cap IS NULL THEN
    SELECT default_domain_cap INTO cap
    FROM deliverability_settings
    WHERE user_id = p_user_id OR workspace_id = p_workspace_id;
    
    IF cap IS NULL THEN
      cap := 20; -- Default fallback
    END IF;
  END IF;
  
  -- Get current usage
  SELECT COALESCE(sent_count, 0) INTO current_count
  FROM domain_daily_usage
  WHERE (user_id = p_user_id OR workspace_id = p_workspace_id)
    AND domain = p_domain
    AND date = p_date;
  
  RETURN current_count < cap;
END;
$$ LANGUAGE plpgsql;

-- RLS policies (if enabled)
-- Note: These assume RLS is enabled. Adjust based on your setup.

-- Mailboxes: Users can see their own mailboxes or workspace mailboxes
-- ALTER TABLE mailboxes ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own mailboxes" ON mailboxes
--   FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "Users can view workspace mailboxes" ON mailboxes
--   FOR SELECT USING (workspace_id IN (
--     SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
--   ));

-- Domain caps: Users can see their own or workspace caps
-- ALTER TABLE domain_daily_caps ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own domain caps" ON domain_daily_caps
--   FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "Users can view workspace domain caps" ON domain_daily_caps
--   FOR SELECT USING (workspace_id IN (
--     SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
--   ));

-- Deliverability settings: Users can see their own or workspace settings
-- ALTER TABLE deliverability_settings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own deliverability settings" ON deliverability_settings
--   FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "Users can view workspace deliverability settings" ON deliverability_settings
--   FOR SELECT USING (workspace_id IN (
--     SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
--   ));

-- Tracking tables: Read-only for users, full access for service role
-- ALTER TABLE tracking_tokens ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own tracking data" ON tracking_tokens
--   FOR SELECT USING (campaign_id IN (
--     SELECT id FROM campaigns WHERE user_id = auth.uid()
--   ));
-- CREATE POLICY "Users can view own tracking events" ON tracking_events
--   FOR SELECT USING (campaign_id IN (
--     SELECT id FROM campaigns WHERE user_id = auth.uid()
--   )); 