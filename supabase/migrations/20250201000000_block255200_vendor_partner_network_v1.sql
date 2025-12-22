-- ============================================================
-- Block 255200 — SmartSend Vendor & Partner Network v1
-- "Preferred Vendors, Labor Pools, Sub Networks, Workforce Sharing, Ratings System"
-- ============================================================
-- 
-- This block expands SmartSend beyond one roofing company.
-- It begins turning SmartSend into a network — where vendors, subcontractors, 
-- labor resources, and partner companies become connected.
--
-- Features:
-- - Preferred Vendor Database
-- - Subcontractor Partner Network
-- - Emergency Labor Pool System
-- - Company-to-Company Resource Sharing
-- - Vendor Rating & Performance Scores
-- - SmartSend Partner Marketplace (Internal)
-- - Verified Labor Profiles
-- - Vendor Pricing Comparison Tool
-- ============================================================

-- ============================================================
-- 1. VENDOR_PARTNERS TABLE
-- ============================================================
-- Preferred vendors that roofing companies can add and rate

CREATE TABLE IF NOT EXISTS public.vendor_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Vendor Identity
  vendor_name text NOT NULL,
  trade text NOT NULL, -- 'roofing_supply', 'gutter_fabricator', 'dumpster_rental', 'siding', 'insulation', 'hvac', 'solar', 'material_supplier', etc.
  
  -- Contact Information
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip_code text,
  website text,
  
  -- Performance Metrics
  rating numeric(3,1) DEFAULT 0 CHECK (rating >= 0 AND rating <= 100),
  total_jobs int DEFAULT 0,
  total_reviews int DEFAULT 0,
  
  -- Performance Breakdown (for rating calculation)
  responsiveness_score numeric(3,1) DEFAULT 0, -- 0-100
  accuracy_score numeric(3,1) DEFAULT 0, -- 0-100
  speed_score numeric(3,1) DEFAULT 0, -- 0-100
  quality_score numeric(3,1) DEFAULT 0, -- 0-100
  pricing_consistency_score numeric(3,1) DEFAULT 0, -- 0-100
  
  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  is_verified boolean DEFAULT false,
  is_shared boolean DEFAULT false, -- If true, visible to other orgs in network
  
  -- Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique vendor per org (unless shared)
  CONSTRAINT unique_vendor_per_org UNIQUE (org_id, vendor_name, trade)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vendor_partners_org ON public.vendor_partners(org_id, status);
CREATE INDEX IF NOT EXISTS idx_vendor_partners_trade ON public.vendor_partners(trade, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_vendor_partners_rating ON public.vendor_partners(org_id, rating DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_vendor_partners_shared ON public.vendor_partners(is_shared, trade, rating DESC) WHERE is_shared = true AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_vendor_partners_verified ON public.vendor_partners(is_verified, rating DESC) WHERE is_verified = true;

-- ============================================================
-- 2. LABOR_POOL TABLE
-- ============================================================
-- Emergency labor pool - crews and individual workers

CREATE TABLE IF NOT EXISTS public.labor_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL, -- null = network-wide
  
  -- Labor Identity
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  
  -- Skills & Experience
  skill text NOT NULL, -- 'tear_off', 'install', 'repairs', 'cleanup', 'gutter', 'siding', 'general'
  experience_years int DEFAULT 0,
  certifications text[], -- Array of certifications
  
  -- Performance
  rating numeric(3,1) DEFAULT 0 CHECK (rating >= 0 AND rating <= 100),
  total_jobs int DEFAULT 0,
  total_reviews int DEFAULT 0,
  
  -- Availability
  availability text DEFAULT 'available', -- 'available', 'busy', 'unavailable', 'on_job'
  available_from date,
  available_until date,
  preferred_radius_miles int DEFAULT 25, -- How far they'll travel
  
  -- Location
  city text,
  state text,
  zip_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  
  -- Verification
  verified boolean DEFAULT false,
  verification_docs jsonb DEFAULT '[]'::jsonb, -- IDs, insurance, certifications
  insurance_provider text,
  insurance_expires date,
  
  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  is_shared boolean DEFAULT false, -- If true, visible to other orgs
  
  -- Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_labor_pool_org ON public.labor_pool(org_id, status) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_labor_pool_skill ON public.labor_pool(skill, availability, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_labor_pool_rating ON public.labor_pool(skill, rating DESC, availability) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_labor_pool_location ON public.labor_pool(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_labor_pool_shared ON public.labor_pool(is_shared, skill, availability) WHERE is_shared = true AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_labor_pool_verified ON public.labor_pool(verified, rating DESC) WHERE verified = true;

-- ============================================================
-- 3. PARTNER_JOBS TABLE
-- ============================================================
-- Company-to-company resource sharing requests

CREATE TABLE IF NOT EXISTS public.partner_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL, -- null = open request
  
  -- Job Details
  job_description text NOT NULL,
  resource_type text NOT NULL, -- 'crew', 'dump_trailer', 'tear_off_help', 'installers', 'specialty_trade', 'equipment'
  quantity_needed int DEFAULT 1,
  
  -- Timing
  needed_on date NOT NULL,
  needed_until date,
  urgency text DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'emergency')),
  
  -- Location
  job_location text,
  city text,
  state text,
  zip_code text,
  
  -- Pricing
  budget_per_unit numeric(10,2), -- e.g., $250/day per installer
  total_budget numeric(10,2),
  
  -- Status
  status text DEFAULT 'open' CHECK (status IN ('open', 'matched', 'accepted', 'in_progress', 'completed', 'cancelled')),
  is_shared boolean DEFAULT true, -- If true, visible to other orgs for matching
  
  -- Matching
  matched_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  
  -- Feedback
  requester_rating int CHECK (requester_rating >= 1 AND requester_rating <= 5),
  provider_rating int CHECK (provider_rating >= 1 AND provider_rating <= 5),
  requester_feedback text,
  provider_feedback text,
  
  -- Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_partner_jobs_requester ON public.partner_jobs(requester_org_id, status);
CREATE INDEX IF NOT EXISTS idx_partner_jobs_provider ON public.partner_jobs(provider_org_id, status) WHERE provider_org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partner_jobs_status ON public.partner_jobs(status, needed_on) WHERE status IN ('open', 'matched');
CREATE INDEX IF NOT EXISTS idx_partner_jobs_resource_type ON public.partner_jobs(resource_type, status, needed_on) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_partner_jobs_location ON public.partner_jobs(state, city, status) WHERE status = 'open';

-- ============================================================
-- 4. VENDOR_PRICING TABLE
-- ============================================================
-- Vendor pricing data for comparison

CREATE TABLE IF NOT EXISTS public.vendor_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendor_partners(id) ON DELETE CASCADE,
  
  -- Material Information
  material_name text NOT NULL, -- e.g., 'Timberline HDZ', 'GAF Timberline', 'CertainTeed Landmark'
  material_sku text,
  material_category text, -- 'shingles', 'underlayment', 'flashing', 'nails', 'gutters', etc.
  
  -- Pricing
  price numeric(10,2) NOT NULL,
  unit text NOT NULL, -- 'sq', 'bundle', 'roll', 'linear_ft', 'piece', 'box'
  min_quantity int DEFAULT 1,
  bulk_discount_threshold int, -- e.g., 30 squares = 5% discount
  bulk_discount_percent numeric(5,2),
  
  -- Availability
  in_stock boolean DEFAULT true,
  lead_time_days int DEFAULT 0,
  
  -- Validity
  price_valid_from date DEFAULT CURRENT_DATE,
  price_valid_until date,
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vendor_pricing_vendor ON public.vendor_pricing(vendor_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_pricing_material ON public.vendor_pricing(material_name, price) WHERE price_valid_until IS NULL OR price_valid_until >= CURRENT_DATE;
CREATE INDEX IF NOT EXISTS idx_vendor_pricing_category ON public.vendor_pricing(material_category, price) WHERE price_valid_until IS NULL OR price_valid_until >= CURRENT_DATE;
CREATE INDEX IF NOT EXISTS idx_vendor_pricing_valid ON public.vendor_pricing(price_valid_from, price_valid_until) WHERE price_valid_until IS NULL OR price_valid_until >= CURRENT_DATE;

-- ============================================================
-- 5. VENDOR_REVIEWS TABLE
-- ============================================================
-- Reviews and ratings for vendors

CREATE TABLE IF NOT EXISTS public.vendor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendor_partners(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Ratings (1-5 scale)
  overall_rating int NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
  responsiveness_rating int CHECK (responsiveness_rating >= 1 AND responsiveness_rating <= 5),
  accuracy_rating int CHECK (accuracy_rating >= 1 AND accuracy_rating <= 5),
  speed_rating int CHECK (speed_rating >= 1 AND speed_rating <= 5),
  quality_rating int CHECK (quality_rating >= 1 AND quality_rating <= 5),
  pricing_rating int CHECK (pricing_rating >= 1 AND pricing_rating <= 5),
  
  -- Review Content
  review_text text,
  job_id uuid, -- Optional reference to job
  
  -- Status
  status text DEFAULT 'published' CHECK (status IN ('draft', 'published', 'hidden')),
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure one review per org per vendor (can update)
  CONSTRAINT unique_review_per_org_vendor UNIQUE (vendor_id, org_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vendor_reviews_vendor ON public.vendor_reviews(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_reviews_org ON public.vendor_reviews(org_id, created_at DESC);

-- ============================================================
-- 6. LABOR_REVIEWS TABLE
-- ============================================================
-- Reviews and ratings for labor pool members

CREATE TABLE IF NOT EXISTS public.labor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_id uuid NOT NULL REFERENCES public.labor_pool(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Ratings
  overall_rating int NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
  skill_rating int CHECK (skill_rating >= 1 AND skill_rating <= 5),
  reliability_rating int CHECK (reliability_rating >= 1 AND reliability_rating <= 5),
  communication_rating int CHECK (communication_rating >= 1 AND communication_rating <= 5),
  
  -- Review Content
  review_text text,
  job_id uuid, -- Optional reference to job
  
  -- Status
  status text DEFAULT 'published' CHECK (status IN ('draft', 'published', 'hidden')),
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure one review per org per labor (can update)
  CONSTRAINT unique_review_per_org_labor UNIQUE (labor_id, org_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_labor_reviews_labor ON public.labor_reviews(labor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_labor_reviews_org ON public.labor_reviews(org_id, created_at DESC);

-- ============================================================
-- 7. HELPER FUNCTIONS
-- ============================================================

-- Function to calculate vendor rating from reviews
CREATE OR REPLACE FUNCTION public.calculate_vendor_rating(_vendor_id uuid)
RETURNS numeric(3,1) LANGUAGE plpgsql AS $$
DECLARE
  _rating numeric(3,1);
  _responsiveness numeric(3,1);
  _accuracy numeric(3,1);
  _speed numeric(3,1);
  _quality numeric(3,1);
  _pricing numeric(3,1);
BEGIN
  -- Calculate average ratings from reviews
  SELECT 
    AVG(overall_rating::numeric) * 20, -- Convert 1-5 to 0-100
    AVG(responsiveness_rating::numeric) * 20,
    AVG(accuracy_rating::numeric) * 20,
    AVG(speed_rating::numeric) * 20,
    AVG(quality_rating::numeric) * 20,
    AVG(pricing_rating::numeric) * 20
  INTO _rating, _responsiveness, _accuracy, _speed, _quality, _pricing
  FROM public.vendor_reviews
  WHERE vendor_id = _vendor_id AND status = 'published';
  
  -- Update vendor_partners table
  UPDATE public.vendor_partners
  SET 
    rating = COALESCE(_rating, 0),
    responsiveness_score = COALESCE(_responsiveness, 0),
    accuracy_score = COALESCE(_accuracy, 0),
    speed_score = COALESCE(_speed, 0),
    quality_score = COALESCE(_quality, 0),
    pricing_consistency_score = COALESCE(_pricing, 0),
    total_reviews = (SELECT COUNT(*) FROM public.vendor_reviews WHERE vendor_id = _vendor_id AND status = 'published'),
    updated_at = now()
  WHERE id = _vendor_id;
  
  RETURN COALESCE(_rating, 0);
END;
$$;

-- Function to calculate labor rating from reviews
CREATE OR REPLACE FUNCTION public.calculate_labor_rating(_labor_id uuid)
RETURNS numeric(3,1) LANGUAGE plpgsql AS $$
DECLARE
  _rating numeric(3,1);
BEGIN
  -- Calculate average rating from reviews
  SELECT AVG(overall_rating::numeric) * 20 -- Convert 1-5 to 0-100
  INTO _rating
  FROM public.labor_reviews
  WHERE labor_id = _labor_id AND status = 'published';
  
  -- Update labor_pool table
  UPDATE public.labor_pool
  SET 
    rating = COALESCE(_rating, 0),
    total_reviews = (SELECT COUNT(*) FROM public.labor_reviews WHERE labor_id = _labor_id AND status = 'published'),
    updated_at = now()
  WHERE id = _labor_id;
  
  RETURN COALESCE(_rating, 0);
END;
$$;

-- Trigger to recalculate vendor rating when review is added/updated
CREATE OR REPLACE FUNCTION public.trigger_recalculate_vendor_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.calculate_vendor_rating(COALESCE(NEW.vendor_id, OLD.vendor_id));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recalculate_vendor_rating
AFTER INSERT OR UPDATE OR DELETE ON public.vendor_reviews
FOR EACH ROW EXECUTE FUNCTION public.trigger_recalculate_vendor_rating();

-- Trigger to recalculate labor rating when review is added/updated
CREATE OR REPLACE FUNCTION public.trigger_recalculate_labor_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.calculate_labor_rating(COALESCE(NEW.labor_id, OLD.labor_id));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recalculate_labor_rating
AFTER INSERT OR UPDATE OR DELETE ON public.labor_reviews
FOR EACH ROW EXECUTE FUNCTION public.trigger_recalculate_labor_rating();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply updated_at triggers
CREATE TRIGGER trg_vendor_partners_updated_at
BEFORE UPDATE ON public.vendor_partners
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_labor_pool_updated_at
BEFORE UPDATE ON public.labor_pool
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_partner_jobs_updated_at
BEFORE UPDATE ON public.partner_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_vendor_pricing_updated_at
BEFORE UPDATE ON public.vendor_pricing
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.vendor_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_reviews ENABLE ROW LEVEL SECURITY;

-- Helper function to check org membership
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.org_memberships
    WHERE org_id = _org_id AND user_id = auth.uid() AND status = 'active'
  );
$$;

-- VENDOR_PARTNERS Policies
CREATE POLICY "vendor_partners_select_own" ON public.vendor_partners
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "vendor_partners_select_shared" ON public.vendor_partners
  FOR SELECT USING (is_shared = true AND status = 'active');

CREATE POLICY "vendor_partners_insert" ON public.vendor_partners
  FOR INSERT WITH CHECK (is_org_member(org_id));

CREATE POLICY "vendor_partners_update_own" ON public.vendor_partners
  FOR UPDATE USING (is_org_member(org_id));

CREATE POLICY "vendor_partners_delete_own" ON public.vendor_partners
  FOR DELETE USING (is_org_member(org_id));

-- LABOR_POOL Policies
CREATE POLICY "labor_pool_select_own" ON public.labor_pool
  FOR SELECT USING (org_id IS NULL OR is_org_member(org_id));

CREATE POLICY "labor_pool_select_shared" ON public.labor_pool
  FOR SELECT USING (is_shared = true AND status = 'active');

CREATE POLICY "labor_pool_insert" ON public.labor_pool
  FOR INSERT WITH CHECK (org_id IS NULL OR is_org_member(org_id));

CREATE POLICY "labor_pool_update_own" ON public.labor_pool
  FOR UPDATE USING (org_id IS NULL OR is_org_member(org_id));

CREATE POLICY "labor_pool_delete_own" ON public.labor_pool
  FOR DELETE USING (org_id IS NULL OR is_org_member(org_id));

-- PARTNER_JOBS Policies
CREATE POLICY "partner_jobs_select_requester" ON public.partner_jobs
  FOR SELECT USING (is_org_member(requester_org_id));

CREATE POLICY "partner_jobs_select_provider" ON public.partner_jobs
  FOR SELECT USING (provider_org_id IS NOT NULL AND is_org_member(provider_org_id));

CREATE POLICY "partner_jobs_select_open" ON public.partner_jobs
  FOR SELECT USING (status = 'open'); -- Allow viewing open jobs for matching

CREATE POLICY "partner_jobs_insert" ON public.partner_jobs
  FOR INSERT WITH CHECK (is_org_member(requester_org_id));

CREATE POLICY "partner_jobs_update_requester" ON public.partner_jobs
  FOR UPDATE USING (is_org_member(requester_org_id));

CREATE POLICY "partner_jobs_update_provider" ON public.partner_jobs
  FOR UPDATE USING (provider_org_id IS NOT NULL AND is_org_member(provider_org_id));

-- VENDOR_PRICING Policies (follow vendor access)
CREATE POLICY "vendor_pricing_select" ON public.vendor_pricing
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.vendor_partners vp
      WHERE vp.id = vendor_pricing.vendor_id
      AND (is_org_member(vp.org_id) OR (vp.is_shared = true AND vp.status = 'active'))
    )
  );

CREATE POLICY "vendor_pricing_insert" ON public.vendor_pricing
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vendor_partners vp
      WHERE vp.id = vendor_pricing.vendor_id
      AND is_org_member(vp.org_id)
    )
  );

CREATE POLICY "vendor_pricing_update" ON public.vendor_pricing
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.vendor_partners vp
      WHERE vp.id = vendor_pricing.vendor_id
      AND is_org_member(vp.org_id)
    )
  );

-- VENDOR_REVIEWS Policies
CREATE POLICY "vendor_reviews_select" ON public.vendor_reviews
  FOR SELECT USING (
    is_org_member(org_id) OR
    EXISTS (
      SELECT 1 FROM public.vendor_partners vp
      WHERE vp.id = vendor_reviews.vendor_id
      AND (vp.is_shared = true AND vp.status = 'active')
    )
  );

CREATE POLICY "vendor_reviews_insert" ON public.vendor_reviews
  FOR INSERT WITH CHECK (is_org_member(org_id));

CREATE POLICY "vendor_reviews_update_own" ON public.vendor_reviews
  FOR UPDATE USING (is_org_member(org_id));

-- LABOR_REVIEWS Policies
CREATE POLICY "labor_reviews_select" ON public.labor_reviews
  FOR SELECT USING (
    is_org_member(org_id) OR
    EXISTS (
      SELECT 1 FROM public.labor_pool lp
      WHERE lp.id = labor_reviews.labor_id
      AND (lp.is_shared = true AND lp.status = 'active')
    )
  );

CREATE POLICY "labor_reviews_insert" ON public.labor_reviews
  FOR INSERT WITH CHECK (is_org_member(org_id));

CREATE POLICY "labor_reviews_update_own" ON public.labor_reviews
  FOR UPDATE USING (is_org_member(org_id));

-- ============================================================
-- 9. COMMENTS
-- ============================================================

COMMENT ON TABLE public.vendor_partners IS 'Preferred vendors that roofing companies can add and rate';
COMMENT ON TABLE public.labor_pool IS 'Emergency labor pool - crews and individual workers available for hire';
COMMENT ON TABLE public.partner_jobs IS 'Company-to-company resource sharing requests';
COMMENT ON TABLE public.vendor_pricing IS 'Vendor pricing data for material comparison';
COMMENT ON TABLE public.vendor_reviews IS 'Reviews and ratings for vendors';
COMMENT ON TABLE public.labor_reviews IS 'Reviews and ratings for labor pool members';





















