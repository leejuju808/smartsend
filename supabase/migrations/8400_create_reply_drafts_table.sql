-- Block 8400 — Smart Reply Drafts (AI Reply Suggestions for Hot Leads)
-- Create reply_drafts table for storing AI-generated reply drafts

CREATE TABLE IF NOT EXISTS reply_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_lead_id UUID NOT NULL,
  campaign_id UUID NOT NULL,
  lead_id UUID NOT NULL,
  source TEXT NOT NULL DEFAULT 'ai', -- 'ai' | 'manual' | 'template'
  tone TEXT,                         -- 'casual' | 'neutral' | 'formal', etc.
  length TEXT,                       -- 'short' | 'medium' | 'long'
  subject TEXT,
  body TEXT NOT NULL,
  metadata JSONB,
  created_by TEXT,                   -- e.g. 'system' or user id/email
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  CONSTRAINT reply_drafts_campaign_lead_id_fkey
    FOREIGN KEY (campaign_lead_id) REFERENCES campaign_leads (id) ON DELETE CASCADE,
  CONSTRAINT reply_drafts_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
  CONSTRAINT reply_drafts_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reply_drafts_campaign_lead
  ON reply_drafts (campaign_lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reply_drafts_campaign
  ON reply_drafts (campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reply_drafts_lead
  ON reply_drafts (lead_id, created_at DESC);































































