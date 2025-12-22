-- Block 496 — AI SDR Safety Guardrails & Override Log
-- Daily caps per org/lead/domain + lock toggle + guardrail events log

-- ============================================================================
-- 1️⃣ Extend sdr_settings with guardrail caps and lock fields
-- ============================================================================

ALTER TABLE sdr_settings
ADD COLUMN IF NOT EXISTS daily_ai_sdr_cap_per_org INTEGER NOT NULL DEFAULT 500,
ADD COLUMN IF NOT EXISTS daily_ai_sdr_cap_per_lead INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS daily_ai_sdr_cap_per_domain INTEGER NOT NULL DEFAULT 100,
ADD COLUMN IF NOT EXISTS autopilot_locked BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS autopilot_locked_reason TEXT NULL,
ADD COLUMN IF NOT EXISTS autopilot_locked_at TIMESTAMPTZ NULL;

-- ============================================================================
-- 2️⃣ Create guardrail events table
-- ============================================================================

CREATE TABLE IF NOT EXISTS sdr_guardrail_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NULL REFERENCES organizations(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES leads(id) ON DELETE SET NULL,
  email_domain TEXT NULL,
  guardrail_type TEXT NOT NULL,
  -- 'org_daily_cap'
  -- 'lead_daily_cap'
  -- 'domain_daily_cap'
  -- 'autopilot_locked'
  -- 'manual_lock'
  -- 'manual_unlock'
  -- 'other'
  message TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS sdr_guardrail_events_org_created_idx
ON sdr_guardrail_events (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sdr_guardrail_events_lead_idx
ON sdr_guardrail_events (lead_id);

CREATE INDEX IF NOT EXISTS sdr_guardrail_events_domain_idx
ON sdr_guardrail_events (email_domain);

-- ============================================================================
-- 3️⃣ RLS Policies for guardrail events
-- ============================================================================

ALTER TABLE sdr_guardrail_events ENABLE ROW LEVEL SECURITY;

-- Allow org members to view guardrail events for their org
DROP POLICY IF EXISTS "sdr_guardrail_events.select.member" ON sdr_guardrail_events;
CREATE POLICY "sdr_guardrail_events.select.member"
ON sdr_guardrail_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_guardrail_events.org_id
    AND user_id = auth.uid()
  )
);

-- Allow authenticated users to insert guardrail events (for API routes)
DROP POLICY IF EXISTS "sdr_guardrail_events.insert.authenticated" ON sdr_guardrail_events;
CREATE POLICY "sdr_guardrail_events.insert.authenticated"
ON sdr_guardrail_events FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_guardrail_events.org_id
    AND user_id = auth.uid()
  )
  OR sdr_guardrail_events.org_id IS NULL -- Allow null org_id for service role inserts
);

-- Grant permissions
GRANT SELECT ON sdr_guardrail_events TO authenticated;
GRANT INSERT ON sdr_guardrail_events TO authenticated;
-- Service role bypasses RLS, so it can insert without a policy

