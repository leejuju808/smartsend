-- Block 500 — AI SDR Persona Profiles
-- Org-wide default personas + lead-level overrides for controlling AI SDR tone/style

-- ============================================================================
-- 1️⃣ Create sdr_personas table
-- ============================================================================

CREATE TABLE IF NOT EXISTS sdr_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tone TEXT NULL,               -- e.g. "friendly, concise, direct"
  formality TEXT NULL,          -- "casual", "neutral", "formal"
  email_length TEXT NULL,       -- "short", "medium", "long"
  region TEXT NULL,             -- "US", "UK", "EU", etc.
  avoid_phrases TEXT[] NULL,    -- ["circle back", "touch base"]
  signature_hint TEXT NULL,     -- "No signature", "Use first name only", etc.

  is_default BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sdr_personas_org_idx
ON sdr_personas (org_id);

-- ============================================================================
-- 2️⃣ Add persona references to sdr_settings and leads
-- ============================================================================

ALTER TABLE sdr_settings
ADD COLUMN IF NOT EXISTS default_persona_id UUID NULL REFERENCES sdr_personas(id) ON DELETE SET NULL;

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS ai_persona_id UUID NULL REFERENCES sdr_personas(id) ON DELETE SET NULL;

-- Indexes for persona lookups
CREATE INDEX IF NOT EXISTS idx_leads_ai_persona ON leads(ai_persona_id);
CREATE INDEX IF NOT EXISTS idx_sdr_settings_default_persona ON sdr_settings(default_persona_id);

-- ============================================================================
-- 3️⃣ RLS Policies for sdr_personas
-- ============================================================================

ALTER TABLE sdr_personas ENABLE ROW LEVEL SECURITY;

-- Allow org members to view personas for their org
DROP POLICY IF EXISTS "sdr_personas.select.member" ON sdr_personas;
CREATE POLICY "sdr_personas.select.member"
ON sdr_personas FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_personas.org_id
    AND user_id = auth.uid()
  )
);

-- Allow admins/members to insert personas
DROP POLICY IF EXISTS "sdr_personas.insert.member" ON sdr_personas;
CREATE POLICY "sdr_personas.insert.member"
ON sdr_personas FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_personas.org_id
    AND user_id = auth.uid()
    AND role IN ('admin', 'member', 'owner')
  )
);

-- Allow admins/members to update personas
DROP POLICY IF EXISTS "sdr_personas.update.member" ON sdr_personas;
CREATE POLICY "sdr_personas.update.member"
ON sdr_personas FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_personas.org_id
    AND user_id = auth.uid()
    AND role IN ('admin', 'member', 'owner')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_personas.org_id
    AND user_id = auth.uid()
    AND role IN ('admin', 'member', 'owner')
  )
);

-- Allow admins/members to delete personas
DROP POLICY IF EXISTS "sdr_personas.delete.member" ON sdr_personas;
CREATE POLICY "sdr_personas.delete.member"
ON sdr_personas FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = sdr_personas.org_id
    AND user_id = auth.uid()
    AND role IN ('admin', 'member', 'owner')
  )
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON sdr_personas TO authenticated;

