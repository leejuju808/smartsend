-- =========================================================
-- Block 256700 — SmartSend AI Recruiting Engine v1
-- "Job Ads, Candidate Scoring, Skill Assessment, Interview Automation, Crew Fit Matching"
-- =========================================================
-- 
-- This block makes SmartSend the talent machine roofing companies have ALWAYS needed — 
-- hiring the right people, filtering the wrong ones, and filling crews faster with BETTER workers.
-- 
-- Roofers will say:
-- "SmartSend sends us BETTER applicants than Indeed."
-- "We stopped wasting time on bad hires."
-- "We'd be stupid not using this."
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE job_openings TABLE
-- ============================================================================
-- Job openings posted by roofing companies

CREATE TABLE IF NOT EXISTS public.job_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Job Details
  title text NOT NULL,                    -- "Roofing Installer", "Foreman", "Laborer", etc.
  description text,                       -- Full job description
  requirements jsonb DEFAULT '{}'::jsonb, -- Structured requirements
  -- requirements structure:
  -- {
  --   "experience_years": 2,
  --   "skills": ["tear-off", "shingles", "flashing"],
  --   "certifications": ["OSHA", "GAF"],
  --   "tools_required": ["nail_gun", "harness"],
  --   "physical_requirements": ["lift_50lbs", "climb_ladders"]
  -- }
  wage_range text,                        -- "$22–$32/hr + bonuses"
  location text,                          -- City, State
  job_type text DEFAULT 'full_time' CHECK (job_type IN ('full_time', 'part_time', 'contract', 'seasonal')),
  
  -- Posting Status
  status text DEFAULT 'open' CHECK (status IN ('open', 'paused', 'closed', 'filled')),
  
  -- Job Board Postings
  posted_to jsonb DEFAULT '[]'::jsonb,    -- ["indeed", "facebook_jobs", "craigslist", "ziprecruiter"]
  posting_urls jsonb DEFAULT '{}'::jsonb, -- {"indeed": "url", "facebook_jobs": "url"}
  
  -- AI-Generated Content
  ai_generated_ad text,                   -- AI-written job ad
  ai_ad_version text,                     -- Version identifier
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_openings_company ON public.job_openings(company_id, status);
CREATE INDEX IF NOT EXISTS idx_job_openings_org ON public.job_openings(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_openings_status ON public.job_openings(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_openings_title ON public.job_openings(company_id, title);

COMMENT ON TABLE public.job_openings IS 'Job openings for roofing companies (Block 256700)';

-- ============================================================================
-- PART 2 — CREATE applicants TABLE
-- ============================================================================
-- Applicants who apply to job openings

CREATE TABLE IF NOT EXISTS public.applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_opening_id uuid NOT NULL REFERENCES public.job_openings(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Personal Information
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  email text,
  
  -- Resume & Documents
  resume_url text,
  parsed_resume jsonb DEFAULT '{}'::jsonb,
  -- parsed_resume structure:
  -- {
  --   "years_experience": 3,
  --   "past_roles": ["installer", "laborer"],
  --   "past_employers": ["ABC Roofing", "XYZ Construction"],
  --   "tools_used": ["nail_gun", "circular_saw", "harness"],
  --   "certifications": ["OSHA_10", "GAF_Certified"],
  --   "safety_history": "clean",
  --   "job_hopping_pattern": "low",
  --   "keywords": ["shingles", "tear-off", "flashing", "TPO"]
  -- }
  
  -- AI Scoring (0-100)
  experience_score numeric(5,2) CHECK (experience_score >= 0 AND experience_score <= 100),
  skill_score numeric(5,2) CHECK (skill_score >= 0 AND skill_score <= 100),
  reliability_score numeric(5,2) CHECK (reliability_score >= 0 AND reliability_score <= 100),
  culture_fit_score numeric(5,2) CHECK (culture_fit_score >= 0 AND culture_fit_score <= 100),
  overall_score numeric(5,2) CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- Skill Breakdown
  skill_breakdown jsonb DEFAULT '{}'::jsonb,
  -- skill_breakdown structure:
  -- {
  --   "ridge_valley_experience": "advanced",
  --   "starter_underlayment": "intermediate",
  --   "flashing": "strong",
  --   "tpo_epdm": "minimal",
  --   "steep_roofs": "advanced",
  --   "safety_awareness": "strong"
  -- }
  
  -- Status Tracking
  status text DEFAULT 'new' CHECK (status IN ('new', 'screened', 'interview_scheduled', 'interviewed', 'hired', 'rejected', 'withdrawn')),
  status_notes text,
  
  -- Referral Information
  referred_by uuid REFERENCES public.applicants(id) ON DELETE SET NULL, -- If referred by another applicant/employee
  referral_employee_id uuid, -- If referred by current employee
  is_referral boolean DEFAULT false,
  referral_boost numeric(5,2) DEFAULT 0, -- Score boost for referrals
  
  -- Crew Matching
  recommended_crew_id uuid, -- Best fit crew
  crew_fit_score numeric(5,2), -- How well they fit the recommended crew
  crew_fit_reason text,
  
  -- Metadata
  source text, -- "indeed", "facebook_jobs", "referral", "direct", etc.
  applied_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applicants_job_opening ON public.applicants(job_opening_id, status);
CREATE INDEX IF NOT EXISTS idx_applicants_company ON public.applicants(company_id, status);
CREATE INDEX IF NOT EXISTS idx_applicants_org ON public.applicants(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applicants_overall_score ON public.applicants(company_id, overall_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_applicants_status ON public.applicants(company_id, status, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_applicants_referral ON public.applicants(company_id, is_referral) WHERE is_referral = true;
CREATE INDEX IF NOT EXISTS idx_applicants_email ON public.applicants(email) WHERE email IS NOT NULL;

COMMENT ON TABLE public.applicants IS 'Applicants for job openings (Block 256700)';

-- ============================================================================
-- PART 3 — CREATE interview_notes TABLE
-- ============================================================================
-- Interview notes and ratings from PMs/owners

CREATE TABLE IF NOT EXISTS public.interview_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  interviewer_id uuid REFERENCES public.project_managers(id) ON DELETE SET NULL,
  interviewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Interview Details
  interview_date date,
  interview_type text CHECK (interview_type IN ('phone', 'video', 'in_person', 'ai_assessment')),
  notes text,
  rating numeric(5,2) CHECK (rating >= 0 AND rating <= 100),
  
  -- Assessment Breakdown
  assessment_scores jsonb DEFAULT '{}'::jsonb,
  -- assessment_scores structure:
  -- {
  --   "steep_roof_knowledge": 82,
  --   "safety_awareness": 90,
  --   "technical_skill": 74,
  --   "communication": 85,
  --   "reliability_indicators": 65
  -- }
  
  -- Recommendation
  recommendation text CHECK (recommendation IN ('hire', 'maybe', 'reject', 'pending')),
  recommendation_notes text,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_notes_applicant ON public.interview_notes(applicant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_notes_interviewer ON public.interview_notes(interviewer_id) WHERE interviewer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interview_notes_rating ON public.interview_notes(applicant_id, rating DESC);

COMMENT ON TABLE public.interview_notes IS 'Interview notes and ratings (Block 256700)';

-- ============================================================================
-- PART 4 — CREATE pre_interview_assessments TABLE
-- ============================================================================
-- AI pre-interview assessments (automatic, no PM time wasted)

CREATE TABLE IF NOT EXISTS public.pre_interview_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  
  -- Assessment Questions & Answers
  questions jsonb DEFAULT '[]'::jsonb,
  answers jsonb DEFAULT '{}'::jsonb,
  -- questions structure:
  -- [
  --   {
  --     "id": "q1",
  --     "question": "Describe your experience with steep roofs.",
  --     "type": "text"
  --   },
  --   {
  --     "id": "q2",
  --     "question": "Do you own a harness?",
  --     "type": "yes_no"
  --   }
  -- ]
  -- answers structure:
  -- {
  --   "q1": "I've worked on steep roofs for 3 years...",
  --   "q2": "yes"
  -- }
  
  -- AI Scoring
  ai_scores jsonb DEFAULT '{}'::jsonb,
  -- ai_scores structure:
  -- {
  --   "steep_roof_knowledge": 82,
  --   "safety_awareness": 90,
  --   "technical_skill": 74,
  --   "reliability_indicators": 45
  -- }
  overall_assessment_score numeric(5,2) CHECK (overall_assessment_score >= 0 AND overall_assessment_score <= 100),
  
  -- AI Analysis
  ai_analysis text, -- AI-generated summary of assessment
  strengths text[], -- Array of strengths identified
  weaknesses text[], -- Array of weaknesses identified
  red_flags text[], -- Array of red flags
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'expired')),
  completed_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pre_interview_assessments_applicant ON public.pre_interview_assessments(applicant_id, status);
CREATE INDEX IF NOT EXISTS idx_pre_interview_assessments_score ON public.pre_interview_assessments(applicant_id, overall_assessment_score DESC NULLS LAST);

COMMENT ON TABLE public.pre_interview_assessments IS 'AI pre-interview assessments (Block 256700)';

-- ============================================================================
-- PART 5 — CREATE applicant_referrals TABLE
-- ============================================================================
-- Referral system for current employees to refer applicants

CREATE TABLE IF NOT EXISTS public.applicant_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  referrer_employee_id uuid, -- Current employee who referred
  referrer_name text,
  referrer_email text,
  referrer_phone text,
  
  -- Referred Applicant
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL,
  referred_first_name text,
  referred_last_name text,
  referred_email text,
  referred_phone text,
  
  -- Referral Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'interviewed', 'hired', 'rejected', 'expired')),
  
  -- Reward Tracking
  reward_amount numeric(10,2) DEFAULT 200.00, -- Default $200 referral bonus
  reward_paid boolean DEFAULT false,
  reward_paid_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applicant_referrals_company ON public.applicant_referrals(company_id, status);
CREATE INDEX IF NOT EXISTS idx_applicant_referrals_referrer ON public.applicant_referrals(referrer_employee_id) WHERE referrer_employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applicant_referrals_applicant ON public.applicant_referrals(applicant_id) WHERE applicant_id IS NOT NULL;

COMMENT ON TABLE public.applicant_referrals IS 'Employee referral system (Block 256700)';

-- ============================================================================
-- PART 6 — CREATE crew_fit_analysis TABLE
-- ============================================================================
-- Crew fit matching analysis for applicants

CREATE TABLE IF NOT EXISTS public.crew_fit_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  crew_id uuid, -- References crews table (may vary by company structure)
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Fit Scores
  personality_fit numeric(5,2) CHECK (personality_fit >= 0 AND personality_fit <= 100),
  skill_fit numeric(5,2) CHECK (skill_fit >= 0 AND skill_fit <= 100),
  crew_style_fit numeric(5,2) CHECK (crew_style_fit >= 0 AND crew_style_fit <= 100),
  overall_fit_score numeric(5,2) CHECK (overall_fit_score >= 0 AND overall_fit_score <= 100),
  
  -- Fit Analysis
  fit_reason text, -- Why this crew is a good fit
  predicted_impact text, -- Predicted impact on crew performance
  crew_score_impact numeric(5,2), -- Expected crew score improvement (e.g., +8.3%)
  
  -- Compatibility Factors
  compatibility_factors jsonb DEFAULT '{}'::jsonb,
  -- compatibility_factors structure:
  -- {
  --   "communication_style": "matches",
  --   "work_pace": "matches",
  --   "skill_complement": "high",
  --   "personality_match": "good"
  -- }
  
  -- Metadata
  analyzed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_fit_analysis_applicant ON public.crew_fit_analysis(applicant_id);
CREATE INDEX IF NOT EXISTS idx_crew_fit_analysis_crew ON public.crew_fit_analysis(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crew_fit_analysis_company ON public.crew_fit_analysis(company_id, overall_fit_score DESC);

COMMENT ON TABLE public.crew_fit_analysis IS 'Crew fit matching analysis (Block 256700)';

-- ============================================================================
-- PART 7 — TRIGGERS & UPDATED_AT
-- ============================================================================

-- Updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS trg_job_openings_updated_at ON public.job_openings;
CREATE TRIGGER trg_job_openings_updated_at
BEFORE UPDATE ON public.job_openings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_applicants_updated_at ON public.applicants;
CREATE TRIGGER trg_applicants_updated_at
BEFORE UPDATE ON public.applicants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_interview_notes_updated_at ON public.interview_notes;
CREATE TRIGGER trg_interview_notes_updated_at
BEFORE UPDATE ON public.interview_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pre_interview_assessments_updated_at ON public.pre_interview_assessments;
CREATE TRIGGER trg_pre_interview_assessments_updated_at
BEFORE UPDATE ON public.pre_interview_assessments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_applicant_referrals_updated_at ON public.applicant_referrals;
CREATE TRIGGER trg_applicant_referrals_updated_at
BEFORE UPDATE ON public.applicant_referrals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_interview_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicant_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_fit_analysis ENABLE ROW LEVEL SECURITY;

-- Helper function to check company access
CREATE OR REPLACE FUNCTION public.has_company_access(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.roofing_companies rc
    WHERE rc.id = _company_id
      AND (
        rc.owner_id = auth.uid()
        OR EXISTS(
          SELECT 1
          FROM public.org_memberships om
          WHERE om.org_id = rc.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
        )
      )
  );
$$;

-- Job Openings Policies
DROP POLICY IF EXISTS "job_openings_select" ON public.job_openings;
CREATE POLICY "job_openings_select" ON public.job_openings
  FOR SELECT USING (has_company_access(company_id));

DROP POLICY IF EXISTS "job_openings_insert" ON public.job_openings;
CREATE POLICY "job_openings_insert" ON public.job_openings
  FOR INSERT WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "job_openings_update" ON public.job_openings;
CREATE POLICY "job_openings_update" ON public.job_openings
  FOR UPDATE USING (has_company_access(company_id));

DROP POLICY IF EXISTS "job_openings_delete" ON public.job_openings;
CREATE POLICY "job_openings_delete" ON public.job_openings
  FOR DELETE USING (has_company_access(company_id));

-- Applicants Policies
DROP POLICY IF EXISTS "applicants_select" ON public.applicants;
CREATE POLICY "applicants_select" ON public.applicants
  FOR SELECT USING (has_company_access(company_id));

DROP POLICY IF EXISTS "applicants_insert" ON public.applicants;
CREATE POLICY "applicants_insert" ON public.applicants
  FOR INSERT WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "applicants_update" ON public.applicants;
CREATE POLICY "applicants_update" ON public.applicants
  FOR UPDATE USING (has_company_access(company_id));

DROP POLICY IF EXISTS "applicants_delete" ON public.applicants;
CREATE POLICY "applicants_delete" ON public.applicants
  FOR DELETE USING (has_company_access(company_id));

-- Interview Notes Policies
DROP POLICY IF EXISTS "interview_notes_select" ON public.interview_notes;
CREATE POLICY "interview_notes_select" ON public.interview_notes
  FOR SELECT USING (
    EXISTS(
      SELECT 1
      FROM public.applicants a
      WHERE a.id = interview_notes.applicant_id
        AND has_company_access(a.company_id)
    )
  );

DROP POLICY IF EXISTS "interview_notes_insert" ON public.interview_notes;
CREATE POLICY "interview_notes_insert" ON public.interview_notes
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1
      FROM public.applicants a
      WHERE a.id = interview_notes.applicant_id
        AND has_company_access(a.company_id)
    )
  );

DROP POLICY IF EXISTS "interview_notes_update" ON public.interview_notes;
CREATE POLICY "interview_notes_update" ON public.interview_notes
  FOR UPDATE USING (
    EXISTS(
      SELECT 1
      FROM public.applicants a
      WHERE a.id = interview_notes.applicant_id
        AND has_company_access(a.company_id)
    )
  );

-- Pre-Interview Assessments Policies
DROP POLICY IF EXISTS "pre_interview_assessments_select" ON public.pre_interview_assessments;
CREATE POLICY "pre_interview_assessments_select" ON public.pre_interview_assessments
  FOR SELECT USING (
    EXISTS(
      SELECT 1
      FROM public.applicants a
      WHERE a.id = pre_interview_assessments.applicant_id
        AND has_company_access(a.company_id)
    )
  );

DROP POLICY IF EXISTS "pre_interview_assessments_insert" ON public.pre_interview_assessments;
CREATE POLICY "pre_interview_assessments_insert" ON public.pre_interview_assessments
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1
      FROM public.applicants a
      WHERE a.id = pre_interview_assessments.applicant_id
        AND has_company_access(a.company_id)
    )
  );

DROP POLICY IF EXISTS "pre_interview_assessments_update" ON public.pre_interview_assessments;
CREATE POLICY "pre_interview_assessments_update" ON public.pre_interview_assessments
  FOR UPDATE USING (
    EXISTS(
      SELECT 1
      FROM public.applicants a
      WHERE a.id = pre_interview_assessments.applicant_id
        AND has_company_access(a.company_id)
    )
  );

-- Applicant Referrals Policies
DROP POLICY IF EXISTS "applicant_referrals_select" ON public.applicant_referrals;
CREATE POLICY "applicant_referrals_select" ON public.applicant_referrals
  FOR SELECT USING (has_company_access(company_id));

DROP POLICY IF EXISTS "applicant_referrals_insert" ON public.applicant_referrals;
CREATE POLICY "applicant_referrals_insert" ON public.applicant_referrals
  FOR INSERT WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "applicant_referrals_update" ON public.applicant_referrals;
CREATE POLICY "applicant_referrals_update" ON public.applicant_referrals
  FOR UPDATE USING (has_company_access(company_id));

-- Crew Fit Analysis Policies
DROP POLICY IF EXISTS "crew_fit_analysis_select" ON public.crew_fit_analysis;
CREATE POLICY "crew_fit_analysis_select" ON public.crew_fit_analysis
  FOR SELECT USING (has_company_access(company_id));

DROP POLICY IF EXISTS "crew_fit_analysis_insert" ON public.crew_fit_analysis;
CREATE POLICY "crew_fit_analysis_insert" ON public.crew_fit_analysis
  FOR INSERT WITH CHECK (has_company_access(company_id));

DROP POLICY IF EXISTS "crew_fit_analysis_update" ON public.crew_fit_analysis;
CREATE POLICY "crew_fit_analysis_update" ON public.crew_fit_analysis
  FOR UPDATE USING (has_company_access(company_id));

-- ============================================================================
-- PART 9 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Get recruiting dashboard stats
CREATE OR REPLACE FUNCTION public.get_recruiting_dashboard_stats(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'open_roles', (
      SELECT COUNT(*)::int
      FROM public.job_openings
      WHERE company_id = _company_id
        AND status = 'open'
    ),
    'applicants_this_week', (
      SELECT COUNT(*)::int
      FROM public.applicants
      WHERE company_id = _company_id
        AND applied_at >= now() - interval '7 days'
    ),
    'high_quality_applicants', (
      SELECT COUNT(*)::int
      FROM public.applicants
      WHERE company_id = _company_id
        AND overall_score >= 70
        AND applied_at >= now() - interval '7 days'
    ),
    'interviews_scheduled', (
      SELECT COUNT(*)::int
      FROM public.applicants
      WHERE company_id = _company_id
        AND status = 'interview_scheduled'
    ),
    'hires_this_month', (
      SELECT COUNT(*)::int
      FROM public.applicants
      WHERE company_id = _company_id
        AND status = 'hired'
        AND applied_at >= date_trunc('month', now())
    ),
    'average_applicant_score', (
      SELECT COALESCE(AVG(overall_score), 0)::numeric(5,2)
      FROM public.applicants
      WHERE company_id = _company_id
        AND overall_score IS NOT NULL
        AND applied_at >= now() - interval '30 days'
    ),
    'most_common_skill_gap', (
      SELECT skill_gap
      FROM (
        SELECT 
          jsonb_object_keys(skill_breakdown) as skill_gap,
          COUNT(*) as gap_count
        FROM public.applicants
        WHERE company_id = _company_id
          AND skill_breakdown IS NOT NULL
          AND applied_at >= now() - interval '30 days'
        GROUP BY skill_gap
        ORDER BY gap_count DESC
        LIMIT 1
      ) subq
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_recruiting_dashboard_stats IS 'Get recruiting dashboard statistics for a company (Block 256700)';





















