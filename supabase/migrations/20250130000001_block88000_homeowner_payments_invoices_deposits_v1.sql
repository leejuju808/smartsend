-- Block 88000 — SmartSend Roofing "Homeowner Payments + Invoices + Deposits System" v1
-- This block turns SmartSend from a lead → job system into a lead → job → MONEY COLLECTED system.
-- This is where SmartSend becomes the place roofers get PAID.

-- ============================================================================
-- PART 1 — INVOICES TABLE
-- ============================================================================
-- Core invoice table for tracking all homeowner invoices

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, -- Organization/company that owns this invoice
  job_id uuid, -- Link to roofing_jobs (optional - can be standalone invoice)
  
  invoice_number text NOT NULL, -- Unique invoice number (e.g., INV-2025-001)
  homeowner_name text NOT NULL,
  homeowner_email text NOT NULL,
  
  amount_due numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  
  due_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'cancelled')),
  
  invoice_type text DEFAULT 'full' CHECK (invoice_type IN ('deposit', 'full', 'progress', 'change_order', 'supplement')),
  
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure invoice number is unique per org
  UNIQUE(org_id, invoice_number)
);

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job ON public.invoices(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_homeowner_email ON public.invoices(homeowner_email);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON public.invoices(created_at DESC);

-- ============================================================================
-- PART 2 — INVOICE ITEMS TABLE
-- ============================================================================
-- Line items for each invoice (tear-off, materials, labor, etc.)

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  
  description text NOT NULL, -- e.g., "Tear-off labor", "Material cost", "Dump fees"
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  total numeric(12,2) NOT NULL, -- Calculated: quantity * unit_price
  
  line_order integer NOT NULL DEFAULT 0, -- For ordering items on invoice
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for invoice_items
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_order ON public.invoice_items(invoice_id, line_order);

-- ============================================================================
-- PART 3 — PAYMENTS TABLE
-- ============================================================================
-- Records of all payments received

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  job_id uuid, -- Can track payments even without invoice
  
  amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('card', 'ach', 'check', 'cash', 'other')),
  
  stripe_payment_id text, -- Stripe payment intent or charge ID
  stripe_payment_link_id text, -- Stripe payment link ID if used
  
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded')),
  
  payer_name text,
  payer_email text,
  
  metadata jsonb DEFAULT '{}'::jsonb, -- Additional payment data
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_org ON public.payments(org_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_job ON public.payments(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe ON public.payments(stripe_payment_id) WHERE stripe_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_created ON public.payments(created_at DESC);

-- ============================================================================
-- PART 4 — PAYMENT LINKS TABLE
-- ============================================================================
-- Stripe payment links for invoices (deposit, full payment, partial)

CREATE TABLE IF NOT EXISTS public.payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  
  payment_url text NOT NULL, -- Stripe payment link URL
  stripe_payment_link_id text NOT NULL, -- Stripe payment link ID
  
  link_type text NOT NULL CHECK (link_type IN ('deposit', 'full_payment', 'partial', 'custom')),
  amount numeric(12,2) NOT NULL, -- Amount this link is for
  
  expires_at timestamptz, -- When link expires (if applicable)
  is_active boolean NOT NULL DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for payment_links
CREATE INDEX IF NOT EXISTS idx_payment_links_invoice ON public.payment_links(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_stripe ON public.payment_links(stripe_payment_link_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_active ON public.payment_links(invoice_id, is_active) WHERE is_active = true;

-- ============================================================================
-- PART 5 — PAYMENT REMINDERS TABLE
-- ============================================================================
-- Tracks automated payment reminders sent to homeowners

CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  
  reminder_type text NOT NULL CHECK (reminder_type IN ('due_soon', 'due_tomorrow', 'overdue', 'escalation')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  
  email_sent boolean NOT NULL DEFAULT false,
  email_sent_at timestamptz,
  
  sms_sent boolean NOT NULL DEFAULT false,
  sms_sent_at timestamptz,
  
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Indexes for payment_reminders
CREATE INDEX IF NOT EXISTS idx_payment_reminders_invoice ON public.payment_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_sent ON public.payment_reminders(sent_at DESC);

-- ============================================================================
-- PART 6 — FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update invoice amount_paid when payment is recorded
CREATE OR REPLACE FUNCTION public.update_invoice_amount_paid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'succeeded' AND (OLD.status IS NULL OR OLD.status != 'succeeded') THEN
    -- Payment succeeded, add to invoice
    UPDATE public.invoices
    SET 
      amount_paid = COALESCE(amount_paid, 0) + NEW.amount,
      status = CASE
        WHEN amount_due <= (COALESCE(amount_paid, 0) + NEW.amount) THEN 'paid'
        WHEN (COALESCE(amount_paid, 0) + NEW.amount) > 0 THEN 'partial'
        ELSE status
      END,
      updated_at = now()
    WHERE id = NEW.invoice_id;
  ELSIF OLD.status = 'succeeded' AND NEW.status != 'succeeded' THEN
    -- Payment was reversed, subtract from invoice
    UPDATE public.invoices
    SET 
      amount_paid = GREATEST(COALESCE(amount_paid, 0) - OLD.amount, 0),
      status = CASE
        WHEN amount_paid - OLD.amount <= 0 THEN 'pending'
        WHEN amount_due > (amount_paid - OLD.amount) THEN 'partial'
        ELSE 'paid'
      END,
      updated_at = now()
    WHERE id = NEW.invoice_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update invoice when payment status changes
DROP TRIGGER IF EXISTS trg_update_invoice_on_payment ON public.payments;
CREATE TRIGGER trg_update_invoice_on_payment
AFTER INSERT OR UPDATE OF status, amount ON public.payments
FOR EACH ROW
WHEN (NEW.invoice_id IS NOT NULL)
EXECUTE FUNCTION public.update_invoice_amount_paid();

-- Function to mark invoices as overdue
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS void AS $$
BEGIN
  UPDATE public.invoices
  SET status = 'overdue'
  WHERE status IN ('pending', 'partial')
    AND due_date IS NOT NULL
    AND due_date < CURRENT_DATE
    AND amount_due > amount_paid;
END;
$$ LANGUAGE plpgsql;

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_org_id uuid)
RETURNS text AS $$
DECLARE
  v_count integer;
  v_year text;
  v_number text;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  SELECT COUNT(*) INTO v_count
  FROM public.invoices
  WHERE org_id = p_org_id
    AND invoice_number LIKE 'INV-' || v_year || '-%';
  
  v_number := 'INV-' || v_year || '-' || LPAD((v_count + 1)::text, 6, '0');
  
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate invoice number if not provided
CREATE OR REPLACE FUNCTION public.auto_generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := public.generate_invoice_number(NEW.org_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_generate_invoice_number ON public.invoices;
CREATE TRIGGER trg_auto_generate_invoice_number
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.auto_generate_invoice_number();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

-- Helper function to check org membership
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.org_memberships
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for invoices
DROP POLICY IF EXISTS "invoices_select_org_members" ON public.invoices;
CREATE POLICY "invoices_select_org_members" ON public.invoices
  FOR SELECT
  USING (is_org_member(org_id));

DROP POLICY IF EXISTS "invoices_insert_org_members" ON public.invoices;
CREATE POLICY "invoices_insert_org_members" ON public.invoices
  FOR INSERT
  WITH CHECK (is_org_member(org_id));

DROP POLICY IF EXISTS "invoices_update_org_members" ON public.invoices;
CREATE POLICY "invoices_update_org_members" ON public.invoices
  FOR UPDATE
  USING (is_org_member(org_id))
  WITH CHECK (is_org_member(org_id));

DROP POLICY IF EXISTS "invoices_delete_org_members" ON public.invoices;
CREATE POLICY "invoices_delete_org_members" ON public.invoices
  FOR DELETE
  USING (is_org_member(org_id));

-- RLS Policies for invoice_items (inherit from invoice)
DROP POLICY IF EXISTS "invoice_items_select_invoice" ON public.invoice_items;
CREATE POLICY "invoice_items_select_invoice" ON public.invoice_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND is_org_member(invoices.org_id)
    )
  );

DROP POLICY IF EXISTS "invoice_items_modify_invoice" ON public.invoice_items;
CREATE POLICY "invoice_items_modify_invoice" ON public.invoice_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND is_org_member(invoices.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND is_org_member(invoices.org_id)
    )
  );

-- RLS Policies for payments
DROP POLICY IF EXISTS "payments_select_org_members" ON public.payments;
CREATE POLICY "payments_select_org_members" ON public.payments
  FOR SELECT
  USING (is_org_member(org_id));

DROP POLICY IF EXISTS "payments_insert_org_members" ON public.payments;
CREATE POLICY "payments_insert_org_members" ON public.payments
  FOR INSERT
  WITH CHECK (is_org_member(org_id));

DROP POLICY IF EXISTS "payments_update_org_members" ON public.payments;
CREATE POLICY "payments_update_org_members" ON public.payments
  FOR UPDATE
  USING (is_org_member(org_id))
  WITH CHECK (is_org_member(org_id));

-- RLS Policies for payment_links (inherit from invoice)
DROP POLICY IF EXISTS "payment_links_select_invoice" ON public.payment_links;
CREATE POLICY "payment_links_select_invoice" ON public.payment_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = payment_links.invoice_id
        AND is_org_member(invoices.org_id)
    )
  );

DROP POLICY IF EXISTS "payment_links_modify_invoice" ON public.payment_links;
CREATE POLICY "payment_links_modify_invoice" ON public.payment_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = payment_links.invoice_id
        AND is_org_member(invoices.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = payment_links.invoice_id
        AND is_org_member(invoices.org_id)
    )
  );

-- RLS Policies for payment_reminders (inherit from invoice)
DROP POLICY IF EXISTS "payment_reminders_select_invoice" ON public.payment_reminders;
CREATE POLICY "payment_reminders_select_invoice" ON public.payment_reminders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = payment_reminders.invoice_id
        AND is_org_member(invoices.org_id)
    )
  );

DROP POLICY IF EXISTS "payment_reminders_modify_invoice" ON public.payment_reminders;
CREATE POLICY "payment_reminders_modify_invoice" ON public.payment_reminders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = payment_reminders.invoice_id
        AND is_org_member(invoices.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = payment_reminders.invoice_id
        AND is_org_member(invoices.org_id)
    )
  );

-- ============================================================================
-- PART 8 — ADD PAYMENT FIELDS TO roofing_jobs (if table exists)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'roofing_jobs'
  ) THEN
    -- Add payment tracking fields to roofing_jobs
    ALTER TABLE public.roofing_jobs
      ADD COLUMN IF NOT EXISTS deposit_collected boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS deposit_amount numeric(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_paid numeric(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS balance_due numeric(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'deposit_paid', 'partial', 'paid', 'overdue'));
    
    -- Create index for payment status queries
    CREATE INDEX IF NOT EXISTS idx_roofing_jobs_payment_status ON public.roofing_jobs(payment_status) WHERE payment_status != 'paid';
  END IF;
END $$;

-- ============================================================================
-- PART 9 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.invoices IS 'Invoices for homeowner payments - deposits, progress payments, final invoices';
COMMENT ON TABLE public.invoice_items IS 'Line items for each invoice (tear-off, materials, labor, etc.)';
COMMENT ON TABLE public.payments IS 'Records of all payments received from homeowners';
COMMENT ON TABLE public.payment_links IS 'Stripe payment links for invoices';
COMMENT ON TABLE public.payment_reminders IS 'Tracks automated payment reminders sent to homeowners';



























