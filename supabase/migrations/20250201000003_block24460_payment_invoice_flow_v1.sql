-- =========================================================
-- Block 24460 — SmartSend Roofing Payment & Invoice Flow v1
-- (Down Payments • Progress Payments • Insurance Checks • Final Invoices • Cashflow Tracking • Preventing Revenue Leakage)
-- =========================================================
-- 
-- FULL ROOFING PAYMENT ENGINE — ZERO FLUFF.
-- 
-- This block builds the financial backbone for SmartSend, ensuring roofers get paid on time,
-- avoid cashflow problems, and stop losing money due to poor tracking.
--
-- Every piece below is designed to help roofers:
-- ✔ collect payments faster
-- ✔ avoid unpaid jobs
-- ✔ track insurance money
-- ✔ stay on schedule
-- ✔ keep cashflow steady
-- ✔ eliminate "lost checks" and forgotten invoices
-- =========================================================

-- ============================================================================
-- PART 1 — ENHANCE job_invoices TABLE FOR 4 PAYMENT TYPES
-- ============================================================================
-- Extend existing invoice table to support:
-- 1. Down Payment / Deposit
-- 2. Insurance ACV Check
-- 3. RCV Supplemental / Depreciation Checks
-- 4. Final Invoice

-- Add payment_type column if it doesn't exist (enhancement to block 22880)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'job_invoices' 
    AND column_name = 'payment_type'
  ) THEN
    ALTER TABLE public.job_invoices
      ADD COLUMN payment_type text CHECK (payment_type IN ('deposit', 'acv_check', 'depreciation', 'final_invoice', 'progress')) DEFAULT 'final';
    
    COMMENT ON COLUMN public.job_invoices.payment_type IS 'Block 24460: Payment type - deposit, acv_check, depreciation, final_invoice, or progress';
  END IF;
END $$;

-- Update existing type column to be more specific
DO $$
BEGIN
  -- If type column exists, migrate it to payment_type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'job_invoices' 
    AND column_name = 'type'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'job_invoices' 
    AND column_name = 'payment_type'
  ) THEN
    -- Migrate type values to payment_type
    UPDATE public.job_invoices
    SET payment_type = CASE 
      WHEN type = 'deposit' THEN 'deposit'
      WHEN type = 'progress' THEN 'progress'
      WHEN type = 'final' THEN 'final_invoice'
      ELSE payment_type
    END
    WHERE payment_type IS NULL OR payment_type = 'final';
  END IF;
END $$;

-- Add fields for insurance check tracking
ALTER TABLE public.job_invoices
  ADD COLUMN IF NOT EXISTS check_photo_url text,
  ADD COLUMN IF NOT EXISTS check_number text,
  ADD COLUMN IF NOT EXISTS deposited_at timestamptz,
  ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES public.job_insurance_claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text;

-- Add indexes for payment type queries
CREATE INDEX IF NOT EXISTS idx_job_invoices_payment_type 
  ON public.job_invoices(payment_type, status) 
  WHERE status != 'paid';

CREATE INDEX IF NOT EXISTS idx_job_invoices_due_date 
  ON public.job_invoices(due_date) 
  WHERE status IN ('sent', 'viewed', 'overdue');

CREATE INDEX IF NOT EXISTS idx_job_invoices_insurance_claim 
  ON public.job_invoices(insurance_claim_id) 
  WHERE insurance_claim_id IS NOT NULL;

-- ============================================================================
-- PART 2 — ENHANCE job_payments TABLE FOR INSURANCE CHECKS
-- ============================================================================
-- Add fields to track insurance check details

ALTER TABLE public.job_payments
  ADD COLUMN IF NOT EXISTS payment_type text CHECK (payment_type IN ('deposit', 'acv_check', 'depreciation', 'final_invoice', 'progress', 'other')) DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS check_photo_url text,
  ADD COLUMN IF NOT EXISTS check_number text,
  ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES public.job_insurance_claims(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deposited_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_job_payments_payment_type 
  ON public.job_payments(payment_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_payments_insurance_claim 
  ON public.job_payments(insurance_claim_id) 
  WHERE insurance_claim_id IS NOT NULL;

-- ============================================================================
-- PART 3 — CREATE payment_status_engine TABLE
-- ============================================================================
-- Tracks payment status and triggers automated checks

CREATE TABLE IF NOT EXISTS public.payment_status_engine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.job_invoices(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Status tracking
  payment_type text NOT NULL CHECK (payment_type IN ('deposit', 'acv_check', 'depreciation', 'final_invoice', 'progress')),
  status text NOT NULL CHECK (status IN (
    'paid',
    'unpaid',
    'overdue',
    'insurance_submitted',
    'insurance_approved',
    'insurance_deposited',
    'pending_deposit'
  )) DEFAULT 'unpaid',
  
  -- Amounts
  expected_amount numeric(10,2) NOT NULL,
  received_amount numeric(10,2) DEFAULT 0,
  
  -- Dates
  due_date date,
  sent_at timestamptz,
  received_at timestamptz,
  overdue_at timestamptz,
  
  -- Insurance-specific
  insurance_claim_id uuid REFERENCES public.job_insurance_claims(id) ON DELETE SET NULL,
  supplement_status text CHECK (supplement_status IN ('not_filed', 'filed', 'approved', 'denied')),
  
  -- Alerts
  alert_triggered boolean DEFAULT false,
  alert_reason text,
  last_checked_at timestamptz DEFAULT now(),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_status_job_invoice 
  ON public.payment_status_engine(job_id, invoice_id) 
  WHERE invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_status_job 
  ON public.payment_status_engine(job_id, payment_type);

CREATE INDEX IF NOT EXISTS idx_payment_status_workspace 
  ON public.payment_status_engine(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_payment_status_overdue 
  ON public.payment_status_engine(status, due_date) 
  WHERE status IN ('overdue', 'unpaid') AND due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_status_alert 
  ON public.payment_status_engine(alert_triggered, last_checked_at) 
  WHERE alert_triggered = true;

-- ============================================================================
-- PART 4 — CREATE payment_reminders TABLE
-- ============================================================================
-- Tracks automated payment reminders

CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.job_invoices(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  reminder_type text NOT NULL CHECK (reminder_type IN (
    'deposit_reminder',
    'acv_check_reminder',
    'depreciation_reminder',
    'final_invoice_reminder',
    'overdue_reminder'
  )),
  
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'skipped', 'cancelled')) DEFAULT 'pending',
  
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  
  email_template_key text,
  email_sent_id uuid,
  
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_job 
  ON public.payment_reminders(job_id, reminder_type);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_scheduled 
  ON public.payment_reminders(scheduled_for, status) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_payment_reminders_workspace 
  ON public.payment_reminders(workspace_id, scheduled_for);

-- ============================================================================
-- PART 5 — CREATE FUNCTION: update_payment_status
-- ============================================================================
-- Automatically updates payment status based on invoices and payments

CREATE OR REPLACE FUNCTION public.update_payment_status(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice record;
  v_payment_total numeric;
  v_status text;
  v_due_date date;
  v_now date := current_date;
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id from job once
  SELECT workspace_id INTO v_workspace_id
  FROM public.roofing_jobs
  WHERE id = p_job_id;
  
  -- Process each invoice for this job
  FOR v_invoice IN 
    SELECT * FROM public.job_invoices
    WHERE job_id = p_job_id
    AND status != 'paid'
  LOOP
    -- Calculate total payments for this invoice
    SELECT COALESCE(SUM(amount), 0) INTO v_payment_total
    FROM public.job_payments
    WHERE invoice_id = v_invoice.id;
    
    -- Determine status
    IF v_payment_total >= v_invoice.amount THEN
      v_status := 'paid';
    ELSIF v_invoice.due_date IS NOT NULL AND v_invoice.due_date < v_now THEN
      v_status := 'overdue';
    ELSIF v_invoice.status = 'sent' OR v_invoice.status = 'viewed' THEN
      v_status := 'unpaid';
    ELSE
      v_status := 'unpaid';
    END IF;
    
    -- Update or insert payment status record
    INSERT INTO public.payment_status_engine (
      job_id,
      invoice_id,
      workspace_id,
      payment_type,
      status,
      expected_amount,
      received_amount,
      due_date,
      sent_at,
      received_at,
      overdue_at,
      last_checked_at
    )
    SELECT 
      p_job_id,
      v_invoice.id,
      v_workspace_id,
      COALESCE(v_invoice.payment_type, 'final_invoice'),
      v_status,
      v_invoice.amount,
      v_payment_total,
      v_invoice.due_date,
      CASE WHEN v_invoice.status != 'draft' THEN v_invoice.created_at ELSE NULL END,
      CASE WHEN v_status = 'paid' THEN now() ELSE NULL END,
      CASE WHEN v_status = 'overdue' THEN now() ELSE NULL END,
      now()
    ON CONFLICT (job_id, invoice_id) DO UPDATE SET
      status = EXCLUDED.status,
      received_amount = EXCLUDED.received_amount,
      received_at = EXCLUDED.received_at,
      overdue_at = EXCLUDED.overdue_at,
      last_checked_at = now(),
      updated_at = now();
    
    -- Update invoice status
    UPDATE public.job_invoices
    SET status = v_status,
        updated_at = now()
    WHERE id = v_invoice.id
    AND status != v_status;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.update_payment_status IS 'Block 24460: Automatically updates payment status for all invoices in a job';

-- ============================================================================
-- PART 6 — CREATE FUNCTION: check_payment_alerts
-- ============================================================================
-- Checks for payment issues and triggers alerts

CREATE OR REPLACE FUNCTION public.check_payment_alerts(p_workspace_id uuid DEFAULT NULL)
RETURNS TABLE (
  job_id uuid,
  payment_type text,
  status text,
  alert_reason text,
  expected_amount numeric,
  due_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pse.job_id,
    pse.payment_type,
    pse.status,
    CASE 
      WHEN pse.payment_type = 'deposit' AND pse.status = 'unpaid' THEN 'Missing deposit - job should not start without deposit'
      WHEN pse.payment_type = 'acv_check' AND pse.status = 'unpaid' THEN 'ACV check not received - insurance delay'
      WHEN pse.payment_type = 'depreciation' AND pse.status = 'unpaid' THEN 'Depreciation check overdue - potential revenue loss'
      WHEN pse.payment_type = 'final_invoice' AND pse.status = 'overdue' THEN format('Final invoice overdue by %s days', current_date - pse.due_date)
      ELSE 'Payment issue detected'
    END as alert_reason,
    pse.expected_amount,
    pse.due_date
  FROM public.payment_status_engine pse
  WHERE (p_workspace_id IS NULL OR pse.workspace_id = p_workspace_id)
  AND (
    (pse.payment_type = 'deposit' AND pse.status = 'unpaid')
    OR (pse.payment_type = 'acv_check' AND pse.status = 'unpaid' AND pse.due_date < current_date - interval '7 days')
    OR (pse.payment_type = 'depreciation' AND pse.status = 'unpaid' AND pse.due_date < current_date)
    OR (pse.payment_type = 'final_invoice' AND pse.status = 'overdue')
  )
  AND pse.alert_triggered = false
  ORDER BY 
    CASE pse.payment_type
      WHEN 'deposit' THEN 1
      WHEN 'acv_check' THEN 2
      WHEN 'depreciation' THEN 3
      WHEN 'final_invoice' THEN 4
    END,
    pse.due_date ASC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.check_payment_alerts IS 'Block 24460: Checks for payment issues that need roofer attention';

-- ============================================================================
-- PART 7 — CREATE FUNCTION: calculate_job_payment_summary
-- ============================================================================
-- Calculates payment summary for a job (received, pending, overdue)

CREATE OR REPLACE FUNCTION public.calculate_job_payment_summary(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_total_revenue numeric;
  v_collected numeric;
  v_outstanding numeric;
  v_received jsonb;
  v_pending jsonb;
  v_overdue jsonb;
BEGIN
  -- Get job total revenue
  SELECT COALESCE(job_value, 0) INTO v_total_revenue
  FROM public.roofing_jobs
  WHERE id = p_job_id;
  
  -- Calculate collected amount
  SELECT COALESCE(SUM(amount), 0) INTO v_collected
  FROM public.job_payments
  WHERE job_id = p_job_id;
  
  -- Calculate outstanding
  v_outstanding := GREATEST(v_total_revenue - v_collected, 0);
  
  -- Build received payments array
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', payment_type,
      'amount', amount,
      'method', method,
      'received_at', created_at,
      'notes', notes
    )
    ORDER BY created_at DESC
  ) INTO v_received
  FROM public.job_payments
  WHERE job_id = p_job_id
  AND amount > 0;
  
  -- Build pending payments array
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', payment_type,
      'amount', expected_amount,
      'due_date', due_date,
      'status', status
    )
    ORDER BY 
      CASE payment_type
        WHEN 'deposit' THEN 1
        WHEN 'acv_check' THEN 2
        WHEN 'depreciation' THEN 3
        WHEN 'final_invoice' THEN 4
      END
  ) INTO v_pending
  FROM public.payment_status_engine
  WHERE job_id = p_job_id
  AND status IN ('unpaid', 'insurance_submitted', 'insurance_approved');
  
  -- Build overdue payments array
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', payment_type,
      'amount', expected_amount,
      'due_date', due_date,
      'days_overdue', current_date - due_date,
      'alert_reason', alert_reason
    )
    ORDER BY due_date ASC
  ) INTO v_overdue
  FROM public.payment_status_engine
  WHERE job_id = p_job_id
  AND status = 'overdue';
  
  -- Build result
  v_result := jsonb_build_object(
    'job_id', p_job_id,
    'total_revenue', v_total_revenue,
    'collected', v_collected,
    'outstanding', v_outstanding,
    'received_payments', COALESCE(v_received, '[]'::jsonb),
    'pending_payments', COALESCE(v_pending, '[]'::jsonb),
    'overdue_payments', COALESCE(v_overdue, '[]'::jsonb)
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_job_payment_summary IS 'Block 24460: Returns complete payment summary for a job card';

-- ============================================================================
-- PART 8 — CREATE CASHFLOW DASHBOARD VIEWS
-- ============================================================================

-- View: This Week Cashflow
CREATE OR REPLACE VIEW public.cashflow_this_week AS
SELECT 
  w.id as workspace_id,
  COALESCE(SUM(CASE WHEN pse.status = 'paid' THEN pse.received_amount ELSE 0 END), 0) as collected,
  COALESCE(SUM(CASE WHEN pse.status IN ('unpaid', 'overdue') THEN pse.expected_amount ELSE 0 END), 0) as expected,
  COALESCE(SUM(CASE WHEN pse.status = 'overdue' THEN pse.expected_amount ELSE 0 END), 0) as overdue,
  COALESCE(SUM(CASE WHEN pse.status IN ('unpaid', 'overdue') THEN pse.expected_amount ELSE 0 END), 0) - 
  COALESCE(SUM(CASE WHEN pse.status = 'paid' THEN pse.received_amount ELSE 0 END), 0) as outstanding
FROM public.workspaces w
LEFT JOIN public.payment_status_engine pse ON pse.workspace_id = w.id
WHERE pse.received_at >= date_trunc('week', current_date)
   OR pse.due_date BETWEEN date_trunc('week', current_date) AND date_trunc('week', current_date) + interval '7 days'
   OR pse.status = 'overdue'
GROUP BY w.id;

COMMENT ON VIEW public.cashflow_this_week IS 'Block 24460: This week cashflow summary by workspace';

-- View: Cashflow by Stage
CREATE OR REPLACE VIEW public.cashflow_by_stage AS
SELECT 
  w.id as workspace_id,
  rj.current_stage,
  COUNT(DISTINCT rj.id) as job_count,
  COALESCE(SUM(CASE WHEN pse.payment_type = 'deposit' AND pse.status = 'unpaid' THEN pse.expected_amount ELSE 0 END), 0) as deposits_due,
  COALESCE(SUM(CASE WHEN pse.payment_type = 'acv_check' AND pse.status IN ('unpaid', 'insurance_submitted', 'insurance_approved') THEN pse.expected_amount ELSE 0 END), 0) as acv_pending,
  COALESCE(SUM(CASE WHEN pse.payment_type = 'depreciation' AND pse.status IN ('unpaid', 'insurance_submitted', 'insurance_approved') THEN pse.expected_amount ELSE 0 END), 0) as depreciation_pending,
  COALESCE(SUM(CASE WHEN pse.payment_type = 'final_invoice' AND pse.status = 'overdue' THEN pse.expected_amount ELSE 0 END), 0) as final_invoices_overdue
FROM public.workspaces w
LEFT JOIN public.roofing_jobs rj ON rj.workspace_id = w.id
LEFT JOIN public.payment_status_engine pse ON pse.job_id = rj.id
WHERE rj.status NOT IN ('cancelled', 'lost')
GROUP BY w.id, rj.current_stage;

COMMENT ON VIEW public.cashflow_by_stage IS 'Block 24460: Cashflow breakdown by pipeline stage';

-- ============================================================================
-- PART 9 — INTEGRATE WITH JOB HEALTH SCORE
-- ============================================================================
-- Add payment penalty function to job health score calculation

CREATE OR REPLACE FUNCTION public.calculate_payment_penalty(p_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_penalty integer := 0;
  v_deposit_status text;
  v_acv_status text;
  v_depreciation_status text;
  v_final_invoice_status text;
  v_final_invoice_days integer;
BEGIN
  -- Check deposit status (-15 points if missing)
  SELECT status INTO v_deposit_status
  FROM public.payment_status_engine
  WHERE job_id = p_job_id
  AND payment_type = 'deposit'
  LIMIT 1;
  
  IF v_deposit_status = 'unpaid' THEN
    v_penalty := v_penalty - 15;
  END IF;
  
  -- Check ACV check status (-10 points if not received)
  SELECT status INTO v_acv_status
  FROM public.payment_status_engine
  WHERE job_id = p_job_id
  AND payment_type = 'acv_check'
  LIMIT 1;
  
  IF v_acv_status IN ('unpaid', 'insurance_submitted') THEN
    v_penalty := v_penalty - 10;
  END IF;
  
  -- Check depreciation status (-12 points if overdue)
  SELECT status INTO v_depreciation_status
  FROM public.payment_status_engine
  WHERE job_id = p_job_id
  AND payment_type = 'depreciation'
  LIMIT 1;
  
  IF v_depreciation_status = 'overdue' THEN
    v_penalty := v_penalty - 12;
  END IF;
  
  -- Check final invoice status (-20 points if overdue > 21 days)
  SELECT status, current_date - due_date INTO v_final_invoice_status, v_final_invoice_days
  FROM public.payment_status_engine
  WHERE job_id = p_job_id
  AND payment_type = 'final_invoice'
  LIMIT 1;
  
  IF v_final_invoice_status = 'overdue' AND v_final_invoice_days > 21 THEN
    v_penalty := v_penalty - 20;
  ELSIF v_final_invoice_status = 'overdue' THEN
    v_penalty := v_penalty - 10;
  END IF;
  
  RETURN v_penalty;
END;
$$;

COMMENT ON FUNCTION public.calculate_payment_penalty IS 'Block 24460: Calculates payment penalty for job health score (-15 deposit, -10 ACV, -12 depreciation, -20 final invoice >21 days)';

-- ============================================================================
-- PART 10 — AUTO-TRIGGERS BASED ON PIPELINE STAGE
-- ============================================================================
-- Create triggers that prompt for payment actions at each stage

CREATE OR REPLACE FUNCTION public.trigger_payment_actions_on_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_invoice_id uuid;
  v_org_id uuid;
  v_deposit_amount numeric;
  v_final_amount numeric;
BEGIN
  -- Only process if stage changed
  IF OLD.current_stage = NEW.current_stage THEN
    RETURN NEW;
  END IF;
  
  -- Get job details
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = NEW.id;
  
  -- Get org_id from workspace_id (try to find org for this workspace)
  -- Try to get org_id from existing invoices for this workspace
  SELECT org_id INTO v_org_id
  FROM public.job_invoices ji
  JOIN public.roofing_jobs rj ON rj.id = ji.job_id
  WHERE rj.workspace_id = v_job.workspace_id
  LIMIT 1;
  
  -- If no org_id found, try to get from org_memberships
  IF v_org_id IS NULL THEN
    SELECT om.org_id INTO v_org_id
    FROM public.org_memberships om
    WHERE om.user_id IN (
      SELECT user_id FROM public.workspace_members
      WHERE workspace_id = v_job.workspace_id
      LIMIT 1
    )
    LIMIT 1;
  END IF;
  
  -- Stage: CLAIM_APPROVED → Prompt for deposit invoice
  IF NEW.current_stage = 'CLAIM_APPROVED' AND OLD.current_stage != 'CLAIM_APPROVED' THEN
    -- Check if deposit invoice already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.job_invoices
      WHERE job_id = NEW.id
      AND payment_type = 'deposit'
    ) AND v_org_id IS NOT NULL THEN
      -- Calculate deposit amount
      SELECT GREATEST(COALESCE(job_value, 0) * 0.20, 0) INTO v_deposit_amount
      FROM public.roofing_jobs
      WHERE id = NEW.id;
      
      -- Create deposit invoice prompt (status = draft, roofer needs to send)
      INSERT INTO public.job_invoices (
        org_id,
        job_id,
        payment_type,
        type,
        amount,
        status,
        notes
      )
      VALUES (
        v_org_id,
        NEW.id,
        'deposit',
        'deposit',
        v_deposit_amount,
        'draft',
        'Auto-created when job moved to CLAIM_APPROVED stage'
      )
      RETURNING id INTO v_invoice_id;
      
      -- Create payment status record
      INSERT INTO public.payment_status_engine (
        job_id,
        invoice_id,
        workspace_id,
        payment_type,
        status,
        expected_amount,
        status_reason
      )
      VALUES (
        NEW.id,
        v_invoice_id,
        v_job.workspace_id,
        'deposit',
        'pending_deposit',
        v_deposit_amount,
        'Deposit required before scheduling'
      );
    END IF;
  END IF;
  
  -- Stage: SCHEDULED_INSTALL → Confirm ACV check received
  IF NEW.current_stage = 'SCHEDULED_INSTALL' AND OLD.current_stage != 'SCHEDULED_INSTALL' THEN
    -- Check if ACV check status needs updating
    PERFORM public.update_payment_status(NEW.id);
  END IF;
  
  -- Stage: IN_PROGRESS → Check for ACV and update supplements
  IF NEW.current_stage = 'IN_PROGRESS' AND OLD.current_stage != 'IN_PROGRESS' THEN
    -- Update payment statuses
    PERFORM public.update_payment_status(NEW.id);
  END IF;
  
  -- Stage: COMPLETED → Send final invoice
  IF NEW.current_stage = 'COMPLETED' AND OLD.current_stage != 'COMPLETED' THEN
    -- Check if final invoice exists
    IF NOT EXISTS (
      SELECT 1 FROM public.job_invoices
      WHERE job_id = NEW.id
      AND payment_type = 'final_invoice'
    ) AND v_org_id IS NOT NULL THEN
      -- Calculate final invoice amount
      SELECT GREATEST(COALESCE(job_value, 0) - COALESCE((
        SELECT SUM(amount) FROM public.job_payments WHERE job_id = NEW.id
      ), 0), 0) INTO v_final_amount
      FROM public.roofing_jobs
      WHERE id = NEW.id;
      
      -- Create final invoice (draft, roofer needs to send)
      INSERT INTO public.job_invoices (
        org_id,
        job_id,
        payment_type,
        type,
        amount,
        status,
        due_date,
        notes
      )
      VALUES (
        v_org_id,
        NEW.id,
        'final_invoice',
        'final',
        v_final_amount,
        'draft',
        current_date + interval '14 days',
        'Auto-created when job moved to COMPLETED stage'
      )
      RETURNING id INTO v_invoice_id;
      
      -- Create payment status record
      INSERT INTO public.payment_status_engine (
        job_id,
        invoice_id,
        workspace_id,
        payment_type,
        status,
        expected_amount,
        due_date,
        status_reason
      )
      VALUES (
        NEW.id,
        v_invoice_id,
        v_job.workspace_id,
        'final_invoice',
        'unpaid',
        v_final_amount,
        current_date + interval '14 days',
        'Final invoice - payment due'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_payment_actions_on_stage_change ON public.roofing_jobs;
CREATE TRIGGER trg_payment_actions_on_stage_change
  AFTER UPDATE ON public.roofing_jobs
  FOR EACH ROW
  WHEN (OLD.current_stage IS DISTINCT FROM NEW.current_stage)
  EXECUTE FUNCTION public.trigger_payment_actions_on_stage_change();

COMMENT ON FUNCTION public.trigger_payment_actions_on_stage_change IS 'Block 24460: Auto-triggers payment actions when job stage changes';

-- ============================================================================
-- PART 11 — AUTOMATED PAYMENT REMINDER FUNCTIONS
-- ============================================================================

-- Function: Schedule payment reminders
CREATE OR REPLACE FUNCTION public.schedule_payment_reminder(
  p_job_id uuid,
  p_invoice_id uuid,
  p_reminder_type text,
  p_days_from_now integer DEFAULT 3
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reminder_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id
  SELECT workspace_id INTO v_workspace_id
  FROM public.roofing_jobs
  WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  
  -- Create reminder
  INSERT INTO public.payment_reminders (
    job_id,
    invoice_id,
    workspace_id,
    reminder_type,
    scheduled_for,
    email_template_key
  )
  VALUES (
    p_job_id,
    p_invoice_id,
    v_workspace_id,
    p_reminder_type,
    now() + (p_days_from_now || ' days')::interval,
    CASE p_reminder_type
      WHEN 'deposit_reminder' THEN 'deposit_reminder'
      WHEN 'acv_check_reminder' THEN 'acv_check_reminder'
      WHEN 'depreciation_reminder' THEN 'depreciation_reminder'
      WHEN 'final_invoice_reminder' THEN 'final_invoice_reminder'
      ELSE 'payment_reminder'
    END
  )
  RETURNING id INTO v_reminder_id;
  
  RETURN v_reminder_id;
END;
$$;

COMMENT ON FUNCTION public.schedule_payment_reminder IS 'Block 24460: Schedules a payment reminder';

-- Function: Auto-schedule reminders when invoice is sent
CREATE OR REPLACE FUNCTION public.trigger_schedule_reminders_on_invoice_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reminder_type text;
BEGIN
  -- Only process when invoice status changes to 'sent'
  IF OLD.status != 'sent' AND NEW.status = 'sent' THEN
    -- Determine reminder type based on payment_type
    v_reminder_type := CASE NEW.payment_type
      WHEN 'deposit' THEN 'deposit_reminder'
      WHEN 'acv_check' THEN 'acv_check_reminder'
      WHEN 'depreciation' THEN 'depreciation_reminder'
      WHEN 'final_invoice' THEN 'final_invoice_reminder'
      ELSE 'payment_reminder'
    END;
    
    -- Schedule reminder for 3 days from now
    PERFORM public.schedule_payment_reminder(
      NEW.job_id,
      NEW.id,
      v_reminder_type,
      3
    );
    
    -- Update invoice reminder_sent_at
    UPDATE public.job_invoices
    SET reminder_sent_at = now(),
        reminder_count = reminder_count + 1
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_schedule_reminders_on_invoice_sent ON public.job_invoices;
CREATE TRIGGER trg_schedule_reminders_on_invoice_sent
  AFTER UPDATE ON public.job_invoices
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'sent')
  EXECUTE FUNCTION public.trigger_schedule_reminders_on_invoice_sent();

COMMENT ON FUNCTION public.trigger_schedule_reminders_on_invoice_sent IS 'Block 24460: Auto-schedules reminders when invoice is sent';

-- ============================================================================
-- PART 12 — TRIGGERS TO UPDATE PAYMENT STATUS ON PAYMENT RECEIVED
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_update_payment_status_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update payment status for the job
  PERFORM public.update_payment_status(NEW.job_id);
  
  -- If payment is linked to an invoice, update invoice status
  IF NEW.invoice_id IS NOT NULL THEN
    UPDATE public.job_invoices
    SET status = 'paid',
        updated_at = now()
    WHERE id = NEW.invoice_id
    AND status != 'paid';
    
    -- Update payment status engine
    UPDATE public.payment_status_engine
    SET status = 'paid',
        received_amount = received_amount + NEW.amount,
        received_at = NEW.created_at,
        updated_at = now()
    WHERE invoice_id = NEW.invoice_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_update_payment_status_on_payment ON public.job_payments;
CREATE TRIGGER trg_update_payment_status_on_payment
  AFTER INSERT ON public.job_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_payment_status_on_payment();

COMMENT ON FUNCTION public.trigger_update_payment_status_on_payment IS 'Block 24460: Updates payment status when payment is received';

-- ============================================================================
-- PART 13 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.payment_status_engine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

-- Payment status engine policies
CREATE POLICY "Users can view payment status in their workspace"
  ON public.payment_status_engine
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage payment status in their workspace"
  ON public.payment_status_engine
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Payment reminders policies
CREATE POLICY "Users can view reminders in their workspace"
  ON public.payment_reminders
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage reminders in their workspace"
  ON public.payment_reminders
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 14 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.payment_status_engine TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_reminders TO authenticated;
GRANT SELECT ON public.cashflow_this_week TO authenticated;
GRANT SELECT ON public.cashflow_by_stage TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_payment_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_payment_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_job_payment_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_payment_penalty(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_payment_reminder(uuid, uuid, text, integer) TO authenticated;

-- ============================================================================
-- PART 15 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.payment_status_engine IS 'Block 24460: Payment status tracking engine - automatically updates status and triggers alerts';
COMMENT ON TABLE public.payment_reminders IS 'Block 24460: Automated payment reminder system - schedules and tracks reminders';
COMMENT ON VIEW public.cashflow_this_week IS 'Block 24460: This week cashflow dashboard - expected, collected, outstanding, overdue';
COMMENT ON VIEW public.cashflow_by_stage IS 'Block 24460: Cashflow breakdown by pipeline stage - deposits due, ACV pending, depreciation pending, final invoices overdue';

