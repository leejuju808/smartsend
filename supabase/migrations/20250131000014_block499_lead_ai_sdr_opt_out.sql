-- Block 499 — Lead-Level AI SDR Kill-Switch + Touch History
-- Per-lead opt-out flags for AI SDR

-- ============================================================================
-- 1️⃣ Add lead-level AI SDR opt-out columns
-- ============================================================================

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS ai_sdr_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_sdr_opt_out_reason TEXT NULL,
ADD COLUMN IF NOT EXISTS ai_sdr_opt_out_at TIMESTAMPTZ NULL;

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS leads_ai_sdr_opt_out_idx
ON leads (ai_sdr_opt_out)
WHERE ai_sdr_opt_out = TRUE;

