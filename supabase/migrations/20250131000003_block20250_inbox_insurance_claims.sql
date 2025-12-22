-- =========================================================
-- Block 20250 — SmartSend Inbox Insurance Claim Tracker v1
-- (So roofers can SEE every insurance claim detail for a homeowner in one place — not buried in notes.)
-- =========================================================

-- ============================================================================
-- Add Insurance Claim Fields to inbox_threads
-- ============================================================================
-- We already have is_insurance_claim and insurance_carrier from earlier JobValueBar.
-- This block makes that actually useful by adding detailed claim tracking fields.

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS insurance_claim_number TEXT,
  ADD COLUMN IF NOT EXISTS insurance_adjuster_name TEXT,
  ADD COLUMN IF NOT EXISTS insurance_adjuster_phone TEXT,
  ADD COLUMN IF NOT EXISTS insurance_deductible NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS insurance_status TEXT CHECK (insurance_status IN ('not_started', 'filed', 'inspection_scheduled', 'approved', 'denied', 'paid')),
  ADD COLUMN IF NOT EXISTS insurance_notes TEXT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_threads_insurance_status ON public.inbox_threads(insurance_status) WHERE insurance_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_insurance_claim_number ON public.inbox_threads(insurance_claim_number) WHERE insurance_claim_number IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN public.inbox_threads.insurance_claim_number IS 'Insurance claim number/reference';
COMMENT ON COLUMN public.inbox_threads.insurance_adjuster_name IS 'Name of the insurance adjuster assigned to the claim';
COMMENT ON COLUMN public.inbox_threads.insurance_adjuster_phone IS 'Phone number for the insurance adjuster';
COMMENT ON COLUMN public.inbox_threads.insurance_deductible IS 'Insurance deductible amount ($)';
COMMENT ON COLUMN public.inbox_threads.insurance_status IS 'Claim status: not_started, filed, inspection_scheduled, approved, denied, paid';
COMMENT ON COLUMN public.inbox_threads.insurance_notes IS 'Notes about the insurance claim (adjuster visits, supplements, etc.)';

-- ============================================================================
-- Update inbox_activity_log to allow 'insurance' type
-- ============================================================================

-- Drop the existing constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'inbox_activity_log_type_check'
    AND table_name = 'inbox_activity_log'
  ) THEN
    ALTER TABLE public.inbox_activity_log DROP CONSTRAINT inbox_activity_log_type_check;
  END IF;
END$$;

-- Add new constraint that includes 'insurance'
-- Note: This will include all existing types plus 'insurance'
ALTER TABLE public.inbox_activity_log
  ADD CONSTRAINT inbox_activity_log_type_check 
  CHECK (type IN ('note', 'status_change', 'value_change', 'follow_up', 'system', 'call', 'appointment', 'insurance'));

-- Update comment to reflect insurance type
COMMENT ON COLUMN public.inbox_activity_log.type IS 'Activity type: note, status_change, value_change, follow_up, system, call, appointment, insurance';

















































