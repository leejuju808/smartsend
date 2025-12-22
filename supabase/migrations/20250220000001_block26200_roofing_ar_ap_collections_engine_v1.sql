-- =========================================================
-- Block 26200 — SmartSend Roofing AR/AP Collections Engine v1
-- (Track unpaid invoices • Insurance check stages • Homeowner balances • Automatic "collect payment" reminders)
-- =========================================================
-- 
-- This block makes SmartSend the money collector, not just the lead-getter.
-- 
-- Every roofing job now has a live "who still owes me what?" view.
-- Every unpaid dollar is tracked with due dates and stages.
-- SmartSend automatically lines up "collect payment" follow-ups for homeowners and adjusters.
-- 
-- This is where roofers feel the system paying for itself.

-- ============================================================================
-- PART 1 — DATABASE STRUCTURE (SUPABASE SQL)
-- ============================================================================

-- 1) Invoices table (AR – money owed to roofer)
CREATE TABLE IF NOT EXISTS public.roofing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- who owes the money
  payer_type text CHECK (payer_type IN ('homeowner', 'insurance', 'other')) NOT NULL,
  payer_name text,
  payer_email text,
  payer_phone text,

  -- invoice numbers & metadata
  invoice_number text,
  description text,
  amount numeric NOT NULL,
  due_date date,
  status text CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'overdue')) DEFAULT 'draft',

  -- insurance-specific
  insurance_company text,
  claim_number text,
  check_stage text CHECK (
    check_stage IN ('none', 'acv_issued', 'depreciation_pending', 'final_paid')
  ) DEFAULT 'none',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for roofing_invoices
CREATE INDEX IF NOT EXISTS idx_roofing_invoices_job ON public.roofing_invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_invoices_workspace ON public.roofing_invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roofing_invoices_status ON public.roofing_invoices(status) 
  WHERE status IN ('sent', 'partial', 'overdue');
CREATE INDEX IF NOT EXISTS idx_roofing_invoices_due_date ON public.roofing_invoices(due_date) 
  WHERE status IN ('sent', 'partial', 'overdue');
CREATE INDEX IF NOT EXISTS idx_roofing_invoices_payer_type ON public.roofing_invoices(payer_type);
CREATE INDEX IF NOT EXISTS idx_roofing_invoices_check_stage ON public.roofing_invoices(check_stage) 
  WHERE payer_type = 'insurance';

-- Trigger to auto-populate workspace_id from job
CREATE OR REPLACE FUNCTION public.roofing_invoices_set_workspace_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.job_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
    FROM public.roofing_jobs
    WHERE id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roofing_invoices_set_workspace_id_trigger ON public.roofing_invoices;
CREATE TRIGGER roofing_invoices_set_workspace_id_trigger
BEFORE INSERT ON public.roofing_invoices
FOR EACH ROW
EXECUTE FUNCTION public.roofing_invoices_set_workspace_id();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.roofing_invoices_update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roofing_invoices_update_updated_at_trigger ON public.roofing_invoices;
CREATE TRIGGER roofing_invoices_update_updated_at_trigger
BEFORE UPDATE ON public.roofing_invoices
FOR EACH ROW
EXECUTE FUNCTION public.roofing_invoices_update_updated_at();

-- 2) Payments table (money actually received)
CREATE TABLE IF NOT EXISTS public.roofing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.roofing_invoices(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,

  amount numeric NOT NULL,
  method text, -- 'check', 'card', 'cash', 'ach', etc.
  received_date date NOT NULL DEFAULT CURRENT_DATE,

  note text,
  created_at timestamptz DEFAULT now()
);

-- Indexes for roofing_payments
CREATE INDEX IF NOT EXISTS idx_roofing_payments_invoice ON public.roofing_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_roofing_payments_job ON public.roofing_payments(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_payments_workspace ON public.roofing_payments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roofing_payments_received_date ON public.roofing_payments(received_date DESC);

-- Trigger to auto-populate workspace_id and job_id from invoice
CREATE OR REPLACE FUNCTION public.roofing_payments_set_ids()
RETURNS trigger AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    IF NEW.job_id IS NULL THEN
      SELECT job_id INTO NEW.job_id
      FROM public.roofing_invoices
      WHERE id = NEW.invoice_id;
    END IF;
    IF NEW.workspace_id IS NULL THEN
      SELECT workspace_id INTO NEW.workspace_id
      FROM public.roofing_invoices
      WHERE id = NEW.invoice_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roofing_payments_set_ids_trigger ON public.roofing_payments;
CREATE TRIGGER roofing_payments_set_ids_trigger
BEFORE INSERT ON public.roofing_payments
FOR EACH ROW
EXECUTE FUNCTION public.roofing_payments_set_ids();

-- 3) Vendor bills table (AP – money roofer owes vendors)
CREATE TABLE IF NOT EXISTS public.roofing_vendor_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,

  vendor_name text NOT NULL,
  vendor_email text,
  invoice_number text,
  description text,

  amount numeric NOT NULL,
  due_date date,
  status text CHECK (status IN ('open', 'scheduled', 'paid', 'overdue')) DEFAULT 'open',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for roofing_vendor_bills
CREATE INDEX IF NOT EXISTS idx_roofing_vendor_bills_job ON public.roofing_vendor_bills(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_vendor_bills_workspace ON public.roofing_vendor_bills(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roofing_vendor_bills_status ON public.roofing_vendor_bills(status) 
  WHERE status IN ('open', 'overdue');
CREATE INDEX IF NOT EXISTS idx_roofing_vendor_bills_due_date ON public.roofing_vendor_bills(due_date) 
  WHERE status IN ('open', 'overdue');

-- Trigger to auto-populate workspace_id from job
CREATE OR REPLACE FUNCTION public.roofing_vendor_bills_set_workspace_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.job_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
    FROM public.roofing_jobs
    WHERE id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roofing_vendor_bills_set_workspace_id_trigger ON public.roofing_vendor_bills;
CREATE TRIGGER roofing_vendor_bills_set_workspace_id_trigger
BEFORE INSERT ON public.roofing_vendor_bills
FOR EACH ROW
EXECUTE FUNCTION public.roofing_vendor_bills_set_workspace_id();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.roofing_vendor_bills_update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roofing_vendor_bills_update_updated_at_trigger ON public.roofing_vendor_bills;
CREATE TRIGGER roofing_vendor_bills_update_updated_at_trigger
BEFORE UPDATE ON public.roofing_vendor_bills
FOR EACH ROW
EXECUTE FUNCTION public.roofing_vendor_bills_update_updated_at();

-- 4) Invoice balance view (live AR per invoice)
CREATE OR REPLACE VIEW public.roofing_invoice_balances AS
SELECT
  i.id AS invoice_id,
  i.job_id,
  i.workspace_id,
  i.payer_type,
  i.payer_name,
  i.payer_email,
  i.payer_phone,
  i.invoice_number,
  i.description,
  i.amount AS invoice_amount,
  COALESCE(SUM(p.amount), 0) AS amount_paid,
  i.amount - COALESCE(SUM(p.amount), 0) AS balance_due,
  i.due_date,
  i.status,
  i.insurance_company,
  i.claim_number,
  i.check_stage,
  i.created_at,
  i.updated_at
FROM public.roofing_invoices i
LEFT JOIN public.roofing_payments p ON p.invoice_id = i.id
GROUP BY i.id;

-- Grant access to the view
GRANT SELECT ON public.roofing_invoice_balances TO authenticated;

-- ============================================================================
-- PART 2 — AUTOMATIC STATUS & OVERDUE LOGIC
-- ============================================================================

-- 1) Update invoice status when a payment is added
CREATE OR REPLACE FUNCTION public.update_invoice_status_after_payment()
RETURNS trigger AS $$
DECLARE
  total_paid numeric;
  invoice_amount numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0), i.amount
  INTO total_paid, invoice_amount
  FROM public.roofing_payments p
  JOIN public.roofing_invoices i ON i.id = p.invoice_id
  WHERE p.invoice_id = NEW.invoice_id
  GROUP BY i.amount;

  UPDATE public.roofing_invoices
  SET status = CASE
    WHEN total_paid <= 0 THEN 'sent'
    WHEN total_paid < invoice_amount THEN 'partial'
    WHEN total_paid >= invoice_amount THEN 'paid'
  END,
  updated_at = now()
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_invoice_status_after_payment ON public.roofing_payments;
CREATE TRIGGER trg_update_invoice_status_after_payment
AFTER INSERT OR UPDATE ON public.roofing_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_invoice_status_after_payment();

-- 2) Daily "overdue" status updater
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS void AS $$
BEGIN
  UPDATE public.roofing_invoices
  SET status = 'overdue',
      updated_at = now()
  WHERE status IN ('sent', 'partial')
    AND due_date < CURRENT_DATE
    AND amount > (
      SELECT COALESCE(SUM(amount), 0)
      FROM public.roofing_payments
      WHERE invoice_id = roofing_invoices.id
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.mark_overdue_invoices IS 'Marks invoices as overdue if due_date has passed and balance is still outstanding. Call this daily via cron.';

-- ============================================================================
-- PART 3 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.roofing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_vendor_bills ENABLE ROW LEVEL SECURITY;

-- RLS Policies for roofing_invoices
CREATE POLICY "Users can view invoices in their workspace"
  ON public.roofing_invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_invoices.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage invoices in their workspace"
  ON public.roofing_invoices FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_invoices.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_invoices.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for roofing_payments
CREATE POLICY "Users can view payments in their workspace"
  ON public.roofing_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_payments.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage payments in their workspace"
  ON public.roofing_payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_payments.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_payments.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for roofing_vendor_bills
CREATE POLICY "Users can view vendor bills in their workspace"
  ON public.roofing_vendor_bills FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_vendor_bills.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage vendor bills in their workspace"
  ON public.roofing_vendor_bills FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_vendor_bills.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_vendor_bills.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 4 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_vendor_bills TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice_status_after_payment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue_invoices() TO authenticated;

COMMENT ON TABLE public.roofing_invoices IS 'Block 26200: AR invoices - money owed to roofer from homeowners, insurance, or others';
COMMENT ON TABLE public.roofing_payments IS 'Block 26200: Payments received against invoices';
COMMENT ON TABLE public.roofing_vendor_bills IS 'Block 26200: AP vendor bills - money roofer owes to vendors';
COMMENT ON VIEW public.roofing_invoice_balances IS 'Block 26200: Live view of invoice balances (invoice amount - payments = balance due)';



































