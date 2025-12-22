-- Block 490 — Lead Timeline & AI SDR Activity Feed
-- Generic Lead Activity Events Table

CREATE TABLE IF NOT EXISTS lead_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,          -- 'email_sent', 'reply_received', 'intent_scored', 'pipeline_changed', 'autopilot_queued', 'autopilot_dispatched', 'open', 'click', 'note', etc.
  source TEXT NULL,                  -- 'campaign' | 'ai_sdr' | 'system' | 'user'
  related_table TEXT NULL,           -- 'send_queue' | 'lead_replies' | 'sdr_autopilot_queue' | ...
  related_id UUID NULL,              -- ID in the related_table
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_activity_events_lead_created_idx
ON lead_activity_events (lead_id, created_at DESC);

-- Add RLS policies if needed (adjust based on your auth setup)
ALTER TABLE lead_activity_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read events for leads in their workspace
CREATE POLICY "Users can read lead_activity_events for their workspace leads"
ON lead_activity_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM leads
    WHERE leads.id = lead_activity_events.lead_id
    AND leads.workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  )
);

-- Policy: Service role can insert/update/delete (for edge functions)
CREATE POLICY "Service role can manage lead_activity_events"
ON lead_activity_events
FOR ALL
USING (auth.role() = 'service_role');

