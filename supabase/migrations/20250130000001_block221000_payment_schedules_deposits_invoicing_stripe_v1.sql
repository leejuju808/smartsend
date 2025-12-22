-- =========================================================
-- Block 221000 — SmartSend Roofing "Payment Schedules + Deposits + Invoicing Engine + Stripe Integration" v1
-- Full Sprint Step — No Bullshit. Full System Delivered.
-- =========================================================
-- 
-- This block turns SmartSend from "nice tool" → "THIS THING PRINTS MONEY FOR ROOFERS."
-- 
-- Features:
-- - Payment Schedules (Deposit, Progress Payments, Final)
-- - Invoice Engine (Auto-create, auto-send, auto-track)
-- - Stripe Integration (Save company keys, homeowner payments)
-- - Job Pipeline Update (Final payment → job completed)
-- =========================================================

-- ============================================================
-- 1. PAYMENT_SCHEDULES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.contract_documents(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  total_amount numeric(12,2) NOT NULL,
  currency text DEFAULT 'usd',
  
  -- Schedule metadata
  schedule_type text DEFAULT 'standard' CHECK (schedule_type IN ('standard', 'custom', 'insurance')),
  notes text,
  
  -- Status tracking
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_schedules_contract ON public.payment_schedules(contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_schedules_job ON public.payment_schedules(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_schedules_workspace ON public.payment_schedules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_homeowner ON public.payment_schedules(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_schedules_status ON public.payment_schedules(status);

-- ============================================================
-- 2. PAYMENT_MILESTONES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.payment_schedules(id) ON DELETE CASCADE,
  
  label text NOT NULL, -- "Deposit", "Progress Payment #1", "Final Payment", etc.
  amount numeric(12,2) NOT NULL,
  percentage numeric(5,2), -- Percentage of total (e.g., 30.00 for 30%)
  due_date date,
  
  status text DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'overdue', 'partial')),
  paid_at timestamptz,
  paid_amount numeric(12,2) DEFAULT 0,
  
  -- Milestone order
  milestone_order integer NOT NULL DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_milestones_schedule ON public.payment_milestones(schedule_id);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_status ON public.payment_milestones(status);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_due_date ON public.payment_milestones(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_milestones_order ON public.payment_milestones(schedule_id, milestone_order);

-- ============================================================
-- 3. EXTEND INVOICES TABLE (if needed)
-- ============================================================
-- Add milestone_id to link invoices to payment milestones
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS milestone_id uuid REFERENCES public.payment_milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.payment_schedules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_milestone ON public.invoices(milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_schedule ON public.invoices(schedule_id) WHERE schedule_id IS NOT NULL;

-- ============================================================
-- 4. STRIPE_TRANSACTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stripe_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  milestone_id uuid REFERENCES public.payment_milestones(id) ON DELETE SET NULL,
  schedule_id uuid REFERENCES public.payment_schedules(id) ON DELETE SET NULL,
  
  stripe_payment_intent_id text UNIQUE,
  stripe_charge_id text,
  stripe_customer_id text,
  
  amount numeric(12,2) NOT NULL,
  currency text DEFAULT 'usd',
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'canceled')),
  
  -- Payment method info
  payment_method_type text, -- 'card', 'ach', etc.
  last4 text, -- Last 4 digits of card
  
  -- Raw Stripe event data
  raw_event_data jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_transactions_invoice ON public.stripe_transactions(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_milestone ON public.stripe_transactions(milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_schedule ON public.stripe_transactions(schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_payment_intent ON public.stripe_transactions(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_status ON public.stripe_transactions(status);

-- ============================================================
-- 5. COMPANY STRIPE KEYS TABLE
-- ============================================================
-- Store company-specific Stripe keys for Connect accounts
CREATE TABLE IF NOT EXISTS public.company_stripe_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Stripe Connect account ID (if using Connect)
  stripe_account_id text,
  
  -- Stripe API keys (encrypted in application layer)
  stripe_publishable_key text,
  stripe_secret_key_encrypted text, -- Should be encrypted at application level
  
  -- Webhook configuration
  webhook_secret text,
  webhook_endpoint_id text,
  
  is_active boolean DEFAULT true,
  is_test_mode boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(workspace_id) -- One Stripe config per workspace
);

CREATE INDEX IF NOT EXISTS idx_company_stripe_keys_workspace ON public.company_stripe_keys(workspace_id);
CREATE INDEX IF NOT EXISTS idx_company_stripe_keys_company ON public.company_stripe_keys(company_id) WHERE company_id IS NOT NULL;

-- ============================================================
-- 6. TRIGGERS & FUNCTIONS
-- ============================================================

-- Update updated_at on payment_schedules
CREATE OR REPLACE FUNCTION public.tg_update_payment_schedules_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_update_payment_schedules_updated_at ON public.payment_schedules;
CREATE TRIGGER tr_update_payment_schedules_updated_at
BEFORE UPDATE ON public.payment_schedules
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_payment_schedules_updated_at();

-- Update updated_at on payment_milestones
CREATE OR REPLACE FUNCTION public.tg_update_payment_milestones_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_update_payment_milestones_updated_at ON public.payment_milestones;
CREATE TRIGGER tr_update_payment_milestones_updated_at
BEFORE UPDATE ON public.payment_milestones
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_payment_milestones_updated_at();

-- Auto-update milestone status based on payment
CREATE OR REPLACE FUNCTION public.update_milestone_payment_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_milestone_id uuid;
  v_total_paid numeric;
  v_milestone_amount numeric;
  v_due_date date;
BEGIN
  -- Get milestone_id from invoice or transaction
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT milestone_id INTO v_milestone_id
    FROM public.invoices
    WHERE id = NEW.invoice_id;
  ELSIF NEW.milestone_id IS NOT NULL THEN
    v_milestone_id := NEW.milestone_id;
  ELSE
    RETURN NEW;
  END IF;
  
  IF v_milestone_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get milestone details
  SELECT amount, due_date INTO v_milestone_amount, v_due_date
  FROM public.payment_milestones
  WHERE id = v_milestone_id;
  
  -- Calculate total paid for this milestone
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM public.stripe_transactions
  WHERE milestone_id = v_milestone_id
    AND status = 'succeeded';
  
  -- Update milestone status
  IF v_total_paid >= v_milestone_amount THEN
    UPDATE public.payment_milestones
    SET 
      status = 'paid',
      paid_at = COALESCE(paid_at, now()),
      paid_amount = v_total_paid,
      updated_at = now()
    WHERE id = v_milestone_id;
  ELSIF v_total_paid > 0 THEN
    UPDATE public.payment_milestones
    SET 
      status = 'partial',
      paid_amount = v_total_paid,
      updated_at = now()
    WHERE id = v_milestone_id;
  ELSIF v_due_date IS NOT NULL AND v_due_date < CURRENT_DATE THEN
    UPDATE public.payment_milestones
    SET 
      status = 'overdue',
      updated_at = now()
    WHERE id = v_milestone_id
      AND status = 'unpaid';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_update_milestone_on_payment ON public.stripe_transactions;
CREATE TRIGGER tr_update_milestone_on_payment
AFTER INSERT OR UPDATE ON public.stripe_transactions
FOR EACH ROW
WHEN (NEW.status = 'succeeded')
EXECUTE FUNCTION public.update_milestone_payment_status();

-- Auto-update job status when final payment is received
CREATE OR REPLACE FUNCTION public.check_final_payment_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_schedule_id uuid;
  v_job_id uuid;
  v_all_paid boolean;
  v_final_milestone_id uuid;
BEGIN
  -- Get schedule_id
  IF NEW.milestone_id IS NOT NULL THEN
    SELECT schedule_id INTO v_schedule_id
    FROM public.payment_milestones
    WHERE id = NEW.milestone_id;
  ELSIF NEW.schedule_id IS NOT NULL THEN
    v_schedule_id := NEW.schedule_id;
  ELSE
    RETURN NEW;
  END IF;
  
  IF v_schedule_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get job_id from schedule
  SELECT job_id INTO v_job_id
  FROM public.payment_schedules
  WHERE id = v_schedule_id;
  
  IF v_job_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if this is the final milestone
  SELECT id INTO v_final_milestone_id
  FROM public.payment_milestones
  WHERE schedule_id = v_schedule_id
    AND milestone_order = (
      SELECT MAX(milestone_order)
      FROM public.payment_milestones
      WHERE schedule_id = v_schedule_id
    )
  LIMIT 1;
  
  -- If this payment is for the final milestone and it's now paid
  IF NEW.milestone_id = v_final_milestone_id AND NEW.status = 'succeeded' THEN
    -- Check if all milestones are paid
    SELECT COUNT(*) = 0 INTO v_all_paid
    FROM public.payment_milestones
    WHERE schedule_id = v_schedule_id
      AND status != 'paid';
    
    IF v_all_paid THEN
      -- Update job status to completed
      UPDATE public.roofing_jobs
      SET 
        status = 'completed',
        updated_at = now()
      WHERE id = v_job_id
        AND status != 'completed';
      
      -- Update schedule status
      UPDATE public.payment_schedules
      SET 
        status = 'completed',
        updated_at = now()
      WHERE id = v_schedule_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_check_final_payment ON public.stripe_transactions;
CREATE TRIGGER tr_check_final_payment
AFTER UPDATE ON public.stripe_transactions
FOR EACH ROW
WHEN (NEW.status = 'succeeded' AND OLD.status != 'succeeded')
EXECUTE FUNCTION public.check_final_payment_complete();

-- ============================================================
-- 7. HELPER FUNCTIONS
-- ============================================================

-- Function to create payment schedule from contract
CREATE OR REPLACE FUNCTION public.create_payment_schedule_from_contract(
  p_contract_id uuid,
  p_total_amount numeric,
  p_structure text[] DEFAULT ARRAY['30', '40', '30']::text[] -- Default: 30% deposit, 40% progress, 30% final
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_schedule_id uuid;
  v_workspace_id uuid;
  v_homeowner_id uuid;
  v_job_id uuid;
  v_lead_id uuid;
  v_percentage numeric;
  v_amount numeric;
  v_milestone_order integer := 0;
  v_label text;
BEGIN
  -- Get contract details
  SELECT 
    cd.workspace_id,
    cd.homeowner_id,
    cd.job_id,
    cd.lead_id
  INTO v_workspace_id, v_homeowner_id, v_job_id, v_lead_id
  FROM public.contract_documents cd
  WHERE cd.id = p_contract_id;
  
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Contract not found or missing workspace_id';
  END IF;
  
  -- Create payment schedule
  INSERT INTO public.payment_schedules (
    contract_id,
    job_id,
    workspace_id,
    homeowner_id,
    lead_id,
    total_amount
  ) VALUES (
    p_contract_id,
    v_job_id,
    v_workspace_id,
    v_homeowner_id,
    v_lead_id,
    p_total_amount
  )
  RETURNING id INTO v_schedule_id;
  
  -- Create milestones based on structure
  FOR i IN 1..array_length(p_structure, 1) LOOP
    v_percentage := (p_structure[i]::numeric);
    v_amount := (p_total_amount * v_percentage / 100);
    v_milestone_order := v_milestone_order + 1;
    
    -- Generate label
    IF i = 1 THEN
      v_label := 'Deposit';
    ELSIF i = array_length(p_structure, 1) THEN
      v_label := 'Final Payment';
    ELSE
      v_label := format('Progress Payment #%s', i - 1);
    END IF;
    
    INSERT INTO public.payment_milestones (
      schedule_id,
      label,
      amount,
      percentage,
      milestone_order,
      due_date
    ) VALUES (
      v_schedule_id,
      v_label,
      v_amount,
      v_percentage,
      v_milestone_order,
      CASE 
        WHEN i = 1 THEN CURRENT_DATE + INTERVAL '7 days' -- Deposit due in 7 days
        WHEN i = array_length(p_structure, 1) THEN NULL -- Final payment due when job is complete
        ELSE CURRENT_DATE + INTERVAL '30 days' -- Progress payments due in 30 days
      END
    );
  END LOOP;
  
  RETURN v_schedule_id;
END;
$$;

-- Function to get payment schedule summary
CREATE OR REPLACE FUNCTION public.get_payment_schedule_summary(p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'schedule_id', ps.id,
    'total_amount', ps.total_amount,
    'total_paid', COALESCE(SUM(pm.paid_amount), 0),
    'total_remaining', ps.total_amount - COALESCE(SUM(pm.paid_amount), 0),
    'milestones', jsonb_agg(
      jsonb_build_object(
        'id', pm.id,
        'label', pm.label,
        'amount', pm.amount,
        'percentage', pm.percentage,
        'due_date', pm.due_date,
        'status', pm.status,
        'paid_amount', pm.paid_amount,
        'paid_at', pm.paid_at
      ) ORDER BY pm.milestone_order
    )
  )
  INTO result
  FROM public.payment_schedules ps
  LEFT JOIN public.payment_milestones pm ON pm.schedule_id = ps.id
  WHERE ps.id = p_schedule_id
  GROUP BY ps.id, ps.total_amount;
  
  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

-- ============================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_stripe_keys ENABLE ROW LEVEL SECURITY;

-- Payment schedules: Workspace members can access
CREATE POLICY "payment_schedules_workspace_access"
  ON public.payment_schedules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = payment_schedules.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = payment_schedules.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Payment milestones: Inherit from schedule
CREATE POLICY "payment_milestones_access"
  ON public.payment_milestones
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.payment_schedules ps
      JOIN public.workspace_members wm ON wm.workspace_id = ps.workspace_id
      WHERE ps.id = payment_milestones.schedule_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.payment_schedules ps
      JOIN public.workspace_members wm ON wm.workspace_id = ps.workspace_id
      WHERE ps.id = payment_milestones.schedule_id
        AND wm.user_id = auth.uid()
    )
  );

-- Stripe transactions: Inherit from schedule/invoice
CREATE POLICY "stripe_transactions_access"
  ON public.stripe_transactions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.payment_schedules ps
      JOIN public.workspace_members wm ON wm.workspace_id = ps.workspace_id
      WHERE ps.id = stripe_transactions.schedule_id
        AND wm.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.workspace_members wm ON wm.workspace_id = i.workspace_id
      WHERE i.id = stripe_transactions.invoice_id
        AND wm.user_id = auth.uid()
    )
  );

-- Company Stripe keys: Workspace admins only
CREATE POLICY "company_stripe_keys_access"
  ON public.company_stripe_keys
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = company_stripe_keys.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Service role has full access
CREATE POLICY IF NOT EXISTS "service_role_full_access_payment_schedules"
  ON public.payment_schedules FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_full_access_payment_milestones"
  ON public.payment_milestones FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_full_access_stripe_transactions"
  ON public.stripe_transactions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 9. AUTOMATION FUNCTIONS FOR FOLLOW-UPS
-- ============================================================

-- Function to check and send deposit follow-ups (24h after contract signed)
CREATE OR REPLACE FUNCTION public.check_deposit_followups()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_milestone RECORD;
  v_schedule RECORD;
  v_contract RECORD;
  v_lead RECORD;
BEGIN
  -- Find unpaid deposit milestones that are 24+ hours old
  FOR v_milestone IN
    SELECT pm.*, ps.contract_id, ps.workspace_id, ps.lead_id
    FROM public.payment_milestones pm
    JOIN public.payment_schedules ps ON ps.id = pm.schedule_id
    WHERE pm.label ILIKE '%deposit%'
      AND pm.status = 'unpaid'
      AND pm.created_at < NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.invoice_automation_log
        WHERE milestone_id = pm.id
          AND automation_type = 'deposit_followup_24h'
      )
  LOOP
    -- Get contract and lead info
    SELECT cd.* INTO v_contract
    FROM public.contract_documents cd
    WHERE cd.id = v_milestone.contract_id;
    
    IF v_contract IS NOT NULL AND v_milestone.lead_id IS NOT NULL THEN
      SELECT * INTO v_lead
      FROM public.leads
      WHERE id = v_milestone.lead_id;
      
      -- Log automation trigger (will be processed by edge function or cron)
      INSERT INTO public.invoice_automation_log (
        milestone_id,
        schedule_id,
        workspace_id,
        automation_type,
        status,
        metadata
      ) VALUES (
        v_milestone.id,
        v_milestone.schedule_id,
        v_milestone.workspace_id,
        'deposit_followup_24h',
        'pending',
        jsonb_build_object(
          'lead_email', v_lead.email,
          'lead_name', COALESCE(v_lead.first_name || ' ' || v_lead.last_name, 'Homeowner'),
          'amount', v_milestone.amount,
          'contract_signed_at', v_contract.signed_at
        )
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Function to check and send overdue payment reminders
CREATE OR REPLACE FUNCTION public.check_overdue_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_milestone RECORD;
  v_schedule RECORD;
  v_contract RECORD;
  v_lead RECORD;
  v_days_overdue integer;
BEGIN
  -- Find overdue milestones
  FOR v_milestone IN
    SELECT pm.*, ps.contract_id, ps.workspace_id, ps.lead_id
    FROM public.payment_milestones pm
    JOIN public.payment_schedules ps ON ps.id = pm.schedule_id
    WHERE pm.status IN ('unpaid', 'overdue')
      AND pm.due_date IS NOT NULL
      AND pm.due_date < CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM public.invoice_automation_log
        WHERE milestone_id = pm.id
          AND automation_type = 'overdue_reminder'
          AND created_at > CURRENT_DATE - INTERVAL '7 days' -- Don't spam, max once per week
      )
  LOOP
    v_days_overdue := CURRENT_DATE - v_milestone.due_date;
    
    -- Get contract and lead info
    SELECT cd.* INTO v_contract
    FROM public.contract_documents cd
    WHERE cd.id = v_milestone.contract_id;
    
    IF v_contract IS NOT NULL AND v_milestone.lead_id IS NOT NULL THEN
      SELECT * INTO v_lead
      FROM public.leads
      WHERE id = v_milestone.lead_id;
      
      -- Log automation trigger
      INSERT INTO public.invoice_automation_log (
        milestone_id,
        schedule_id,
        workspace_id,
        automation_type,
        status,
        metadata
      ) VALUES (
        v_milestone.id,
        v_milestone.schedule_id,
        v_milestone.workspace_id,
        'overdue_reminder',
        'pending',
        jsonb_build_object(
          'lead_email', v_lead.email,
          'lead_name', COALESCE(v_lead.first_name || ' ' || v_lead.last_name, 'Homeowner'),
          'amount', v_milestone.amount,
          'due_date', v_milestone.due_date,
          'days_overdue', v_days_overdue
        )
      )
      ON CONFLICT DO NOTHING;
      
      -- Update milestone status to overdue if not already
      IF v_milestone.status != 'overdue' THEN
        UPDATE public.payment_milestones
        SET status = 'overdue', updated_at = NOW()
        WHERE id = v_milestone.id;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Table to log automation triggers (for processing by edge functions/cron)
CREATE TABLE IF NOT EXISTS public.invoice_automation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid REFERENCES public.payment_milestones(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.payment_schedules(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  automation_type text NOT NULL CHECK (automation_type IN (
    'deposit_followup_24h',
    'overdue_reminder',
    'progress_payment_reminder',
    'final_payment_reminder'
  )),
  
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  
  metadata jsonb DEFAULT '{}'::jsonb,
  
  processed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one automation per milestone per type per day
  CONSTRAINT unique_automation_per_day UNIQUE(milestone_id, automation_type, DATE(created_at))
);

CREATE INDEX IF NOT EXISTS idx_invoice_automation_log_status ON public.invoice_automation_log(status, created_at);
CREATE INDEX IF NOT EXISTS idx_invoice_automation_log_milestone ON public.invoice_automation_log(milestone_id);
CREATE INDEX IF NOT EXISTS idx_invoice_automation_log_workspace ON public.invoice_automation_log(workspace_id);

-- RLS for automation log
ALTER TABLE public.invoice_automation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_automation_log_workspace_access"
  ON public.invoice_automation_log
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = invoice_automation_log.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "service_role_full_access_invoice_automation_log"
  ON public.invoice_automation_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 10. COMMENTS
-- ============================================================

COMMENT ON TABLE public.payment_schedules IS 'Payment schedules for contracts (Block 221000)';
COMMENT ON TABLE public.payment_milestones IS 'Individual payment milestones within schedules (Block 221000)';
COMMENT ON TABLE public.stripe_transactions IS 'Stripe payment transactions linked to invoices/milestones (Block 221000)';
COMMENT ON TABLE public.company_stripe_keys IS 'Company-specific Stripe API keys configuration (Block 221000)';
COMMENT ON TABLE public.invoice_automation_log IS 'Automation triggers for invoice follow-ups and reminders (Block 221000)';
COMMENT ON FUNCTION public.check_deposit_followups IS 'Checks for unpaid deposits 24h+ old and creates follow-up triggers (Block 221000)';
COMMENT ON FUNCTION public.check_overdue_payments IS 'Checks for overdue payments and creates reminder triggers (Block 221000)';

























