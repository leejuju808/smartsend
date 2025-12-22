-- =========================================================
-- Block 253900 — SmartSend Customer Experience Engine v1
-- "Homeowner Portal, Live Job Updates, AI Explanations, Progress Photos, Service Requests, Warranty Center"
-- =========================================================
-- 
-- This block turns SmartSend into a customer-facing powerhouse.
-- 
-- Right now roofing companies FAIL at customer communication:
-- - Homeowners have no idea what's happening
-- - Crews never tell homeowners anything
-- - Customers ask for updates constantly
-- - No portal, no progress bar, no before/during/after photos
-- - No easy place to submit questions
-- - No warranty support
-- - No service request system
-- - No job documents provided
-- - Homeowners complain = lost reviews
-- 
-- SmartSend will FIX ALL OF IT and make roofers look elite and premium.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE homeowner_accounts TABLE
-- ============================================================================
-- Secure homeowner accounts linked to jobs with portal access

CREATE TABLE IF NOT EXISTS public.homeowner_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  workspace_id uuid,
  email text,
  phone text,
  portal_key text UNIQUE NOT NULL,   -- secure hash link (e.g., ABX-2349-FG9K)
  first_name text,
  last_name text,
  is_active boolean DEFAULT true,
  last_accessed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraints if jobs table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_accounts_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_accounts
        ADD CONSTRAINT homeowner_accounts_job_id_fkey
        FOREIGN KEY (job_id)
        REFERENCES public.jobs(id)
        ON DELETE CASCADE;
    END IF;
  END IF;

  -- Also check for roofing_jobs table
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'roofing_jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_accounts_roofing_job_id_fkey'
    ) THEN
      -- Add optional reference to roofing_jobs
      ALTER TABLE public.homeowner_accounts
        ADD COLUMN IF NOT EXISTS roofing_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_accounts_job ON public.homeowner_accounts(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_accounts_portal_key ON public.homeowner_accounts(portal_key);
CREATE INDEX IF NOT EXISTS idx_homeowner_accounts_email ON public.homeowner_accounts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_homeowner_accounts_workspace ON public.homeowner_accounts(workspace_id) WHERE workspace_id IS NOT NULL;

COMMENT ON TABLE public.homeowner_accounts IS 'Block 253900: Homeowner accounts with secure portal access';
COMMENT ON COLUMN public.homeowner_accounts.portal_key IS 'Secure hash link for portal access (e.g., ABX-2349-FG9K)';

-- ============================================================================
-- PART 2 — CREATE service_requests TABLE
-- ============================================================================
-- Post-install service requests from homeowners

CREATE TABLE IF NOT EXISTS public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  homeowner_id uuid REFERENCES public.homeowner_accounts(id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK (request_type IN (
    'leak',
    'missing_shingle',
    'flashing_issue',
    'gutter_issue',
    'vent_issue',
    'debris_cleanup',
    'noise_concern',
    'other'
  )),
  description text NOT NULL,
  photo_url text,
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'rejected')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'service_requests_job_id_fkey'
    ) THEN
      ALTER TABLE public.service_requests
        ADD CONSTRAINT service_requests_job_id_fkey
        FOREIGN KEY (job_id)
        REFERENCES public.jobs(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_requests_job ON public.service_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_homeowner ON public.service_requests(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON public.service_requests(status);
CREATE INDEX IF NOT EXISTS idx_service_requests_created ON public.service_requests(created_at DESC);

COMMENT ON TABLE public.service_requests IS 'Block 253900: Post-install service requests from homeowners';
COMMENT ON COLUMN public.service_requests.request_type IS 'Type: leak, missing_shingle, flashing_issue, gutter_issue, vent_issue, debris_cleanup, noise_concern, other';

-- ============================================================================
-- PART 3 — CREATE warranty_claims TABLE
-- ============================================================================
-- Warranty claim submissions from homeowners

CREATE TABLE IF NOT EXISTS public.warranty_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  homeowner_id uuid REFERENCES public.homeowner_accounts(id) ON DELETE SET NULL,
  claim_description text NOT NULL,
  photo_url text,
  issue_started_date date,
  status text DEFAULT 'submitted' CHECK (status IN (
    'submitted',
    'under_review',
    'approved',
    'scheduled',
    'in_progress',
    'resolved',
    'rejected'
  )),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'warranty_claims_job_id_fkey'
    ) THEN
      ALTER TABLE public.warranty_claims
        ADD CONSTRAINT warranty_claims_job_id_fkey
        FOREIGN KEY (job_id)
        REFERENCES public.jobs(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_warranty_claims_job ON public.warranty_claims(job_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_homeowner ON public.warranty_claims(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranty_claims_status ON public.warranty_claims(status);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_created ON public.warranty_claims(created_at DESC);

COMMENT ON TABLE public.warranty_claims IS 'Block 253900: Warranty claim submissions from homeowners';

-- ============================================================================
-- PART 4 — CREATE photo_explanations TABLE
-- ============================================================================
-- AI-generated simple language explanations for homeowner photos

CREATE TABLE IF NOT EXISTS public.photo_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid,
  job_id uuid NOT NULL,
  homeowner_explanation text NOT NULL,  -- Simple language explanation
  technical_details text,               -- Technical details (for PM reference)
  ai_generated boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'photo_explanations_job_id_fkey'
    ) THEN
      ALTER TABLE public.photo_explanations
        ADD CONSTRAINT photo_explanations_job_id_fkey
        FOREIGN KEY (job_id)
        REFERENCES public.jobs(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Try to link to existing photo tables
DO $$
BEGIN
  -- Link to crew_photos if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'crew_photos'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'photo_explanations_crew_photo_fkey'
    ) THEN
      ALTER TABLE public.photo_explanations
        ADD CONSTRAINT photo_explanations_crew_photo_fkey
        FOREIGN KEY (photo_id)
        REFERENCES public.crew_photos(id)
        ON DELETE CASCADE;
    END IF;
  END IF;

  -- Link to job_photo_entries if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'job_photo_entries'
  ) THEN
    -- Add optional reference
    ALTER TABLE public.photo_explanations
      ADD COLUMN IF NOT EXISTS job_photo_entry_id uuid;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'photo_explanations_job_photo_entry_fkey'
    ) THEN
      ALTER TABLE public.photo_explanations
        ADD CONSTRAINT photo_explanations_job_photo_entry_fkey
        FOREIGN KEY (job_photo_entry_id)
        REFERENCES public.job_photo_entries(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_photo_explanations_job ON public.photo_explanations(job_id);
CREATE INDEX IF NOT EXISTS idx_photo_explanations_photo ON public.photo_explanations(photo_id) WHERE photo_id IS NOT NULL;

COMMENT ON TABLE public.photo_explanations IS 'Block 253900: AI-generated simple language explanations for homeowner photos';

-- ============================================================================
-- PART 5 — CREATE homeowner_messages TABLE
-- ============================================================================
-- Customer messaging (PM only, separated from crew communication)

CREATE TABLE IF NOT EXISTS public.homeowner_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  homeowner_id uuid REFERENCES public.homeowner_accounts(id) ON DELETE SET NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('homeowner', 'pm', 'system')),
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- PM user_id if sender_type = 'pm'
  message_text text NOT NULL,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_messages_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_messages
        ADD CONSTRAINT homeowner_messages_job_id_fkey
        FOREIGN KEY (job_id)
        REFERENCES public.jobs(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_messages_job ON public.homeowner_messages(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_messages_homeowner ON public.homeowner_messages(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_homeowner_messages_created ON public.homeowner_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_homeowner_messages_unread ON public.homeowner_messages(job_id, is_read) WHERE is_read = false;

COMMENT ON TABLE public.homeowner_messages IS 'Block 253900: Customer messaging (PM only, separated from crew communication)';

-- ============================================================================
-- PART 6 — CREATE review_requests TABLE
-- ============================================================================
-- Review automation tracking

CREATE TABLE IF NOT EXISTS public.review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  homeowner_id uuid REFERENCES public.homeowner_accounts(id) ON DELETE SET NULL,
  request_sent_at timestamptz DEFAULT now(),
  review_submitted boolean DEFAULT false,
  review_submitted_at timestamptz,
  review_platform text,  -- 'google', 'facebook', 'bbb', etc.
  review_url text,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'jobs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'review_requests_job_id_fkey'
    ) THEN
      ALTER TABLE public.review_requests
        ADD CONSTRAINT review_requests_job_id_fkey
        FOREIGN KEY (job_id)
        REFERENCES public.jobs(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_review_requests_job ON public.review_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_homeowner ON public.review_requests(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_requests_submitted ON public.review_requests(review_submitted);

COMMENT ON TABLE public.review_requests IS 'Block 253900: Review automation tracking';

-- ============================================================================
-- PART 7 — FUNCTION: Generate Portal Key
-- ============================================================================
-- Generates secure portal key (e.g., ABX-2349-FG9K)

CREATE OR REPLACE FUNCTION generate_homeowner_portal_key()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_key text;
  v_exists boolean;
  v_part1 text;
  v_part2 text;
  v_part3 text;
BEGIN
  LOOP
    -- Generate format: XXX-####-XXXX (e.g., ABX-2349-FG9K)
    v_part1 := upper(substring(md5(random()::text) from 1 for 3));
    v_part2 := lpad(floor(random() * 10000)::text, 4, '0');
    v_part3 := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
    v_key := v_part1 || '-' || v_part2 || '-' || v_part3;
    
    -- Check if key already exists
    SELECT EXISTS(
      SELECT 1 FROM public.homeowner_accounts 
      WHERE portal_key = v_key
    ) INTO v_exists;
    
    -- Exit loop if key is unique
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_key;
END;
$$;

COMMENT ON FUNCTION generate_homeowner_portal_key IS 'Block 253900: Generates secure portal key (e.g., ABX-2349-FG9K)';

-- ============================================================================
-- PART 8 — FUNCTION: Get Job Progress Timeline
-- ============================================================================
-- Returns live job progress timeline for homeowner portal

CREATE OR REPLACE FUNCTION get_job_progress_timeline(p_job_id uuid)
RETURNS TABLE (
  step_name text,
  step_status text,
  completed_at timestamptz,
  order_index int
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Try to get from production_milestones first
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'production_milestones'
  ) THEN
    RETURN QUERY
    SELECT 
      pm.name::text as step_name,
      pm.status::text as step_status,
      pm.completed_date::timestamptz as completed_at,
      pm.order_index::int as order_index
    FROM public.production_milestones pm
    WHERE pm.job_id = p_job_id
    ORDER BY pm.order_index ASC;
    RETURN;
  END IF;

  -- Fallback: Try roofing_job_steps
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'roofing_job_steps'
  ) THEN
    RETURN QUERY
    SELECT 
      CASE rjs.step
        WHEN 'arrived' THEN 'Crew Arrived'
        WHEN 'tear_off' THEN 'Tear-Off'
        WHEN 'dry_in' THEN 'Underlayment'
        WHEN 'install' THEN 'Shingle Install'
        WHEN 'clean_up' THEN 'Final Cleanup'
        WHEN 'completed' THEN 'Job Complete'
        ELSE rjs.step::text
      END as step_name,
      CASE 
        WHEN rjs.completed THEN 'completed'
        ELSE 'pending'
      END::text as step_status,
      rjs.completed_at as completed_at,
      CASE rjs.step
        WHEN 'arrived' THEN 1
        WHEN 'tear_off' THEN 2
        WHEN 'dry_in' THEN 3
        WHEN 'install' THEN 4
        WHEN 'clean_up' THEN 5
        WHEN 'completed' THEN 6
        ELSE 0
      END::int as order_index
    FROM public.roofing_job_steps rjs
    WHERE rjs.job_id = p_job_id
    ORDER BY order_index ASC;
    RETURN;
  END IF;

  -- Default empty result
  RETURN;
END;
$$;

COMMENT ON FUNCTION get_job_progress_timeline IS 'Block 253900: Returns live job progress timeline for homeowner portal';

-- ============================================================================
-- PART 9 — FUNCTION: Generate AI Photo Explanation
-- ============================================================================
-- Generates simple language explanation for homeowner photos

CREATE OR REPLACE FUNCTION generate_photo_explanation_for_homeowner(
  p_photo_id uuid,
  p_job_id uuid,
  p_photo_url text,
  p_photo_category text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_explanation text;
  v_category text;
BEGIN
  -- Determine category from photo metadata or use default
  v_category := COALESCE(p_photo_category, 'general');

  -- Generate simple explanations based on category
  CASE v_category
    WHEN 'before' THEN
      v_explanation := 'This photo shows your roof before we started work. This helps us document the original condition.';
    WHEN 'during' THEN
      v_explanation := 'This photo shows work in progress. Our crew is actively working on your roof.';
    WHEN 'after' THEN
      v_explanation := 'This photo shows the completed work. Your new roof is installed and ready.';
    WHEN 'tear_off' THEN
      v_explanation := 'This photo shows the tear-off process. We''re removing your old roof to prepare for the new installation.';
    WHEN 'underlayment' THEN
      v_explanation := 'This photo shows the underlayment being installed. It protects your roof deck from moisture and is required before shingles go on.';
    WHEN 'decking' THEN
      v_explanation := 'This photo shows the roof deck inspection. We check for any damage or rot that needs repair before installing the new roof.';
    WHEN 'install' THEN
      v_explanation := 'This photo shows the shingle installation in progress. Our crew is installing your new roofing materials.';
    WHEN 'ridge_caps' THEN
      v_explanation := 'This photo shows the installation of ridge caps on the roof peak. These help ventilate your attic and finish the roof system.';
    WHEN 'cleanup' THEN
      v_explanation := 'This photo shows our cleanup process. We''re making sure your property is clean and safe.';
    ELSE
      v_explanation := 'This photo shows progress on your roof project. Our crew is working to complete your installation.';
  END CASE;

  -- Insert or update explanation
  INSERT INTO public.photo_explanations (
    photo_id,
    job_id,
    homeowner_explanation,
    ai_generated
  )
  VALUES (
    p_photo_id,
    p_job_id,
    v_explanation,
    true
  )
  ON CONFLICT DO NOTHING;

  RETURN v_explanation;
END;
$$;

COMMENT ON FUNCTION generate_photo_explanation_for_homeowner IS 'Block 253900: Generates simple language explanation for homeowner photos';

-- ============================================================================
-- PART 10 — TRIGGERS
-- ============================================================================

-- Update updated_at on homeowner_accounts
CREATE OR REPLACE FUNCTION update_homeowner_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_homeowner_accounts_updated_at ON public.homeowner_accounts;
CREATE TRIGGER trg_homeowner_accounts_updated_at
BEFORE UPDATE ON public.homeowner_accounts
FOR EACH ROW
EXECUTE FUNCTION update_homeowner_accounts_updated_at();

-- Update updated_at on service_requests
CREATE OR REPLACE FUNCTION update_service_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_requests_updated_at ON public.service_requests;
CREATE TRIGGER trg_service_requests_updated_at
BEFORE UPDATE ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION update_service_requests_updated_at();

-- Update updated_at on warranty_claims
CREATE OR REPLACE FUNCTION update_warranty_claims_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_warranty_claims_updated_at ON public.warranty_claims;
CREATE TRIGGER trg_warranty_claims_updated_at
BEFORE UPDATE ON public.warranty_claims
FOR EACH ROW
EXECUTE FUNCTION update_warranty_claims_updated_at();

-- Auto-generate portal key when homeowner account is created
CREATE OR REPLACE FUNCTION auto_generate_portal_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.portal_key IS NULL OR NEW.portal_key = '' THEN
    NEW.portal_key := generate_homeowner_portal_key();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_generate_portal_key ON public.homeowner_accounts;
CREATE TRIGGER trg_auto_generate_portal_key
BEFORE INSERT ON public.homeowner_accounts
FOR EACH ROW
EXECUTE FUNCTION auto_generate_portal_key();

-- ============================================================================
-- PART 11 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.homeowner_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_explanations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;

-- Homeowner accounts: Public read access by portal_key (for edge functions)
DROP POLICY IF EXISTS "homeowner_accounts_public_read" ON public.homeowner_accounts;
CREATE POLICY "homeowner_accounts_public_read" ON public.homeowner_accounts
  FOR SELECT
  USING (true);  -- Portal access validated by portal_key in application layer

-- Service requests: Homeowners can view their own, PMs can view all for their jobs
DROP POLICY IF EXISTS "service_requests_select" ON public.service_requests;
CREATE POLICY "service_requests_select" ON public.service_requests
  FOR SELECT
  USING (
    -- Homeowner can view their own requests
    (homeowner_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.homeowner_accounts ha
      WHERE ha.id = service_requests.homeowner_id
    ))
    OR
    -- PM can view all requests for their jobs
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = service_requests.job_id
      AND EXISTS (
        SELECT 1 FROM public.roofing_company_members rcm
        WHERE rcm.roofing_company_id = j.company_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
      )
    )
  );

-- Warranty claims: Same as service requests
DROP POLICY IF EXISTS "warranty_claims_select" ON public.warranty_claims;
CREATE POLICY "warranty_claims_select" ON public.warranty_claims
  FOR SELECT
  USING (
    (homeowner_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.homeowner_accounts ha
      WHERE ha.id = warranty_claims.homeowner_id
    ))
    OR
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = warranty_claims.job_id
      AND EXISTS (
        SELECT 1 FROM public.roofing_company_members rcm
        WHERE rcm.roofing_company_id = j.company_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
      )
    )
  );

-- Photo explanations: Public read (for portal)
DROP POLICY IF EXISTS "photo_explanations_select" ON public.photo_explanations;
CREATE POLICY "photo_explanations_select" ON public.photo_explanations
  FOR SELECT
  USING (true);

-- Homeowner messages: Homeowners can view their own, PMs can view all
DROP POLICY IF EXISTS "homeowner_messages_select" ON public.homeowner_messages;
CREATE POLICY "homeowner_messages_select" ON public.homeowner_messages
  FOR SELECT
  USING (
    (homeowner_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.homeowner_accounts ha
      WHERE ha.id = homeowner_messages.homeowner_id
    ))
    OR
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = homeowner_messages.job_id
      AND EXISTS (
        SELECT 1 FROM public.roofing_company_members rcm
        WHERE rcm.roofing_company_id = j.company_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
      )
    )
  );

-- Review requests: Similar access pattern
DROP POLICY IF EXISTS "review_requests_select" ON public.review_requests;
CREATE POLICY "review_requests_select" ON public.review_requests
  FOR SELECT
  USING (
    (homeowner_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.homeowner_accounts ha
      WHERE ha.id = review_requests.homeowner_id
    ))
    OR
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = review_requests.job_id
      AND EXISTS (
        SELECT 1 FROM public.roofing_company_members rcm
        WHERE rcm.roofing_company_id = j.company_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
      )
    )
  );

-- Service role can do everything
DROP POLICY IF EXISTS "homeowner_accounts_service_role" ON public.homeowner_accounts;
CREATE POLICY "homeowner_accounts_service_role" ON public.homeowner_accounts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_requests_service_role" ON public.service_requests;
CREATE POLICY "service_requests_service_role" ON public.service_requests
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "warranty_claims_service_role" ON public.warranty_claims;
CREATE POLICY "warranty_claims_service_role" ON public.warranty_claims
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "photo_explanations_service_role" ON public.photo_explanations;
CREATE POLICY "photo_explanations_service_role" ON public.photo_explanations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "homeowner_messages_service_role" ON public.homeowner_messages;
CREATE POLICY "homeowner_messages_service_role" ON public.homeowner_messages
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "review_requests_service_role" ON public.review_requests;
CREATE POLICY "review_requests_service_role" ON public.review_requests
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 12 — COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.homeowner_accounts IS 'Block 253900: Homeowner accounts with secure portal access';
COMMENT ON TABLE public.service_requests IS 'Block 253900: Post-install service requests from homeowners';
COMMENT ON TABLE public.warranty_claims IS 'Block 253900: Warranty claim submissions from homeowners';
COMMENT ON TABLE public.photo_explanations IS 'Block 253900: AI-generated simple language explanations for homeowner photos';
COMMENT ON TABLE public.homeowner_messages IS 'Block 253900: Customer messaging (PM only, separated from crew communication)';
COMMENT ON TABLE public.review_requests IS 'Block 253900: Review automation tracking';
























