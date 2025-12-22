-- =========================================================
-- Block 254900 — SmartSend Marketing Engine v1
-- (Local SEO Booster • Review Management • Social Content AI • Jobsite Media Automation)
-- =========================================================
-- 
-- This block turns SmartSend into the marketing powerhouse that roofing companies 
-- ALWAYS wish they had — without needing an agency, a laptop, or any marketing experience.
--
-- Roofers today lose customers because:
-- ❌ They don't get enough Google reviews
-- ❌ They don't post on social media
-- ❌ They don't capture jobsite photos
-- ❌ SEO is terrible
-- ❌ Website updates never happen
-- ❌ No branded content
-- ❌ No before/after photos
-- ❌ No customer proof
-- ❌ Marketing is inconsistent
-- ❌ They rely only on referrals
--
-- SmartSend turns every job into a marketing machine.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE reviews TABLE
-- ============================================================================
-- Tracks all customer reviews across platforms

CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  -- Review data
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text text,
  platform text NOT NULL CHECK (platform IN ('google', 'facebook', 'yelp', 'bbb', 'internal')),
  
  -- Review metadata
  reviewer_name text,
  reviewer_email text,
  reviewer_phone text,
  
  -- Review link (for Google/Facebook/Yelp)
  review_url text,
  
  -- Internal review flag (before public posting)
  is_internal_review boolean DEFAULT false,
  should_post_publicly boolean DEFAULT true,
  
  -- Review request tracking
  review_request_id uuid, -- Links to review_request_automation table
  requested_at timestamptz,
  received_at timestamptz,
  
  -- Response tracking
  owner_response_text text,
  owner_response_at timestamptz,
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'responded', 'flagged')),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_job ON public.reviews(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_customer ON public.reviews(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_workspace ON public.reviews(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reviews_company ON public.reviews(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_platform ON public.reviews(platform);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON public.reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON public.reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_received_at ON public.reviews(received_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_reviews_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON public.reviews;
CREATE TRIGGER trg_reviews_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.set_reviews_updated_at();

-- ============================================================================
-- PART 2 — CREATE marketing_posts TABLE
-- ============================================================================
-- Tracks social media posts generated from job photos

CREATE TABLE IF NOT EXISTS public.marketing_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  -- Platform info
  platform text NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'linkedin', 'twitter')),
  
  -- Content
  caption text NOT NULL,
  hashtags text[],
  call_to_action text,
  
  -- Media
  media_urls text[] NOT NULL DEFAULT '{}',
  media_type text CHECK (media_type IN ('photo', 'video', 'carousel')) DEFAULT 'photo',
  
  -- Before/After gallery link
  before_after_gallery_id uuid REFERENCES public.before_after_galleries(id) ON DELETE SET NULL,
  
  -- Scheduling
  scheduled_at timestamptz,
  posted boolean DEFAULT false,
  posted_at timestamptz,
  post_url text, -- Link to published post
  
  -- AI generation metadata
  ai_generated boolean DEFAULT true,
  ai_model text,
  generation_prompt text,
  
  -- Performance tracking
  engagement_metrics jsonb DEFAULT '{}'::jsonb, -- likes, comments, shares, views
  
  -- Status
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'posted', 'failed', 'cancelled')),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_posts_job ON public.marketing_posts(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_posts_workspace ON public.marketing_posts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_marketing_posts_company ON public.marketing_posts(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_posts_platform ON public.marketing_posts(platform);
CREATE INDEX IF NOT EXISTS idx_marketing_posts_scheduled ON public.marketing_posts(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_posts_posted ON public.marketing_posts(posted) WHERE posted = false;
CREATE INDEX IF NOT EXISTS idx_marketing_posts_status ON public.marketing_posts(status);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_marketing_posts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_posts_updated_at ON public.marketing_posts;
CREATE TRIGGER trg_marketing_posts_updated_at
BEFORE UPDATE ON public.marketing_posts
FOR EACH ROW
EXECUTE FUNCTION public.set_marketing_posts_updated_at();

-- ============================================================================
-- PART 3 — CREATE seo_keywords TABLE
-- ============================================================================
-- Tracks SEO keyword rankings for local roofing searches

CREATE TABLE IF NOT EXISTS public.seo_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  -- Keyword data
  keyword text NOT NULL, -- e.g., "roofing contractor Boise"
  location text, -- e.g., "Boise, ID"
  
  -- Ranking data
  ranking integer, -- Current Google ranking (1-100, null if not ranking)
  previous_ranking integer, -- For tracking improvement
  ranking_change integer GENERATED ALWAYS AS (
    CASE 
      WHEN previous_ranking IS NOT NULL AND ranking IS NOT NULL 
      THEN previous_ranking - ranking
      ELSE NULL
    END
  ) STORED,
  
  -- Tracking
  last_checked timestamptz,
  check_frequency_days integer DEFAULT 7,
  
  -- Source tracking
  keyword_source text DEFAULT 'auto' CHECK (keyword_source IN ('auto', 'manual', 'competitor')),
  
  -- Job association (keywords auto-generated from completed jobs)
  associated_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Metadata
  search_volume integer, -- Estimated monthly search volume
  difficulty_score integer CHECK (difficulty_score >= 0 AND difficulty_score <= 100),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one keyword per company per location
  UNIQUE(roofing_company_id, keyword, location)
);

CREATE INDEX IF NOT EXISTS idx_seo_keywords_workspace ON public.seo_keywords(workspace_id);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_company ON public.seo_keywords(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seo_keywords_keyword ON public.seo_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_location ON public.seo_keywords(location) WHERE location IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seo_keywords_ranking ON public.seo_keywords(ranking) WHERE ranking IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seo_keywords_last_checked ON public.seo_keywords(last_checked) WHERE last_checked IS NOT NULL;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_seo_keywords_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seo_keywords_updated_at ON public.seo_keywords;
CREATE TRIGGER trg_seo_keywords_updated_at
BEFORE UPDATE ON public.seo_keywords
FOR EACH ROW
EXECUTE FUNCTION public.set_seo_keywords_updated_at();

-- ============================================================================
-- PART 4 — CREATE before_after_galleries TABLE
-- ============================================================================
-- Auto-generated before/after photo galleries for marketing

CREATE TABLE IF NOT EXISTS public.before_after_galleries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  -- Gallery metadata
  title text, -- e.g., "32 SQ Timberline HDZ — Boise, ID"
  description text,
  
  -- Before photos
  before_photo_ids uuid[] DEFAULT '{}', -- References to job_field_photos
  before_photo_urls text[] DEFAULT '{}',
  
  -- After photos
  after_photo_ids uuid[] DEFAULT '{}', -- References to job_field_photos
  after_photo_urls text[] DEFAULT '{}',
  
  -- Comparison image (AI-generated split)
  comparison_image_url text,
  
  -- Job details (denormalized for SEO)
  roof_material text, -- e.g., "Timberline HDZ"
  roof_color text, -- e.g., "Weathered Wood"
  roof_squares numeric(10,2),
  completion_date date,
  location text, -- e.g., "Boise, ID"
  
  -- Sharing
  public_url text, -- Public shareable link
  is_public boolean DEFAULT false,
  
  -- SEO keywords extracted from this gallery
  seo_keywords text[],
  
  -- Status
  status text DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'published', 'failed')),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one gallery per job
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_before_after_galleries_job ON public.before_after_galleries(job_id);
CREATE INDEX IF NOT EXISTS idx_before_after_galleries_workspace ON public.before_after_galleries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_before_after_galleries_company ON public.before_after_galleries(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_before_after_galleries_status ON public.before_after_galleries(status);
CREATE INDEX IF NOT EXISTS idx_before_after_galleries_public ON public.before_after_galleries(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_before_after_galleries_location ON public.before_after_galleries(location) WHERE location IS NOT NULL;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_before_after_galleries_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_before_after_galleries_updated_at ON public.before_after_galleries;
CREATE TRIGGER trg_before_after_galleries_updated_at
BEFORE UPDATE ON public.before_after_galleries
FOR EACH ROW
EXECUTE FUNCTION public.set_before_after_galleries_updated_at();

-- ============================================================================
-- PART 5 — CREATE customer_testimonials TABLE
-- ============================================================================
-- Video/audio testimonials from customers

CREATE TABLE IF NOT EXISTS public.customer_testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  -- Media
  media_type text NOT NULL CHECK (media_type IN ('video', 'audio')),
  original_media_url text NOT NULL, -- Raw upload from customer
  processed_media_url text, -- After AI processing (branded frame, subtitles)
  thumbnail_url text,
  
  -- Transcript
  transcript text,
  transcript_confidence numeric(3,2) CHECK (transcript_confidence >= 0 AND transcript_confidence <= 1),
  
  -- Branding
  has_branded_frame boolean DEFAULT false,
  has_subtitles boolean DEFAULT false,
  has_company_logo boolean DEFAULT false,
  has_contact_info boolean DEFAULT false,
  
  -- Testimonial details
  customer_name text,
  customer_location text,
  job_type text, -- e.g., "Roof Replacement"
  testimonial_text text, -- Extracted or transcribed
  
  -- Request tracking
  requested_at timestamptz,
  uploaded_at timestamptz,
  processed_at timestamptz,
  
  -- Approval
  is_approved boolean DEFAULT false,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  
  -- Sharing
  is_public boolean DEFAULT false,
  public_url text,
  
  -- Usage tracking
  times_used_in_marketing integer DEFAULT 0,
  last_used_at timestamptz,
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'processing', 'ready', 'approved', 'rejected')),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_testimonials_job ON public.customer_testimonials(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_testimonials_customer ON public.customer_testimonials(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_testimonials_workspace ON public.customer_testimonials(workspace_id);
CREATE INDEX IF NOT EXISTS idx_customer_testimonials_company ON public.customer_testimonials(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_testimonials_status ON public.customer_testimonials(status);
CREATE INDEX IF NOT EXISTS idx_customer_testimonials_approved ON public.customer_testimonials(is_approved) WHERE is_approved = true;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_customer_testimonials_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_testimonials_updated_at ON public.customer_testimonials;
CREATE TRIGGER trg_customer_testimonials_updated_at
BEFORE UPDATE ON public.customer_testimonials
FOR EACH ROW
EXECUTE FUNCTION public.set_customer_testimonials_updated_at();

-- ============================================================================
-- PART 6 — CREATE review_request_automation TABLE
-- ============================================================================
-- Tracks automated review request campaigns

CREATE TABLE IF NOT EXISTS public.review_request_automation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  -- Request tracking
  initial_request_sent_at timestamptz,
  reminder_1_sent_at timestamptz, -- Day 3
  reminder_2_sent_at timestamptz, -- Day 7
  
  -- Review received
  review_received boolean DEFAULT false,
  review_id uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
  
  -- Review quality check
  internal_rating integer CHECK (internal_rating >= 1 AND internal_rating <= 5),
  
  -- Decision logic
  should_send_google_link boolean, -- Only if 5 stars internally
  google_review_link_sent_at timestamptz,
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'request_sent', 'reminder_1_sent', 'reminder_2_sent', 'review_received', 'completed', 'cancelled')),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one automation per job
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_review_request_automation_job ON public.review_request_automation(job_id);
CREATE INDEX IF NOT EXISTS idx_review_request_automation_workspace ON public.review_request_automation(workspace_id);
CREATE INDEX IF NOT EXISTS idx_review_request_automation_status ON public.review_request_automation(status);
CREATE INDEX IF NOT EXISTS idx_review_request_automation_pending ON public.review_request_automation(workspace_id, status) WHERE status IN ('pending', 'request_sent', 'reminder_1_sent', 'reminder_2_sent');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_review_request_automation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_request_automation_updated_at ON public.review_request_automation;
CREATE TRIGGER trg_review_request_automation_updated_at
BEFORE UPDATE ON public.review_request_automation
FOR EACH ROW
EXECUTE FUNCTION public.set_review_request_automation_updated_at();

-- ============================================================================
-- PART 7 — CREATE google_business_profile_sync TABLE
-- ============================================================================
-- Tracks sync status with Google Business Profile

CREATE TABLE IF NOT EXISTS public.google_business_profile_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Google Business Profile connection
  google_business_profile_id text, -- Google's location ID
  profile_name text,
  profile_address text,
  
  -- Connection status
  is_connected boolean DEFAULT false,
  connected_at timestamptz,
  last_sync_at timestamptz,
  sync_frequency_hours integer DEFAULT 24,
  
  -- Sync data
  hours_synced boolean DEFAULT false,
  service_areas_synced boolean DEFAULT false,
  photos_synced boolean DEFAULT false,
  posts_synced boolean DEFAULT false,
  updates_synced boolean DEFAULT false,
  reviews_synced boolean DEFAULT false,
  qa_responses_synced boolean DEFAULT false,
  
  -- OAuth credentials (encrypted in metadata)
  oauth_credentials jsonb DEFAULT '{}'::jsonb, -- Store encrypted OAuth tokens
  
  -- Last sync results
  last_sync_status text CHECK (last_sync_status IN ('success', 'partial', 'failed')),
  last_sync_error text,
  last_sync_summary jsonb DEFAULT '{}'::jsonb,
  
  -- Status
  status text DEFAULT 'not_connected' CHECK (status IN ('not_connected', 'connected', 'syncing', 'error', 'paused')),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one sync config per company
  UNIQUE(roofing_company_id)
);

CREATE INDEX IF NOT EXISTS idx_google_business_profile_sync_workspace ON public.google_business_profile_sync(workspace_id);
CREATE INDEX IF NOT EXISTS idx_google_business_profile_sync_company ON public.google_business_profile_sync(roofing_company_id);
CREATE INDEX IF NOT EXISTS idx_google_business_profile_sync_connected ON public.google_business_profile_sync(is_connected) WHERE is_connected = true;
CREATE INDEX IF NOT EXISTS idx_google_business_profile_sync_last_sync ON public.google_business_profile_sync(last_sync_at) WHERE last_sync_at IS NOT NULL;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_google_business_profile_sync_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_google_business_profile_sync_updated_at ON public.google_business_profile_sync;
CREATE TRIGGER trg_google_business_profile_sync_updated_at
BEFORE UPDATE ON public.google_business_profile_sync
FOR EACH ROW
EXECUTE FUNCTION public.set_google_business_profile_sync_updated_at();

-- ============================================================================
-- PART 8 — CREATE jobsite_media_requirements TABLE
-- ============================================================================
-- Enforces media capture requirements for jobsites

CREATE TABLE IF NOT EXISTS public.jobsite_media_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Required photo categories
  requires_before_photos boolean DEFAULT true,
  requires_during_photos boolean DEFAULT true,
  requires_after_photos boolean DEFAULT true,
  requires_detail_photos boolean DEFAULT true,
  requires_proof_photos boolean DEFAULT true,
  
  -- Photo counts required
  before_photos_min_count integer DEFAULT 3,
  during_photos_min_count integer DEFAULT 5,
  after_photos_min_count integer DEFAULT 5,
  detail_photos_min_count integer DEFAULT 2,
  proof_photos_min_count integer DEFAULT 2,
  
  -- Current counts (denormalized for quick checks)
  before_photos_count integer DEFAULT 0,
  during_photos_count integer DEFAULT 0,
  after_photos_count integer DEFAULT 0,
  detail_photos_count integer DEFAULT 0,
  proof_photos_count integer DEFAULT 0,
  
  -- Job unlock status (crew app can't unlock job until requirements met)
  job_unlocked boolean DEFAULT false,
  unlocked_at timestamptz,
  unlocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Status
  status text DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'complete', 'override')),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one requirement set per job
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_jobsite_media_requirements_job ON public.jobsite_media_requirements(job_id);
CREATE INDEX IF NOT EXISTS idx_jobsite_media_requirements_workspace ON public.jobsite_media_requirements(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jobsite_media_requirements_status ON public.jobsite_media_requirements(status);
CREATE INDEX IF NOT EXISTS idx_jobsite_media_requirements_unlocked ON public.jobsite_media_requirements(job_unlocked) WHERE job_unlocked = false;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_jobsite_media_requirements_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobsite_media_requirements_updated_at ON public.jobsite_media_requirements;
CREATE TRIGGER trg_jobsite_media_requirements_updated_at
BEFORE UPDATE ON public.jobsite_media_requirements
FOR EACH ROW
EXECUTE FUNCTION public.set_jobsite_media_requirements_updated_at();

-- ============================================================================
-- PART 9 — ENABLE ROW LEVEL SECURITY
-- ============================================================================

-- Reviews RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews: workspace members can view"
  ON public.reviews FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Reviews: workspace members can insert"
  ON public.reviews FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Reviews: workspace members can update"
  ON public.reviews FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Marketing Posts RLS
ALTER TABLE public.marketing_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marketing posts: workspace members can view"
  ON public.marketing_posts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Marketing posts: workspace members can manage"
  ON public.marketing_posts FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- SEO Keywords RLS
ALTER TABLE public.seo_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SEO keywords: workspace members can view"
  ON public.seo_keywords FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "SEO keywords: workspace members can manage"
  ON public.seo_keywords FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Before/After Galleries RLS
ALTER TABLE public.before_after_galleries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Before/after galleries: workspace members can view"
  ON public.before_after_galleries FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
    OR is_public = true -- Public galleries are viewable by anyone
  );

CREATE POLICY "Before/after galleries: workspace members can manage"
  ON public.before_after_galleries FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Customer Testimonials RLS
ALTER TABLE public.customer_testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customer testimonials: workspace members can view"
  ON public.customer_testimonials FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
    OR is_public = true -- Public testimonials are viewable by anyone
  );

CREATE POLICY "Customer testimonials: workspace members can manage"
  ON public.customer_testimonials FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Review Request Automation RLS
ALTER TABLE public.review_request_automation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Review request automation: workspace members can view"
  ON public.review_request_automation FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Review request automation: workspace members can manage"
  ON public.review_request_automation FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Google Business Profile Sync RLS
ALTER TABLE public.google_business_profile_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Google Business Profile sync: workspace members can view"
  ON public.google_business_profile_sync FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Google Business Profile sync: workspace members can manage"
  ON public.google_business_profile_sync FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Jobsite Media Requirements RLS
ALTER TABLE public.jobsite_media_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Jobsite media requirements: workspace members can view"
  ON public.jobsite_media_requirements FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Jobsite media requirements: workspace members can manage"
  ON public.jobsite_media_requirements FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 10 — FUNCTIONS FOR AUTOMATION
-- ============================================================================

-- Function: Auto-generate SEO keywords from completed job
CREATE OR REPLACE FUNCTION public.generate_seo_keywords_from_job(job_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job public.roofing_jobs%ROWTYPE;
  v_company_id uuid;
  v_workspace_id uuid;
  v_location text;
  v_keyword text;
  v_keywords text[];
BEGIN
  -- Get job details
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = job_uuid;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  v_company_id := v_job.roofing_company_id;
  v_workspace_id := v_job.workspace_id;
  
  -- Build location string
  v_location := COALESCE(v_job.city || ', ' || v_job.state, v_job.state, '');
  
  IF v_location = '' THEN
    RETURN;
  END IF;
  
  -- Generate keywords based on job data
  v_keywords := ARRAY[
    'roofing contractor ' || v_location,
    'roof replacement ' || v_location,
    'roof repair ' || v_location,
    v_job.roof_material || ' ' || v_location,
    'roofing company ' || v_location,
    'residential roofing ' || v_location
  ];
  
  -- Insert/update keywords
  FOREACH v_keyword IN ARRAY v_keywords
  LOOP
    INSERT INTO public.seo_keywords (
      workspace_id,
      roofing_company_id,
      keyword,
      location,
      associated_job_id,
      keyword_source
    )
    VALUES (
      v_workspace_id,
      v_company_id,
      v_keyword,
      v_location,
      job_uuid,
      'auto'
    )
    ON CONFLICT (roofing_company_id, keyword, location) 
    DO UPDATE SET
      associated_job_id = EXCLUDED.associated_job_id,
      updated_at = now();
  END LOOP;
END;
$$;

-- Function: Update jobsite media requirements counts
CREATE OR REPLACE FUNCTION public.update_jobsite_media_counts(job_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_before_count integer;
  v_during_count integer;
  v_after_count integer;
  v_detail_count integer;
  v_proof_count integer;
BEGIN
  -- Count photos by tag
  SELECT COUNT(*) INTO v_before_count
  FROM public.job_field_photos
  WHERE job_id = job_uuid AND tag = 'before';
  
  SELECT COUNT(*) INTO v_during_count
  FROM public.job_field_photos
  WHERE job_id = job_uuid AND tag = 'during';
  
  SELECT COUNT(*) INTO v_after_count
  FROM public.job_field_photos
  WHERE job_id = job_uuid AND tag = 'after';
  
  -- Update counts
  UPDATE public.jobsite_media_requirements
  SET
    before_photos_count = v_before_count,
    during_photos_count = v_during_count,
    after_photos_count = v_after_count,
    status = CASE
      WHEN 
        (before_photos_count >= before_photos_min_count OR NOT requires_before_photos) AND
        (during_photos_count >= during_photos_min_count OR NOT requires_during_photos) AND
        (after_photos_count >= after_photos_min_count OR NOT requires_after_photos)
      THEN 'complete'
      ELSE 'incomplete'
    END
  WHERE job_id = job_uuid;
  
  -- Auto-unlock job if requirements met
  UPDATE public.jobsite_media_requirements
  SET
    job_unlocked = true,
    unlocked_at = now()
  WHERE job_id = job_uuid
    AND status = 'complete'
    AND job_unlocked = false;
END;
$$;

-- Function: Trigger before/after gallery generation
CREATE OR REPLACE FUNCTION public.trigger_before_after_gallery_generation(job_uuid uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gallery_id uuid;
  v_job public.roofing_jobs%ROWTYPE;
BEGIN
  -- Get job details
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = job_uuid;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Create gallery record (actual generation happens in edge function)
  INSERT INTO public.before_after_galleries (
    job_id,
    workspace_id,
    roofing_company_id,
    title,
    location,
    roof_material,
    roof_squares,
    completion_date,
    status
  )
  VALUES (
    job_uuid,
    v_job.workspace_id,
    v_job.roofing_company_id,
    COALESCE(
      v_job.roof_squares::text || ' SQ ' || v_job.roof_material || ' — ' || v_job.city || ', ' || v_job.state,
      'Roofing Project — ' || COALESCE(v_job.city || ', ' || v_job.state, v_job.state)
    ),
    COALESCE(v_job.city || ', ' || v_job.state, v_job.state),
    v_job.roof_material,
    v_job.roof_squares,
    CURRENT_DATE,
    'generating'
  )
  ON CONFLICT (job_id) DO NOTHING
  RETURNING id INTO v_gallery_id;
  
  -- If already exists, get existing ID
  IF v_gallery_id IS NULL THEN
    SELECT id INTO v_gallery_id
    FROM public.before_after_galleries
    WHERE job_id = job_uuid;
  END IF;
  
  RETURN v_gallery_id;
END;
$$;

-- ============================================================================
-- PART 11 — TRIGGERS FOR AUTOMATION
-- ============================================================================

-- Trigger: Auto-create jobsite media requirements when job is created
CREATE OR REPLACE FUNCTION public.create_jobsite_media_requirements()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.jobsite_media_requirements (job_id, workspace_id)
  VALUES (NEW.id, NEW.workspace_id)
  ON CONFLICT (job_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_jobsite_media_requirements ON public.roofing_jobs;
CREATE TRIGGER trg_create_jobsite_media_requirements
AFTER INSERT ON public.roofing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.create_jobsite_media_requirements();

-- Trigger: Update media counts when photos are uploaded
CREATE OR REPLACE FUNCTION public.update_media_counts_on_photo_upload()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.update_jobsite_media_counts(NEW.job_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_media_counts_on_photo_upload ON public.job_field_photos;
CREATE TRIGGER trg_update_media_counts_on_photo_upload
AFTER INSERT OR UPDATE ON public.job_field_photos
FOR EACH ROW
EXECUTE FUNCTION public.update_media_counts_on_photo_upload();

-- Trigger: Generate SEO keywords when job is completed
CREATE OR REPLACE FUNCTION public.generate_seo_on_job_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if job status changed to completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Generate SEO keywords
    PERFORM public.generate_seo_keywords_from_job(NEW.id);
    
    -- Trigger before/after gallery generation
    PERFORM public.trigger_before_after_gallery_generation(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_seo_on_job_completion ON public.roofing_jobs;
CREATE TRIGGER trg_generate_seo_on_job_completion
AFTER UPDATE ON public.roofing_jobs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.generate_seo_on_job_completion();

COMMENT ON TABLE public.reviews IS 'Block 254900: Customer reviews across all platforms (Google, Facebook, Yelp, etc.)';
COMMENT ON TABLE public.marketing_posts IS 'Block 254900: AI-generated social media posts from job photos';
COMMENT ON TABLE public.seo_keywords IS 'Block 254900: Local SEO keyword tracking and ranking data';
COMMENT ON TABLE public.before_after_galleries IS 'Block 254900: Auto-generated before/after photo galleries for marketing';
COMMENT ON TABLE public.customer_testimonials IS 'Block 254900: Video/audio testimonials from customers';
COMMENT ON TABLE public.review_request_automation IS 'Block 254900: Automated review request campaigns';
COMMENT ON TABLE public.google_business_profile_sync IS 'Block 254900: Google Business Profile sync status and configuration';
COMMENT ON TABLE public.jobsite_media_requirements IS 'Block 254900: Enforces media capture requirements for jobsites';






















