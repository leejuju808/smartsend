-- =========================================================
-- Block 27880 — SmartSend Roofing Crew Mobile Field App v1
-- (Daily job instructions • Material list • Upload photos • Mark progress • Auto-sync to Owner Command Center)
-- =========================================================
-- 
-- This is the block that takes SmartSend from "office software" → full company operating system.
-- 
-- Roofers don't just need backend tools. They need a field app that crews can actually USE:
-- - Simple
-- - Fast
-- - Works on any phone
-- - Zero training
-- 
-- Your field app will be:
-- A minimal, bullet-proof interface where crews receive instructions, see material lists, 
-- upload job photos, track progress, and sync everything back instantly.
-- 
-- This is the piece that every competing roofing CRM struggles with — nobody does this smoothly.
-- SmartSend will.

-- ============================================================================
-- PART 1 — CREATE roofing_job_steps TABLE
-- ============================================================================
-- Track job step completion (arrived, tear-off, dry-in, install, clean-up, completed)

CREATE TABLE IF NOT EXISTS public.roofing_job_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (
    step IN ('arrived', 'tear_off', 'dry_in', 'install', 'clean_up', 'completed')
  ),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_job_steps_job ON public.roofing_job_steps(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_job_steps_crew ON public.roofing_job_steps(crew_id);
CREATE INDEX IF NOT EXISTS idx_roofing_job_steps_step ON public.roofing_job_steps(step);
CREATE INDEX IF NOT EXISTS idx_roofing_job_steps_completed ON public.roofing_job_steps(job_id, step, completed);

COMMENT ON TABLE public.roofing_job_steps IS 'Block 27880: Job step tracking for field crews';
COMMENT ON COLUMN public.roofing_job_steps.step IS 'Block 27880: Job step type (arrived, tear_off, dry_in, install, clean_up, completed)';

-- ============================================================================
-- PART 2 — CREATE roofing_job_photos TABLE
-- ============================================================================
-- Store references to job photos uploaded by crews

CREATE TABLE IF NOT EXISTS public.roofing_job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (
    category IN ('before', 'during', 'after', 'material_issue', 'rot', 'other')
  ),
  url text NOT NULL,
  storage_path text, -- Path in Supabase Storage
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_job_photos_job ON public.roofing_job_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_job_photos_crew ON public.roofing_job_photos(crew_id);
CREATE INDEX IF NOT EXISTS idx_roofing_job_photos_category ON public.roofing_job_photos(category);
CREATE INDEX IF NOT EXISTS idx_roofing_job_photos_created ON public.roofing_job_photos(job_id, created_at DESC);

COMMENT ON TABLE public.roofing_job_photos IS 'Block 27880: Job photos uploaded by field crews';
COMMENT ON COLUMN public.roofing_job_photos.category IS 'Block 27880: Photo category (before, during, after, material_issue, rot, other)';

-- ============================================================================
-- PART 3 — CREATE roofing_job_issues TABLE
-- ============================================================================
-- Track issues reported by crews (missing items, material shorts, rot, etc.)

CREATE TABLE IF NOT EXISTS public.roofing_job_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  issue_type text, -- e.g., 'missing_item', 'material_short', 'rot_found', 'pitch_steeper', 'general'
  description text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_job_issues_job ON public.roofing_job_issues(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_job_issues_crew ON public.roofing_job_issues(crew_id);
CREATE INDEX IF NOT EXISTS idx_roofing_job_issues_type ON public.roofing_job_issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_roofing_job_issues_resolved ON public.roofing_job_issues(job_id, resolved);

COMMENT ON TABLE public.roofing_job_issues IS 'Block 27880: Issues reported by field crews';
COMMENT ON COLUMN public.roofing_job_issues.issue_type IS 'Block 27880: Type of issue (missing_item, material_short, rot_found, pitch_steeper, general)';

-- ============================================================================
-- PART 4 — ENSURE STORAGE BUCKET EXISTS
-- ============================================================================
-- Use existing job-photos bucket or create if needed

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-photos',
  'job-photos',
  false, -- private bucket
  10485760, -- 10 MB file size limit
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.roofing_job_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_job_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_job_issues ENABLE ROW LEVEL SECURITY;

-- Policies for roofing_job_steps
CREATE POLICY "Users can view job steps for their workspace jobs"
  ON public.roofing_job_steps FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM public.roofing_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Crews can insert job steps"
  ON public.roofing_job_steps FOR INSERT
  TO authenticated
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.roofing_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update job steps for their workspace jobs"
  ON public.roofing_job_steps FOR UPDATE
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM public.roofing_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policies for roofing_job_photos
CREATE POLICY "Users can view job photos for their workspace jobs"
  ON public.roofing_job_photos FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM public.roofing_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Crews can insert job photos"
  ON public.roofing_job_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.roofing_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policies for roofing_job_issues
CREATE POLICY "Users can view job issues for their workspace jobs"
  ON public.roofing_job_issues FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM public.roofing_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Crews can insert job issues"
  ON public.roofing_job_issues FOR INSERT
  TO authenticated
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.roofing_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update job issues for their workspace jobs"
  ON public.roofing_job_issues FOR UPDATE
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM public.roofing_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Service role policies (for API routes)
CREATE POLICY "Service role can manage job steps"
  ON public.roofing_job_steps FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage job photos"
  ON public.roofing_job_photos FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage job issues"
  ON public.roofing_job_issues FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 6 — TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_roofing_job_steps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_roofing_job_steps_updated_at
BEFORE UPDATE ON public.roofing_job_steps
FOR EACH ROW
EXECUTE FUNCTION update_roofing_job_steps_updated_at();



































