-- Block 498 — Sequence-Level AI SDR Tuner
-- Override global SDR settings per sequence

-- ============================================================================
-- 1️⃣ Create sdr_sequence_overrides table
-- ============================================================================

CREATE TABLE IF NOT EXISTS sdr_sequence_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL, -- references sequences(id) - but sequences table may vary by schema
  autopilot_mode_override TEXT NULL CHECK (autopilot_mode_override IN ('off', 'assist', 'auto')),
  -- NULL = inherit org setting
  aggressiveness_override INTEGER NULL CHECK (aggressiveness_override >= 1 AND aggressiveness_override <= 3),
  max_autopilot_emails_per_lead_override INTEGER NULL CHECK (max_autopilot_emails_per_lead_override > 0),
  min_minutes_between_autopilot_override INTEGER NULL CHECK (min_minutes_between_autopilot_override >= 0),
  auto_send_ready_to_meet_override BOOLEAN NULL,
  auto_send_needs_info_override BOOLEAN NULL,
  auto_send_follow_up_later_override BOOLEAN NULL,
  auto_send_open_to_chat_override BOOLEAN NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, sequence_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_sdr_sequence_overrides_org_sequence 
ON sdr_sequence_overrides(org_id, sequence_id);

CREATE INDEX IF NOT EXISTS idx_sdr_sequence_overrides_sequence 
ON sdr_sequence_overrides(sequence_id);

-- ============================================================================
-- 2️⃣ RLS Policies
-- ============================================================================

ALTER TABLE sdr_sequence_overrides ENABLE ROW LEVEL SECURITY;

-- Allow org members to view overrides for their org
DROP POLICY IF EXISTS "sdr_sequence_overrides.select.member" ON sdr_sequence_overrides;
CREATE POLICY "sdr_sequence_overrides.select.member"
ON sdr_sequence_overrides FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_sequence_overrides.org_id
    AND user_id = auth.uid()
  )
);

-- Allow org members to insert/update overrides for their org
DROP POLICY IF EXISTS "sdr_sequence_overrides.insert.member" ON sdr_sequence_overrides;
CREATE POLICY "sdr_sequence_overrides.insert.member"
ON sdr_sequence_overrides FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_sequence_overrides.org_id
    AND user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "sdr_sequence_overrides.update.member" ON sdr_sequence_overrides;
CREATE POLICY "sdr_sequence_overrides.update.member"
ON sdr_sequence_overrides FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_sequence_overrides.org_id
    AND user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_sequence_overrides.org_id
    AND user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "sdr_sequence_overrides.delete.member" ON sdr_sequence_overrides;
CREATE POLICY "sdr_sequence_overrides.delete.member"
ON sdr_sequence_overrides FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_sequence_overrides.org_id
    AND user_id = auth.uid()
  )
);

-- ============================================================================
-- 3️⃣ Trigger to update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_sdr_sequence_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sdr_sequence_overrides_updated_at ON sdr_sequence_overrides;
CREATE TRIGGER trg_sdr_sequence_overrides_updated_at
BEFORE UPDATE ON sdr_sequence_overrides
FOR EACH ROW
EXECUTE FUNCTION update_sdr_sequence_overrides_updated_at();

-- ============================================================================
-- 4️⃣ Grant permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON sdr_sequence_overrides TO authenticated;

