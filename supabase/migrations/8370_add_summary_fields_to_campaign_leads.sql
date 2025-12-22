-- Block 8370 — Lead Timeline Panel (Thread + AI Summary + Next Action)
-- Add summary fields to campaign_leads for AI-generated thread summaries

ALTER TABLE campaign_leads
  ADD COLUMN IF NOT EXISTS thread_summary TEXT,
  ADD COLUMN IF NOT EXISTS thread_stage TEXT,
  ADD COLUMN IF NOT EXISTS thread_next_action TEXT,
  ADD COLUMN IF NOT EXISTS thread_priority TEXT,
  ADD COLUMN IF NOT EXISTS thread_summary_version TEXT,
  ADD COLUMN IF NOT EXISTS thread_summary_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_campaign_leads_thread_summary_updated_at
  ON campaign_leads (thread_summary_updated_at);































































