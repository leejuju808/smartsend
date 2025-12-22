-- =========================================================
-- Block 56000 — SmartSend Roofing "Customer Review + Reputation Automation System" v1
-- (AUTO-REQUEST REVIEWS • NEGATIVE-FEEDBACK FILTER • GOOGLE REVIEW PUSH • TESTIMONIAL COLLECTION • REPUTATION DASHBOARD)
-- =========================================================
-- 
-- THE REPUTATION WEAPON THAT PRINTS REVENUE.
-- 
-- Roofing companies live or die by their:
-- - Google rating
-- - Review volume
-- - Recent reviews
-- - Homeowner trust
-- 
-- This block turns SmartSend into a reputation weapon that:
-- - Systematically captures positive reviews
-- - Blocks negative reviews from going public
-- - Sends customers to Google at the right moment
-- - Automates review flows
-- - Tracks reputation metrics
-- 
-- A roofing company with:
-- ⭐ 4.7–5.0 rating → wins jobs
-- ⭐ 4.3–4.5 rating → loses jobs
-- ⭐ under 4.2 → they're dead
-- 
-- This system protects reputation, boosts Google reviews, filters bad feedback,
-- creates testimonials for marketing, increases referrals, and increases close rates.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE review_requests TABLE
-- ============================================================================
-- Tracks all review requests sent to homeowners and their responses

CREATE TABLE IF NOT EXISTS public.review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  qc_inspection_id uuid REFERENCES public.qc_inspections(id) ON DELETE SET NULL,
  
  -- Request tracking
  sent_at timestamptz DEFAULT now(),
  sent_via text CHECK (sent_via IN ('email', 'sms', 'portal')) DEFAULT 'email',
  message_sent boolean DEFAULT false,
  
  -- Homeowner response
  response_rating int CHECK (response_rating >= 1 AND response_rating <= 5),
  feedback text,
  
  -- Review workflow stage
  review_stage text NOT NULL DEFAULT 'pending' CHECK (review_stage IN (
    'pending',           -- Request sent, waiting for response
    'internal_feedback', -- 1-3 stars, routed to private feedback
    'google_push',      -- 4-5 stars, sent Google review link
    'completed',        -- Review process complete
    'reminder_sent_24h', -- 24h reminder sent
    'reminder_sent_3d'   -- 3 day reminder sent
  )),
  
  -- Google review tracking
  google_review_url text,
  google_review_submitted boolean DEFAULT false,
  google_review_submitted_at timestamptz,
  
  -- Reminder tracking
  reminder_24h_sent_at timestamptz,
  reminder_3d_sent_at timestamptz,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign keys
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'review_requests_job_id_fkey'
    ) THEN
      ALTER TABLE public.review_requests
        ADD CONSTRAINT review_requests_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'review_requests_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.review_requests
        ADD CONSTRAINT review_requests_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_review_requests_job ON public.review_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_workspace ON public.review_requests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_homeowner ON public.review_requests(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_requests_stage ON public.review_requests(review_stage);
CREATE INDEX IF NOT EXISTS idx_review_requests_rating ON public.review_requests(response_rating) WHERE response_rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_requests_sent_at ON public.review_requests(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_requests_created ON public.review_requests(created_at DESC);

-- ============================================================================
-- PART 2 — CREATE testimonials TABLE
-- ============================================================================
-- Stores internal testimonials collected from 4-5 star reviews

CREATE TABLE IF NOT EXISTS public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  job_id uuid NOT NULL,
  review_request_id uuid REFERENCES public.review_requests(id) ON DELETE SET NULL,
  
  -- Testimonial content
  content text NOT NULL,
  rating int CHECK (rating >= 1 AND rating <= 5),
  homeowner_name text,
  
  -- Media
  photo_url text,
  video_url text,
  
  -- Approval workflow
  approved boolean DEFAULT false,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  
  -- Usage tracking
  featured_on_website boolean DEFAULT false,
  used_in_proposals boolean DEFAULT false,
  used_in_marketing boolean DEFAULT false,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign keys
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'testimonials_job_id_fkey'
    ) THEN
      ALTER TABLE public.testimonials
        ADD CONSTRAINT testimonials_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'testimonials_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.testimonials
        ADD CONSTRAINT testimonials_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_testimonials_workspace ON public.testimonials(workspace_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_job ON public.testimonials(job_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_homeowner ON public.testimonials(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_testimonials_approved ON public.testimonials(approved, workspace_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_rating ON public.testimonials(rating) WHERE rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_testimonials_created ON public.testimonials(created_at DESC);

-- ============================================================================
-- PART 3 — CREATE reputation_metrics TABLE
-- ============================================================================
-- Daily aggregated metrics for reputation dashboard and trend analysis

CREATE TABLE IF NOT EXISTS public.reputation_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  date date NOT NULL,
  
  -- Review counts
  total_reviews int DEFAULT 0,
  total_requests_sent int DEFAULT 0,
  total_responses int DEFAULT 0,
  
  -- Rating distribution
  rating_5_count int DEFAULT 0,
  rating_4_count int DEFAULT 0,
  rating_3_count int DEFAULT 0,
  rating_2_count int DEFAULT 0,
  rating_1_count int DEFAULT 0,
  
  -- Average rating
  avg_rating numeric(3,2),
  
  -- Google review tracking
  google_reviews_sent int DEFAULT 0,
  google_reviews_submitted int DEFAULT 0,
  
  -- Internal feedback tracking
  internal_feedback_count int DEFAULT 0,
  
  -- Testimonial tracking
  testimonials_collected int DEFAULT 0,
  testimonials_approved int DEFAULT 0,
  
  -- Satisfaction metrics
  satisfaction_rate numeric(5,2), -- % of 4-5 star reviews
  response_rate numeric(5,2), -- % of requests that got responses
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one metric per workspace per day
  UNIQUE(workspace_id, date)
);

-- Add foreign key
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'reputation_metrics_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.reputation_metrics
        ADD CONSTRAINT reputation_metrics_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reputation_metrics_workspace_date ON public.reputation_metrics(workspace_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_metrics_date ON public.reputation_metrics(date DESC);

-- ============================================================================
-- PART 4 — FUNCTIONS
-- ============================================================================

-- Function: Create review request when QC passes
CREATE OR REPLACE FUNCTION public.create_review_request_on_qc_pass()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_homeowner RECORD;
  v_job RECORD;
  v_review_request_id uuid;
BEGIN
  -- Only trigger when QC status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Get job and homeowner info
    SELECT j.*, h.id as homeowner_id, h.email as homeowner_email, h.name as homeowner_name
    INTO v_job
    FROM public.roofing_jobs j
    LEFT JOIN public.homeowners h ON h.job_id = j.id
    WHERE j.id = NEW.job_id
    LIMIT 1;
    
    -- Only create review request if homeowner exists
    IF v_job.homeowner_id IS NOT NULL THEN
      -- Check if review request already exists for this job
      SELECT id INTO v_review_request_id
      FROM public.review_requests
      WHERE job_id = NEW.job_id
      LIMIT 1;
      
      -- Create review request if it doesn't exist
      IF v_review_request_id IS NULL THEN
        INSERT INTO public.review_requests (
          job_id,
          workspace_id,
          homeowner_id,
          qc_inspection_id,
          review_stage,
          sent_at
        ) VALUES (
          NEW.job_id,
          NEW.workspace_id,
          v_job.homeowner_id,
          NEW.id,
          'pending',
          now()
        )
        RETURNING id INTO v_review_request_id;
        
        -- Note: Actual email/SMS sending will be handled by API/edge function
        -- This just creates the database record
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function: Update review request when rating is submitted
CREATE OR REPLACE FUNCTION public.handle_review_rating_submission(
  p_review_request_id uuid,
  p_rating int,
  p_feedback text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stage text;
BEGIN
  -- Validate rating
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;
  
  -- Determine next stage based on rating
  IF p_rating <= 3 THEN
    v_stage := 'internal_feedback';
  ELSE
    v_stage := 'google_push';
  END IF;
  
  -- Update review request
  UPDATE public.review_requests
  SET 
    response_rating = p_rating,
    feedback = p_feedback,
    review_stage = v_stage,
    updated_at = now()
  WHERE id = p_review_request_id;
  
  -- If 4-5 stars, create testimonial placeholder
  IF p_rating >= 4 AND p_feedback IS NOT NULL THEN
    INSERT INTO public.testimonials (
      workspace_id,
      homeowner_id,
      job_id,
      review_request_id,
      content,
      rating,
      approved
    )
    SELECT 
      rr.workspace_id,
      rr.homeowner_id,
      rr.job_id,
      rr.id,
      p_feedback,
      p_rating,
      false
    FROM public.review_requests rr
    WHERE rr.id = p_review_request_id;
  END IF;
END;
$$;

-- Function: Aggregate daily reputation metrics
CREATE OR REPLACE FUNCTION public.aggregate_reputation_metrics(
  p_workspace_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metrics RECORD;
  v_satisfaction_rate numeric(5,2);
  v_response_rate numeric(5,2);
BEGIN
  -- Calculate metrics for the date
  SELECT 
    COUNT(*) FILTER (WHERE rr.created_at::date = p_date) as total_requests_sent,
    COUNT(*) FILTER (WHERE rr.response_rating IS NOT NULL AND rr.created_at::date = p_date) as total_responses,
    COUNT(*) FILTER (WHERE rr.response_rating IS NOT NULL AND rr.created_at::date = p_date) as total_reviews,
    COUNT(*) FILTER (WHERE rr.response_rating = 5 AND rr.created_at::date = p_date) as rating_5_count,
    COUNT(*) FILTER (WHERE rr.response_rating = 4 AND rr.created_at::date = p_date) as rating_4_count,
    COUNT(*) FILTER (WHERE rr.response_rating = 3 AND rr.created_at::date = p_date) as rating_3_count,
    COUNT(*) FILTER (WHERE rr.response_rating = 2 AND rr.created_at::date = p_date) as rating_2_count,
    COUNT(*) FILTER (WHERE rr.response_rating = 1 AND rr.created_at::date = p_date) as rating_1_count,
    AVG(rr.response_rating) FILTER (WHERE rr.response_rating IS NOT NULL AND rr.created_at::date = p_date) as avg_rating,
    COUNT(*) FILTER (WHERE rr.review_stage = 'google_push' AND rr.created_at::date = p_date) as google_reviews_sent,
    COUNT(*) FILTER (WHERE rr.google_review_submitted = true AND rr.google_review_submitted_at::date = p_date) as google_reviews_submitted,
    COUNT(*) FILTER (WHERE rr.review_stage = 'internal_feedback' AND rr.created_at::date = p_date) as internal_feedback_count,
    COUNT(*) FILTER (WHERE t.created_at::date = p_date) as testimonials_collected,
    COUNT(*) FILTER (WHERE t.approved = true AND t.created_at::date = p_date) as testimonials_approved
  INTO v_metrics
  FROM public.review_requests rr
  LEFT JOIN public.testimonials t ON t.review_request_id = rr.id
  WHERE rr.workspace_id = p_workspace_id
    AND (rr.created_at::date = p_date OR t.created_at::date = p_date);
  
  -- Calculate satisfaction rate (% of 4-5 star reviews)
  IF v_metrics.total_responses > 0 THEN
    v_satisfaction_rate := ((v_metrics.rating_4_count + v_metrics.rating_5_count)::numeric / v_metrics.total_responses::numeric) * 100;
  ELSE
    v_satisfaction_rate := 0;
  END IF;
  
  IF v_metrics.total_requests_sent > 0 THEN
    v_response_rate := (v_metrics.total_responses::numeric / v_metrics.total_requests_sent::numeric) * 100;
  ELSE
    v_response_rate := 0;
  END IF;
  
  -- Upsert metrics
  INSERT INTO public.reputation_metrics (
    workspace_id,
    date,
    total_reviews,
    total_requests_sent,
    total_responses,
    rating_5_count,
    rating_4_count,
    rating_3_count,
    rating_2_count,
    rating_1_count,
    avg_rating,
    google_reviews_sent,
    google_reviews_submitted,
    internal_feedback_count,
    testimonials_collected,
    testimonials_approved,
    satisfaction_rate,
    response_rate,
    updated_at
  ) VALUES (
    p_workspace_id,
    p_date,
    COALESCE(v_metrics.total_reviews, 0),
    COALESCE(v_metrics.total_requests_sent, 0),
    COALESCE(v_metrics.total_responses, 0),
    COALESCE(v_metrics.rating_5_count, 0),
    COALESCE(v_metrics.rating_4_count, 0),
    COALESCE(v_metrics.rating_3_count, 0),
    COALESCE(v_metrics.rating_2_count, 0),
    COALESCE(v_metrics.rating_1_count, 0),
    COALESCE(v_metrics.avg_rating, 0),
    COALESCE(v_metrics.google_reviews_sent, 0),
    COALESCE(v_metrics.google_reviews_submitted, 0),
    COALESCE(v_metrics.internal_feedback_count, 0),
    COALESCE(v_metrics.testimonials_collected, 0),
    COALESCE(v_metrics.testimonials_approved, 0),
    v_satisfaction_rate,
    v_response_rate,
    now()
  )
  ON CONFLICT (workspace_id, date)
  DO UPDATE SET
    total_reviews = EXCLUDED.total_reviews,
    total_requests_sent = EXCLUDED.total_requests_sent,
    total_responses = EXCLUDED.total_responses,
    rating_5_count = EXCLUDED.rating_5_count,
    rating_4_count = EXCLUDED.rating_4_count,
    rating_3_count = EXCLUDED.rating_3_count,
    rating_2_count = EXCLUDED.rating_2_count,
    rating_1_count = EXCLUDED.rating_1_count,
    avg_rating = EXCLUDED.avg_rating,
    google_reviews_sent = EXCLUDED.google_reviews_sent,
    google_reviews_submitted = EXCLUDED.google_reviews_submitted,
    internal_feedback_count = EXCLUDED.internal_feedback_count,
    testimonials_collected = EXCLUDED.testimonials_collected,
    testimonials_approved = EXCLUDED.testimonials_approved,
    satisfaction_rate = EXCLUDED.satisfaction_rate,
    response_rate = EXCLUDED.response_rate,
    updated_at = now();
END;
$$;

-- ============================================================================
-- PART 5 — TRIGGERS
-- ============================================================================

-- Trigger: Create review request when QC inspection passes
DROP TRIGGER IF EXISTS trg_create_review_request_on_qc_pass ON public.qc_inspections;
CREATE TRIGGER trg_create_review_request_on_qc_pass
AFTER UPDATE ON public.qc_inspections
FOR EACH ROW
WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
EXECUTE FUNCTION public.create_review_request_on_qc_pass();

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_review_updated_at()
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
EXECUTE FUNCTION public.set_review_updated_at();

DROP TRIGGER IF EXISTS trg_testimonials_updated_at ON public.testimonials;
CREATE TRIGGER trg_testimonials_updated_at
BEFORE UPDATE ON public.testimonials
FOR EACH ROW
EXECUTE FUNCTION public.set_review_updated_at();

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for review_requests
CREATE POLICY "review_requests_select_workspace"
  ON public.review_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = review_requests.workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "review_requests_insert_workspace"
  ON public.review_requests FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = review_requests.workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "review_requests_update_workspace"
  ON public.review_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = review_requests.workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for testimonials
CREATE POLICY "testimonials_select_workspace"
  ON public.testimonials FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = testimonials.workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "testimonials_insert_workspace"
  ON public.testimonials FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = testimonials.workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "testimonials_update_workspace"
  ON public.testimonials FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = testimonials.workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for reputation_metrics
CREATE POLICY "reputation_metrics_select_workspace"
  ON public.reputation_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = reputation_metrics.workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
          AND wm.user_id = auth.uid()
        )
      )
    )
  );

-- Allow service role full access
CREATE POLICY "review_requests_service_role_all" ON public.review_requests
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "testimonials_service_role_all" ON public.testimonials
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "reputation_metrics_service_role_all" ON public.reputation_metrics
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

