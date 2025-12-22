-- =========================================================
-- Block 20060 — SmartSend Inbox Follow-Up Queue & "Today" View v1
-- (Roofers start their day with a clean list: "Here's who to call today.")
-- =========================================================

-- ============================================================================
-- Follow-Up Indexes for Fast Querying
-- ============================================================================
-- These indexes make it fast to query follow-ups by next_action_at
-- and filter by lead_stage simultaneously

-- Index on next_action_at (already exists from Block 20050, but ensuring it's there)
CREATE INDEX IF NOT EXISTS idx_inbox_threads_next_action_at
ON public.inbox_threads (next_action_at);

-- Composite index for filtering by lead_stage and sorting by next_action_at
-- This is especially useful for queries like:
-- "Get all threads with lead_stage != 'won' AND lead_stage != 'lost' 
--  ordered by next_action_at"
CREATE INDEX IF NOT EXISTS idx_inbox_threads_lead_stage_next
ON public.inbox_threads (lead_stage, next_action_at);

-- Comments for documentation
COMMENT ON INDEX idx_inbox_threads_next_action_at IS 'Fast lookup of threads by follow-up date';
COMMENT ON INDEX idx_inbox_threads_lead_stage_next IS 'Fast filtering by lead stage and sorting by follow-up date';

















































