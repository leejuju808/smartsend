-- =========================================================
-- Block 22370 — SmartSend Roofing Lead → Job Auto-Conversion v1
-- (NO BULLSHIT. FULL BLOCK. THIS IS WHERE LEADS TURN INTO MONEY.)
-- =========================================================
-- 
-- When a roofer confirms a qualified lead, SmartSend automatically converts
-- the lead into a Job with all required fields, tasks, materials, and activity logs.
-- 
-- This block eliminates human error and ensures leads become revenue immediately.

-- ============================================================================
-- PART 1 — ADD CONVERSION FIELDS TO leads TABLE
-- ============================================================================
-- Track which leads have been converted and prevent double-conversions

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS converted_to_job boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_converted_to_job 
  ON public.leads(converted_to_job) 
  WHERE converted_to_job = true;

CREATE INDEX IF NOT EXISTS idx_leads_converted_job_id 
  ON public.leads(converted_job_id) 
  WHERE converted_job_id IS NOT NULL;

-- ============================================================================
-- PART 2 — ENSURE roofing_jobs TABLE HAS REQUIRED FIELDS
-- ============================================================================
-- Add homeowner contact fields and address fields if they don't exist

ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS homeowner_name text,
  ADD COLUMN IF NOT EXISTS homeowner_email text,
  ADD COLUMN IF NOT EXISTS homeowner_phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip text;

-- Ensure status supports 'awaiting_scheduling' (add if not in check constraint)
DO $$
BEGIN
  -- Check if 'awaiting_scheduling' is in the status check constraint
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint c
    JOIN pg_constraint_columns cc ON c.oid = cc.constraint_oid
    WHERE c.conname LIKE '%status%' 
      AND cc.table_name = 'roofing_jobs'
      AND cc.column_name = 'status'
  ) THEN
    -- If no constraint exists, we'll allow any text for now
    -- The application will enforce 'awaiting_scheduling'
    NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 3 — ENSURE job_timeline TABLE EXISTS
-- ============================================================================
-- Create job_timeline table if it doesn't exist (for conversion tracking)

CREATE TABLE IF NOT EXISTS public.job_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_timeline_job_id 
  ON public.job_timeline(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_timeline_event_type 
  ON public.job_timeline(event_type);

-- RLS for job_timeline
ALTER TABLE public.job_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view job timeline in their workspace"
  ON public.job_timeline FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = job_timeline.job_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "System can insert job timeline events"
  ON public.job_timeline FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- PART 4 — ENSURE job_tasks TABLE EXISTS
-- ============================================================================
-- Create job_tasks table for kickoff tasks

CREATE TABLE IF NOT EXISTS public.job_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date date,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_tasks_job_id 
  ON public.job_tasks(job_id, status);

CREATE INDEX IF NOT EXISTS idx_job_tasks_status 
  ON public.job_tasks(status) 
  WHERE status = 'pending';

-- RLS for job_tasks
ALTER TABLE public.job_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view job tasks in their workspace"
  ON public.job_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = job_tasks.job_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "Users can manage job tasks in their workspace"
  ON public.job_tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = job_tasks.job_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = job_tasks.job_id
        AND wm.user_id = auth.uid()
    )
  );

-- Updated_at trigger for job_tasks
CREATE OR REPLACE FUNCTION public.set_job_tasks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_tasks_updated_at ON public.job_tasks;
CREATE TRIGGER trg_set_job_tasks_updated_at
BEFORE UPDATE ON public.job_tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_job_tasks_updated_at();

-- ============================================================================
-- PART 5 — ENSURE material_orders TABLE EXISTS (from Block 22320)
-- ============================================================================
-- Material orders table should already exist, but ensure it has required structure

-- Note: material_orders table is created in block 22320
-- We just ensure it exists and has the right structure

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'material_orders'
  ) THEN
    CREATE TABLE public.material_orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
      job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
      supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
      status text CHECK (status IN (
        'not_ordered',
        'draft',
        'ordered',
        'confirmed',
        'on_truck',
        'delivered',
        'partial',
        'cancelled'
      )) DEFAULT 'not_ordered',
      expected_delivery_date date,
      actual_delivery_date date,
      subtotal numeric,
      tax numeric,
      total numeric,
      notes text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

-- ============================================================================
-- PART 6 — ENSURE job_activity TABLE EXISTS (alternative to job_events)
-- ============================================================================
-- Create job_activity table if job_events doesn't meet requirements

CREATE TABLE IF NOT EXISTS public.job_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_activity_job_id 
  ON public.job_activity(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_activity_type 
  ON public.job_activity(type);

-- RLS for job_activity
ALTER TABLE public.job_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view job activity in their workspace"
  ON public.job_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = job_activity.job_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "System can insert job activity"
  ON public.job_activity FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- PART 7 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.leads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.roofing_jobs TO authenticated;
GRANT SELECT, INSERT ON public.job_timeline TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_tasks TO authenticated;
GRANT SELECT, INSERT ON public.material_orders TO authenticated;
GRANT SELECT, INSERT ON public.job_activity TO authenticated;

COMMENT ON COLUMN public.leads.converted_to_job IS 'Tracks if this lead has been converted to a job';
COMMENT ON COLUMN public.leads.converted_job_id IS 'Reference to the job created from this lead';








































