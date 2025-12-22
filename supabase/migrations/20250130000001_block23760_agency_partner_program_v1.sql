-- =========================================================
-- Block 23760 — SmartSend Roofing Agency Partner Program v1
-- (Agency Acquisition • Reseller Structure • Commission System • Onboarding)
-- =========================================================

-- 1. PARTNERS TABLE
-- Tracks agency partners and their tier/commission information
CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Agency Information
  agency_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  
  -- Partner Authentication (links to auth.users)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Partner Tier (auto-upgraded based on account count)
  tier TEXT NOT NULL DEFAULT 'partner' CHECK (tier IN ('partner', 'elite', 'premier')),
  
  -- Commission Rate (20% Partner, 30% Elite, 40% Premier)
  commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 20.00 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  
  -- Account Tracking
  number_of_accounts INTEGER NOT NULL DEFAULT 0,
  referred_accounts UUID[] DEFAULT '{}'::uuid[], -- Array of user_ids referred by this partner
  
  -- Stripe Connect Account (for payouts)
  stripe_connect_account_id TEXT,
  stripe_connect_account_status TEXT CHECK (stripe_connect_account_status IN ('pending', 'active', 'restricted', 'rejected')),
  
  -- Partner Referral Link
  referral_code TEXT UNIQUE NOT NULL, -- Unique code for referral links (e.g., "AGENCY-ABC123")
  
  -- White-label Options (Premier Tier Only)
  white_label_domain TEXT,
  white_label_logo_url TEXT,
  white_label_branding JSONB DEFAULT '{}'::jsonb,
  
  -- Partner Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'inactive')),
  
  -- Onboarding
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_completed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_partners_user_id ON public.partners(user_id);
CREATE INDEX IF NOT EXISTS idx_partners_referral_code ON public.partners(referral_code);
CREATE INDEX IF NOT EXISTS idx_partners_tier ON public.partners(tier);
CREATE INDEX IF NOT EXISTS idx_partners_status ON public.partners(status);
CREATE INDEX IF NOT EXISTS idx_partners_contact_email ON public.partners(contact_email);

-- RLS Policies
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- Partners can view their own record
CREATE POLICY "Partners can view own record" ON public.partners
  FOR SELECT
  USING (user_id = auth.uid());

-- Service role can manage all partners
CREATE POLICY "Service role can manage partners" ON public.partners
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 2. PARTNER REFERRALS TABLE
-- Tracks which accounts were referred by which partner
CREATE TABLE IF NOT EXISTS public.partner_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Partner who made the referral
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  
  -- Referred Account/User
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Subscription Information
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  stripe_subscription_id TEXT,
  
  -- Referral Metadata
  referral_code TEXT NOT NULL,
  referral_source TEXT, -- 'email', 'link', 'manual', etc.
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'canceled', 'expired')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ, -- When subscription became active
  canceled_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_partner_referrals_partner_id ON public.partner_referrals(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_referrals_referred_user_id ON public.partner_referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_partner_referrals_subscription_id ON public.partner_referrals(subscription_id);
CREATE INDEX IF NOT EXISTS idx_partner_referrals_status ON public.partner_referrals(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_referrals_user_unique ON public.partner_referrals(referred_user_id);

-- RLS Policies
ALTER TABLE public.partner_referrals ENABLE ROW LEVEL SECURITY;

-- Partners can view their own referrals
CREATE POLICY "Partners can view own referrals" ON public.partner_referrals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.partners p
      WHERE p.id = partner_referrals.partner_id
      AND p.user_id = auth.uid()
    )
  );

-- Service role can manage all referrals
CREATE POLICY "Service role can manage referrals" ON public.partner_referrals
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 3. PARTNER COMMISSIONS TABLE
-- Tracks monthly commission calculations per partner per referred account
CREATE TABLE IF NOT EXISTS public.partner_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Partner
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  
  -- Referred Account
  referral_id UUID NOT NULL REFERENCES public.partner_referrals(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Subscription Period
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  stripe_subscription_id TEXT,
  
  -- Commission Calculation
  subscription_amount_cents INTEGER NOT NULL, -- Monthly subscription amount in cents
  commission_rate DECIMAL(5, 2) NOT NULL, -- Commission rate at time of calculation
  commission_amount_cents INTEGER NOT NULL, -- Calculated commission in cents
  
  -- Period
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accrued', 'paid', 'canceled')),
  
  -- Payout Information
  payout_id UUID, -- Links to partner_payouts table
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_partner_commissions_partner_id ON public.partner_commissions(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_referral_id ON public.partner_commissions(referral_id);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_period ON public.partner_commissions(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_status ON public.partner_commissions(status);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_payout_id ON public.partner_commissions(payout_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_commissions_unique_period ON public.partner_commissions(partner_id, referral_id, period_year, period_month);

-- RLS Policies
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;

-- Partners can view their own commissions
CREATE POLICY "Partners can view own commissions" ON public.partner_commissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.partners p
      WHERE p.id = partner_commissions.partner_id
      AND p.user_id = auth.uid()
    )
  );

-- Service role can manage all commissions
CREATE POLICY "Service role can manage commissions" ON public.partner_commissions
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 4. PARTNER PAYOUTS TABLE
-- Tracks monthly payout batches to partners via Stripe Connect
CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Partner
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  
  -- Payout Period
  payout_year INTEGER NOT NULL,
  payout_month INTEGER NOT NULL CHECK (payout_month >= 1 AND payout_month <= 12),
  
  -- Amount
  total_commission_cents INTEGER NOT NULL,
  commission_count INTEGER NOT NULL DEFAULT 0, -- Number of commissions included
  
  -- Stripe Transfer
  stripe_transfer_id TEXT,
  stripe_transfer_status TEXT CHECK (stripe_transfer_status IN ('pending', 'paid', 'failed', 'canceled')),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'canceled')),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner_id ON public.partner_payouts(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_period ON public.partner_payouts(payout_year, payout_month);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_status ON public.partner_payouts(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_payouts_unique_period ON public.partner_payouts(partner_id, payout_year, payout_month);

-- RLS Policies
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;

-- Partners can view their own payouts
CREATE POLICY "Partners can view own payouts" ON public.partner_payouts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.partners p
      WHERE p.id = partner_payouts.partner_id
      AND p.user_id = auth.uid()
    )
  );

-- Service role can manage all payouts
CREATE POLICY "Service role can manage payouts" ON public.partner_payouts
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 5. ADD PARTNER_ID TO SUBSCRIPTIONS TABLE
-- Track which partner referred each subscription
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_referral_code TEXT;

CREATE INDEX IF NOT EXISTS idx_subscriptions_partner_id ON public.subscriptions(partner_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_partner_referral_code ON public.subscriptions(partner_referral_code);

-- 6. FUNCTION: Generate Unique Referral Code
CREATE OR REPLACE FUNCTION public.generate_partner_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate code: AGENCY-XXXXXX (6 random alphanumeric)
    v_code := 'AGENCY-' || upper(
      substr(md5(random()::text || clock_timestamp()::text), 1, 6)
    );
    
    -- Check if code exists
    SELECT EXISTS(SELECT 1 FROM public.partners WHERE referral_code = v_code) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$;

-- 7. FUNCTION: Update Partner Account Count and Tier
CREATE OR REPLACE FUNCTION public.update_partner_account_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_partner_id UUID;
  v_account_count INTEGER;
  v_current_tier TEXT;
  v_new_tier TEXT;
  v_new_commission_rate DECIMAL(5, 2);
BEGIN
  -- Get partner_id from referral
  IF TG_OP = 'INSERT' THEN
    v_partner_id := NEW.partner_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_partner_id := NEW.partner_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_partner_id := OLD.partner_id;
  END IF;
  
  IF v_partner_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Count active referrals
  SELECT COUNT(*) INTO v_account_count
  FROM public.partner_referrals
  WHERE partner_id = v_partner_id
    AND status = 'active';
  
  -- Get current tier
  SELECT tier INTO v_current_tier
  FROM public.partners
  WHERE id = v_partner_id;
  
  -- Determine new tier based on account count
  IF v_account_count >= 50 THEN
    v_new_tier := 'premier';
    v_new_commission_rate := 40.00;
  ELSIF v_account_count >= 11 THEN
    v_new_tier := 'elite';
    v_new_commission_rate := 30.00;
  ELSE
    v_new_tier := 'partner';
    v_new_commission_rate := 20.00;
  END IF;
  
  -- Update partner record
  UPDATE public.partners
  SET 
    number_of_accounts = v_account_count,
    tier = v_new_tier,
    commission_rate = v_new_commission_rate,
    updated_at = now()
  WHERE id = v_partner_id;
  
  -- Update referred_accounts array
  UPDATE public.partners
  SET referred_accounts = (
    SELECT ARRAY_AGG(referred_user_id)
    FROM public.partner_referrals
    WHERE partner_id = v_partner_id
      AND status = 'active'
  )
  WHERE id = v_partner_id;
  
  RETURN NULL;
END;
$$;

-- Trigger: Update partner account count when referrals change
DROP TRIGGER IF EXISTS trigger_update_partner_account_count ON public.partner_referrals;
CREATE TRIGGER trigger_update_partner_account_count
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_partner_account_count();

-- 8. FUNCTION: Calculate Monthly Commission
CREATE OR REPLACE FUNCTION public.calculate_partner_commission(
  p_partner_id UUID,
  p_referral_id UUID,
  p_period_year INTEGER,
  p_period_month INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referral RECORD;
  v_subscription RECORD;
  v_partner RECORD;
  v_commission_rate DECIMAL(5, 2);
  v_subscription_amount_cents INTEGER;
  v_commission_amount_cents INTEGER;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_commission_id UUID;
BEGIN
  -- Get referral details
  SELECT * INTO v_referral
  FROM public.partner_referrals
  WHERE id = p_referral_id
    AND partner_id = p_partner_id
    AND status = 'active';
  
  IF v_referral IS NULL THEN
    RAISE EXCEPTION 'Referral not found or not active';
  END IF;
  
  -- Get subscription details
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE id = v_referral.subscription_id
    AND status = 'active';
  
  IF v_subscription IS NULL THEN
    RAISE EXCEPTION 'Active subscription not found for referral';
  END IF;
  
  -- Get partner details
  SELECT * INTO v_partner
  FROM public.partners
  WHERE id = p_partner_id;
  
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Partner not found';
  END IF;
  
  -- Use partner's current commission rate
  v_commission_rate := v_partner.commission_rate;
  
  -- Calculate period dates
  v_period_start := make_date(p_period_year, p_period_month, 1);
  v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::date + INTERVAL '23:59:59';
  
  -- Get subscription amount (default $199/month = $19900 cents)
  -- In production, this should come from Stripe subscription
  v_subscription_amount_cents := 19900; -- $199/month default
  
  -- Calculate commission
  v_commission_amount_cents := ROUND(v_subscription_amount_cents * (v_commission_rate / 100));
  
  -- Insert or update commission record
  INSERT INTO public.partner_commissions (
    partner_id,
    referral_id,
    referred_user_id,
    subscription_id,
    stripe_subscription_id,
    subscription_amount_cents,
    commission_rate,
    commission_amount_cents,
    period_year,
    period_month,
    period_start,
    period_end,
    status
  )
  VALUES (
    p_partner_id,
    p_referral_id,
    v_referral.referred_user_id,
    v_subscription.id,
    v_subscription.stripe_subscription_id,
    v_subscription_amount_cents,
    v_commission_rate,
    v_commission_amount_cents,
    p_period_year,
    p_period_month,
    v_period_start,
    v_period_end,
    'pending'
  )
  ON CONFLICT (partner_id, referral_id, period_year, period_month)
  DO UPDATE SET
    subscription_amount_cents = EXCLUDED.subscription_amount_cents,
    commission_rate = EXCLUDED.commission_rate,
    commission_amount_cents = EXCLUDED.commission_amount_cents,
    updated_at = now()
  RETURNING id INTO v_commission_id;
  
  RETURN v_commission_id;
END;
$$;

-- 9. FUNCTION: Process Monthly Commissions for All Partners
CREATE OR REPLACE FUNCTION public.process_monthly_partner_commissions(
  p_period_year INTEGER DEFAULT EXTRACT(YEAR FROM now())::INTEGER,
  p_period_month INTEGER DEFAULT EXTRACT(MONTH FROM now())::INTEGER
)
RETURNS TABLE (
  partner_id UUID,
  commissions_created INTEGER,
  total_commission_cents INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_partner RECORD;
  v_referral RECORD;
  v_commissions_created INTEGER;
  v_total_cents INTEGER;
BEGIN
  -- Loop through all active partners
  FOR v_partner IN
    SELECT * FROM public.partners WHERE status = 'active'
  LOOP
    v_commissions_created := 0;
    v_total_cents := 0;
    
    -- Loop through all active referrals for this partner
    FOR v_referral IN
      SELECT * FROM public.partner_referrals
      WHERE partner_id = v_partner.id
        AND status = 'active'
    LOOP
      BEGIN
        -- Calculate commission for this referral
        PERFORM public.calculate_partner_commission(
          v_partner.id,
          v_referral.id,
          p_period_year,
          p_period_month
        );
        
        v_commissions_created := v_commissions_created + 1;
        
        -- Get commission amount
        SELECT commission_amount_cents INTO v_total_cents
        FROM public.partner_commissions
        WHERE partner_id = v_partner.id
          AND referral_id = v_referral.id
          AND period_year = p_period_year
          AND period_month = p_period_month;
        
        v_total_cents := COALESCE(v_total_cents, 0);
        
      EXCEPTION WHEN OTHERS THEN
        -- Log error but continue processing
        RAISE NOTICE 'Error calculating commission for partner % referral %: %', 
          v_partner.id, v_referral.id, SQLERRM;
      END;
    END LOOP;
    
    -- Return result for this partner
    IF v_commissions_created > 0 THEN
      RETURN QUERY SELECT v_partner.id, v_commissions_created, v_total_cents;
    END IF;
  END LOOP;
END;
$$;

-- 10. VIEW: Partner Dashboard Summary
CREATE OR REPLACE VIEW public.partner_dashboard_summary AS
SELECT
  p.id AS partner_id,
  p.agency_name,
  p.tier,
  p.commission_rate,
  p.number_of_accounts,
  p.status AS partner_status,
  
  -- Active Referrals Count
  COUNT(DISTINCT pr.id) FILTER (WHERE pr.status = 'active') AS active_referrals_count,
  
  -- Total Commissions (Pending + Accrued)
  COALESCE(SUM(pc.commission_amount_cents) FILTER (WHERE pc.status IN ('pending', 'accrued')), 0) AS pending_commissions_cents,
  
  -- Total Paid Commissions
  COALESCE(SUM(pc.commission_amount_cents) FILTER (WHERE pc.status = 'paid'), 0) AS paid_commissions_cents,
  
  -- This Month's Commissions
  COALESCE(SUM(pc.commission_amount_cents) FILTER (
    WHERE pc.period_year = EXTRACT(YEAR FROM now())::INTEGER
      AND pc.period_month = EXTRACT(MONTH FROM now())::INTEGER
      AND pc.status IN ('pending', 'accrued')
  ), 0) AS this_month_commissions_cents,
  
  -- Last Payout Date
  MAX(pp.paid_at) FILTER (WHERE pp.status = 'paid') AS last_payout_date,
  
  -- Last Payout Amount
  COALESCE(MAX(pp.total_commission_cents) FILTER (WHERE pp.status = 'paid'), 0) AS last_payout_amount_cents
  
FROM public.partners p
LEFT JOIN public.partner_referrals pr ON pr.partner_id = p.id
LEFT JOIN public.partner_commissions pc ON pc.partner_id = p.id
LEFT JOIN public.partner_payouts pp ON pp.partner_id = p.id
GROUP BY p.id, p.agency_name, p.tier, p.commission_rate, p.number_of_accounts, p.status;

-- 11. VIEW: Partner Referral Performance
CREATE OR REPLACE VIEW public.partner_referral_performance AS
SELECT
  pr.id AS referral_id,
  pr.partner_id,
  p.agency_name,
  pr.referred_user_id,
  pr.referral_code,
  pr.status AS referral_status,
  pr.created_at AS referred_at,
  pr.activated_at,
  
  -- Subscription Info
  s.plan AS subscription_plan,
  s.status AS subscription_status,
  
  -- Total Commissions Earned
  COALESCE(SUM(pc.commission_amount_cents) FILTER (WHERE pc.status = 'paid'), 0) AS total_commissions_paid_cents,
  
  -- Pending Commissions
  COALESCE(SUM(pc.commission_amount_cents) FILTER (WHERE pc.status IN ('pending', 'accrued')), 0) AS pending_commissions_cents,
  
  -- Months Active
  COUNT(DISTINCT (pc.period_year, pc.period_month)) FILTER (WHERE pc.status = 'paid') AS months_active
  
FROM public.partner_referrals pr
JOIN public.partners p ON p.id = pr.partner_id
LEFT JOIN public.subscriptions s ON s.id = pr.subscription_id
LEFT JOIN public.partner_commissions pc ON pc.referral_id = pr.id
GROUP BY pr.id, pr.partner_id, p.agency_name, pr.referred_user_id, pr.referral_code, pr.status, pr.created_at, pr.activated_at, s.plan, s.status;

-- 12. TRIGGER: Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_partners_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_partners_updated_at ON public.partners;
CREATE TRIGGER trigger_update_partners_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_partners_updated_at();

-- 13. TRIGGER: Activate Referral When Subscription Becomes Active
CREATE OR REPLACE FUNCTION public.activate_partner_referral()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referral_id UUID;
BEGIN
  -- Check if subscription has partner_id
  IF NEW.partner_id IS NULL OR NEW.status != 'active' THEN
    RETURN NEW;
  END IF;
  
  -- Find referral for this user
  SELECT id INTO v_referral_id
  FROM public.partner_referrals
  WHERE referred_user_id = NEW.user_id
    AND partner_id = NEW.partner_id
    AND status = 'pending'
  LIMIT 1;
  
  IF v_referral_id IS NOT NULL THEN
    -- Activate referral
    UPDATE public.partner_referrals
    SET 
      status = 'active',
      subscription_id = NEW.id,
      stripe_subscription_id = NEW.stripe_subscription_id,
      activated_at = now()
    WHERE id = v_referral_id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_activate_partner_referral ON public.subscriptions;
CREATE TRIGGER trigger_activate_partner_referral
  AFTER UPDATE ON public.subscriptions
  FOR EACH ROW
  WHEN (OLD.status != 'active' AND NEW.status = 'active')
  EXECUTE FUNCTION public.activate_partner_referral();

-- Comments
COMMENT ON TABLE public.partners IS 'Block 23760: Agency partners in SmartSend Partner Program';
COMMENT ON TABLE public.partner_referrals IS 'Block 23760: Tracks accounts referred by partners';
COMMENT ON TABLE public.partner_commissions IS 'Block 23760: Monthly commission calculations per partner per referral';
COMMENT ON TABLE public.partner_payouts IS 'Block 23760: Monthly payout batches to partners via Stripe Connect';
COMMENT ON FUNCTION public.generate_partner_referral_code() IS 'Block 23760: Generates unique referral code for partners';
COMMENT ON FUNCTION public.update_partner_account_count() IS 'Block 23760: Auto-updates partner tier based on account count (11→Elite, 50→Premier)';
COMMENT ON FUNCTION public.calculate_partner_commission(UUID, UUID, INTEGER, INTEGER) IS 'Block 23760: Calculates monthly commission for a partner referral';
COMMENT ON FUNCTION public.process_monthly_partner_commissions(INTEGER, INTEGER) IS 'Block 23760: Processes monthly commissions for all active partners';
COMMENT ON VIEW public.partner_dashboard_summary IS 'Block 23760: Partner dashboard summary with account counts, commissions, and payouts';
COMMENT ON VIEW public.partner_referral_performance IS 'Block 23760: Performance metrics per referral for partner dashboard';






































