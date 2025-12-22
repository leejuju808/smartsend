-- Block 493 — AI SDR Assist Mode Review Queue
-- Human approval for AI SDR drafts in "assist" mode

-- Add review status and edit fields to sdr_autopilot_queue
ALTER TABLE sdr_autopilot_queue
ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved',
ADD COLUMN IF NOT EXISTS approved_by UUID NULL, -- future: reference users table
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS edited_subject TEXT NULL,
ADD COLUMN IF NOT EXISTS edited_body TEXT NULL;

-- Add index for efficient review queue queries
CREATE INDEX IF NOT EXISTS idx_sdr_autopilot_queue_review_status 
ON sdr_autopilot_queue(review_status, status, created_at) 
WHERE review_status = 'pending_review';

-- Add constraint to ensure valid review_status values
ALTER TABLE sdr_autopilot_queue
DROP CONSTRAINT IF EXISTS sdr_autopilot_queue_review_status_check;

ALTER TABLE sdr_autopilot_queue
ADD CONSTRAINT sdr_autopilot_queue_review_status_check 
CHECK (review_status IN ('pending_review', 'approved', 'skipped'));

