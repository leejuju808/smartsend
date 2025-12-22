-- =========================================================
-- Block 254700 — SmartSend Billing & Collections Engine v1
-- "Invoicing, Payment Tracking, Collections Automation, Financing Integration, Deposit Requests"
-- =========================================================
-- 
-- This block turns SmartSend into the money collection machine that roofers have ALWAYS needed.
-- 
-- The #1 reason roofing companies struggle isn't leads. It's cashflow — slow, late, or missing payments.
-- 
-- Roofers currently lose money because:
-- - invoices are sent late
-- - no automated reminders
-- - customers "forget" to pay
-- - deposits aren't collected early
-- - payment schedules aren't enforced
-- - no financing options
-- - no past-due tracking
-- - no collections workflow
-- - sales reps don't follow up
-- - no visibility on outstanding money
-- 
-- SmartSend fixes ALL OF IT.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE invoices TABLE
-- ============================================================================
-- SmartSend automatically creates deposit invoice, material delivery invoice, completion invoice

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid, -- For multi-tenant isolation
  job_id uuid, -- References jobs table
  customer_id uuid, -- References customers table (if exists)
  
  -- Invoice details
  invoice_number text UNIQUE NOT NULL, -- e.g., "INV-4421"
  amount numeric(12,2) NOT NULL,
  due_date date NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid', 'overdue', 'cancelled')),
  
  -- Invoice content
  notes text,
  scope_summary text, -- Brief description of work
  line_items jsonb DEFAULT '[]'::jsonb, -- Array of {description, quantity, unit_price, total}
  
  -- Payment tracking
  paid_amount numeric(12,2) DEFAULT 0,
  balance numeric(12,2) GENERATED ALWAYS AS (amount - COALESCE(paid_amount, 0)) STORED,
  
  -- Links
  payment_link text, -- Customer payment portal link
  financing_link text, -- Financing partner link
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON public.invoices(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_job ON public.invoices(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_overdue ON public.invoices(due_date) WHERE status IN ('unpaid', 'partial') AND due_date < CURRENT_DATE;
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON public.invoices(created_at DESC);

-- ============================================================================
-- PART 2 — CREATE payments TABLE
-- ============================================================================
-- Track all payments: card, ACH, cash, check, financing

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  workspace_id uuid, -- For multi-tenant isolation
  
  -- Payment details
  amount numeric(12,2) NOT NULL,
  date timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL CHECK (method IN ('card', 'ACH', 'cash', 'check', 'financing', 'other')),
  
  -- Payment processing
  transaction_id text, -- External payment processor transaction ID
  reference_number text, -- Check number, ACH reference, etc.
  processor text, -- 'stripe', 'square', 'quickbooks', 'manual', etc.
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_workspace ON public.payments(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_method ON public.payments(method);

-- ============================================================================
-- PART 3 — CREATE payment_schedules TABLE
-- ============================================================================
-- Pre-built roofing payment templates: deposit, mid-install, completion, inspection

CREATE TABLE IF NOT EXISTS public.payment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL, -- References jobs table
  workspace_id uuid, -- For multi-tenant isolation
  
  -- Schedule details
  milestone text NOT NULL, -- 'deposit', 'mid-install', 'completion', 'inspection', 'material_delivery'
  amount numeric(12,2) NOT NULL,
  percentage numeric(5,2), -- Optional: percentage of total job value
  due_event text NOT NULL, -- 'on_approval', 'on_material_delivery', 'on_install_start', 'on_complete', 'on_inspection'
  
  -- Status
  paid boolean DEFAULT false,
  paid_at timestamptz,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL, -- Link to generated invoice
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for payment_schedules
CREATE INDEX IF NOT EXISTS idx_payment_schedules_job ON public.payment_schedules(job_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_workspace ON public.payment_schedules(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_schedules_paid ON public.payment_schedules(paid);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_invoice ON public.payment_schedules(invoice_id) WHERE invoice_id IS NOT NULL;

-- ============================================================================
-- PART 4 — CREATE collections_events TABLE
-- ============================================================================
-- Track all collections automation: reminder_sent, overdue_notice, escalation

CREATE TABLE IF NOT EXISTS public.collections_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  workspace_id uuid, -- For multi-tenant isolation
  
  -- Event details
  event_type text NOT NULL CHECK (event_type IN ('reminder_sent', 'overdue_notice', 'escalation', 'manager_notification', 'payment_received')),
  message text, -- Message sent to customer
  channel text, -- 'email', 'sms', 'phone', 'portal'
  
  -- Automation tracking
  automated boolean DEFAULT true, -- Was this sent automatically?
  sent_at timestamptz DEFAULT now(),
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for collections_events
CREATE INDEX IF NOT EXISTS idx_collections_events_invoice ON public.collections_events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_collections_events_workspace ON public.collections_events(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collections_events_type ON public.collections_events(event_type);
CREATE INDEX IF NOT EXISTS idx_collections_events_sent ON public.collections_events(sent_at DESC);

-- ============================================================================
-- PART 5 — CREATE payment_templates TABLE
-- ============================================================================
-- Pre-built roofing payment templates

CREATE TABLE IF NOT EXISTS public.payment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid, -- NULL = global template
  name text NOT NULL, -- 'Standard Roof', 'Insurance Job', 'Cash Job'
  description text,
  
  -- Template structure
  schedule jsonb NOT NULL, -- Array of {milestone, percentage, due_event}
  -- Example: [{"milestone": "deposit", "percentage": 30, "due_event": "on_approval"}, ...]
  
  -- Metadata
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for payment_templates
CREATE INDEX IF NOT EXISTS idx_payment_templates_workspace ON public.payment_templates(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_templates_default ON public.payment_templates(is_default) WHERE is_default = true;

-- Seed default payment templates
INSERT INTO public.payment_templates (workspace_id, name, description, schedule, is_default)
VALUES
  (NULL, 'Standard Roof', '30% deposit, 50% on material delivery, 20% on completion', 
   '[{"milestone": "deposit", "percentage": 30, "due_event": "on_approval"}, {"milestone": "material_delivery", "percentage": 50, "due_event": "on_material_delivery"}, {"milestone": "completion", "percentage": 20, "due_event": "on_complete"}]'::jsonb, 
   true),
  (NULL, 'Insurance Job', 'Deductible upfront, ACV when approved, depreciation when done',
   '[{"milestone": "deductible", "percentage": null, "due_event": "on_approval"}, {"milestone": "ACV", "percentage": null, "due_event": "on_approval"}, {"milestone": "depreciation", "percentage": null, "due_event": "on_complete"}]'::jsonb,
   false),
  (NULL, 'Cash Job', '50% deposit, 50% completion',
   '[{"milestone": "deposit", "percentage": 50, "due_event": "on_approval"}, {"milestone": "completion", "percentage": 50, "due_event": "on_complete"}]'::jsonb,
   false)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 6 — FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update invoice status based on payments
CREATE OR REPLACE FUNCTION public.update_invoice_status()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_amount numeric;
  v_paid_amount numeric;
BEGIN
  -- Get invoice amount
  SELECT amount INTO v_invoice_amount
  FROM public.invoices
  WHERE id = NEW.invoice_id;
  
  -- Calculate total paid amount
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_amount
  FROM public.payments
  WHERE invoice_id = NEW.invoice_id AND status = 'completed';
  
  -- Update invoice
  UPDATE public.invoices
  SET 
    paid_amount = v_paid_amount,
    status = CASE
      WHEN v_paid_amount >= v_invoice_amount THEN 'paid'
      WHEN v_paid_amount > 0 THEN 'partial'
      WHEN due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'unpaid'
    END,
    updated_at = now()
  WHERE id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update invoice status when payment is added/updated
CREATE TRIGGER trg_update_invoice_on_payment
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION public.update_invoice_status();

-- Function to mark invoices as overdue
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS void AS $$
BEGIN
  UPDATE public.invoices
  SET status = 'overdue'
  WHERE status IN ('unpaid', 'partial')
    AND due_date < CURRENT_DATE
    AND (amount - COALESCE(paid_amount, 0)) > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_workspace_id uuid DEFAULT NULL)
RETURNS text AS $$
DECLARE
  v_prefix text := 'INV-';
  v_number int;
BEGIN
  -- Get next number (workspace-specific or global)
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS int)), 0) + 1
  INTO v_number
  FROM public.invoices
  WHERE (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
    AND invoice_number ~ '^INV-[0-9]+$';
  
  RETURN v_prefix || v_number;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_payment_schedules_updated_at
BEFORE UPDATE ON public.payment_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_payment_templates_updated_at
BEFORE UPDATE ON public.payment_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invoices
CREATE POLICY "invoices_select_workspace_member" ON public.invoices
  FOR SELECT
  USING (
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = invoices.workspace_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "invoices_insert_workspace_member" ON public.invoices
  FOR INSERT
  WITH CHECK (
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = invoices.workspace_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "invoices_update_workspace_member" ON public.invoices
  FOR UPDATE
  USING (
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = invoices.workspace_id
        AND user_id = auth.uid()
    )
  );

-- RLS Policies for payments
CREATE POLICY "payments_select_workspace_member" ON public.payments
  FOR SELECT
  USING (
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = payments.workspace_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "payments_insert_workspace_member" ON public.payments
  FOR INSERT
  WITH CHECK (
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = payments.workspace_id
        AND user_id = auth.uid()
    )
  );

-- RLS Policies for payment_schedules
CREATE POLICY "payment_schedules_select_workspace_member" ON public.payment_schedules
  FOR SELECT
  USING (
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = payment_schedules.workspace_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "payment_schedules_insert_workspace_member" ON public.payment_schedules
  FOR INSERT
  WITH CHECK (
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = payment_schedules.workspace_id
        AND user_id = auth.uid()
    )
  );

-- RLS Policies for collections_events
CREATE POLICY "collections_events_select_workspace_member" ON public.collections_events
  FOR SELECT
  USING (
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = collections_events.workspace_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "collections_events_insert_workspace_member" ON public.collections_events
  FOR INSERT
  WITH CHECK (
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = collections_events.workspace_id
        AND user_id = auth.uid()
    )
  );

-- RLS Policies for payment_templates (readable by all, writable by workspace members)
CREATE POLICY "payment_templates_select_all" ON public.payment_templates
  FOR SELECT
  USING (true);

CREATE POLICY "payment_templates_insert_workspace_member" ON public.payment_templates
  FOR INSERT
  WITH CHECK (
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = payment_templates.workspace_id
        AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — VIEWS FOR DASHBOARD
-- ============================================================================

-- View for outstanding invoices summary
CREATE OR REPLACE VIEW public.invoice_summary AS
SELECT
  workspace_id,
  COUNT(*) FILTER (WHERE status IN ('unpaid', 'partial')) AS outstanding_count,
  COALESCE(SUM(balance) FILTER (WHERE status IN ('unpaid', 'partial')), 0) AS outstanding_amount,
  COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
  COALESCE(SUM(balance) FILTER (WHERE status = 'overdue'), 0) AS overdue_amount,
  COUNT(*) FILTER (WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND status IN ('unpaid', 'partial')) AS due_this_week_count,
  COALESCE(SUM(balance) FILTER (WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND status IN ('unpaid', 'partial')), 0) AS due_this_week_amount
FROM public.invoices
WHERE workspace_id IS NOT NULL
GROUP BY workspace_id;

-- View for unpaid invoices list
CREATE OR REPLACE VIEW public.unpaid_invoices_list AS
SELECT
  i.id,
  i.invoice_number,
  i.job_id,
  i.customer_id,
  i.amount,
  i.balance,
  i.due_date,
  i.status,
  i.issue_date,
  CURRENT_DATE - i.due_date AS days_overdue,
  i.workspace_id
FROM public.invoices i
WHERE i.status IN ('unpaid', 'partial', 'overdue')
  AND i.balance > 0
ORDER BY 
  CASE WHEN i.due_date < CURRENT_DATE THEN 0 ELSE 1 END,
  i.due_date ASC;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.invoices IS 'SmartSend invoice generator - automatically creates deposit, material delivery, and completion invoices';
COMMENT ON TABLE public.payments IS 'Payment tracking - card, ACH, cash, check, financing';
COMMENT ON TABLE public.payment_schedules IS 'Pre-built roofing payment templates with milestone tracking';
COMMENT ON TABLE public.collections_events IS 'Collections automation tracking - reminders, overdue notices, escalations';
COMMENT ON TABLE public.payment_templates IS 'Payment schedule templates: Standard Roof, Insurance Job, Cash Job';






















