-- ============================================================
-- Block 256000 — SmartSend Customer Financing Engine v1
-- Instant Financing Offers, Soft Pull Pre-Approval, Monthly Payment Calculator, 
-- Multi-Tier Financing Options, Close-Rate Booster
-- ============================================================
-- 
-- This block turns SmartSend into a sales weapon by giving homeowners 
-- INSTANT financing options.
-- 
-- Roofing companies LOSE JOBS because:
-- - homeowners can't afford the full cost upfront
-- - no financing options are shown at the point of sale
-- - sales reps forget to mention financing
-- - financing is confusing and slow
-- - approvals take hours or days
-- - proposals don't show monthly payments
-- - customers hesitate and stall
-- - jobs get delayed waiting for money
-- - reps lose deals to companies who DO offer financing
-- 
-- SmartSend fixes EVERYTHING.
-- ============================================================

-- ============================================================================
-- PART 1 — FINANCING APPLICATIONS TABLE
-- ============================================================================
-- Tracks all financing applications from homeowners

CREATE TABLE IF NOT EXISTS public.financing_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  
  -- Application details
  amount_requested numeric(12,2) NOT NULL,
  soft_pull_done boolean DEFAULT false,
  soft_pull_timestamp timestamptz,
  
  -- Lender information
  lender text, -- 'hearth', 'sunlight', 'wisetack', 'enhancify', etc.
  lender_application_id text, -- External lender's application ID
  
  -- Offer details (stored as JSON for flexibility)
  offer jsonb DEFAULT '{}'::jsonb,
  
  -- Application status
  status text DEFAULT 'pending' CHECK (status IN (
    'pending',
    'pre_approved',
    'approved',
    'denied',
    'expired',
    'withdrawn'
  )),
  
  -- Customer information (for soft pull)
  customer_name text,
  customer_address text,
  customer_city text,
  customer_state text,
  customer_zip text,
  customer_ssn_last4 text, -- Last 4 digits only
  customer_income numeric(12,2),
  customer_phone text,
  customer_email text,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for financing_applications
CREATE INDEX IF NOT EXISTS idx_financing_applications_job ON public.financing_applications(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financing_applications_customer ON public.financing_applications(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financing_applications_team ON public.financing_applications(team_id);
CREATE INDEX IF NOT EXISTS idx_financing_applications_status ON public.financing_applications(status);
CREATE INDEX IF NOT EXISTS idx_financing_applications_created ON public.financing_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financing_applications_lender ON public.financing_applications(lender) WHERE lender IS NOT NULL;

-- ============================================================================
-- PART 2 — FINANCING OFFERS TABLE
-- ============================================================================
-- Stores all financing offers available for each application

CREATE TABLE IF NOT EXISTS public.financing_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.financing_applications(id) ON DELETE CASCADE,
  
  -- Offer details
  plan_name text NOT NULL, -- e.g., "12 Months Same-As-Cash", "36 Month Payment Plan"
  monthly_payment numeric(12,2) NOT NULL,
  term_months int NOT NULL,
  apr numeric(5,2) NOT NULL, -- Annual Percentage Rate
  same_as_cash boolean DEFAULT false,
  total_amount numeric(12,2) NOT NULL, -- Total amount financed
  down_payment numeric(12,2) DEFAULT 0,
  
  -- Lender information
  lender text NOT NULL,
  lender_offer_id text, -- External lender's offer ID
  
  -- Offer status
  is_available boolean DEFAULT true,
  is_recommended boolean DEFAULT false, -- Best offer for this customer
  
  -- Offer metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for financing_offers
CREATE INDEX IF NOT EXISTS idx_financing_offers_application ON public.financing_offers(application_id);
CREATE INDEX IF NOT EXISTS idx_financing_offers_lender ON public.financing_offers(lender);
CREATE INDEX IF NOT EXISTS idx_financing_offers_available ON public.financing_offers(application_id, is_available) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_financing_offers_recommended ON public.financing_offers(application_id, is_recommended) WHERE is_recommended = true;

-- ============================================================================
-- PART 3 — FINANCING EVENTS TABLE
-- ============================================================================
-- Audit trail of all financing-related events

CREATE TABLE IF NOT EXISTS public.financing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.financing_applications(id) ON DELETE CASCADE,
  
  -- Event details
  event_type text NOT NULL CHECK (event_type IN (
    'application_created',
    'soft_pull_initiated',
    'soft_pull_completed',
    'pre_approved',
    'approved',
    'denied',
    'expired',
    'follow_up_sent',
    'offer_selected',
    'offer_accepted',
    'offer_declined',
    'payment_plan_calculated',
    'job_funded',
    'application_withdrawn'
  )),
  
  -- Event data
  message text,
  event_data jsonb DEFAULT '{}'::jsonb,
  
  -- User who triggered the event (if applicable)
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for financing_events
CREATE INDEX IF NOT EXISTS idx_financing_events_application ON public.financing_events(application_id);
CREATE INDEX IF NOT EXISTS idx_financing_events_type ON public.financing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_financing_events_created ON public.financing_events(created_at DESC);

-- ============================================================================
-- PART 4 — FINANCING ANALYTICS TABLE
-- ============================================================================
-- Aggregated analytics for financing performance

CREATE TABLE IF NOT EXISTS public.financing_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  
  -- Time period
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'yearly')),
  
  -- Application metrics
  total_applications int DEFAULT 0,
  pre_approved_count int DEFAULT 0,
  approved_count int DEFAULT 0,
  denied_count int DEFAULT 0,
  expired_count int DEFAULT 0,
  
  -- Financial metrics
  total_amount_requested numeric(12,2) DEFAULT 0,
  total_amount_approved numeric(12,2) DEFAULT 0,
  avg_loan_amount numeric(12,2) DEFAULT 0,
  revenue_generated numeric(12,2) DEFAULT 0, -- Revenue from jobs that used financing
  
  -- Conversion metrics
  approval_rate numeric(5,2) DEFAULT 0, -- Percentage of applications approved
  close_rate_increase numeric(5,2) DEFAULT 0, -- Percentage increase in close rate
  
  -- Lender breakdown
  lender_breakdown jsonb DEFAULT '{}'::jsonb, -- { lender_name: { count, amount, approval_rate } }
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one record per team/period
  UNIQUE(team_id, period_start, period_end, period_type)
);

-- Indexes for financing_analytics
CREATE INDEX IF NOT EXISTS idx_financing_analytics_team ON public.financing_analytics(team_id);
CREATE INDEX IF NOT EXISTS idx_financing_analytics_period ON public.financing_analytics(team_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_financing_analytics_type ON public.financing_analytics(team_id, period_type, period_start DESC);

-- ============================================================================
-- PART 5 — TRIGGERS AND FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_financing_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_financing_applications_updated_at
BEFORE UPDATE ON public.financing_applications
FOR EACH ROW
EXECUTE FUNCTION update_financing_applications_updated_at();

-- Function to update financing_analytics updated_at
CREATE OR REPLACE FUNCTION update_financing_analytics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_financing_analytics_updated_at
BEFORE UPDATE ON public.financing_analytics
FOR EACH ROW
EXECUTE FUNCTION update_financing_analytics_updated_at();

-- Function to automatically create financing event on application status change
CREATE OR REPLACE FUNCTION log_financing_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.financing_events (
      application_id,
      event_type,
      message,
      event_data
    ) VALUES (
      NEW.id,
      NEW.status,
      'Application status changed from ' || COALESCE(OLD.status, 'null') || ' to ' || NEW.status,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'application_id', NEW.id
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_financing_status_change
AFTER UPDATE ON public.financing_applications
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION log_financing_status_change();

-- Function to automatically update job when financing is approved
CREATE OR REPLACE FUNCTION handle_financing_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- When financing is approved, mark job as funding secured
  IF NEW.status = 'approved' AND OLD.status != 'approved' AND NEW.job_id IS NOT NULL THEN
    -- Update job to indicate funding is secured
    UPDATE public.jobs
    SET 
      stage = CASE 
        WHEN stage = 'estimate' THEN 'approved'
        ELSE stage
      END,
      updated_at = now()
    WHERE id = NEW.job_id;
    
    -- Log the event
    INSERT INTO public.financing_events (
      application_id,
      event_type,
      message,
      event_data
    ) VALUES (
      NEW.id,
      'job_funded',
      'Financing approved - job funding secured',
      jsonb_build_object(
        'job_id', NEW.job_id,
        'amount_approved', NEW.amount_requested
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_financing_approval
AFTER UPDATE ON public.financing_applications
FOR EACH ROW
WHEN (NEW.status = 'approved' AND OLD.status != 'approved')
EXECUTE FUNCTION handle_financing_approval();

-- Function to automatically trigger follow-up on financing denial
CREATE OR REPLACE FUNCTION handle_financing_denial()
RETURNS TRIGGER AS $$
BEGIN
  -- When financing is denied, queue follow-up
  IF NEW.status = 'denied' AND OLD.status != 'denied' THEN
    -- Log the denial event (follow-up will be processed by application logic)
    INSERT INTO public.financing_events (
      application_id,
      event_type,
      message,
      event_data
    ) VALUES (
      NEW.id,
      'denied',
      'Financing application denied - follow-up queued',
      jsonb_build_object(
        'customer_email', NEW.customer_email,
        'customer_name', NEW.customer_name,
        'job_id', NEW.job_id
      )
    );
    
    -- Note: Actual follow-up email sending is handled by the application
    -- via the /api/financing/followup endpoint or a background job
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_financing_denial
AFTER UPDATE ON public.financing_applications
FOR EACH ROW
WHEN (NEW.status = 'denied' AND OLD.status != 'denied')
EXECUTE FUNCTION handle_financing_denial();

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.financing_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financing_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financing_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for financing_applications
-- Service role has full access
CREATE POLICY "financing_applications_service_role_all" ON public.financing_applications
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Users can view applications for their team
CREATE POLICY "financing_applications_team_select" ON public.financing_applications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = financing_applications.team_id
      AND teams.id IN (
        SELECT team_id FROM public.team_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Users can insert applications for their team
CREATE POLICY "financing_applications_team_insert" ON public.financing_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = financing_applications.team_id
      AND teams.id IN (
        SELECT team_id FROM public.team_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Users can update applications for their team
CREATE POLICY "financing_applications_team_update" ON public.financing_applications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = financing_applications.team_id
      AND teams.id IN (
        SELECT team_id FROM public.team_members
        WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = financing_applications.team_id
      AND teams.id IN (
        SELECT team_id FROM public.team_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for financing_offers
CREATE POLICY "financing_offers_service_role_all" ON public.financing_offers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "financing_offers_team_select" ON public.financing_offers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.financing_applications
      WHERE financing_applications.id = financing_offers.application_id
      AND EXISTS (
        SELECT 1 FROM public.teams
        WHERE teams.id = financing_applications.team_id
        AND teams.id IN (
          SELECT team_id FROM public.team_members
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for financing_events
CREATE POLICY "financing_events_service_role_all" ON public.financing_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "financing_events_team_select" ON public.financing_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.financing_applications
      WHERE financing_applications.id = financing_events.application_id
      AND EXISTS (
        SELECT 1 FROM public.teams
        WHERE teams.id = financing_applications.team_id
        AND teams.id IN (
          SELECT team_id FROM public.team_members
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for financing_analytics
CREATE POLICY "financing_analytics_service_role_all" ON public.financing_analytics
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "financing_analytics_team_select" ON public.financing_analytics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE teams.id = financing_analytics.team_id
      AND teams.id IN (
        SELECT team_id FROM public.team_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- PART 7 — HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate monthly payment for a given loan amount, APR, and term
CREATE OR REPLACE FUNCTION calculate_monthly_payment(
  loan_amount numeric,
  apr numeric,
  term_months int
)
RETURNS numeric AS $$
DECLARE
  monthly_rate numeric;
  payment numeric;
BEGIN
  -- Convert APR to monthly rate
  monthly_rate := (apr / 100.0) / 12.0;
  
  -- Calculate monthly payment using standard loan formula
  -- P = (r * PV) / (1 - (1 + r)^(-n))
  IF monthly_rate = 0 THEN
    -- 0% APR (same-as-cash)
    payment := loan_amount / term_months;
  ELSE
    payment := (monthly_rate * loan_amount) / (1 - POWER(1 + monthly_rate, -term_months));
  END IF;
  
  RETURN ROUND(payment, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get financing offers for a job amount
CREATE OR REPLACE FUNCTION get_financing_options_for_amount(
  p_amount numeric,
  p_customer_state text DEFAULT NULL
)
RETURNS TABLE (
  plan_name text,
  monthly_payment numeric,
  term_months int,
  apr numeric,
  same_as_cash boolean,
  total_amount numeric,
  lender text
) AS $$
BEGIN
  -- This function returns standard financing options
  -- In production, this would query actual lender APIs
  -- For now, we return common roofing financing options
  
  RETURN QUERY
  SELECT
    '12 Months Same-As-Cash'::text as plan_name,
    calculate_monthly_payment(p_amount, 0, 12) as monthly_payment,
    12 as term_months,
    0.0::numeric as apr,
    true as same_as_cash,
    p_amount as total_amount,
    'hearth'::text as lender
  UNION ALL
  SELECT
    '36 Month Payment Plan'::text,
    calculate_monthly_payment(p_amount, 6.99, 36),
    36,
    6.99::numeric,
    false,
    calculate_monthly_payment(p_amount, 6.99, 36) * 36,
    'sunlight'::text
  UNION ALL
  SELECT
    '60 Month Payment Plan'::text,
    calculate_monthly_payment(p_amount, 8.99, 60),
    60,
    8.99::numeric,
    false,
    calculate_monthly_payment(p_amount, 8.99, 60) * 60,
    'wisetack'::text;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.financing_applications IS 'Tracks all financing applications from homeowners';
COMMENT ON TABLE public.financing_offers IS 'Stores financing offers available for each application';
COMMENT ON TABLE public.financing_events IS 'Audit trail of all financing-related events';
COMMENT ON TABLE public.financing_analytics IS 'Aggregated analytics for financing performance';
COMMENT ON FUNCTION calculate_monthly_payment IS 'Calculates monthly payment for a loan';
COMMENT ON FUNCTION get_financing_options_for_amount IS 'Returns standard financing options for a given amount';





















