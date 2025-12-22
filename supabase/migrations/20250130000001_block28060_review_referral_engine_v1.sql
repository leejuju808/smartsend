-- =========================================================
-- Block 28060 — SmartSend Roofing Review & Referral Engine v1
-- (Auto-request reviews • Track referrals • Reward homeowners • Feed new leads automatically)
-- =========================================================
-- 
-- This block turns SmartSend into a lead generator from finished jobs — no ads.
--
-- Most roofers:
-- ❌ Forget to ask for reviews
-- ❌ Never systematically ask for referrals
-- ❌ Don't track who actually sends them new business
-- ❌ Let their Google profile go stale
--
-- SmartSend will now:
-- ✅ Watch for job completion, automatically ask for reviews + referrals
-- ✅ Track the results
-- ✅ Feed new leads back into the system
--
-- This is a free lead machine on top of everything you built.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE homeowner_profiles TABLE
-- ============================================================================
-- Tracks homeowner profiles with referral codes and stats

CREATE TABLE IF NOT EXISTS public.homeowner_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  referral_code text UNIQUE NOT NULL,
  referrals_count int DEFAULT 0,
  reviews_requested int DEFAULT 0,
  reviews_completed int DEFAULT 0,
  
  -- Reward tracking
  rewards_earned int DEFAULT 0,
  rewards_delivered int DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_profiles_lead ON public.homeowner_profiles(lead_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_profiles_workspace ON public.homeowner_profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_profiles_referral_code ON public.homeowner_profiles(referral_code);

-- ============================================================================
-- PART 2 — CREATE referrals TABLE
-- ============================================================================
-- Tracks new leads from happy customers (referrals)

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  referral_code text NOT NULL,
  referring_homeowner uuid REFERENCES public.homeowner_profiles(id) ON DELETE SET NULL,
  new_lead uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  status text DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'booked', 'closed', 'lost')),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referral_code ON public.referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_referring_homeowner ON public.referrals(referring_homeowner);
CREATE INDEX IF NOT EXISTS idx_referrals_new_lead ON public.referrals(new_lead);
CREATE INDEX IF NOT EXISTS idx_referrals_workspace ON public.referrals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON public.referrals(status);

-- ============================================================================
-- PART 3 — CREATE review_requests TABLE
-- ============================================================================
-- Tracks review requests sent to customers after job completion

CREATE TABLE IF NOT EXISTS public.review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  homeowner_id uuid REFERENCES public.homeowner_profiles(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  review_link_url text,
  google_review_link text,
  
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'clicked', 'reviewed', 'skipped')),
  
  created_at timestamptz DEFAULT now(),
  clicked_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_requests_homeowner ON public.review_requests(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_lead ON public.review_requests(lead_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_workspace ON public.review_requests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_status ON public.review_requests(status);

-- ============================================================================
-- PART 4 — CREATE referral_rewards TABLE
-- ============================================================================
-- Tracks reward configuration and delivery

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  homeowner_id uuid REFERENCES public.homeowner_profiles(id) ON DELETE SET NULL,
  
  reward_type text, -- 'gift_card', 'discount', 'service', 'cash', etc.
  reward_description text,
  referrals_required int DEFAULT 1,
  referrals_earned int DEFAULT 0,
  
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'earned', 'delivered', 'cancelled')),
  
  created_at timestamptz DEFAULT now(),
  delivered_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_homeowner ON public.referral_rewards(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_workspace ON public.referral_rewards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON public.referral_rewards(status);

-- ============================================================================
-- PART 5 — FUNCTIONS
-- ============================================================================

-- Generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'REF' || upper(substr(md5(random()::text || now()::text), 1, 8));
$$;

-- Increment referral count for homeowner
CREATE OR REPLACE FUNCTION public.increment_referral_count(homeowner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.homeowner_profiles
  SET referrals_count = referrals_count + 1,
      updated_at = now()
  WHERE id = homeowner_id;
END;
$$;

-- Increment review requested count
CREATE OR REPLACE FUNCTION public.increment_review_requested(homeowner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.homeowner_profiles
  SET reviews_requested = reviews_requested + 1,
      updated_at = now()
  WHERE id = homeowner_id;
END;
$$;

-- Increment review completed count
CREATE OR REPLACE FUNCTION public.increment_review_completed(homeowner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.homeowner_profiles
  SET reviews_completed = reviews_completed + 1,
      updated_at = now()
  WHERE id = homeowner_id;
END;
$$;

-- ============================================================================
-- PART 6 — TRIGGERS FOR updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_homeowner_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_homeowner_profiles_updated_at ON public.homeowner_profiles;
CREATE TRIGGER trg_homeowner_profiles_updated_at
BEFORE UPDATE ON public.homeowner_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_homeowner_profiles_updated_at();

CREATE OR REPLACE FUNCTION public.set_referrals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referrals_updated_at ON public.referrals;
CREATE TRIGGER trg_referrals_updated_at
BEFORE UPDATE ON public.referrals
FOR EACH ROW
EXECUTE FUNCTION public.set_referrals_updated_at();

CREATE OR REPLACE FUNCTION public.set_review_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_requests_updated_at ON public.review_requests;
CREATE TRIGGER trg_review_requests_updated_at
BEFORE UPDATE ON public.review_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_review_requests_updated_at();

CREATE OR REPLACE FUNCTION public.set_referral_rewards_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_rewards_updated_at ON public.referral_rewards;
CREATE TRIGGER trg_referral_rewards_updated_at
BEFORE UPDATE ON public.referral_rewards
FOR EACH ROW
EXECUTE FUNCTION public.set_referral_rewards_updated_at();

-- ============================================================================
-- PART 7 — TRIGGER: Create homeowner profile when lead becomes customer
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_homeowner_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  -- Only create profile if status changed to 'customer' or 'Customer'
  IF (OLD.status IS DISTINCT FROM NEW.status) 
     AND (NEW.status ILIKE 'customer' OR NEW.status ILIKE 'Customer')
     AND (OLD.status IS NULL OR OLD.status NOT ILIKE 'customer') THEN
    
    -- Check if profile already exists
    SELECT id INTO v_profile_id
    FROM public.homeowner_profiles
    WHERE lead_id = NEW.id
    LIMIT 1;
    
    -- Only create if doesn't exist
    IF v_profile_id IS NULL THEN
      INSERT INTO public.homeowner_profiles (lead_id, workspace_id, referral_code)
      VALUES (NEW.id, NEW.workspace_id, public.generate_referral_code())
      RETURNING id INTO v_profile_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS homeowner_profile_trigger ON public.leads;
CREATE TRIGGER homeowner_profile_trigger
AFTER UPDATE OF status ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.create_homeowner_profile();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.homeowner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- Homeowner profiles policies
CREATE POLICY "Users can view homeowner profiles for their workspace"
  ON public.homeowner_profiles FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert homeowner profiles for their workspace"
  ON public.homeowner_profiles FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update homeowner profiles for their workspace"
  ON public.homeowner_profiles FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage homeowner profiles"
  ON public.homeowner_profiles FOR ALL
  USING (true) WITH CHECK (true);

-- Referrals policies
CREATE POLICY "Users can view referrals for their workspace"
  ON public.referrals FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert referrals for their workspace"
  ON public.referrals FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update referrals for their workspace"
  ON public.referrals FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage referrals"
  ON public.referrals FOR ALL
  USING (true) WITH CHECK (true);

-- Review requests policies
CREATE POLICY "Users can view review requests for their workspace"
  ON public.review_requests FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert review requests for their workspace"
  ON public.review_requests FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update review requests for their workspace"
  ON public.review_requests FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage review requests"
  ON public.review_requests FOR ALL
  USING (true) WITH CHECK (true);

-- Referral rewards policies
CREATE POLICY "Users can view referral rewards for their workspace"
  ON public.referral_rewards FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert referral rewards for their workspace"
  ON public.referral_rewards FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update referral rewards for their workspace"
  ON public.referral_rewards FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage referral rewards"
  ON public.referral_rewards FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 9 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.homeowner_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.referrals TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.review_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.referral_rewards TO authenticated;

COMMENT ON TABLE public.homeowner_profiles IS 'Tracks homeowner profiles with referral codes and stats (Block 28060)';
COMMENT ON TABLE public.referrals IS 'Tracks new leads from happy customers (referrals) (Block 28060)';
COMMENT ON TABLE public.review_requests IS 'Tracks review requests sent to customers after job completion (Block 28060)';
COMMENT ON TABLE public.referral_rewards IS 'Tracks reward configuration and delivery (Block 28060)';


































