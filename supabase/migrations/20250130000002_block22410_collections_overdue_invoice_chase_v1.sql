-- =========================================================
-- Block 22410 — SmartSend Roofing Collections & Overdue Invoice Chase v1
-- (Auto-Detect Outstanding Balances, Smart Reminders, & Final Check Recovery Engine)
-- =========================================================
-- 
-- FULL BLOCK. NO CUTS. THIS IS PURE CASHFLOW.
-- 
-- Roofers lose the MOST money right here:
-- - Homeowners "forget" the final check
-- - Insurance companies delay payments
-- - Homeowners slow-walk deductible payments
-- - Jobs sit "completed" but not paid
-- - No one is tracking aging balances
-- - No follow-up system
-- - No automation
-- 
-- SmartSend must fix all of that.
-- 
-- This block creates a Collections Engine that:
-- - Auto-detects unpaid balances
-- - Tracks overdue invoices
-- - Sends smart reminders
-- - Shows an exact Collections Dashboard
-- - Classifies "risk-level" accounts
-- - Helps roofers get PAID FASTER
-- 
-- This is REAL MONEY.
-- This is SmartSend turning jobs into cash.

-- ============================================================================
-- PART 1 — DATABASE ENHANCEMENTS FOR COLLECTIONS
-- ============================================================================
-- Add collections tracking fields to roofing_jobs table

ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS total_invoiced numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paid numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_date date,
  ADD COLUMN IF NOT EXISTS payment_status text 
    CHECK (payment_status IN ('paid','partial','unpaid','overdue')) DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS days_overdue integer DEFAULT 0;

-- Indexes for collections queries
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_payment_status 
  ON public.roofing_jobs(payment_status) 
  WHERE payment_status IN ('overdue','partial','unpaid');

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_days_overdue 
  ON public.roofing_jobs(days_overdue DESC) 
  WHERE days_overdue > 0;

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_balance_due 
  ON public.roofing_jobs(balance_due DESC) 
  WHERE balance_due > 0;

-- ============================================================================
-- PART 2 — RPC FUNCTION — Recalculate Job Payment Summary
-- ============================================================================
-- SmartSend recalculates ALL balances every time a payment changes.
-- This function updates payment tracking fields based on job_payments table.

CREATE OR REPLACE FUNCTION public.recalc_job_payment_summary(p_job_id uuid)
RETURNS void AS $$
DECLARE
  v_total_paid numeric := 0;
  v_last_payment date;
  v_job_value numeric;
  v_balance numeric;
  v_status text := 'unpaid';
  v_days_overdue integer := 0;
  v_completed date;
  v_grace_date date;
BEGIN
  -- Get job contract value
  SELECT job_value, scheduled_end_date 
  INTO v_job_value, v_completed
  FROM public.roofing_jobs 
  WHERE id = p_job_id;

  -- If job not found, return early
  IF v_job_value IS NULL THEN
    RETURN;
  END IF;

  -- Sum all received payments
  SELECT 
    COALESCE(SUM(amount), 0), 
    MAX(received_at::date)
  INTO v_total_paid, v_last_payment
  FROM public.job_payments
  WHERE job_id = p_job_id
    AND status = 'received';

  -- Calculate balance
  v_balance := v_job_value - v_total_paid;

  -- Determine payment status
  IF v_balance <= 0 THEN
    v_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_status := 'partial';
  ELSE
    v_status := 'unpaid';
  END IF;

  -- Determine overdue logic
  -- Job is overdue AFTER "completed" + 10 days grace period
  IF v_completed IS NOT NULL THEN
    v_grace_date := v_completed + interval '10 days';
    IF current_date > v_grace_date AND v_status != 'paid' THEN
      v_status := 'overdue';
      v_days_overdue := current_date - v_grace_date;
    END IF;
  END IF;

  -- Update job fields
  UPDATE public.roofing_jobs
  SET
    total_invoiced = v_job_value,
    total_paid = v_total_paid,
    balance_due = v_balance,
    last_payment_date = v_last_payment,
    payment_status = v_status,
    days_overdue = v_days_overdue,
    updated_at = now()
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.recalc_job_payment_summary IS 'Recalculates payment summary fields (total_paid, balance_due, payment_status, days_overdue) for a job based on job_payments table';

-- ============================================================================
-- PART 3 — TRIGGER — Auto-recalculate on job_payments changes
-- ============================================================================
-- Update the existing trigger to also call recalc_job_payment_summary
-- Note: We keep the existing recalc_job_payments for deposit tracking,
-- but add recalc_job_payment_summary for collections tracking

-- Update the existing trigger function to also call recalc_job_payment_summary
-- Note: The trigger already exists from block 22300, so we're updating the function
CREATE OR REPLACE FUNCTION public.job_payments_after_change()
RETURNS trigger AS $$
DECLARE
  v_job_id uuid;
BEGIN
  -- Get the job_id (from NEW on INSERT/UPDATE, OLD on DELETE)
  v_job_id := COALESCE(NEW.job_id, OLD.job_id);
  
  IF v_job_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Call existing function for deposit tracking
  PERFORM public.recalc_job_payments(v_job_id);
  
  -- Call new function for collections tracking
  PERFORM public.recalc_job_payment_summary(v_job_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- The trigger already exists from block 22300, but ensure it handles DELETE
DROP TRIGGER IF EXISTS job_payments_after_change_trigger ON public.job_payments;
CREATE TRIGGER job_payments_after_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.job_payments
FOR EACH ROW
EXECUTE FUNCTION public.job_payments_after_change();

-- ============================================================================
-- PART 4 — INITIAL BACKFILL — Recalculate all existing jobs
-- ============================================================================
-- Run recalculation on all existing jobs to populate the new fields

DO $$
DECLARE
  v_job_id uuid;
BEGIN
  FOR v_job_id IN SELECT id FROM public.roofing_jobs LOOP
    PERFORM public.recalc_job_payment_summary(v_job_id);
  END LOOP;
END $$;

-- ============================================================================
-- PART 5 — GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.recalc_job_payment_summary(uuid) TO authenticated;

