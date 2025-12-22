-- ============================================================
-- Block 58000 — SmartSend Roofing "Financing Options + Payment Plan System" v1
-- (BUILT-IN FINANCING OFFERS • PAYMENT PLAN BUILDER • SOFT CREDIT CHECK LINK • DOWN PAYMENT TRACKING • AUTOMATED PAYMENT REMINDERS)
-- ============================================================
-- 
-- This block makes SmartSend a sales-closing nuclear weapon.
--
-- Roofers lose 20–40% of jobs because:
-- - Homeowners can't afford the full price upfront
-- - They don't know financing exists
-- - The contractor doesn't explain options clearly
-- - No easy payment plan exists
-- - No automated follow-up
-- - No calculators or simple monthly payment views
--
-- This module removes ALL friction.
-- Once you add financing, your users will close MORE deals instantly.

-- ============================================================================
-- PART 1 — CREATE financing_options TABLE
-- ============================================================================
-- Stores financing options displayed in proposals
-- Each proposal can have multiple financing options (different lenders/terms)

CREATE TABLE IF NOT EXISTS public.financing_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Financing details
  total_price numeric NOT NULL,
  apr numeric NOT NULL, -- Annual Percentage Rate (e.g., 0.099 for 9.9%)
  term_months int NOT NULL, -- Loan term in months (24, 36, 60, 120)
  down_payment numeric DEFAULT 0,
  monthly_payment numeric NOT NULL, -- Calculated monthly payment
  
  -- Lender information
  lender_name text NOT NULL, -- 'Enhancify', 'Service Finance', 'Sunlight Financial', 'GreenSky', 'Acorn', 'In-House'
  lender_link text, -- URL to lender application page (pre-filled if possible)
  
  -- Display order
  display_order int DEFAULT 0,
  
  -- Active status
  is_active boolean DEFAULT true,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financing_options_proposal ON public.financing_options(proposal_id);
CREATE INDEX IF NOT EXISTS idx_financing_options_workspace ON public.financing_options(workspace_id);
CREATE INDEX IF NOT EXISTS idx_financing_options_active ON public.financing_options(proposal_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_financing_options_display_order ON public.financing_options(proposal_id, display_order);

-- ============================================================================
-- PART 2 — CREATE payment_plans TABLE
-- ============================================================================
-- Stores in-house payment plans created by contractors
-- Used when contractor offers their own financing instead of third-party lenders

CREATE TABLE IF NOT EXISTS public.payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contractor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Payment plan details
  down_payment numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL,
  number_of_payments int NOT NULL,
  apr numeric, -- Optional APR for in-house financing
  monthly_payment numeric, -- Calculated monthly payment
  
  -- Payment schedule (JSONB array of payment dates/amounts)
  schedule jsonb DEFAULT '[]'::jsonb,
  -- Format: [
  --   { "due_date": "2024-02-01", "amount": 500.00, "payment_number": 1 },
  --   { "due_date": "2024-03-01", "amount": 500.00, "payment_number": 2 },
  --   ...
  -- ]
  
  -- Status tracking
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'delinquent', 'cancelled')),
  
  -- Terms and conditions
  terms text,
  
  -- Digital signature (if homeowner signed the payment plan)
  signature jsonb, -- { type: 'typed'|'drawn'|'touch', data: '...', name: '...', signed_at: '...' }
  signed_at timestamptz,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_job ON public.payment_plans(job_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_proposal ON public.payment_plans(proposal_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_homeowner ON public.payment_plans(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_workspace ON public.payment_plans(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_status ON public.payment_plans(status);
CREATE INDEX IF NOT EXISTS idx_payment_plans_contractor ON public.payment_plans(contractor_id);

-- ============================================================================
-- PART 3 — CREATE payment_plan_payments TABLE
-- ============================================================================
-- Tracks individual payments within a payment plan
-- Each row represents one scheduled payment

CREATE TABLE IF NOT EXISTS public.payment_plan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  
  -- Payment details
  amount numeric NOT NULL,
  due_date date NOT NULL,
  payment_number int NOT NULL, -- 1, 2, 3, etc.
  
  -- Payment status
  paid boolean DEFAULT false,
  paid_at timestamptz,
  payment_method text, -- 'cash', 'check', 'credit_card', 'ach', 'other'
  payment_reference text, -- Check number, transaction ID, etc.
  
  -- Reminder tracking
  reminder_sent_at timestamptz, -- When reminder was last sent
  reminder_count int DEFAULT 0, -- Number of reminders sent
  
  -- Late fee (if applicable)
  late_fee numeric DEFAULT 0,
  
  -- Notes
  notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique payment number per plan
  UNIQUE(plan_id, payment_number)
);

CREATE INDEX IF NOT EXISTS idx_payment_plan_payments_plan ON public.payment_plan_payments(plan_id);
CREATE INDEX IF NOT EXISTS idx_payment_plan_payments_due_date ON public.payment_plan_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_payment_plan_payments_paid ON public.payment_plan_payments(paid);
CREATE INDEX IF NOT EXISTS idx_payment_plan_payments_overdue ON public.payment_plan_payments(plan_id, due_date, paid) WHERE paid = false AND due_date < CURRENT_DATE;

-- ============================================================================
-- PART 4 — CREATE payment_reminders TABLE
-- ============================================================================
-- Tracks payment reminders sent to homeowners
-- Prevents duplicate reminders and tracks reminder history

CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payment_plan_payments(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  
  -- Reminder details
  reminder_type text NOT NULL CHECK (reminder_type IN ('day_before', 'day_of', 'day_after', 'weekly_late')),
  sent_at timestamptz DEFAULT now(),
  
  -- Communication channel
  channel text CHECK (channel IN ('email', 'sms', 'phone')),
  
  -- Status
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced')),
  
  -- Response tracking
  homeowner_viewed boolean DEFAULT false,
  homeowner_responded boolean DEFAULT false,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_payment ON public.payment_reminders(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_plan ON public.payment_reminders(plan_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_sent_at ON public.payment_reminders(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_type ON public.payment_reminders(reminder_type);

-- ============================================================================
-- PART 5 — CREATE down_payments TABLE
-- ============================================================================
-- Tracks down payments for jobs/proposals
-- Separate from payment plans to track deposits independently

CREATE TABLE IF NOT EXISTS public.down_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Down payment details
  amount numeric NOT NULL,
  due_date date,
  paid boolean DEFAULT false,
  paid_at timestamptz,
  payment_method text,
  payment_reference text,
  
  -- Notes
  notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_down_payments_job ON public.down_payments(job_id);
CREATE INDEX IF NOT EXISTS idx_down_payments_proposal ON public.down_payments(proposal_id);
CREATE INDEX IF NOT EXISTS idx_down_payments_homeowner ON public.down_payments(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_down_payments_workspace ON public.down_payments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_down_payments_paid ON public.down_payments(paid);
CREATE INDEX IF NOT EXISTS idx_down_payments_due_date ON public.down_payments(due_date) WHERE paid = false;

-- ============================================================================
-- PART 6 — FUNCTIONS
-- ============================================================================

-- Function: Calculate monthly payment for financing
CREATE OR REPLACE FUNCTION public.calculate_monthly_payment(
  p_principal numeric,
  p_apr numeric,
  p_term_months int,
  p_down_payment numeric DEFAULT 0
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_loan_amount numeric;
  v_monthly_rate numeric;
  v_monthly_payment numeric;
BEGIN
  -- Calculate loan amount after down payment
  v_loan_amount := GREATEST(p_principal - p_down_payment, 0);
  
  -- If no loan amount, return 0
  IF v_loan_amount <= 0 THEN
    RETURN 0;
  END IF;
  
  -- Calculate monthly interest rate
  v_monthly_rate := p_apr / 12.0;
  
  -- Calculate monthly payment using standard loan formula
  -- P = (r * PV) / (1 - (1 + r)^(-n))
  -- where P = payment, r = monthly rate, PV = present value, n = number of payments
  IF v_monthly_rate > 0 THEN
    v_monthly_payment := (v_monthly_rate * v_loan_amount) / 
                        (1 - POWER(1 + v_monthly_rate, -p_term_months));
  ELSE
    -- If APR is 0, just divide loan amount by term
    v_monthly_payment := v_loan_amount / p_term_months;
  END IF;
  
  RETURN ROUND(v_monthly_payment, 2);
END;
$$;

-- Function: Generate payment schedule for payment plan
CREATE OR REPLACE FUNCTION public.generate_payment_schedule(
  p_total_amount numeric,
  p_down_payment numeric,
  p_number_of_payments int,
  p_start_date date DEFAULT CURRENT_DATE,
  p_apr numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_loan_amount numeric;
  v_monthly_payment numeric;
  v_schedule jsonb := '[]'::jsonb;
  v_due_date date;
  v_payment_number int;
BEGIN
  -- Calculate loan amount after down payment
  v_loan_amount := GREATEST(p_total_amount - p_down_payment, 0);
  
  -- Calculate monthly payment
  IF p_apr IS NOT NULL AND p_apr > 0 THEN
    v_monthly_payment := public.calculate_monthly_payment(
      p_total_amount,
      p_apr,
      p_number_of_payments,
      p_down_payment
    );
  ELSE
    -- Simple division if no APR
    v_monthly_payment := ROUND(v_loan_amount / p_number_of_payments, 2);
  END IF;
  
  -- Generate schedule (monthly payments)
  v_due_date := p_start_date;
  FOR v_payment_number IN 1..p_number_of_payments LOOP
    -- Add one month to due date
    v_due_date := v_due_date + INTERVAL '1 month';
    
    -- Adjust last payment to account for rounding
    IF v_payment_number = p_number_of_payments THEN
      -- Last payment gets any remainder
      v_monthly_payment := v_loan_amount - (v_monthly_payment * (p_number_of_payments - 1));
    END IF;
    
    -- Add payment to schedule
    v_schedule := v_schedule || jsonb_build_object(
      'due_date', v_due_date,
      'amount', v_monthly_payment,
      'payment_number', v_payment_number
    );
  END LOOP;
  
  RETURN v_schedule;
END;
$$;

-- Function: Update payment plan status based on payments
CREATE OR REPLACE FUNCTION public.update_payment_plan_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_payments int;
  v_paid_payments int;
  v_overdue_payments int;
  v_new_status text;
BEGIN
  -- Count total and paid payments
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE paid = true),
    COUNT(*) FILTER (WHERE paid = false AND due_date < CURRENT_DATE)
  INTO v_total_payments, v_paid_payments, v_overdue_payments
  FROM public.payment_plan_payments
  WHERE plan_id = NEW.plan_id;
  
  -- Determine new status
  IF v_paid_payments = v_total_payments THEN
    v_new_status := 'completed';
  ELSIF v_overdue_payments > 0 THEN
    v_new_status := 'delinquent';
  ELSE
    v_new_status := 'active';
  END IF;
  
  -- Update plan status if changed
  UPDATE public.payment_plans
  SET 
    status = v_new_status,
    updated_at = now()
  WHERE id = NEW.plan_id
    AND status != v_new_status;
  
  RETURN NEW;
END;
$$;

-- Trigger: Auto-update payment plan status when payment is marked as paid
DROP TRIGGER IF EXISTS trg_update_payment_plan_status ON public.payment_plan_payments;
CREATE TRIGGER trg_update_payment_plan_status
AFTER UPDATE OF paid ON public.payment_plan_payments
FOR EACH ROW
WHEN (OLD.paid IS DISTINCT FROM NEW.paid)
EXECUTE FUNCTION public.update_payment_plan_status();

-- Function: Auto-populate workspace_id from proposal
CREATE OR REPLACE FUNCTION public.tg_set_financing_option_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.proposal_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
    FROM public.proposals
    WHERE id = NEW.proposal_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger: Auto-set workspace_id from proposal
DROP TRIGGER IF EXISTS trg_set_financing_option_workspace ON public.financing_options;
CREATE TRIGGER trg_set_financing_option_workspace
BEFORE INSERT ON public.financing_options
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_financing_option_workspace();

-- Function: Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION public.tg_update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trg_financing_options_updated_at ON public.financing_options;
CREATE TRIGGER trg_financing_options_updated_at
BEFORE UPDATE ON public.financing_options
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_updated_at();

DROP TRIGGER IF EXISTS trg_payment_plans_updated_at ON public.payment_plans;
CREATE TRIGGER trg_payment_plans_updated_at
BEFORE UPDATE ON public.payment_plans
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_updated_at();

DROP TRIGGER IF EXISTS trg_payment_plan_payments_updated_at ON public.payment_plan_payments;
CREATE TRIGGER trg_payment_plan_payments_updated_at
BEFORE UPDATE ON public.payment_plan_payments
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_updated_at();

DROP TRIGGER IF EXISTS trg_down_payments_updated_at ON public.down_payments;
CREATE TRIGGER trg_down_payments_updated_at
BEFORE UPDATE ON public.down_payments
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_updated_at();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.financing_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plan_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.down_payments ENABLE ROW LEVEL SECURITY;

-- Financing options: workspace members can access
CREATE POLICY "financing_options_workspace_members" ON public.financing_options
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Financing options: public access via proposal token
CREATE POLICY "financing_options_public_proposal" ON public.financing_options
  FOR SELECT
  USING (
    proposal_id IN (
      SELECT id FROM public.proposals
      WHERE public_token IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.proposals p2
          WHERE p2.id = financing_options.proposal_id
        )
    )
  );

-- Payment plans: workspace members can access
CREATE POLICY "payment_plans_workspace_members" ON public.payment_plans
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Payment plan payments: workspace members can access
CREATE POLICY "payment_plan_payments_workspace_members" ON public.payment_plan_payments
  FOR ALL
  USING (
    plan_id IN (
      SELECT id FROM public.payment_plans
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Payment reminders: workspace members can access
CREATE POLICY "payment_reminders_workspace_members" ON public.payment_reminders
  FOR ALL
  USING (
    plan_id IN (
      SELECT id FROM public.payment_plans
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Down payments: workspace members can access
CREATE POLICY "down_payments_workspace_members" ON public.down_payments
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.financing_options IS 'Financing options displayed in proposals (Block 58000)';
COMMENT ON TABLE public.payment_plans IS 'In-house payment plans created by contractors (Block 58000)';
COMMENT ON TABLE public.payment_plan_payments IS 'Individual payments within a payment plan (Block 58000)';
COMMENT ON TABLE public.payment_reminders IS 'Payment reminders sent to homeowners (Block 58000)';
COMMENT ON TABLE public.down_payments IS 'Down payment tracking for jobs/proposals (Block 58000)';

COMMENT ON FUNCTION public.calculate_monthly_payment() IS 'Calculates monthly payment for financing based on principal, APR, term, and down payment (Block 58000)';
COMMENT ON FUNCTION public.generate_payment_schedule() IS 'Generates payment schedule JSONB for payment plans (Block 58000)';
COMMENT ON FUNCTION public.update_payment_plan_status() IS 'Automatically updates payment plan status based on payment status (Block 58000)';

