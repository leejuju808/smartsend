-- Unified Suppression System
-- This migration creates the unified suppression tables and policies

-- Drop old/conflicting tables if they exist (optional - comment out in production)
-- DROP TABLE IF EXISTS campaign_suppressions CASCADE;
-- DROP TABLE IF EXISTS suppressions CASCADE;

-- Global per-user suppression list (email-level)
CREATE TABLE IF NOT EXISTS suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  reason text,                 -- "unsubscribe", "bounced", "manual", "complaint"
  source text,                 -- "link", "reply", "import", "admin"
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);

-- Optional: per-campaign suppression (for fine-grain)
CREATE TABLE IF NOT EXISTS campaign_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, email)
);

ALTER TABLE suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_suppressions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for suppressions table
CREATE POLICY "suppressions_select_own" ON suppressions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "suppressions_insert_own" ON suppressions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "suppressions_delete_own" ON suppressions FOR DELETE
  USING (auth.uid() = user_id);

-- Allow service role full access
CREATE POLICY "service_role_suppressions_full" ON suppressions
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for campaign_suppressions table
CREATE POLICY "camp_supr_select_own" ON campaign_suppressions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "camp_supr_insert_own" ON campaign_suppressions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "camp_supr_delete_own" ON campaign_suppressions FOR DELETE
  USING (auth.uid() = user_id);

-- Allow service role full access
CREATE POLICY "service_role_campaign_suppressions_full" ON campaign_suppressions
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Helpful views
CREATE OR REPLACE VIEW suppressed_emails AS
SELECT user_id, email FROM suppressions;

CREATE OR REPLACE VIEW campaign_suppressed_emails AS
SELECT user_id, campaign_id, email FROM campaign_suppressions;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_suppressions_user_email ON suppressions(user_id, email);
CREATE INDEX IF NOT EXISTS idx_campaign_suppressions_user_campaign_email
  ON campaign_suppressions(user_id, campaign_id, email);

-- Helpful RPC function to check if an email is suppressed
CREATE OR REPLACE FUNCTION is_suppressed(
  p_user_id uuid,
  p_email text,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  is_suppressed_global boolean;
  is_suppressed_campaign boolean;
BEGIN
  -- Check global suppression
  SELECT EXISTS(
    SELECT 1 FROM suppressions 
    WHERE user_id = p_user_id 
    AND LOWER(email) = LOWER(p_email)
  ) INTO is_suppressed_global;

  IF is_suppressed_global THEN
    RETURN true;
  END IF;

  -- If campaign_id provided, check campaign-specific suppression
  IF p_campaign_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM campaign_suppressions 
      WHERE user_id = p_user_id 
      AND campaign_id = p_campaign_id
      AND LOWER(email) = LOWER(p_email)
    ) INTO is_suppressed_campaign;

    IF is_suppressed_campaign THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;
