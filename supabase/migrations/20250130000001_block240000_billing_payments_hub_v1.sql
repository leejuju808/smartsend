-- =========================================================
-- Block 240000 — SmartSend Roofing "Billing & Payments Hub v1"
-- Invoicing, ACH, Cards, Auto-Pay, Payment Plans
-- Full Sprint Step — No Bullshit. This block transforms SmartSend into a TRUE FINANCIAL SYSTEM.
-- =========================================================

-- ============================================================
-- 1. PAYMENT_METHODS TABLE
-- ============================================================
-- Stores saved payment methods (cards and ACH) for homeowners
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stripe_payment_method_id text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('card', 'ach')),
  last4 text,
  brand text, -- visa, mastercard, amex, etc. (for cards)
  exp_month int, -- for cards
  exp_year int, -- for cards
  bank_name text, -- for ACH
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_homeowner ON public.payment_methods(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_workspace ON public.payment_methods(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_stripe ON public.payment_methods(stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON public.payment_methods(homeowner_id, is_default) WHERE is_default = true;

-- ============================================================
-- 2. TRANSACTIONS TABLE
-- ============================================================
-- Extends payments table with payment method reference and additional tracking
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL, -- Link to existing payments table
  method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  stripe_charge_id text,
  stripe_payment_intent_id text,
  amount numeric(12,2) NOT NULL,
  currency text DEFAULT 'usd',
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'canceled')),
  failure_reason text,
  payment_type text CHECK (payment_type IN ('card', 'ach', 'manual', 'auto_pay')),
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON public.transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment ON public.transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_method ON public.transactions(method_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_charge ON public.transactions(stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_intent ON public.transactions(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- ============================================================
-- 3. PAYMENT_PLANS TABLE
-- ============================================================
-- Payment plans for splitting large invoices into installments
CREATE TABLE IF NOT EXISTS public.payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL, -- Optional: link to original invoice
  total_amount numeric(12,2) NOT NULL,
  num_payments int NOT NULL CHECK (num_payments > 0),
  schedule jsonb NOT NULL, -- Array of {date, amount, status, invoice_id?}
  auto_pay boolean DEFAULT false,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'overdue')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_homeowner ON public.payment_plans(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_job ON public.payment_plans(job_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_workspace ON public.payment_plans(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_status ON public.payment_plans(status);

-- ============================================================
-- 4. AUTO_PAY_RULES TABLE
-- ============================================================
-- Rules for automatically charging saved payment methods
CREATE TABLE IF NOT EXISTS public.auto_pay_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id uuid NOT NULL REFERENCES public.payment_methods(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_plan_id uuid REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  trigger_type text CHECK (trigger_type IN ('invoice_due', 'payment_plan_installment', 'manual')),
  trigger_days_before int DEFAULT 0, -- Days before due date to charge
  last_charged_at timestamptz,
  next_charge_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- Ensure only one of invoice_id or payment_plan_id is set
  CONSTRAINT auto_pay_rules_single_target CHECK (
    (invoice_id IS NULL AND payment_plan_id IS NOT NULL) OR
    (invoice_id IS NOT NULL AND payment_plan_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_auto_pay_rules_method ON public.auto_pay_rules(method_id);
CREATE INDEX IF NOT EXISTS idx_auto_pay_rules_invoice ON public.auto_pay_rules(invoice_id);
CREATE INDEX IF NOT EXISTS idx_auto_pay_rules_plan ON public.auto_pay_rules(payment_plan_id);
CREATE INDEX IF NOT EXISTS idx_auto_pay_rules_homeowner ON public.auto_pay_rules(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_auto_pay_rules_status ON public.auto_pay_rules(status);
CREATE INDEX IF NOT EXISTS idx_auto_pay_rules_next_charge ON public.auto_pay_rules(next_charge_at) WHERE status = 'active';

-- ============================================================
-- 5. QUICKBOOKS SYNC TABLE
-- ============================================================
-- Track QuickBooks synchronization status for invoices
CREATE TABLE IF NOT EXISTS public.quickbooks_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  qbo_invoice_id text, -- QuickBooks Online invoice ID
  qbo_customer_id text, -- QuickBooks Online customer ID
  sync_status text DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed', 'skipped')),
  sync_error text,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quickbooks_sync_invoice ON public.quickbooks_sync(invoice_id);
CREATE INDEX IF NOT EXISTS idx_quickbooks_sync_workspace ON public.quickbooks_sync(workspace_id);
CREATE INDEX IF NOT EXISTS idx_quickbooks_sync_status ON public.quickbooks_sync(sync_status);
CREATE INDEX IF NOT EXISTS idx_quickbooks_sync_qbo_invoice ON public.quickbooks_sync(qbo_invoice_id) WHERE qbo_invoice_id IS NOT NULL;

-- ============================================================
-- 6. PAYMENT REMINDERS TABLE
-- ============================================================
-- Track payment reminders sent to homeowners
CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('upcoming', 'due_today', 'overdue_3', 'overdue_7', 'overdue_14', 'overdue_30')),
  sent_via text CHECK (sent_via IN ('email', 'sms', 'both')),
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_invoice ON public.payment_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_homeowner ON public.payment_reminders(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_type ON public.payment_reminders(reminder_type);

-- ============================================================
-- 7. HELPER FUNCTIONS
-- ============================================================

-- Function to update payment plan status
CREATE OR REPLACE FUNCTION update_payment_plan_status(p_plan_id uuid)
RETURNS void AS $$
DECLARE
  plan_record public.payment_plans%ROWTYPE;
  schedule_items jsonb;
  paid_count int := 0;
  total_count int;
  item jsonb;
BEGIN
  SELECT * INTO plan_record FROM public.payment_plans WHERE id = p_plan_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  schedule_items := plan_record.schedule;
  total_count := jsonb_array_length(schedule_items);
  
  -- Count paid items
  FOR i IN 0..total_count - 1 LOOP
    item := schedule_items->i;
    IF (item->>'status')::text = 'paid' THEN
      paid_count := paid_count + 1;
    END IF;
  END LOOP;
  
  -- Update status
  IF paid_count = total_count THEN
    UPDATE public.payment_plans SET status = 'completed', updated_at = now() WHERE id = p_plan_id;
  ELSIF paid_count > 0 THEN
    -- Check if any payment is overdue
    FOR i IN 0..total_count - 1 LOOP
      item := schedule_items->i;
      IF (item->>'status')::text != 'paid' AND (item->>'date')::date < CURRENT_DATE THEN
        UPDATE public.payment_plans SET status = 'overdue', updated_at = now() WHERE id = p_plan_id;
        RETURN;
      END IF;
    END LOOP;
    UPDATE public.payment_plans SET status = 'active', updated_at = now() WHERE id = p_plan_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get billing dashboard metrics
CREATE OR REPLACE FUNCTION get_billing_dashboard_metrics(
  p_workspace_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  start_date date := COALESCE(p_start_date, date_trunc('month', CURRENT_DATE)::date);
  end_date date := COALESCE(p_end_date, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date);
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'amount_collected_this_month', (
      SELECT COALESCE(SUM(t.amount), 0)
      FROM public.transactions t
      JOIN public.invoices i ON t.invoice_id = i.id
      WHERE t.status = 'succeeded'
        AND i.workspace_id = p_workspace_id
        AND t.created_at >= start_date
        AND t.created_at <= end_date
    ),
    'amount_overdue', (
      SELECT COALESCE(SUM(i.amount - COALESCE(paid.total, 0)), 0)
      FROM public.invoices i
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) as total
        FROM public.transactions
        WHERE status = 'succeeded'
        GROUP BY invoice_id
      ) paid ON i.id = paid.invoice_id
      WHERE i.workspace_id = p_workspace_id
        AND i.status = 'overdue'
    ),
    'unpaid_invoices_count', (
      SELECT COUNT(*)
      FROM public.invoices
      WHERE workspace_id = p_workspace_id
        AND status IN ('pending', 'partially_paid', 'overdue')
    ),
    'autopay_enabled_count', (
      SELECT COUNT(DISTINCT homeowner_id)
      FROM public.auto_pay_rules
      WHERE workspace_id = p_workspace_id
        AND status = 'active'
    ),
    'card_on_file_count', (
      SELECT COUNT(DISTINCT homeowner_id)
      FROM public.payment_methods
      WHERE workspace_id = p_workspace_id
    ),
    'average_days_to_pay', (
      SELECT COALESCE(
        AVG(EXTRACT(DAY FROM (t.created_at::date - i.due_date))),
        0
      )
      FROM public.transactions t
      JOIN public.invoices i ON t.invoice_id = i.id
      WHERE t.status = 'succeeded'
        AND i.workspace_id = p_workspace_id
        AND i.due_date IS NOT NULL
        AND t.created_at >= start_date
    ),
    'failed_payments_count', (
      SELECT COUNT(*)
      FROM public.transactions
      WHERE status = 'failed'
        AND created_at >= start_date
        AND created_at <= end_date
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process auto-pay charges
CREATE OR REPLACE FUNCTION process_autopay_charges()
RETURNS TABLE(rule_id uuid, success boolean, error_message text) AS $$
DECLARE
  rule_record public.auto_pay_rules%ROWTYPE;
  invoice_record public.invoices%ROWTYPE;
  plan_record public.payment_plans%ROWTYPE;
  charge_amount numeric;
BEGIN
  -- Get all active auto-pay rules that are due
  FOR rule_record IN
    SELECT * FROM public.auto_pay_rules
    WHERE status = 'active'
      AND next_charge_at IS NOT NULL
      AND next_charge_at <= now()
  LOOP
    BEGIN
      IF rule_record.invoice_id IS NOT NULL THEN
        -- Charge for invoice
        SELECT * INTO invoice_record FROM public.invoices WHERE id = rule_record.invoice_id;
        
        IF invoice_record.status = 'paid' THEN
          -- Invoice already paid, deactivate rule
          UPDATE public.auto_pay_rules
          SET status = 'cancelled', updated_at = now()
          WHERE id = rule_record.id;
          CONTINUE;
        END IF;
        
        -- Calculate amount due
        SELECT COALESCE(
          invoice_record.amount - (
            SELECT COALESCE(SUM(amount), 0)
            FROM public.transactions
            WHERE invoice_id = invoice_record.id
              AND status = 'succeeded'
          ),
          0
        ) INTO charge_amount;
        
        IF charge_amount > 0 THEN
          -- This would trigger an external API call to Stripe
          -- For now, we'll just log it - actual charging happens in API route
          RETURN QUERY SELECT rule_record.id, false, 'Auto-charge requires API call to Stripe';
        END IF;
      ELSIF rule_record.payment_plan_id IS NOT NULL THEN
        -- Charge for payment plan installment
        SELECT * INTO plan_record FROM public.payment_plans WHERE id = rule_record.payment_plan_id;
        
        -- Find next unpaid installment
        -- This logic would be handled in the API route
        RETURN QUERY SELECT rule_record.id, false, 'Payment plan auto-charge requires API call';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT rule_record.id, false, SQLERRM;
    END;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. TRIGGERS
-- ============================================================

-- Update updated_at on payment_methods
CREATE OR REPLACE FUNCTION update_payment_methods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_methods_updated_at ON public.payment_methods;
CREATE TRIGGER trg_payment_methods_updated_at
BEFORE UPDATE ON public.payment_methods
FOR EACH ROW
EXECUTE FUNCTION update_payment_methods_updated_at();

-- Update updated_at on transactions
CREATE OR REPLACE FUNCTION update_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON public.transactions;
CREATE TRIGGER trg_transactions_updated_at
BEFORE UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION update_transactions_updated_at();

-- Update updated_at on payment_plans
CREATE OR REPLACE FUNCTION update_payment_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_plans_updated_at ON public.payment_plans;
CREATE TRIGGER trg_payment_plans_updated_at
BEFORE UPDATE ON public.payment_plans
FOR EACH ROW
EXECUTE FUNCTION update_payment_plans_updated_at();

-- Update updated_at on auto_pay_rules
CREATE OR REPLACE FUNCTION update_auto_pay_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_pay_rules_updated_at ON public.auto_pay_rules;
CREATE TRIGGER trg_auto_pay_rules_updated_at
BEFORE UPDATE ON public.auto_pay_rules
FOR EACH ROW
EXECUTE FUNCTION update_auto_pay_rules_updated_at();

-- Ensure only one default payment method per homeowner
CREATE OR REPLACE FUNCTION ensure_single_default_payment_method()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.payment_methods
    SET is_default = false
    WHERE homeowner_id = NEW.homeowner_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_single_default_payment_method ON public.payment_methods;
CREATE TRIGGER trg_ensure_single_default_payment_method
BEFORE INSERT OR UPDATE ON public.payment_methods
FOR EACH ROW
EXECUTE FUNCTION ensure_single_default_payment_method();

-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_pay_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quickbooks_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

-- Payment methods: workspace members can access
CREATE POLICY "payment_methods_workspace_access" ON public.payment_methods
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Transactions: workspace members can access
CREATE POLICY "transactions_workspace_access" ON public.transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = transactions.invoice_id
        AND i.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
    )
  );

-- Payment plans: workspace members can access
CREATE POLICY "payment_plans_workspace_access" ON public.payment_plans
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Auto-pay rules: workspace members can access
CREATE POLICY "auto_pay_rules_workspace_access" ON public.auto_pay_rules
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- QuickBooks sync: workspace members can access
CREATE POLICY "quickbooks_sync_workspace_access" ON public.quickbooks_sync
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Payment reminders: workspace members can access
CREATE POLICY "payment_reminders_workspace_access" ON public.payment_reminders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = payment_reminders.invoice_id
        AND i.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
    )
  );

-- Service role has full access
CREATE POLICY IF NOT EXISTS "service_role_full_access_payment_methods"
  ON public.payment_methods FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_full_access_transactions"
  ON public.transactions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_full_access_payment_plans"
  ON public.payment_plans FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_full_access_auto_pay_rules"
  ON public.auto_pay_rules FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_full_access_quickbooks_sync"
  ON public.quickbooks_sync FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_full_access_payment_reminders"
  ON public.payment_reminders FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

























