-- Block 8490 — Unified Reply Inbox v1
-- Add handled fields to campaign_replies

ALTER TABLE campaign_replies
  ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_replies_handled
  ON campaign_replies (handled_at);

CREATE INDEX IF NOT EXISTS idx_campaign_replies_intent
  ON campaign_replies (intent);





