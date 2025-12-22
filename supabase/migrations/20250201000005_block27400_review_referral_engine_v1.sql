-- =========================================================
-- Block 27400 — SmartSend Roofing Referral & Review Engine v1
-- (Auto-request Google reviews • Ask for referrals at the right time • Track who referred who • Turn happy customers into new leads)
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
-- PART 1 — CREATE roofing_review_requests TABLE
-- ============================================================================
-- Tracks review requests sent to customers after job completion

CREATE TABLE IF NOT EXISTS public.roofing_review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.roofing_customers(id) ON DELETE SET NULL,
  
  channel text CHECK (channel IN ('email', 'sms')) DEFAULT 'email',
  review_platform text,        -- 'google', 'facebook', 'yelp', 'internal'
  
  review_link_url text,
  
  status text CHECK (status IN ('pending', 'sent', 'clicked', 'completed', 'skipped')) DEFAULT 'pending',
  
  sent_at timestamptz,
  completed_at timestamptz,
  last_click_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_review_requests_job ON public.roofing_review_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_review_requests_customer ON public.roofing_review_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_roofing_review_requests_status ON public.roofing_review_requests(status);
CREATE INDEX IF NOT EXISTS idx_roofing_review_requests_sent_at ON public.roofing_review_requests(sent_at);

-- ============================================================================
-- PART 2 — CREATE roofing_referral_requests TABLE
-- ============================================================================
-- Tracks referral requests sent to customers after positive review sentiment

CREATE TABLE IF NOT EXISTS public.roofing_referral_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.roofing_customers(id) ON DELETE SET NULL,
  
  channel text CHECK (channel IN ('email', 'sms')) DEFAULT 'email',
  status text CHECK (status IN ('pending', 'sent', 'responded', 'skipped')) DEFAULT 'pending',
  
  sent_at timestamptz,
  responded_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_referral_requests_job ON public.roofing_referral_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_referral_requests_customer ON public.roofing_referral_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_roofing_referral_requests_status ON public.roofing_referral_requests(status);
CREATE INDEX IF NOT EXISTS idx_roofing_referral_requests_sent_at ON public.roofing_referral_requests(sent_at);

-- ============================================================================
-- PART 3 — CREATE roofing_referrals TABLE
-- ============================================================================
-- Tracks new leads from happy customers (referrals)

CREATE TABLE IF NOT EXISTS public.roofing_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  referrer_customer_id uuid REFERENCES public.roofing_customers(id) ON DELETE SET NULL,
  referrer_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  referred_name text,
  referred_email text,
  referred_phone text,
  referred_address text,
  
  status text CHECK (status IN ('new', 'converted', 'lost')) DEFAULT 'new',
  linked_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_referrals_referrer_customer ON public.roofing_referrals(referrer_customer_id);
CREATE INDEX IF NOT EXISTS idx_roofing_referrals_referrer_job ON public.roofing_referrals(referrer_job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_referrals_status ON public.roofing_referrals(status);
CREATE INDEX IF NOT EXISTS idx_roofing_referrals_linked_lead ON public.roofing_referrals(linked_lead_id);
CREATE INDEX IF NOT EXISTS idx_roofing_referrals_created_at ON public.roofing_referrals(created_at DESC);

-- ============================================================================
-- PART 4 — ADD completed_at COLUMN TO roofing_jobs IF NOT EXISTS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'roofing_jobs' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.roofing_jobs ADD COLUMN completed_at timestamptz;
  END IF;
END $$;

-- ============================================================================
-- PART 5 — TRIGGERS FOR updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_roofing_review_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roofing_review_requests_updated_at ON public.roofing_review_requests;
CREATE TRIGGER trg_roofing_review_requests_updated_at
BEFORE UPDATE ON public.roofing_review_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_roofing_review_requests_updated_at();

CREATE OR REPLACE FUNCTION public.set_roofing_referral_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roofing_referral_requests_updated_at ON public.roofing_referral_requests;
CREATE TRIGGER trg_roofing_referral_requests_updated_at
BEFORE UPDATE ON public.roofing_referral_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_roofing_referral_requests_updated_at();

CREATE OR REPLACE FUNCTION public.set_roofing_referrals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roofing_referrals_updated_at ON public.roofing_referrals;
CREATE TRIGGER trg_roofing_referrals_updated_at
BEFORE UPDATE ON public.roofing_referrals
FOR EACH ROW
EXECUTE FUNCTION public.set_roofing_referrals_updated_at();

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.roofing_review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_referral_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_referrals ENABLE ROW LEVEL SECURITY;

-- Review requests policies
CREATE POLICY "Users can view review requests for their workspace"
  ON public.roofing_review_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rj.id = roofing_review_requests.job_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage review requests"
  ON public.roofing_review_requests FOR ALL
  USING (true) WITH CHECK (true);

-- Referral requests policies
CREATE POLICY "Users can view referral requests for their workspace"
  ON public.roofing_referral_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rj.id = roofing_referral_requests.job_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage referral requests"
  ON public.roofing_referral_requests FOR ALL
  USING (true) WITH CHECK (true);

-- Referrals policies
CREATE POLICY "Users can view referrals for their workspace"
  ON public.roofing_referrals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rj.id = roofing_referrals.referrer_job_id
        AND wm.user_id = auth.uid()
    )
    OR referrer_job_id IS NULL
  );

CREATE POLICY "Users can insert referrals"
  ON public.roofing_referrals FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update referrals for their workspace"
  ON public.roofing_referrals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rj.id = roofing_referrals.referrer_job_id
        AND wm.user_id = auth.uid()
    )
    OR referrer_job_id IS NULL
  );

CREATE POLICY "Service role can manage referrals"
  ON public.roofing_referrals FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 7 — TRIGGER TO SET completed_at WHEN STATUS CHANGES TO 'completed'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_roofing_jobs_completed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set completed_at when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_roofing_jobs_completed_at ON public.roofing_jobs;
CREATE TRIGGER trg_set_roofing_jobs_completed_at
BEFORE UPDATE OF status ON public.roofing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_roofing_jobs_completed_at();

-- ============================================================================
-- PART 8 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.roofing_review_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.roofing_referral_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.roofing_referrals TO authenticated;

COMMENT ON TABLE public.roofing_review_requests IS 'Tracks review requests sent to customers after job completion (Block 27400)';
COMMENT ON TABLE public.roofing_referral_requests IS 'Tracks referral requests sent to customers after positive review sentiment (Block 27400)';
COMMENT ON TABLE public.roofing_referrals IS 'Tracks new leads from happy customers (referrals) (Block 27400)';



































