-- =========================================================
-- Block 84000 — SmartSend Roofing "Reviews + Referral Flywheel Engine" v1
-- =========================================================
-- 
-- This block is pure revenue.
-- This is how SmartSend turns every completed job into:
-- - More jobs
-- - More Google reviews
-- - More referrals
-- - More neighborhood visibility
-- - More trust → more revenue
--
-- Every happy homeowner automatically becomes a review + referral generator
-- without the roofer doing anything.
--
-- This creates the flywheel effect:
-- Job → Review → Referral → Job → Review → Referral → Endless.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE review_requests TABLE
-- ============================================================================
-- Tracks review requests sent to homeowners after job completion

CREATE TABLE IF NOT EXISTS public.review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid REFERENCES public.homeowner_portals(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  homeowner_email text,
  sent_at timestamp DEFAULT now(),
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'clicked', 'completed', 'ignored')),
  review_platform text CHECK (review_platform IN ('google', 'facebook', 'yelp')),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_requests_portal ON public.review_requests(portal_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_job ON public.review_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_status ON public.review_requests(status);
CREATE INDEX IF NOT EXISTS idx_review_requests_sent_at ON public.review_requests(sent_at DESC);

-- ============================================================================
-- PART 2 — CREATE referral_links TABLE
-- ============================================================================
-- Tracks unique referral links for each homeowner

CREATE TABLE IF NOT EXISTS public.referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid REFERENCES public.homeowner_portals(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  ref_code text UNIQUE NOT NULL,  -- unique referral tracking code
  clicks integer DEFAULT 0,
  leads_generated integer DEFAULT 0,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_links_portal ON public.referral_links(portal_id);
CREATE INDEX IF NOT EXISTS idx_referral_links_job ON public.referral_links(job_id);
CREATE INDEX IF NOT EXISTS idx_referral_links_ref_code ON public.referral_links(ref_code);

-- ============================================================================
-- PART 3 — CREATE referral_leads TABLE
-- ============================================================================
-- Tracks leads generated from referral links

CREATE TABLE IF NOT EXISTS public.referral_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid REFERENCES public.referral_links(id) ON DELETE SET NULL,
  homeowner_name text,
  homeowner_email text,
  homeowner_phone text,
  message text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_leads_referral ON public.referral_leads(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_leads_email ON public.referral_leads(homeowner_email);

-- ============================================================================
-- PART 4 — CREATE referral_rewards TABLE
-- ============================================================================
-- Tracks rewards for referrals (optional but future-proofing)

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid REFERENCES public.referral_links(id) ON DELETE SET NULL,
  reward_type text CHECK (reward_type IN ('giftcard', 'discount', 'cash')),
  reward_value numeric,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'issued')),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referral ON public.referral_rewards(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON public.referral_rewards(status);

-- ============================================================================
-- PART 5 — FUNCTIONS
-- ============================================================================

-- Generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE sql
AS $$
  SELECT upper(substr(md5(random()::text || now()::text || random()::text), 1, 8));
$$;

-- Increment referral leads count
CREATE OR REPLACE FUNCTION public.increment_referral_leads(referral_link_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.referral_links
  SET leads_generated = leads_generated + 1
  WHERE id = referral_link_id;
END;
$$;

-- ============================================================================
-- PART 6 — TRIGGERS
-- ============================================================================

-- Auto-generate referral link when job is completed
CREATE OR REPLACE FUNCTION public.auto_create_referral_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_portal_id uuid;
  v_ref_code text;
BEGIN
  -- Only trigger when status changes to 'completed'
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    
    -- Find homeowner portal for this job
    SELECT id INTO v_portal_id
    FROM public.homeowner_portals
    WHERE job_id = NEW.id
    AND is_enabled = true
    LIMIT 1;
    
    -- Only create if portal exists and referral link doesn't exist
    IF v_portal_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.referral_links
        WHERE portal_id = v_portal_id
      ) THEN
        -- Generate unique referral code
        LOOP
          v_ref_code := public.generate_referral_code();
          EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.referral_links WHERE ref_code = v_ref_code
          );
        END LOOP;
        
        -- Create referral link
        INSERT INTO public.referral_links (portal_id, job_id, ref_code)
        VALUES (v_portal_id, NEW.id, v_ref_code);
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_referral_link ON public.roofing_jobs;
CREATE TRIGGER trg_auto_create_referral_link
AFTER UPDATE OF status ON public.roofing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_referral_link();

-- Auto-send review request when job is completed (if homeowner rating ≥ 4)
CREATE OR REPLACE FUNCTION public.auto_send_review_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_portal_id uuid;
  v_homeowner_email text;
  v_rating numeric;
BEGIN
  -- Only trigger when status changes to 'completed'
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    
    -- Find homeowner portal for this job
    SELECT hp.id, l.email
    INTO v_portal_id, v_homeowner_email
    FROM public.homeowner_portals hp
    LEFT JOIN public.roofing_jobs rj ON rj.id = hp.job_id
    LEFT JOIN public.leads l ON l.id = rj.lead_id
    WHERE hp.job_id = NEW.id
    AND hp.is_enabled = true
    LIMIT 1;
    
    -- Check homeowner feedback rating (if exists)
    SELECT rating INTO v_rating
    FROM public.homeowner_feedback
    WHERE job_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Only send if portal exists and rating is ≥ 4 (or no rating yet, default to sending)
    IF v_portal_id IS NOT NULL AND (v_rating IS NULL OR v_rating >= 4) THEN
      -- Check if review request already sent
      IF NOT EXISTS (
        SELECT 1 FROM public.review_requests
        WHERE portal_id = v_portal_id
        AND job_id = NEW.id
      ) THEN
        -- Create review request (will be sent via automation)
        INSERT INTO public.review_requests (portal_id, job_id, homeowner_email, status, review_platform)
        VALUES (v_portal_id, NEW.id, v_homeowner_email, 'sent', 'google');
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_send_review_request ON public.roofing_jobs;
CREATE TRIGGER trg_auto_send_review_request
AFTER UPDATE OF status ON public.roofing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.auto_send_review_request();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- Review requests policies
CREATE POLICY "review_requests_select_workspace"
  ON public.review_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.homeowner_portals hp
      JOIN public.roofing_jobs rj ON rj.id = hp.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE hp.id = review_requests.portal_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "review_requests_service_role_all"
  ON public.review_requests FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Referral links policies
CREATE POLICY "referral_links_select_workspace"
  ON public.referral_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.homeowner_portals hp
      JOIN public.roofing_jobs rj ON rj.id = hp.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE hp.id = referral_links.portal_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "referral_links_service_role_all"
  ON public.referral_links FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Referral leads policies
CREATE POLICY "referral_leads_select_workspace"
  ON public.referral_leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.referral_links rl
      JOIN public.homeowner_portals hp ON hp.id = rl.portal_id
      JOIN public.roofing_jobs rj ON rj.id = hp.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rl.id = referral_leads.referral_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "referral_leads_insert_public"
  ON public.referral_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "referral_leads_service_role_all"
  ON public.referral_leads FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Referral rewards policies
CREATE POLICY "referral_rewards_select_workspace"
  ON public.referral_rewards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.referral_links rl
      JOIN public.homeowner_portals hp ON hp.id = rl.portal_id
      JOIN public.roofing_jobs rj ON rj.id = hp.job_id
      JOIN public.workspace_members wm ON wm.workspace_id = rj.workspace_id
      WHERE rl.id = referral_rewards.referral_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "referral_rewards_service_role_all"
  ON public.referral_rewards FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.review_requests IS 'Block 84000: Tracks review requests sent to homeowners after job completion';
COMMENT ON TABLE public.referral_links IS 'Block 84000: Tracks unique referral links for each homeowner';
COMMENT ON TABLE public.referral_leads IS 'Block 84000: Tracks leads generated from referral links';
COMMENT ON TABLE public.referral_rewards IS 'Block 84000: Tracks rewards for referrals';



























