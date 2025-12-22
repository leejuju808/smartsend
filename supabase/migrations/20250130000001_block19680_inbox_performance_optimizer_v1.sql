-- =========================================================
-- Block 19680 — Inbox Performance Optimizer v1
-- (Fast Loads, Smooth Scrolling, No Lag With Hundreds of Roofing Leads)
-- =========================================================
--
-- This migration adds optimized indexes and query support for:
-- - Cursor-based pagination
-- - Fast filtering by ai_overall_intent
-- - Efficient message lookups
-- - Search optimization
-- =========================================================

-- ============================================================================
-- 1. OPTIMIZED INDEXES FOR inbox_threads
-- ============================================================================

-- Composite index for filtering by intent and sorting by last_message_at
-- This is the most common query pattern: filter by Hot/Warm/Dead, then sort by recency
CREATE INDEX IF NOT EXISTS idx_inbox_threads_intent_last_message 
  ON public.inbox_threads(ai_overall_intent, last_message_at DESC NULLS LAST);

-- Composite index for campaign + intent + last_message_at (for campaign-specific views)
CREATE INDEX IF NOT EXISTS idx_inbox_threads_campaign_intent_last_message 
  ON public.inbox_threads(campaign_id, ai_overall_intent, last_message_at DESC NULLS LAST);

-- Index for cursor-based pagination (using last_message_at as cursor)
-- Already exists but ensuring it's optimized
CREATE INDEX IF NOT EXISTS idx_inbox_threads_last_message_at_desc 
  ON public.inbox_threads(last_message_at DESC NULLS LAST, id DESC);

-- Index for contact_id lookups (when viewing threads for a specific contact)
CREATE INDEX IF NOT EXISTS idx_inbox_threads_contact_last_message 
  ON public.inbox_threads(contact_id, last_message_at DESC NULLS LAST)
  WHERE contact_id IS NOT NULL;

-- ============================================================================
-- 2. OPTIMIZED INDEXES FOR inbox_messages
-- ============================================================================

-- Composite index for thread messages ordered by created_at (most common query)
CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread_created 
  ON public.inbox_messages(thread_id, created_at ASC, id ASC);

-- Index for received_at (alternative ordering)
CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread_received 
  ON public.inbox_messages(thread_id, received_at ASC, id ASC);

-- Index for campaign + received_at (for campaign-wide message queries)
CREATE INDEX IF NOT EXISTS idx_inbox_messages_campaign_received 
  ON public.inbox_messages(campaign_id, received_at DESC NULLS LAST);

-- ============================================================================
-- 3. ADD last_message_preview COLUMN TO inbox_threads (OPTIONAL OPTIMIZATION)
-- ============================================================================
-- Pre-computed snippet of last message for faster list rendering
-- This avoids joining to inbox_messages table for every thread in the list

ALTER TABLE public.inbox_threads
  ADD COLUMN IF NOT EXISTS last_message_preview text;

-- Update function to maintain last_message_preview when messages are inserted
CREATE OR REPLACE FUNCTION public.update_thread_last_message_preview()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update thread's last_message_preview with first 120 characters of latest message
  UPDATE public.inbox_threads
  SET 
    last_message_preview = LEFT(
      COALESCE(NEW.body_clean, NEW.body_raw, ''),
      120
    )
  WHERE id = NEW.thread_id;
  
  RETURN NEW;
END;
$$;

-- Trigger to maintain last_message_preview
DROP TRIGGER IF EXISTS trg_update_thread_last_message_preview ON public.inbox_messages;
CREATE TRIGGER trg_update_thread_last_message_preview
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_thread_last_message_preview();

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_inbox_threads_intent_last_message IS 
  'Optimized for filtering threads by AI intent (Hot/Warm/Dead) and sorting by recency. Used by inbox list queries.';

COMMENT ON INDEX idx_inbox_threads_campaign_intent_last_message IS 
  'Optimized for campaign-specific inbox views with intent filtering.';

COMMENT ON INDEX idx_inbox_threads_last_message_at_desc IS 
  'Optimized for cursor-based pagination using last_message_at as cursor.';

COMMENT ON INDEX idx_inbox_messages_thread_created IS 
  'Optimized for loading messages for a specific thread, ordered by creation time.';

COMMENT ON COLUMN public.inbox_threads.last_message_preview IS 
  'Pre-computed snippet (first 120 chars) of the last message in the thread. Used for fast list rendering without joining to inbox_messages.';



















































