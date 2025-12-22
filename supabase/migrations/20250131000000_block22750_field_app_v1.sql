-- =========================================================
-- Block 22750 — SmartSend Roofing Field App v1
-- "Crew Check-In, Photos, Job Notes"
-- =========================================================
-- 
-- The field-to-office loop that kills 'I didn't know' forever.
-- 
-- This is the first field-facing slice of SmartSend.
-- 
-- Crews stop texting random photos, stops sending notes in 10 different apps.
-- Everything comes into SmartSend, tied to the job, to the day, to the crew.

-- ============================================================================
-- PART 1 — CREATE job_field_sessions TABLE (Check-in / Out)
-- ============================================================================
-- Tracks when crews check in and out of jobs, with progress snapshots

CREATE TABLE IF NOT EXISTS public.job_field_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- the logged-in crew member (auth.uid)
  
  check_in_at timestamptz NOT NULL DEFAULT now(),
  check_out_at timestamptz,
  progress_percent numeric(5,2), -- snapshot at checkout (0-100)
  notes text,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_field_sessions_job_id ON public.job_field_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_field_sessions_crew_id ON public.job_field_sessions(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_field_sessions_user_id ON public.job_field_sessions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_field_sessions_workspace_id ON public.job_field_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_field_sessions_check_in_at ON public.job_field_sessions(check_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_sessions_active ON public.job_field_sessions(job_id, check_out_at) WHERE check_out_at IS NULL;

-- RLS: Enable Row Level Security
ALTER TABLE public.job_field_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view field sessions for jobs in their workspace
CREATE POLICY "field sessions select"
  ON public.job_field_sessions
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Policy: Users can insert field sessions for jobs in their workspace
CREATE POLICY "field sessions insert"
  ON public.job_field_sessions
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Policy: Users can update field sessions for jobs in their workspace
CREATE POLICY "field sessions update"
  ON public.job_field_sessions
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 2 — CREATE job_field_photos TABLE
-- ============================================================================
-- Stores photo metadata (actual files go to Supabase Storage)

CREATE TABLE IF NOT EXISTS public.job_field_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  field_session_id uuid REFERENCES public.job_field_sessions(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  storage_path text NOT NULL, -- path in Supabase Storage (e.g., "workspace_id/job_id/session_id/uuid.jpg")
  tag text CHECK (tag IN ('before','during','after','issue','material','safety')) DEFAULT 'during',
  caption text,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_field_photos_job_id ON public.job_field_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_field_photos_session_id ON public.job_field_photos(field_session_id) WHERE field_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_field_photos_crew_id ON public.job_field_photos(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_field_photos_workspace_id ON public.job_field_photos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_field_photos_tag ON public.job_field_photos(tag);
CREATE INDEX IF NOT EXISTS idx_field_photos_created_at ON public.job_field_photos(created_at DESC);

-- RLS: Enable Row Level Security
ALTER TABLE public.job_field_photos ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view field photos for jobs in their workspace
CREATE POLICY "field photos select"
  ON public.job_field_photos
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Policy: Users can insert field photos for jobs in their workspace
CREATE POLICY "field photos insert"
  ON public.job_field_photos
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 3 — CREATE job_field_notes TABLE
-- ============================================================================
-- Structured notes from field crews

CREATE TABLE IF NOT EXISTS public.job_field_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  field_session_id uuid REFERENCES public.job_field_sessions(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  note_type text CHECK (note_type IN ('progress','issue','material','safety','general')) DEFAULT 'general',
  content text NOT NULL,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_field_notes_job_id ON public.job_field_notes(job_id);
CREATE INDEX IF NOT EXISTS idx_field_notes_session_id ON public.job_field_notes(field_session_id) WHERE field_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_field_notes_crew_id ON public.job_field_notes(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_field_notes_workspace_id ON public.job_field_notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_field_notes_note_type ON public.job_field_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_field_notes_created_at ON public.job_field_notes(created_at DESC);

-- RLS: Enable Row Level Security
ALTER TABLE public.job_field_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view field notes for jobs in their workspace
CREATE POLICY "field notes select"
  ON public.job_field_notes
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Policy: Users can insert field notes for jobs in their workspace
CREATE POLICY "field notes insert"
  ON public.job_field_notes
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 4 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.job_field_sessions TO authenticated;
GRANT SELECT, INSERT ON public.job_field_photos TO authenticated;
GRANT SELECT, INSERT ON public.job_field_notes TO authenticated;







































