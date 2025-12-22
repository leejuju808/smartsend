-- Block 257100 — SmartSend Accounting & Billing Engine v1
-- Invoicing, Payment Tracking, AR Automation, Deposit Requests, Profit Reporting
-- Makes SmartSend the financial nerve center of roofing companies

-- ============================================================
-- 1. INVOICES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  
  -- Invoice details
  invoice_number text NOT NULL,
  invoice_type text NOT NULL CHECK (invoice_type IN ('deposit', 'progress', 'final', 'change_order')),
  amount numeric(12,2) NOT NULL,
  tax_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) NOT NULL,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  paid_amount numeric(12,2) DEFAULT 0,
  remaining_balance numeric(12,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  
  -- Dates
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  paid_at timestamptz,
  
  -- Invoice content
  description text,
  line_items jsonb DEFAULT '[]'::jsonb, -- Array of {description, quantity, unit_price, amount}
  notes text,
  
  -- PDF and delivery
  pdf_url text,
  pdf_generated_at timestamptz,
  sent_at timestamptz,
  sent_via text, -- 'email', 'mail', 'portal'
  
  -- Insurance job tracking
  is_insurance_job boolean DEFAULT false,
  insurance_claim_id text,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_team ON public.invoices(team_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job ON public.invoices(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(team_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(team_id, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_overdue ON public.invoices(team_id, due_date) WHERE status IN ('unpaid', 'partially_paid') AND due_date < CURRENT_DATE;
CREATE INDEX IF NOT EXISTS idx_invoices_type ON public.invoices(team_id, invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(team_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_number_team ON public.invoices(team_id, invoice_number);

-- ============================================================
-- 2. PAYMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  
  -- Payment details
  amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('check', 'credit_card', 'ach', 'cash', 'finance', 'insurance', 'other')),
  payment_reference text, -- Check number, transaction ID, etc.
  
  -- Payment tracking
  received_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Notes
  note text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_team ON public.payments(team_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_received ON public.payments(team_id, received_at DESC);

-- ============================================================
-- 3. AR_FOLLOWUPS TABLE (Automated Collections)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ar_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  
  -- Follow-up details
  followup_type text NOT NULL CHECK (followup_type IN ('reminder', 'overdue_7', 'overdue_14', 'overdue_30', 'final_notice', 'escalation')),
  next_step text,
  due_date date NOT NULL,
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'skipped')),
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Automation
  auto_sent boolean DEFAULT false,
  sent_at timestamptz,
  email_sent_to text,
  
  -- Notes
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for AR followups
CREATE INDEX IF NOT EXISTS idx_ar_followups_team ON public.ar_followups(team_id);
CREATE INDEX IF NOT EXISTS idx_ar_followups_invoice ON public.ar_followups(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_followups_due ON public.ar_followups(team_id, due_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ar_followups_status ON public.ar_followups(team_id, status);

-- ============================================================
-- 4. INSURANCE_TRACKING TABLE (Storm Job Money Management)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.insurance_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  
  -- Insurance claim details
  claim_number text,
  insurance_company text,
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  
  -- Money tracking
  acv_amount numeric(12,2), -- Actual Cash Value
  acv_received numeric(12,2) DEFAULT 0,
  acv_received_at timestamptz,
  
  depreciation_amount numeric(12,2),
  depreciation_received numeric(12,2) DEFAULT 0,
  depreciation_received_at timestamptz,
  
  deductible_amount numeric(12,2),
  deductible_collected numeric(12,2) DEFAULT 0,
  deductible_collected_at timestamptz,
  
  supplement_amount numeric(12,2) DEFAULT 0,
  supplement_pending numeric(12,2) DEFAULT 0,
  supplement_approved numeric(12,2) DEFAULT 0,
  supplement_received numeric(12,2) DEFAULT 0,
  
  -- Mortgage/endorsement tracking
  mortgage_company text,
  mortgage_endorsement_required boolean DEFAULT false,
  mortgage_endorsement_received boolean DEFAULT false,
  mortgage_endorsement_received_at timestamptz,
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acv_received', 'depreciation_pending', 'supplement_pending', 'completed', 'delayed')),
  
  -- Notes
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for insurance tracking
CREATE INDEX IF NOT EXISTS idx_insurance_tracking_team ON public.insurance_tracking(team_id);
CREATE INDEX IF NOT EXISTS idx_insurance_tracking_job ON public.insurance_tracking(job_id);
CREATE INDEX IF NOT EXISTS idx_insurance_tracking_invoice ON public.insurance_tracking(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_tracking_status ON public.insurance_tracking(team_id, status);

-- ============================================================
-- 5. JOB_COSTS TABLE (For Profit Calculations)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  
  -- Cost categories
  materials_cost numeric(12,2) DEFAULT 0,
  labor_cost numeric(12,2) DEFAULT 0,
  subcontractor_cost numeric(12,2) DEFAULT 0,
  equipment_cost numeric(12,2) DEFAULT 0,
  permit_cost numeric(12,2) DEFAULT 0,
  overhead_allocation numeric(12,2) DEFAULT 0,
  other_costs numeric(12,2) DEFAULT 0,
  
  -- Total
  total_cost numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(materials_cost, 0) +
    COALESCE(labor_cost, 0) +
    COALESCE(subcontractor_cost, 0) +
    COALESCE(equipment_cost, 0) +
    COALESCE(permit_cost, 0) +
    COALESCE(overhead_allocation, 0) +
    COALESCE(other_costs, 0)
  ) STORED,
  
  -- Notes
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for job costs
CREATE INDEX IF NOT EXISTS idx_job_costs_team ON public.job_costs(team_id);
CREATE INDEX IF NOT EXISTS idx_job_costs_job ON public.job_costs(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_costs_job ON public.job_costs(job_id);

-- ============================================================
-- 6. ACCOUNTING_SYNC TABLE (QuickBooks/Xero/Wave Integration)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.accounting_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Integration details
  provider text NOT NULL CHECK (provider IN ('quickbooks_online', 'quickbooks_desktop', 'xero', 'wave', 'none')),
  is_enabled boolean DEFAULT false,
  
  -- Credentials (encrypted)
  access_token_encrypted text,
  refresh_token_encrypted text,
  company_id text,
  last_sync_at timestamptz,
  
  -- Sync settings
  auto_sync boolean DEFAULT false,
  sync_frequency text DEFAULT 'daily' CHECK (sync_frequency IN ('manual', 'hourly', 'daily', 'weekly')),
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for accounting sync
CREATE INDEX IF NOT EXISTS idx_accounting_sync_team ON public.accounting_sync(team_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_sync_team ON public.accounting_sync(team_id);

-- ============================================================
-- 7. TRIGGERS & FUNCTIONS
-- ============================================================

-- Update invoice paid_amount when payment is added
CREATE OR REPLACE FUNCTION update_invoice_paid_amount()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.invoices
  SET 
    paid_amount = (
      SELECT COALESCE(SUM(amount), 0)
      FROM public.payments
      WHERE invoice_id = NEW.invoice_id
    ),
    status = CASE
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM public.payments WHERE invoice_id = NEW.invoice_id) >= total_amount THEN 'paid'
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM public.payments WHERE invoice_id = NEW.invoice_id) > 0 THEN 'partially_paid'
      ELSE status
    END,
    paid_at = CASE
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM public.payments WHERE invoice_id = NEW.invoice_id) >= total_amount 
      THEN COALESCE(paid_at, now())
      ELSE paid_at
    END,
    updated_at = now()
  WHERE id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_invoice_on_payment
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION update_invoice_paid_amount();

-- Update invoice status to overdue when due_date passes
CREATE OR REPLACE FUNCTION update_overdue_invoices()
RETURNS void AS $$
BEGIN
  UPDATE public.invoices
  SET 
    status = CASE
      WHEN status IN ('unpaid', 'partially_paid') AND due_date < CURRENT_DATE THEN 'overdue'
      ELSE status
    END,
    updated_at = now()
  WHERE status IN ('unpaid', 'partially_paid') 
    AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Auto-generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number(team_uuid uuid)
RETURNS text AS $$
DECLARE
  next_num integer;
  prefix text;
BEGIN
  -- Get the next invoice number for this team
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
  INTO next_num
  FROM public.invoices
  WHERE team_id = team_uuid;
  
  -- Format: INV-YYYY-NNNN
  prefix := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-';
  
  RETURN prefix || LPAD(next_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_ar_followups_updated_at
BEFORE UPDATE ON public.ar_followups
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_insurance_tracking_updated_at
BEFORE UPDATE ON public.insurance_tracking
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_job_costs_updated_at
BEFORE UPDATE ON public.job_costs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_accounting_sync_updated_at
BEFORE UPDATE ON public.accounting_sync
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_sync ENABLE ROW LEVEL SECURITY;

-- Invoices policies
CREATE POLICY "invoices_team_access" ON public.invoices
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Payments policies
CREATE POLICY "payments_team_access" ON public.payments
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- AR Followups policies
CREATE POLICY "ar_followups_team_access" ON public.ar_followups
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Insurance tracking policies
CREATE POLICY "insurance_tracking_team_access" ON public.insurance_tracking
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Job costs policies
CREATE POLICY "job_costs_team_access" ON public.job_costs
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Accounting sync policies
CREATE POLICY "accounting_sync_team_access" ON public.accounting_sync
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 9. VIEWS FOR DASHBOARDS
-- ============================================================

-- AR Summary View
CREATE OR REPLACE VIEW public.ar_summary AS
SELECT 
  i.team_id,
  COUNT(*) FILTER (WHERE i.status = 'unpaid') as unpaid_count,
  COUNT(*) FILTER (WHERE i.status = 'partially_paid') as partially_paid_count,
  COUNT(*) FILTER (WHERE i.status = 'overdue') as overdue_count,
  COUNT(*) FILTER (WHERE i.status = 'paid') as paid_count,
  COALESCE(SUM(i.total_amount) FILTER (WHERE i.status IN ('unpaid', 'partially_paid', 'overdue')), 0) as total_ar,
  COALESCE(SUM(i.remaining_balance) FILTER (WHERE i.status = 'overdue'), 0) as overdue_amount,
  COALESCE(SUM(i.remaining_balance) FILTER (WHERE i.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'), 0) as due_this_week,
  COALESCE(SUM(p.amount) FILTER (WHERE p.received_at >= date_trunc('month', CURRENT_DATE)), 0) as paid_this_month
FROM public.invoices i
LEFT JOIN public.payments p ON p.invoice_id = i.id
GROUP BY i.team_id;

-- Job Profit View
CREATE OR REPLACE VIEW public.job_profit_summary AS
SELECT 
  j.id as job_id,
  j.team_id,
  j.contract_value as revenue,
  COALESCE(jc.total_cost, 0) as total_cost,
  COALESCE(j.contract_value, 0) - COALESCE(jc.total_cost, 0) as profit,
  CASE 
    WHEN j.contract_value > 0 
    THEN ROUND(((j.contract_value - COALESCE(jc.total_cost, 0)) / j.contract_value * 100)::numeric, 2)
    ELSE 0
  END as profit_margin_percent,
  COALESCE(SUM(i.total_amount), 0) as invoiced_amount,
  COALESCE(SUM(i.paid_amount), 0) as paid_amount
FROM public.jobs j
LEFT JOIN public.job_costs jc ON jc.job_id = j.id
LEFT JOIN public.invoices i ON i.job_id = j.id
GROUP BY j.id, j.team_id, j.contract_value, jc.total_cost;

-- ============================================================
-- 10. AUTO-INVOICE GENERATION TRIGGERS
-- ============================================================

-- Function to auto-generate deposit invoice when job is approved
CREATE OR REPLACE FUNCTION auto_generate_deposit_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_number text;
  v_customer_id uuid;
  v_contract_value numeric;
  v_deposit_amount numeric;
  v_due_date date;
BEGIN
  -- Only trigger when job moves to 'approved' stage
  IF NEW.stage = 'approved' AND (OLD.stage IS NULL OR OLD.stage != 'approved') THEN
    -- Get customer from lead
    SELECT customer_id INTO v_customer_id
    FROM public.leads
    WHERE id = NEW.lead_id
    LIMIT 1;
    
    -- Get contract value
    v_contract_value := COALESCE(NEW.contract_value, 0);
    
    -- Calculate deposit (30% of contract value)
    v_deposit_amount := v_contract_value * 0.3;
    
    -- Skip if amount is too small or invoice already exists
    IF v_deposit_amount < 1 THEN
      RETURN NEW;
    END IF;
    
    -- Check if deposit invoice already exists
    IF EXISTS (
      SELECT 1 FROM public.invoices
      WHERE job_id = NEW.id
        AND invoice_type = 'deposit'
        AND status != 'cancelled'
    ) THEN
      RETURN NEW;
    END IF;
    
    -- Generate invoice number
    SELECT generate_invoice_number(NEW.team_id) INTO v_invoice_number;
    
    -- Set due date (30 days from now)
    v_due_date := CURRENT_DATE + INTERVAL '30 days';
    
    -- Create deposit invoice
    INSERT INTO public.invoices (
      team_id,
      job_id,
      customer_id,
      invoice_number,
      invoice_type,
      amount,
      tax_amount,
      total_amount,
      due_date,
      description,
      status,
      invoice_date
    ) VALUES (
      NEW.team_id,
      NEW.id,
      v_customer_id,
      v_invoice_number,
      'deposit',
      v_deposit_amount,
      0,
      v_deposit_amount,
      v_due_date,
      'Deposit for roofing job',
      'unpaid',
      CURRENT_DATE
    );
    
    -- Notify via pg_notify for edge function to send email
    PERFORM pg_notify('invoice_generated', json_build_object(
      'invoice_type', 'deposit',
      'job_id', NEW.id,
      'team_id', NEW.team_id
    )::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-generate progress invoice when materials delivered
CREATE OR REPLACE FUNCTION auto_generate_progress_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_number text;
  v_customer_id uuid;
  v_contract_value numeric;
  v_progress_amount numeric;
  v_deposit_amount numeric;
  v_due_date date;
  v_job_id uuid;
BEGIN
  -- Only trigger when materials are marked as delivered
  IF NEW.delivered = true AND (OLD.delivered IS NULL OR OLD.delivered = false) THEN
    v_job_id := NEW.job_id;
    
    -- Get job details
    SELECT 
      j.contract_value,
      j.lead_id,
      j.team_id
    INTO 
      v_contract_value,
      v_customer_id,
      v_invoice_number
    FROM public.jobs j
    WHERE j.id = v_job_id;
    
    -- Get customer from lead
    SELECT customer_id INTO v_customer_id
    FROM public.leads
    WHERE id = (SELECT lead_id FROM public.jobs WHERE id = v_job_id)
    LIMIT 1;
    
    v_contract_value := COALESCE(v_contract_value, 0);
    
    -- Calculate progress payment (40% of contract, minus deposit)
    v_deposit_amount := v_contract_value * 0.3;
    v_progress_amount := v_contract_value * 0.4;
    
    -- Skip if amount is too small
    IF v_progress_amount < 1 THEN
      RETURN NEW;
    END IF;
    
    -- Check if progress invoice already exists
    IF EXISTS (
      SELECT 1 FROM public.invoices
      WHERE job_id = v_job_id
        AND invoice_type = 'progress'
        AND status != 'cancelled'
    ) THEN
      RETURN NEW;
    END IF;
    
    -- Get team_id
    SELECT team_id INTO v_invoice_number
    FROM public.jobs
    WHERE id = v_job_id;
    
    -- Generate invoice number
    SELECT generate_invoice_number(v_invoice_number) INTO v_invoice_number;
    
    -- Set due date
    v_due_date := CURRENT_DATE + INTERVAL '30 days';
    
    -- Create progress invoice
    INSERT INTO public.invoices (
      team_id,
      job_id,
      customer_id,
      invoice_number,
      invoice_type,
      amount,
      tax_amount,
      total_amount,
      due_date,
      description,
      status,
      invoice_date
    ) VALUES (
      (SELECT team_id FROM public.jobs WHERE id = v_job_id),
      v_job_id,
      v_customer_id,
      v_invoice_number,
      'progress',
      v_progress_amount,
      0,
      v_progress_amount,
      v_due_date,
      'Progress payment - Materials delivered',
      'unpaid',
      CURRENT_DATE
    );
    
    PERFORM pg_notify('invoice_generated', json_build_object(
      'invoice_type', 'progress',
      'job_id', v_job_id
    )::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-generate final invoice when job completed
CREATE OR REPLACE FUNCTION auto_generate_final_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_number text;
  v_customer_id uuid;
  v_contract_value numeric;
  v_final_amount numeric;
  v_invoiced_amount numeric;
  v_due_date date;
BEGIN
  -- Only trigger when job moves to 'completed' stage
  IF NEW.stage = 'completed' AND (OLD.stage IS NULL OR OLD.stage != 'completed') THEN
    -- Get customer from lead
    SELECT customer_id INTO v_customer_id
    FROM public.leads
    WHERE id = NEW.lead_id
    LIMIT 1;
    
    -- Get contract value
    v_contract_value := COALESCE(NEW.contract_value, 0);
    
    -- Calculate already invoiced amount
    SELECT COALESCE(SUM(total_amount), 0) INTO v_invoiced_amount
    FROM public.invoices
    WHERE job_id = NEW.id
      AND invoice_type IN ('deposit', 'progress')
      AND status != 'cancelled';
    
    -- Calculate final amount (remaining balance)
    v_final_amount := v_contract_value - v_invoiced_amount;
    
    -- Skip if amount is too small or negative
    IF v_final_amount < 1 THEN
      RETURN NEW;
    END IF;
    
    -- Check if final invoice already exists
    IF EXISTS (
      SELECT 1 FROM public.invoices
      WHERE job_id = NEW.id
        AND invoice_type = 'final'
        AND status != 'cancelled'
    ) THEN
      RETURN NEW;
    END IF;
    
    -- Generate invoice number
    SELECT generate_invoice_number(NEW.team_id) INTO v_invoice_number;
    
    -- Set due date
    v_due_date := CURRENT_DATE + INTERVAL '30 days';
    
    -- Create final invoice
    INSERT INTO public.invoices (
      team_id,
      job_id,
      customer_id,
      invoice_number,
      invoice_type,
      amount,
      tax_amount,
      total_amount,
      due_date,
      description,
      status,
      invoice_date
    ) VALUES (
      NEW.team_id,
      NEW.id,
      v_customer_id,
      v_invoice_number,
      'final',
      v_final_amount,
      0,
      v_final_amount,
      v_due_date,
      'Final payment - Job completed',
      'unpaid',
      CURRENT_DATE
    );
    
    PERFORM pg_notify('invoice_generated', json_build_object(
      'invoice_type', 'final',
      'job_id', NEW.id,
      'team_id', NEW.team_id
    )::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trg_auto_generate_deposit_invoice ON public.jobs;
CREATE TRIGGER trg_auto_generate_deposit_invoice
AFTER UPDATE OF stage ON public.jobs
FOR EACH ROW
WHEN (NEW.stage = 'approved' AND (OLD.stage IS NULL OR OLD.stage != 'approved'))
EXECUTE FUNCTION auto_generate_deposit_invoice();

DROP TRIGGER IF EXISTS trg_auto_generate_progress_invoice ON public.job_materials;
CREATE TRIGGER trg_auto_generate_progress_invoice
AFTER UPDATE OF delivered ON public.job_materials
FOR EACH ROW
WHEN (NEW.delivered = true AND (OLD.delivered IS NULL OR OLD.delivered = false))
EXECUTE FUNCTION auto_generate_progress_invoice();

DROP TRIGGER IF EXISTS trg_auto_generate_final_invoice ON public.jobs;
CREATE TRIGGER trg_auto_generate_final_invoice
AFTER UPDATE OF stage ON public.jobs
FOR EACH ROW
WHEN (NEW.stage = 'completed' AND (OLD.stage IS NULL OR OLD.stage != 'completed'))
EXECUTE FUNCTION auto_generate_final_invoice();

-- ============================================================
-- 11. COMMENTS
-- ============================================================
COMMENT ON TABLE public.invoices IS 'Invoices for jobs (deposit, progress, final, change orders)';
COMMENT ON TABLE public.payments IS 'Payment records for invoices';
COMMENT ON TABLE public.ar_followups IS 'Automated accounts receivable follow-up reminders';
COMMENT ON TABLE public.insurance_tracking IS 'Insurance claim money tracking for storm jobs';
COMMENT ON TABLE public.job_costs IS 'Job cost breakdown for profit calculations';
COMMENT ON TABLE public.accounting_sync IS 'Accounting system integration settings (QuickBooks, Xero, Wave)';
COMMENT ON FUNCTION auto_generate_deposit_invoice() IS 'Auto-generates deposit invoice when job moves to approved stage';
COMMENT ON FUNCTION auto_generate_progress_invoice() IS 'Auto-generates progress invoice when materials are delivered';
COMMENT ON FUNCTION auto_generate_final_invoice() IS 'Auto-generates final invoice when job is completed';
