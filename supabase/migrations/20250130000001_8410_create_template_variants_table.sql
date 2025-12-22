-- Block 8410 — Smart Template Rewriter v1 (AI-Powered Template Variants)
-- Migration: 8410_create_template_variants_table.sql

CREATE TABLE IF NOT EXISTS template_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL,
  owner_user_id UUID,
  label TEXT,                  -- e.g. 'Short & casual', 'Formal v2'
  intent TEXT,                 -- 'shorter' | 'longer' | 'more_casual' | 'more_formal' | 'new_angle' | 'subject_only'
  subject TEXT,
  body TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT template_variants_template_id_fkey
    FOREIGN KEY (template_id) REFERENCES email_templates (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_template_variants_template
  ON template_variants (template_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_variants_owner
  ON template_variants (owner_user_id);

-- Enable RLS
ALTER TABLE template_variants ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read variants they own
-- Note: Access control for templates is handled at the application level
CREATE POLICY "template_variants_select"
  ON template_variants
  FOR SELECT
  USING (owner_user_id = auth.uid());

-- RLS Policy: Users can insert variants they own
CREATE POLICY "template_variants_insert"
  ON template_variants
  FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

