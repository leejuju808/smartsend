-- Block 8380 — Hot Lead Alerts (Auto-Notify on High-Intent Replies)
-- Create lead_notifications table for tracking and sending notifications

CREATE TABLE IF NOT EXISTS lead_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_lead_id UUID NOT NULL,
  campaign_id UUID NOT NULL,
  lead_id UUID NOT NULL,

  type TEXT NOT NULL, -- e.g. 'hot_lead', 'reply', 'unsubscribe'
  channel TEXT NOT NULL DEFAULT 'webhook', -- 'webhook', 'email', 'slack', etc.

  payload JSONB,          -- raw structured data for the notification
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  error TEXT,             -- last error message if failed
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Basic FKs (adjust table names/PKs if slightly different)
ALTER TABLE lead_notifications
  ADD CONSTRAINT lead_notifications_campaign_lead_id_fkey
    FOREIGN KEY (campaign_lead_id) REFERENCES campaign_leads (id) ON DELETE CASCADE;

ALTER TABLE lead_notifications
  ADD CONSTRAINT lead_notifications_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE;

ALTER TABLE lead_notifications
  ADD CONSTRAINT lead_notifications_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_lead_notifications_status
  ON lead_notifications (status);

CREATE INDEX IF NOT EXISTS idx_lead_notifications_created_at
  ON lead_notifications (created_at DESC);































































