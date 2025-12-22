-- =========================================================
-- Block 21728 — SmartSend Roofing Lead Status Brain v1
-- (AUTO HOT / WARM / COLD CLASSIFICATION ENGINE)
-- =========================================================
-- 
-- This is THE engine that makes SmartSend feel like magic.
-- Roofers don't lose money because they lack leads.
-- They lose money because they don't know which leads are worth chasing today.
-- 
-- This status engine automatically updates every lead to:
-- - HOT (call NOW)
-- - WARM (follow-up automatically)
-- - COLD (slow-drip nurture, no wasted time)
-- 
-- Based on:
-- - Email replies
-- - Tone/intent AI detection
-- - Homeowner questions
-- - Appointment interest
-- - No-response time windows
-- - Behavior (opens, clicks, patterns)

-- ============================================================================
-- 1. ADD/MODIFY STATUS COLUMN ON LEADS TABLE
-- ============================================================================

-- Add status column if it doesn't exist, or modify check constraint
DO $$
BEGIN
  -- Add status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN status text DEFAULT 'new' 
    CHECK (status IN ('hot', 'warm', 'cold', 'new'));
  ELSE
    -- Column exists, modify the check constraint
    -- First drop existing constraint if it exists
    ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
    -- Add new constraint
    ALTER TABLE public.leads 
    ADD CONSTRAINT leads_status_check 
    CHECK (status IN ('hot', 'warm', 'cold', 'new'));
    -- Update default if needed
    ALTER TABLE public.leads 
    ALTER COLUMN status SET DEFAULT 'new';
  END IF;
END $$;

-- Index for fast status queries
CREATE INDEX IF NOT EXISTS idx_leads_status 
ON public.leads(status) 
WHERE status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_workspace_status 
ON public.leads(workspace_id, status) 
WHERE status IS NOT NULL;

-- ============================================================================
-- 2. ADD COLUMNS FOR TIME-BASED STATUS TRACKING
-- ============================================================================

-- Track last email sent to lead
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'last_email_sent_at'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN last_email_sent_at timestamptz;
  END IF;
END $$;

-- Track last email opened
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'last_email_opened_at'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN last_email_opened_at timestamptz;
  END IF;
END $$;

-- Track last reply received
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'last_reply_at'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN last_reply_at timestamptz;
  END IF;
END $$;

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_leads_last_email_sent_at 
ON public.leads(last_email_sent_at) 
WHERE last_email_sent_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_last_reply_at 
ON public.leads(last_reply_at) 
WHERE last_reply_at IS NOT NULL;

-- ============================================================================
-- 3. FUNCTION: Auto-update status based on time rules
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_update_lead_status_by_time()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- After 3 days with no reply → downgrade to warm
  UPDATE public.leads
  SET status = 'warm'
  WHERE status = 'hot'
    AND last_email_sent_at IS NOT NULL
    AND last_reply_at IS NULL
    AND last_email_sent_at < NOW() - INTERVAL '3 days';

  -- After 7 days with no opens → downgrade to cold
  UPDATE public.leads
  SET status = 'cold'
  WHERE status IN ('hot', 'warm')
    AND last_email_sent_at IS NOT NULL
    AND last_email_opened_at IS NULL
    AND last_email_sent_at < NOW() - INTERVAL '7 days';

  -- If they reopen emails after 7 days → upgrade to warm
  UPDATE public.leads
  SET status = 'warm'
  WHERE status = 'cold'
    AND last_email_opened_at IS NOT NULL
    AND last_email_opened_at > NOW() - INTERVAL '1 day';
END;
$$;

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.leads.status IS 'Lead status: hot (call NOW), warm (follow-up automatically), cold (slow-drip nurture), new (default)';
COMMENT ON COLUMN public.leads.last_email_sent_at IS 'Timestamp of last email sent to this lead';
COMMENT ON COLUMN public.leads.last_email_opened_at IS 'Timestamp of last email opened by this lead';
COMMENT ON COLUMN public.leads.last_reply_at IS 'Timestamp of last reply received from this lead';
COMMENT ON FUNCTION public.auto_update_lead_status_by_time IS 'Automatically updates lead status based on time-based rules (3 days, 7 days)';










































