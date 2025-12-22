-- Block 8390 — Notification Center UI (Hot Lead & Reply Alerts Dashboard)
-- Add seen_at column to lead_notifications table

ALTER TABLE lead_notifications
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_lead_notifications_seen_at
  ON lead_notifications (seen_at);

-- Optional: faster filtering by type/channel
CREATE INDEX IF NOT EXISTS idx_lead_notifications_type
  ON lead_notifications (type);

CREATE INDEX IF NOT EXISTS idx_lead_notifications_campaign_lead
  ON lead_notifications (campaign_lead_id);































































