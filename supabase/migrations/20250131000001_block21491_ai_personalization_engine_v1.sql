-- Block 21491 — SmartSend AI Personalization Engine v1 (Local Touch + Homeowner Context)
-- Personalization Events table for tracking AI personalization actions

CREATE TABLE IF NOT EXISTS personalization_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  model TEXT NOT NULL,
  input_context JSONB NOT NULL,
  output_subject TEXT NOT NULL,
  output_body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster lookups by campaign and lead
CREATE INDEX IF NOT EXISTS personalization_events_campaign_lead_idx
  ON personalization_events (campaign_id, lead_id, step);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS personalization_events_created_at_idx
  ON personalization_events (created_at DESC);

-- Enable RLS
ALTER TABLE personalization_events ENABLE ROW LEVEL SECURITY;

-- RLS policies: allow service role full access
CREATE POLICY "personalization_events_service_role_all" ON personalization_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Allow authenticated users to read their own personalization events
CREATE POLICY "personalization_events_select_authenticated" ON personalization_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = personalization_events.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

COMMENT ON TABLE personalization_events IS 'Tracks AI personalization actions for debugging and analytics';
COMMENT ON COLUMN personalization_events.step IS 'Campaign step number (0-indexed or 1-indexed based on campaign structure)';
COMMENT ON COLUMN personalization_events.model IS 'AI model used (e.g., gpt-4o-mini)';
COMMENT ON COLUMN personalization_events.input_context IS 'JSONB containing homeowner data and personalization settings';
COMMENT ON COLUMN personalization_events.output_subject IS 'Final personalized subject line';
COMMENT ON COLUMN personalization_events.output_body IS 'Final personalized email body';














































