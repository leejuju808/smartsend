-- =========================================================
-- Block 20120 — SmartSend Inbox Unread + SLA Heat Alerts v1
-- (Make sure hot homeowners never wait half a day for a reply)
-- =========================================================

-- ============================================================================
-- Add Unread Tracking & Last Viewed Fields to inbox_threads
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS unread_inbound_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

-- ============================================================================
-- Create Indexes for SLA / Alert Queries
-- ============================================================================

-- Index for last_contact_at (for SLA queries)
CREATE INDEX IF NOT EXISTS idx_inbox_threads_last_contact_at 
  ON public.inbox_threads(last_contact_at);

-- Index for last_viewed_at (for tracking when conversations were last viewed)
CREATE INDEX IF NOT EXISTS idx_inbox_threads_last_viewed_at 
  ON public.inbox_threads(last_viewed_at);

-- Index for unread_inbound_count (for quick unread queries)
CREATE INDEX IF NOT EXISTS idx_inbox_threads_unread_inbound_count 
  ON public.inbox_threads(unread_inbound_count) 
  WHERE unread_inbound_count > 0;

-- ============================================================================
-- Trigger Function to Increment Unread Count on Inbound Messages
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_unread_inbound_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only increment for inbound messages (direction = 'in' or 'inbound')
  IF NEW.direction IN ('in', 'inbound', 'incoming') AND NEW.thread_id IS NOT NULL THEN
    UPDATE public.inbox_threads
    SET 
      unread_inbound_count = COALESCE(unread_inbound_count, 0) + 1,
      updated_at = NOW()
    WHERE id = NEW.thread_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on inbox_messages insert
DROP TRIGGER IF EXISTS trg_increment_unread_inbound_count ON public.inbox_messages;
CREATE TRIGGER trg_increment_unread_inbound_count
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_unread_inbound_count();

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON COLUMN public.inbox_threads.unread_inbound_count IS 'Number of unread inbound messages from homeowner in this conversation';
COMMENT ON COLUMN public.inbox_threads.last_viewed_at IS 'When someone on the team last viewed this conversation thread';
COMMENT ON FUNCTION public.increment_unread_inbound_count() IS 'Automatically increments unread_inbound_count when an inbound message is inserted';

