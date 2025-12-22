-- =========================================================
-- Block 20040 — SmartSend Inbox Priority Queue & Filters v1
-- (Crush the chaos: hottest roof leads at the top, every time)
-- =========================================================
--
-- This migration creates indexes to speed up "hot lead first" sorting
-- for the inbox priority queue system.
-- =========================================================

-- ============================================================================
-- PART 1 — Priority Queue Performance Indexes
-- ============================================================================

-- Speed up sorting by engagement_level, engagement_score, and updated_at
-- This composite index enables fast "hot → warm → cold" ordering with
-- secondary sort by engagement_score and recency
CREATE INDEX IF NOT EXISTS idx_inbox_threads_engagement
ON public.inbox_threads (
  engagement_level NULLS LAST,
  engagement_score DESC NULLS LAST,
  updated_at DESC NULLS LAST
);

-- Index for status filtering (if you use it)
CREATE INDEX IF NOT EXISTS idx_inbox_threads_status
ON public.inbox_threads (status);

-- ============================================================================
-- PART 2 — Comments
-- ============================================================================

COMMENT ON INDEX idx_inbox_threads_engagement IS 
  'Composite index for fast priority queue sorting: engagement_level → engagement_score → updated_at. Enables "hot leads first" queries.';

COMMENT ON INDEX idx_inbox_threads_status IS 
  'Index for filtering inbox threads by status (open/closed).';

















































