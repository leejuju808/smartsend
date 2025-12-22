-- Block 501 — AI SDR Inbox Assistant
-- Database table for storing AI-generated reply drafts

CREATE TABLE IF NOT EXISTS sdr_reply_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' or future extensions
  draft_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sdr_reply_drafts_lead_idx
ON sdr_reply_drafts (lead_id);

CREATE INDEX IF NOT EXISTS sdr_reply_drafts_user_idx
ON sdr_reply_drafts (user_id);

CREATE INDEX IF NOT EXISTS sdr_reply_drafts_created_idx
ON sdr_reply_drafts (created_at DESC);

-- Enable RLS
ALTER TABLE sdr_reply_drafts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own drafts
CREATE POLICY "Users can read their own drafts"
ON sdr_reply_drafts FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own drafts
CREATE POLICY "Users can insert their own drafts"
ON sdr_reply_drafts FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Service role can insert (for edge function)
CREATE POLICY "Service role can insert drafts"
ON sdr_reply_drafts FOR INSERT
WITH CHECK (true);

