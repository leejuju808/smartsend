-- Block 20230 — SmartSend Inbox Lost Reason & Competitor Tracker v1
-- (So roofers finally see why they're losing jobs — and to who.)

-- ============================================================================
-- Add Lost Reason & Competitor Fields to inbox_threads
-- ============================================================================
-- These fields track why a job was lost and competitor information

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS lost_reason_category TEXT,
  -- 'price', 'chose_competitor', 'timing', 'insurance_denied', 'other'
  
  ADD COLUMN IF NOT EXISTS lost_reason_detail TEXT,
  ADD COLUMN IF NOT EXISTS lost_to_competitor_name TEXT,
  ADD COLUMN IF NOT EXISTS lost_to_competitor_bid NUMERIC(12,2);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_threads_lost_reason_category 
  ON public.inbox_threads(lost_reason_category) 
  WHERE lost_reason_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_threads_lost_to_competitor_name 
  ON public.inbox_threads(lost_to_competitor_name) 
  WHERE lost_to_competitor_name IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN public.inbox_threads.lost_reason_category IS 'Quick bucket for lost reason: price, chose_competitor, timing, insurance_denied, other';
COMMENT ON COLUMN public.inbox_threads.lost_reason_detail IS 'Short text explanation of why the job was lost';
COMMENT ON COLUMN public.inbox_threads.lost_to_competitor_name IS 'Name of the competitor who won the job';
COMMENT ON COLUMN public.inbox_threads.lost_to_competitor_bid IS 'What the competitor charged (if known)';

-- ============================================================================
-- Update inbox_activity_log to Support 'lost' Type
-- ============================================================================
-- Allow 'lost' as a valid activity type

DO $$
BEGIN
  -- Check if constraint exists and drop it
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inbox_activity_log_type_check'
    AND table_name = 'inbox_activity_log'
  ) THEN
    ALTER TABLE public.inbox_activity_log DROP CONSTRAINT inbox_activity_log_type_check;
  END IF;
END$$;

ALTER TABLE public.inbox_activity_log
  ADD CONSTRAINT inbox_activity_log_type_check 
  CHECK (type IN ('note', 'status_change', 'value_change', 'follow_up', 'system', 'call', 'appointment', 'lost'));

COMMENT ON COLUMN public.inbox_activity_log.type IS 'Activity type: note, status_change, value_change, follow_up, system, call, appointment, lost';

















































