-- =========================================================
-- Block 20220 — SmartSend Inbox Estimate + Inspection Scheduler v1
-- (One-click way for roofers to set inspection times or estimate appointments directly inside the conversation)
-- =========================================================

-- ============================================================================
-- Add Appointment Fields to inbox_threads
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS appointment_type TEXT CHECK (appointment_type IN ('inspection', 'estimate', 'followup')),
  ADD COLUMN IF NOT EXISTS appointment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appointment_status TEXT CHECK (appointment_status IN ('scheduled', 'completed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS appointment_notes TEXT,
  ADD COLUMN IF NOT EXISTS appointment_address_override TEXT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_threads_appointment_at ON public.inbox_threads(appointment_at) WHERE appointment_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_appointment_status ON public.inbox_threads(appointment_status) WHERE appointment_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_appointment_type ON public.inbox_threads(appointment_type) WHERE appointment_type IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN public.inbox_threads.appointment_type IS 'Appointment type: inspection, estimate, or followup';
COMMENT ON COLUMN public.inbox_threads.appointment_at IS 'Scheduled date and time for the appointment';
COMMENT ON COLUMN public.inbox_threads.appointment_status IS 'Appointment status: scheduled, completed, or cancelled';
COMMENT ON COLUMN public.inbox_threads.appointment_notes IS 'Roofer notes about the appointment';
COMMENT ON COLUMN public.inbox_threads.appointment_address_override IS 'Optional custom address if different from homeowner address';

-- ============================================================================
-- Update inbox_activity_log to allow 'appointment' type
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

-- Add new constraint that includes 'appointment'
ALTER TABLE public.inbox_activity_log
  ADD CONSTRAINT inbox_activity_log_type_check 
  CHECK (type IN ('note', 'status_change', 'value_change', 'follow_up', 'system', 'call', 'appointment'));

-- Update comment to reflect appointment type
COMMENT ON COLUMN public.inbox_activity_log.type IS 'Activity type: note, status_change, value_change, follow_up, system, call, appointment';

