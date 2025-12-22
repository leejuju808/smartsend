-- =========================================================
-- Block 20200 — SmartSend Inbox Call Outcome Logger v1
-- (So phone calls actually get tracked — not just "we called them, I think.")
-- =========================================================

-- ============================================================================
-- PART 1 — Add Call Tracking Columns to inbox_threads
-- ============================================================================
-- Track how many times they called, when the last call was, and what happened

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS call_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_call_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_call_outcome TEXT; -- e.g. 'answered', 'left_vm', 'no_answer', 'wrong_number'

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_threads_call_count ON public.inbox_threads(call_count) WHERE call_count > 0;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_last_call_at ON public.inbox_threads(last_call_at DESC) WHERE last_call_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_last_call_outcome ON public.inbox_threads(last_call_outcome) WHERE last_call_outcome IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN public.inbox_threads.call_count IS 'Number of times this homeowner has been called';
COMMENT ON COLUMN public.inbox_threads.last_call_at IS 'Timestamp of the most recent call attempt';
COMMENT ON COLUMN public.inbox_threads.last_call_outcome IS 'Outcome of the last call: answered, left_vm, no_answer, wrong_number';

-- ============================================================================
-- PART 2 — Update inbox_activity_log to Support Call Type
-- ============================================================================
-- The activity log already exists from Block 20130, we just need to ensure 'call' is a valid type

-- Update the check constraint to include 'call' type
DO $$
BEGIN
  -- Drop the existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'inbox_activity_log_type_check'
    AND table_name = 'inbox_activity_log'
  ) THEN
    ALTER TABLE public.inbox_activity_log DROP CONSTRAINT inbox_activity_log_type_check;
  END IF;
END$$;

-- Add new constraint that includes 'call'
ALTER TABLE public.inbox_activity_log
  ADD CONSTRAINT inbox_activity_log_type_check 
  CHECK (type IN ('note', 'status_change', 'value_change', 'follow_up', 'system', 'call'));

-- Update comment to reflect call type
COMMENT ON COLUMN public.inbox_activity_log.type IS 'Activity type: note, status_change, value_change, follow_up, system, call';

















































