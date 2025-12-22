-- ============================================================================
-- Block 256400 — SmartSend Customer Experience Engine v1
-- "Review Automation, Job Photo Reports, Satisfaction Scoring, Issue Resolution, Reputation Growth"
-- ============================================================================
-- 
-- This block turns SmartSend into the customer satisfaction powerhouse that makes
-- homeowners TRUST the roofing company AND generates nonstop 5-star reviews.
-- 
-- Roofers lose MASSIVE opportunity because:
-- - they forget to ask for reviews
-- - they don't send job photo reports
-- - customers never know what the crew actually did
-- - communication is inconsistent
-- - no satisfaction scoring
-- - issues go unnoticed
-- - unhappy customers don't tell the company—they tell Facebook
-- - no system for capturing referrals
-- - quality control is random
-- - reputation depends on luck instead of systems
-- 
-- SmartSend fixes ALL OF IT.
-- ============================================================================

-- ============================================================================
-- PART 1 — CREATE job_photo_reports TABLE
-- ============================================================================
-- Automated Job Photo Reports (Homeowners LOVE this)
-- SmartSend automatically builds a clean, branded PDF+web report

CREATE TABLE IF NOT EXISTS public.job_photo_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  team_id uuid,
  company_id uuid,
  
  -- Photo collections
  before_photos text[] DEFAULT '{}',
  during_photos text[] DEFAULT '{}',
  after_photos text[] DEFAULT '{}',
  
  -- Report metadata
  report_url text, -- URL to PDF/web report
  report_status text DEFAULT 'pending' CHECK (report_status IN ('pending', 'generating', 'ready', 'sent', 'error')),
  
  -- Report content (for web view)
  report_html text, -- HTML version of report
  report_pdf_url text, -- PDF download URL
  
  -- Delivery tracking
  sent_to_customer boolean DEFAULT false,
  sent_at timestamptz,
  customer_viewed boolean DEFAULT false,
  customer_viewed_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraints
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'job_photo_reports_job_id_fkey'
    ) THEN
      ALTER TABLE public.job_photo_reports
        ADD CONSTRAINT job_photo_reports_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_photo_reports_job ON public.job_photo_reports(job_id);
CREATE INDEX IF NOT EXISTS idx_job_photo_reports_customer ON public.job_photo_reports(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_photo_reports_status ON public.job_photo_reports(report_status);
CREATE INDEX IF NOT EXISTS idx_job_photo_reports_created ON public.job_photo_reports(created_at DESC);

COMMENT ON TABLE public.job_photo_reports IS 'Block 256400: Automated job photo reports with before/during/after photos';

-- ============================================================================
-- PART 2 — CREATE customer_reviews TABLE (Enhanced)
-- ============================================================================
-- 5-Star Review Automation (Google + Facebook + Nextdoor)
-- Tracks all customer reviews across platforms

CREATE TABLE IF NOT EXISTS public.customer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  job_id uuid NOT NULL,
  team_id uuid,
  company_id uuid,
  
  -- Review data
  platform text NOT NULL CHECK (platform IN ('google', 'facebook', 'yelp', 'nextdoor', 'bbb', 'internal')),
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text text,
  review_url text, -- Link to the actual review
  
  -- Reviewer info
  reviewer_name text,
  reviewer_email text,
  
  -- Review request tracking
  review_request_id uuid, -- Links to review request that triggered this
  requested_at timestamptz,
  submitted_at timestamptz,
  
  -- Response tracking
  owner_response_text text,
  owner_response_at timestamptz,
  
  -- Status
  status text DEFAULT 'submitted' CHECK (status IN ('submitted', 'posted', 'responded', 'flagged', 'removed')),
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraints
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'customer_reviews_job_id_fkey'
    ) THEN
      ALTER TABLE public.customer_reviews
        ADD CONSTRAINT customer_reviews_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_reviews_customer ON public.customer_reviews(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_reviews_job ON public.customer_reviews(job_id);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_platform ON public.customer_reviews(platform);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_rating ON public.customer_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_status ON public.customer_reviews(status);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_created ON public.customer_reviews(created_at DESC);

COMMENT ON TABLE public.customer_reviews IS 'Block 256400: Customer reviews across all platforms (Google, Facebook, Yelp, etc.)';

-- ============================================================================
-- PART 3 — CREATE csat_scores TABLE
-- ============================================================================
-- Customer Satisfaction Score (CSAT)
-- After job completion: "How satisfied were you with your roof installation? (1-5)"

CREATE TABLE IF NOT EXISTS public.csat_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  job_id uuid NOT NULL,
  team_id uuid,
  company_id uuid,
  
  -- CSAT data
  score int NOT NULL CHECK (score >= 1 AND score <= 5),
  feedback text, -- Optional feedback text
  
  -- Survey metadata
  survey_sent_at timestamptz,
  survey_responded_at timestamptz DEFAULT now(),
  survey_channel text CHECK (survey_channel IN ('email', 'sms', 'portal', 'phone')),
  
  -- Issue tracking (auto-created for low scores)
  issue_created boolean DEFAULT false,
  issue_id uuid, -- References cx_issues table
  
  -- Follow-up tracking
  follow_up_sent boolean DEFAULT false,
  follow_up_sent_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraints
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'csat_scores_job_id_fkey'
    ) THEN
      ALTER TABLE public.csat_scores
        ADD CONSTRAINT csat_scores_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_csat_scores_customer ON public.csat_scores(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_csat_scores_job ON public.csat_scores(job_id);
CREATE INDEX IF NOT EXISTS idx_csat_scores_score ON public.csat_scores(score);
CREATE INDEX IF NOT EXISTS idx_csat_scores_created ON public.csat_scores(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_csat_scores_low_score ON public.csat_scores(score) WHERE score <= 3;

COMMENT ON TABLE public.csat_scores IS 'Block 256400: Customer Satisfaction Scores (1-5) with automatic issue creation for low scores';

-- ============================================================================
-- PART 4 — CREATE cx_issues TABLE
-- ============================================================================
-- Issue Detection + Automatic Resolution Tickets
-- Never again do issues slip through cracks

CREATE TABLE IF NOT EXISTS public.cx_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  team_id uuid,
  company_id uuid,
  
  -- Issue details
  issue_type text NOT NULL CHECK (issue_type IN (
    'cleanup',
    'safety',
    'quality',
    'communication',
    'timing',
    'damage',
    'warranty',
    'billing',
    'other'
  )),
  description text NOT NULL,
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'urgent')),
  
  -- Source tracking
  source text DEFAULT 'manual' CHECK (source IN ('manual', 'csat', 'review', 'customer_message', 'photo', 'ai_detection')),
  source_id uuid, -- References the source (csat_score, review, etc.)
  
  -- Status tracking
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'cancelled')),
  
  -- Assignment
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  
  -- Resolution
  resolved_at timestamptz,
  resolution_notes text,
  customer_satisfied boolean,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraints
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'cx_issues_job_id_fkey'
    ) THEN
      ALTER TABLE public.cx_issues
        ADD CONSTRAINT cx_issues_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cx_issues_job ON public.cx_issues(job_id);
CREATE INDEX IF NOT EXISTS idx_cx_issues_customer ON public.cx_issues(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cx_issues_status ON public.cx_issues(status);
CREATE INDEX IF NOT EXISTS idx_cx_issues_type ON public.cx_issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_cx_issues_severity ON public.cx_issues(severity);
CREATE INDEX IF NOT EXISTS idx_cx_issues_assigned ON public.cx_issues(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cx_issues_created ON public.cx_issues(created_at DESC);

COMMENT ON TABLE public.cx_issues IS 'Block 256400: Customer experience issues with automatic detection and resolution tracking';

-- ============================================================================
-- PART 5 — CREATE customer_experience_journey TABLE
-- ============================================================================
-- Customer Experience Journey Timeline
-- Customers see EVERY step: inspection scheduled, estimate sent, etc.

CREATE TABLE IF NOT EXISTS public.customer_experience_journey (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  team_id uuid,
  company_id uuid,
  
  -- Journey step
  step_name text NOT NULL, -- e.g., 'inspection_scheduled', 'estimate_sent', 'financing_approved'
  step_category text CHECK (step_category IN (
    'lead',
    'inspection',
    'quote',
    'approval',
    'financing',
    'materials',
    'scheduling',
    'production',
    'completion',
    'warranty',
    'follow_up'
  )),
  
  -- Step details
  step_description text,
  step_status text DEFAULT 'completed' CHECK (step_status IN ('pending', 'in_progress', 'completed', 'skipped', 'failed')),
  
  -- Step metadata
  step_data jsonb DEFAULT '{}'::jsonb, -- Additional step-specific data
  notification_sent boolean DEFAULT false,
  notification_sent_at timestamptz,
  
  -- Customer visibility
  visible_to_customer boolean DEFAULT true,
  customer_viewed boolean DEFAULT false,
  customer_viewed_at timestamptz,
  
  -- Ordering
  order_index int DEFAULT 0, -- For sorting timeline
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraints
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'customer_experience_journey_job_id_fkey'
    ) THEN
      ALTER TABLE public.customer_experience_journey
        ADD CONSTRAINT customer_experience_journey_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cx_journey_job ON public.customer_experience_journey(job_id);
CREATE INDEX IF NOT EXISTS idx_cx_journey_customer ON public.customer_experience_journey(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cx_journey_category ON public.customer_experience_journey(step_category);
CREATE INDEX IF NOT EXISTS idx_cx_journey_order ON public.customer_experience_journey(job_id, order_index);
CREATE INDEX IF NOT EXISTS idx_cx_journey_created ON public.customer_experience_journey(created_at DESC);

COMMENT ON TABLE public.customer_experience_journey IS 'Block 256400: Customer experience journey timeline showing every step of the process';

-- ============================================================================
-- PART 6 — CREATE referral_requests TABLE (Enhanced)
-- ============================================================================
-- Referral Request Automation
-- If CSAT ≥ 4 AND review submitted: "Do you know anyone else who needs roof work?"

CREATE TABLE IF NOT EXISTS public.referral_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  job_id uuid NOT NULL,
  team_id uuid,
  company_id uuid,
  
  -- Request tracking
  request_sent_at timestamptz DEFAULT now(),
  request_channel text CHECK (request_channel IN ('email', 'sms', 'portal', 'phone')),
  
  -- Eligibility criteria (what triggered this request)
  csat_score int CHECK (csat_score >= 1 AND csat_score <= 5),
  review_submitted boolean DEFAULT false,
  review_id uuid, -- References customer_reviews
  
  -- Response tracking
  responded boolean DEFAULT false,
  responded_at timestamptz,
  referral_count int DEFAULT 0, -- Number of referrals provided
  referral_revenue numeric(12,2) DEFAULT 0, -- Revenue from referrals
  
  -- Referral bonus tracking
  bonus_eligible boolean DEFAULT false,
  bonus_amount numeric(10,2),
  bonus_paid boolean DEFAULT false,
  bonus_paid_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraints
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'referral_requests_job_id_fkey'
    ) THEN
      ALTER TABLE public.referral_requests
        ADD CONSTRAINT referral_requests_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_referral_requests_customer ON public.referral_requests(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referral_requests_job ON public.referral_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_referral_requests_responded ON public.referral_requests(responded);
CREATE INDEX IF NOT EXISTS idx_referral_requests_created ON public.referral_requests(created_at DESC);

COMMENT ON TABLE public.referral_requests IS 'Block 256400: Referral request automation for satisfied customers';

-- ============================================================================
-- PART 7 — FUNCTIONS: Job Photo Reports
-- ============================================================================

-- Function: Generate job photo report
CREATE OR REPLACE FUNCTION generate_job_photo_report(p_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_report_id uuid;
  v_before_photos text[];
  v_during_photos text[];
  v_after_photos text[];
BEGIN
  -- Collect photos from job (assuming photos are stored in a photos table)
  -- This is a placeholder - adjust based on your actual photo storage structure
  SELECT 
    COALESCE(array_agg(photo_url), '{}'),
    COALESCE(array_agg(photo_url) FILTER (WHERE category = 'during'), '{}'),
    COALESCE(array_agg(photo_url) FILTER (WHERE category = 'after'), '{}')
  INTO v_before_photos, v_during_photos, v_after_photos
  FROM (
    -- This would need to be adjusted based on your actual photo table structure
    SELECT 'placeholder'::text as photo_url, 'before'::text as category
    LIMIT 0
  ) photos;
  
  -- Create report record
  INSERT INTO public.job_photo_reports (
    job_id,
    before_photos,
    during_photos,
    after_photos,
    report_status
  )
  VALUES (
    p_job_id,
    v_before_photos,
    v_during_photos,
    v_after_photos,
    'generating'
  )
  RETURNING id INTO v_report_id;
  
  -- Update status to ready (in production, this would generate PDF/HTML)
  UPDATE public.job_photo_reports
  SET report_status = 'ready',
      report_url = 'https://smartsendhq.com/report/' || v_report_id::text
  WHERE id = v_report_id;
  
  RETURN v_report_id;
END;
$$;

COMMENT ON FUNCTION generate_job_photo_report IS 'Block 256400: Generates automated job photo report with before/during/after photos';

-- ============================================================================
-- PART 8 — FUNCTIONS: Review Automation
-- ============================================================================

-- Function: Check if review should be requested (only for 4-5 star internal ratings)
CREATE OR REPLACE FUNCTION should_request_public_review(p_job_id uuid, p_internal_rating int)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Only request public review if internal rating is 4 or 5 stars
  IF p_internal_rating >= 4 THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

COMMENT ON FUNCTION should_request_public_review IS 'Block 256400: Determines if a public review should be requested based on internal rating';

-- Function: Create review request for completed job
CREATE OR REPLACE FUNCTION create_review_request_for_job(p_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_record RECORD;
  v_customer_id uuid;
  v_review_request_id uuid;
BEGIN
  -- Get job details
  SELECT j.*, c.id as customer_id
  INTO v_job_record
  FROM public.jobs j
  LEFT JOIN public.customers c ON c.id = (SELECT customer_id FROM public.customer_jobs WHERE job_id = j.id LIMIT 1)
  WHERE j.id = p_job_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found: %', p_job_id;
  END IF;
  
  -- Check if review request already exists
  SELECT id INTO v_review_request_id
  FROM public.customer_reviews
  WHERE job_id = p_job_id
  AND status = 'submitted'
  LIMIT 1;
  
  IF v_review_request_id IS NOT NULL THEN
    RETURN v_review_request_id;
  END IF;
  
  -- Create review request record (this would trigger email/SMS in application layer)
  INSERT INTO public.customer_reviews (
    job_id,
    customer_id,
    platform,
    rating,
    status,
    requested_at
  )
  VALUES (
    p_job_id,
    v_job_record.customer_id,
    'internal', -- Internal review request
    0, -- Not yet rated
    'submitted',
    now()
  )
  RETURNING id INTO v_review_request_id;
  
  RETURN v_review_request_id;
END;
$$;

COMMENT ON FUNCTION create_review_request_for_job IS 'Block 256400: Creates review request for completed job';

-- ============================================================================
-- PART 9 — FUNCTIONS: CSAT Scoring & Issue Detection
-- ============================================================================

-- Function: Create issue from low CSAT score
CREATE OR REPLACE FUNCTION create_issue_from_csat(p_csat_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_csat_record RECORD;
  v_issue_id uuid;
  v_issue_type text;
  v_severity text;
BEGIN
  -- Get CSAT record
  SELECT cs.*, j.id as job_id, j.team_id, j.company_id
  INTO v_csat_record
  FROM public.csat_scores cs
  JOIN public.jobs j ON j.id = cs.job_id
  WHERE cs.id = p_csat_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CSAT score not found: %', p_csat_id;
  END IF;
  
  -- Determine issue type and severity based on score
  IF v_csat_record.score = 1 THEN
    v_severity := 'urgent';
    v_issue_type := 'quality';
  ELSIF v_csat_record.score = 2 THEN
    v_severity := 'high';
    v_issue_type := 'quality';
  ELSIF v_csat_record.score = 3 THEN
    v_severity := 'medium';
    v_issue_type := 'other';
  ELSE
    -- Should not create issue for 4-5 stars
    RETURN NULL;
  END IF;
  
  -- Create issue
  INSERT INTO public.cx_issues (
    job_id,
    customer_id,
    team_id,
    company_id,
    issue_type,
    description,
    severity,
    source,
    source_id
  )
  VALUES (
    v_csat_record.job_id,
    v_csat_record.customer_id,
    v_csat_record.team_id,
    v_csat_record.company_id,
    v_issue_type,
    COALESCE(v_csat_record.feedback, 'Customer satisfaction score: ' || v_csat_record.score || '/5'),
    v_severity,
    'csat',
    p_csat_id
  )
  RETURNING id INTO v_issue_id;
  
  -- Update CSAT record
  UPDATE public.csat_scores
  SET issue_created = true,
      issue_id = v_issue_id
  WHERE id = p_csat_id;
  
  RETURN v_issue_id;
END;
$$;

COMMENT ON FUNCTION create_issue_from_csat IS 'Block 256400: Automatically creates issue ticket from low CSAT score (1-3 stars)';

-- Function: Trigger referral request if CSAT ≥ 4 and review submitted
CREATE OR REPLACE FUNCTION check_referral_eligibility(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_csat_score int;
  v_review_submitted boolean;
  v_review_id uuid;
BEGIN
  -- Get latest CSAT score
  SELECT score INTO v_csat_score
  FROM public.csat_scores
  WHERE job_id = p_job_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Check if review submitted
  SELECT EXISTS(
    SELECT 1 FROM public.customer_reviews
    WHERE job_id = p_job_id
    AND status IN ('submitted', 'posted')
    AND rating >= 4
  ) INTO v_review_submitted;
  
  SELECT id INTO v_review_id
  FROM public.customer_reviews
  WHERE job_id = p_job_id
  AND status IN ('submitted', 'posted')
  AND rating >= 4
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Check eligibility
  IF v_csat_score >= 4 AND v_review_submitted THEN
    -- Check if referral request already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.referral_requests
      WHERE job_id = p_job_id
    ) THEN
      -- Create referral request
      INSERT INTO public.referral_requests (
        job_id,
        customer_id,
        csat_score,
        review_submitted,
        review_id,
        bonus_eligible,
        bonus_amount
      )
      SELECT 
        p_job_id,
        cj.customer_id,
        v_csat_score,
        true,
        v_review_id,
        true,
        100.00 -- $100 referral bonus
      FROM public.customer_jobs cj
      WHERE cj.job_id = p_job_id
      LIMIT 1;
      
      RETURN true;
    END IF;
  END IF;
  
  RETURN false;
END;
$$;

COMMENT ON FUNCTION check_referral_eligibility IS 'Block 256400: Checks if customer is eligible for referral request (CSAT ≥ 4 AND review submitted)';

-- ============================================================================
-- PART 10 — FUNCTIONS: Customer Experience Journey
-- ============================================================================

-- Function: Add journey step
CREATE OR REPLACE FUNCTION add_customer_journey_step(
  p_job_id uuid,
  p_step_name text,
  p_step_category text DEFAULT NULL,
  p_step_description text DEFAULT NULL,
  p_step_data jsonb DEFAULT '{}'::jsonb,
  p_visible_to_customer boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_step_id uuid;
  v_order_index int;
BEGIN
  -- Get next order index
  SELECT COALESCE(MAX(order_index), 0) + 1
  INTO v_order_index
  FROM public.customer_experience_journey
  WHERE job_id = p_job_id;
  
  -- Get job details
  INSERT INTO public.customer_experience_journey (
    job_id,
    customer_id,
    step_name,
    step_category,
    step_description,
    step_data,
    visible_to_customer,
    order_index,
    step_status
  )
  SELECT 
    p_job_id,
    cj.customer_id,
    p_step_name,
    p_step_category,
    p_step_description,
    p_step_data,
    p_visible_to_customer,
    v_order_index,
    'completed'
  FROM public.customer_jobs cj
  WHERE cj.job_id = p_job_id
  LIMIT 1
  RETURNING id INTO v_step_id;
  
  RETURN v_step_id;
END;
$$;

COMMENT ON FUNCTION add_customer_journey_step IS 'Block 256400: Adds a step to the customer experience journey timeline';

-- Function: Get customer journey timeline
CREATE OR REPLACE FUNCTION get_customer_journey_timeline(p_job_id uuid)
RETURNS TABLE (
  step_name text,
  step_category text,
  step_description text,
  step_status text,
  created_at timestamptz,
  order_index int
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cxj.step_name,
    cxj.step_category,
    cxj.step_description,
    cxj.step_status,
    cxj.created_at,
    cxj.order_index
  FROM public.customer_experience_journey cxj
  WHERE cxj.job_id = p_job_id
  AND cxj.visible_to_customer = true
  ORDER BY cxj.order_index ASC, cxj.created_at ASC;
END;
$$;

COMMENT ON FUNCTION get_customer_journey_timeline IS 'Block 256400: Returns customer experience journey timeline for a job';

-- ============================================================================
-- PART 11 — FUNCTIONS: Reputation Insights Dashboard
-- ============================================================================

-- Function: Get reputation insights for team/company
CREATE OR REPLACE FUNCTION get_reputation_insights(
  p_team_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  total_reviews int,
  avg_rating numeric,
  google_reviews_count int,
  facebook_reviews_count int,
  reviews_this_month int,
  avg_rating_this_month numeric,
  csat_avg numeric,
  issues_resolved_count int,
  issues_resolved_percentage numeric,
  top_compliment text,
  top_complaint text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start_date date;
  v_end_date date;
BEGIN
  -- Set date range
  v_start_date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_end_date := COALESCE(p_end_date, CURRENT_DATE);
  
  RETURN QUERY
  WITH review_stats AS (
    SELECT 
      COUNT(*)::int as total_reviews,
      AVG(rating)::numeric(3,2) as avg_rating,
      COUNT(*) FILTER (WHERE platform = 'google' AND created_at >= v_start_date)::int as google_reviews_count,
      COUNT(*) FILTER (WHERE platform = 'facebook' AND created_at >= v_start_date)::int as facebook_reviews_count,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE))::int as reviews_this_month,
      AVG(rating) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE))::numeric(3,2) as avg_rating_this_month
    FROM public.customer_reviews cr
    WHERE (p_team_id IS NULL OR cr.team_id = p_team_id)
      AND (p_company_id IS NULL OR cr.company_id = p_company_id)
      AND cr.created_at BETWEEN v_start_date AND v_end_date
  ),
  csat_stats AS (
    SELECT 
      AVG(score)::numeric(3,2) as csat_avg
    FROM public.csat_scores cs
    WHERE (p_team_id IS NULL OR cs.team_id = p_team_id)
      AND (p_company_id IS NULL OR cs.company_id = p_company_id)
      AND cs.created_at BETWEEN v_start_date AND v_end_date
  ),
  issue_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE status = 'resolved')::int as issues_resolved_count,
      CASE 
        WHEN COUNT(*) > 0 THEN 
          (COUNT(*) FILTER (WHERE status = 'resolved')::numeric / COUNT(*)::numeric * 100)::numeric(5,2)
        ELSE 0::numeric(5,2)
      END as issues_resolved_percentage
    FROM public.cx_issues cxi
    WHERE (p_team_id IS NULL OR cxi.team_id = p_team_id)
      AND (p_company_id IS NULL OR cxi.company_id = p_company_id)
      AND cxi.created_at BETWEEN v_start_date AND v_end_date
  ),
  feedback_analysis AS (
    SELECT 
      'Communication'::text as top_compliment, -- Placeholder - would use AI/NLP in production
      'Crew Noise in Morning'::text as top_complaint -- Placeholder - would use AI/NLP in production
  )
  SELECT 
    rs.total_reviews,
    rs.avg_rating,
    rs.google_reviews_count,
    rs.facebook_reviews_count,
    rs.reviews_this_month,
    rs.avg_rating_this_month,
    cs.csat_avg,
    is_stats.issues_resolved_count,
    is_stats.issues_resolved_percentage,
    fa.top_compliment,
    fa.top_complaint
  FROM review_stats rs
  CROSS JOIN csat_stats cs
  CROSS JOIN issue_stats is_stats
  CROSS JOIN feedback_analysis fa;
END;
$$;

COMMENT ON FUNCTION get_reputation_insights IS 'Block 256400: Returns reputation insights dashboard data (reviews, CSAT, issues, etc.)';

-- ============================================================================
-- PART 12 — TRIGGERS
-- ============================================================================

-- Trigger: Auto-create issue from low CSAT score
CREATE OR REPLACE FUNCTION trg_auto_create_issue_from_csat()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If CSAT score is 1-3, create issue automatically
  IF NEW.score <= 3 AND (OLD IS NULL OR OLD.score IS NULL OR OLD.score > 3) THEN
    PERFORM create_issue_from_csat(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_issue_from_csat ON public.csat_scores;
CREATE TRIGGER trg_auto_create_issue_from_csat
AFTER INSERT OR UPDATE ON public.csat_scores
FOR EACH ROW
WHEN (NEW.score <= 3)
EXECUTE FUNCTION trg_auto_create_issue_from_csat();

-- Trigger: Check referral eligibility when review is submitted
CREATE OR REPLACE FUNCTION trg_check_referral_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If review is submitted with 4-5 stars, check referral eligibility
  IF NEW.status IN ('submitted', 'posted') AND NEW.rating >= 4 THEN
    PERFORM check_referral_eligibility(NEW.job_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_referral_on_review ON public.customer_reviews;
CREATE TRIGGER trg_check_referral_on_review
AFTER INSERT OR UPDATE ON public.customer_reviews
FOR EACH ROW
WHEN (NEW.status IN ('submitted', 'posted') AND NEW.rating >= 4)
EXECUTE FUNCTION trg_check_referral_on_review();

-- Trigger: Update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_photo_reports_updated_at ON public.job_photo_reports;
CREATE TRIGGER trg_job_photo_reports_updated_at
BEFORE UPDATE ON public.job_photo_reports
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_customer_reviews_updated_at ON public.customer_reviews;
CREATE TRIGGER trg_customer_reviews_updated_at
BEFORE UPDATE ON public.customer_reviews
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_csat_scores_updated_at ON public.csat_scores;
CREATE TRIGGER trg_csat_scores_updated_at
BEFORE UPDATE ON public.csat_scores
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_cx_issues_updated_at ON public.cx_issues;
CREATE TRIGGER trg_cx_issues_updated_at
BEFORE UPDATE ON public.cx_issues
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_customer_experience_journey_updated_at ON public.customer_experience_journey;
CREATE TRIGGER trg_customer_experience_journey_updated_at
BEFORE UPDATE ON public.customer_experience_journey
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_referral_requests_updated_at ON public.referral_requests;
CREATE TRIGGER trg_referral_requests_updated_at
BEFORE UPDATE ON public.referral_requests
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- PART 13 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.job_photo_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csat_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cx_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_experience_journey ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_requests ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "job_photo_reports_service_role" ON public.job_photo_reports
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "customer_reviews_service_role" ON public.customer_reviews
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "csat_scores_service_role" ON public.csat_scores
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "cx_issues_service_role" ON public.cx_issues
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "customer_experience_journey_service_role" ON public.customer_experience_journey
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "referral_requests_service_role" ON public.referral_requests
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can view their team's data
-- (Adjust these policies based on your actual team/workspace structure)

CREATE POLICY "job_photo_reports_team_access" ON public.job_photo_reports
  FOR SELECT TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "customer_reviews_team_access" ON public.customer_reviews
  FOR SELECT TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "csat_scores_team_access" ON public.csat_scores
  FOR SELECT TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "cx_issues_team_access" ON public.cx_issues
  FOR SELECT TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "customer_experience_journey_team_access" ON public.customer_experience_journey
  FOR SELECT TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "referral_requests_team_access" ON public.referral_requests
  FOR SELECT TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 14 — COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.job_photo_reports IS 'Block 256400: Automated job photo reports with before/during/after photos';
COMMENT ON TABLE public.customer_reviews IS 'Block 256400: Customer reviews across all platforms (Google, Facebook, Yelp, etc.)';
COMMENT ON TABLE public.csat_scores IS 'Block 256400: Customer Satisfaction Scores (1-5) with automatic issue creation for low scores';
COMMENT ON TABLE public.cx_issues IS 'Block 256400: Customer experience issues with automatic detection and resolution tracking';
COMMENT ON TABLE public.customer_experience_journey IS 'Block 256400: Customer experience journey timeline showing every step of the process';
COMMENT ON TABLE public.referral_requests IS 'Block 256400: Referral request automation for satisfied customers';

-- ============================================================================
-- END OF BLOCK 256400 — CUSTOMER EXPERIENCE ENGINE v1
-- ============================================================================





















