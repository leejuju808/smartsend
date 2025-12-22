-- Block 39200 — SmartSend Roofing "Invoice Engine + Payments & Collections System" v1
-- Auto-generate invoices • Track payments • Auto-remind homeowners • Handle partial payments
-- Sync with job profit • Collect via Stripe • Stop roofers from chasing money

-- ============================================================
-- 1. EXTEND INVOICES TABLE
-- ============================================================
-- Add missing columns to support Block 39200 features

ALTER TABLE IF EXISTS public.invoices
  ADD COLUMN IF NOT EXISTS roofing_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS balance_due numeric(12,2),
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count integer DEFAULT 0;

-- Update invoice type to include 'progress'
ALTER TABLE IF EXISTS public.invoices
  DROP CONSTRAINT IF EXISTS invoices_type_check;

ALTER TABLE IF EXISTS public.invoices
  ADD CONSTRAINT invoices_type_check 
  CHECK (type IN ('deposit', 'progress', 'final', 'change_order'));

-- Add index for roofing_job_id
CREATE INDEX IF NOT EXISTS idx_invoices_roofing_job ON public.invoices(roofing_job_id) WHERE roofing_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_lead ON public.invoices(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_payment_intent ON public.invoices(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- ============================================================
-- 2. INVOICE EVENTS TABLE
-- ============================================================
-- Track all invoice lifecycle events (created, sent, viewed, reminder_sent, paid, overdue)

CREATE TABLE IF NOT EXISTS public.invoice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN (
    'created',
    'sent',
    'viewed',
    'reminder_sent',
    'paid',
    'partially_paid',
    'overdue',
    'payment_failed',
    'refunded'
  )),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice ON public.invoice_events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_events_event ON public.invoice_events(event);
CREATE INDEX IF NOT EXISTS idx_invoice_events_created ON public.invoice_events(created_at DESC);

-- ============================================================
-- 3. INVOICE PAYMENT REMINDERS TABLE
-- ============================================================
-- Track scheduled and sent payment reminders

CREATE TABLE IF NOT EXISTS public.invoice_payment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  reminder_day integer NOT NULL, -- 1, 3, 7, 14
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  message_text text,
  sent_via text CHECK (sent_via IN ('sms', 'email')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_reminders_invoice ON public.invoice_payment_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payment_reminders_scheduled ON public.invoice_payment_reminders(scheduled_at) WHERE sent_at IS NULL;

-- ============================================================
-- 4. FUNCTION: AUTO-GENERATE INVOICE ON JOB COMPLETION
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_generate_invoice_on_job_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_lead_id uuid;
  v_workspace_id uuid;
  v_job_value numeric;
  v_deposit_paid numeric;
  v_balance_due numeric;
  v_change_order_total numeric;
BEGIN
  -- Only trigger when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
    -- Get job details
    SELECT 
      rj.lead_id,
      rj.workspace_id,
      rj.job_value,
      COALESCE(rj.deposit_paid, 0)
    INTO v_lead_id, v_workspace_id, v_job_value, v_deposit_paid
    FROM public.roofing_jobs rj
    WHERE rj.id = NEW.id;
    
    IF v_lead_id IS NULL OR v_workspace_id IS NULL OR v_job_value IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Calculate change order adjustments
    SELECT COALESCE(SUM(amount), 0)
    INTO v_change_order_total
    FROM public.roofing_change_order_revenue
    WHERE job_id = NEW.id
      AND approved = true;
    
    -- Calculate balance due (job value + change orders - deposit paid)
    v_balance_due := v_job_value + v_change_order_total - v_deposit_paid;
    
    -- Only create invoice if there's a balance due
    IF v_balance_due > 0 THEN
      -- Generate invoice number
      v_invoice_number := generate_invoice_number(NULL, v_workspace_id);
      
      -- Create invoice
      INSERT INTO public.invoices (
        roofing_job_id,
        lead_id,
        workspace_id,
        invoice_number,
        type,
        amount,
        balance_due,
        due_date,
        status
      ) VALUES (
        NEW.id,
        v_lead_id,
        v_workspace_id,
        v_invoice_number,
        'final',
        v_job_value + v_change_order_total,
        v_balance_due, -- Initial balance = amount (no payments yet)
        CURRENT_DATE + INTERVAL '7 days',
        'pending'
      )
      RETURNING id INTO v_invoice_id;
      
      -- Log invoice created event
      INSERT INTO public.invoice_events (invoice_id, event, metadata)
      VALUES (
        v_invoice_id,
        'created',
        jsonb_build_object(
          'job_id', NEW.id,
          'job_value', v_job_value,
          'change_order_total', v_change_order_total,
          'deposit_paid', v_deposit_paid,
          'balance_due', v_balance_due
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on roofing_jobs
DROP TRIGGER IF EXISTS trg_auto_generate_invoice_on_completion ON public.roofing_jobs;
CREATE TRIGGER trg_auto_generate_invoice_on_completion
AFTER UPDATE OF status ON public.roofing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.auto_generate_invoice_on_job_completion();

-- ============================================================
-- 5. FUNCTION: UPDATE INVOICE BALANCE ON PAYMENT
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_invoice_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_amount numeric;
  v_total_paid numeric;
  v_new_status text;
BEGIN
  -- Only process succeeded payments
  IF NEW.status = 'succeeded' THEN
    -- Get invoice amount
    SELECT amount INTO v_invoice_amount
    FROM public.invoices
    WHERE id = NEW.invoice_id;
    
    -- Calculate total paid
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.payments
    WHERE invoice_id = NEW.invoice_id
      AND status = 'succeeded';
    
    -- Calculate and update balance
    PERFORM public.calculate_invoice_balance(NEW.invoice_id);
    
    -- Determine new status
    IF v_total_paid >= v_invoice_amount THEN
      v_new_status := 'paid';
      
      -- Log paid event
      INSERT INTO public.invoice_events (invoice_id, event, metadata)
      VALUES (NEW.invoice_id, 'paid', jsonb_build_object('payment_id', NEW.id, 'amount', NEW.amount));
      
    ELSIF v_total_paid > 0 THEN
      v_new_status := 'partially_paid';
      
      -- Log partially paid event
      INSERT INTO public.invoice_events (invoice_id, event, metadata)
      VALUES (NEW.invoice_id, 'partially_paid', jsonb_build_object('payment_id', NEW.id, 'amount', NEW.amount, 'total_paid', v_total_paid));
    END IF;
    
    -- Update invoice status
    UPDATE public.invoices
    SET status = v_new_status,
        updated_at = now()
    WHERE id = NEW.invoice_id;
    
    -- If fully paid, sync with job costing
    IF v_new_status = 'paid' THEN
      -- Update roofing_job to mark as paid
      UPDATE public.roofing_jobs rj
      SET deposit_paid = (
        SELECT COALESCE(SUM(p.amount), 0)
        FROM public.invoices i
        JOIN public.payments p ON p.invoice_id = i.id
        WHERE i.roofing_job_id = rj.id
          AND p.status = 'succeeded'
      )
      WHERE rj.id = (
        SELECT roofing_job_id
        FROM public.invoices
        WHERE id = NEW.invoice_id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on payments
DROP TRIGGER IF EXISTS trg_update_invoice_on_payment ON public.payments;
CREATE TRIGGER trg_update_invoice_on_payment
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_invoice_on_payment();

-- ============================================================
-- 6. FUNCTION: MARK INVOICES AS OVERDUE
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.invoices
  SET status = 'overdue',
      updated_at = now()
  WHERE status IN ('pending', 'partially_paid')
    AND due_date < CURRENT_DATE
    AND balance_due > 0;
  
  -- Log overdue events
  INSERT INTO public.invoice_events (invoice_id, event, metadata)
  SELECT 
    id,
    'overdue',
    jsonb_build_object('due_date', due_date, 'balance_due', balance_due)
  FROM public.invoices
  WHERE status = 'overdue'
    AND due_date < CURRENT_DATE
    AND balance_due > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.invoice_events
      WHERE invoice_id = invoices.id
        AND event = 'overdue'
        AND created_at::date = CURRENT_DATE
    );
END;
$$;

-- ============================================================
-- 8. FUNCTION: SCHEDULE PAYMENT REMINDERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.schedule_payment_reminders(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice record;
  v_due_date date;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id;
  
  IF NOT FOUND OR v_invoice.status = 'paid' THEN
    RETURN;
  END IF;
  
  v_due_date := COALESCE(v_invoice.due_date, v_invoice.created_at::date + INTERVAL '7 days');
  
  -- Schedule reminders for Day 1, 3, 7, 14
  INSERT INTO public.invoice_payment_reminders (invoice_id, reminder_day, scheduled_at)
  VALUES
    (p_invoice_id, 1, v_invoice.created_at + INTERVAL '1 day'),
    (p_invoice_id, 3, v_invoice.created_at + INTERVAL '3 days'),
    (p_invoice_id, 7, v_invoice.created_at + INTERVAL '7 days'),
    (p_invoice_id, 14, v_invoice.created_at + INTERVAL '14 days')
  ON CONFLICT DO NOTHING;
END;
$$;

-- ============================================================
-- 8. ROW LEVEL SECURITY FOR NEW TABLES
-- ============================================================

-- Invoice events
ALTER TABLE IF EXISTS public.invoice_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_events_access" ON public.invoice_events;
CREATE POLICY "invoice_events_access" ON public.invoice_events
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_events.invoice_id
      AND (
        (i.workspace_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.workspace_members 
          WHERE workspace_id = i.workspace_id AND user_id = auth.uid()
        ))
        OR
        (i.team_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.team_members 
          WHERE team_id = i.team_id AND user_id = auth.uid()
        ))
        OR
        i.contractor_id = auth.uid()
      )
    )
  );

-- Invoice payment reminders
ALTER TABLE IF EXISTS public.invoice_payment_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_payment_reminders_access" ON public.invoice_payment_reminders;
CREATE POLICY "invoice_payment_reminders_access" ON public.invoice_payment_reminders
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_payment_reminders.invoice_id
      AND (
        (i.workspace_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.workspace_members 
          WHERE workspace_id = i.workspace_id AND user_id = auth.uid()
        ))
        OR
        (i.team_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.team_members 
          WHERE team_id = i.team_id AND user_id = auth.uid()
        ))
        OR
        i.contractor_id = auth.uid()
      )
    )
  );

-- Service role has full access
CREATE POLICY IF NOT EXISTS "service_role_full_access_invoice_events"
  ON public.invoice_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_full_access_invoice_payment_reminders"
  ON public.invoice_payment_reminders FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 10. GRANT PERMISSIONS
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON public.invoice_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.invoice_payment_reminders TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_generate_invoice_on_job_completion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice_on_payment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue_invoices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_payment_reminders(uuid) TO authenticated;
































