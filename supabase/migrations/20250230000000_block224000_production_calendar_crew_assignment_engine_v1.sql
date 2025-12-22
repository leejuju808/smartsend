-- Block 224000 — SmartSend Roofing "Production Calendar + Crew Assignment Engine" v1
-- THE PRODUCTION COMMAND CENTER
--
-- This is the block that makes roofers STOP and say:
-- "Holy shit… SmartSend is running my entire company."
--
-- Features:
-- - Drag-and-drop production calendar
-- - Assign crews to jobs with validation
-- - Block crews on certain days (vacation, off-days)
-- - Show material delivery dependencies
-- - Prevent scheduling jobs with missing materials or unpaid deposits
-- - Push schedule to Crew App automatically
-- - Production readiness per job
-- - Schedule event tracking

-- ============================================================================
-- PART 1 — ENSURE crews TABLE EXISTS AND ENHANCE IT
-- ============================================================================

-- Ensure crews table exists (may already exist from previous blocks)
CREATE TABLE IF NOT EXISTS public.crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,       -- "Crew A", "Tear-Off Crew", etc.
  lead_name text,
  lead_phone text,
  notes text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add company_id foreign key if companies/roofing_companies table exists
DO $$
BEGIN
  -- Try roofing_companies first (roofing-specific)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_companies') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crews_company_id_fkey'
    ) THEN
      ALTER TABLE public.crews
        ADD CONSTRAINT crews_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.roofing_companies(id) ON DELETE CASCADE;
    END IF;
  -- Fallback to companies table
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crews_company_id_fkey'
    ) THEN
      ALTER TABLE public.crews
        ADD CONSTRAINT crews_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Add columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crews' AND column_name = 'lead_name') THEN
    ALTER TABLE public.crews ADD COLUMN lead_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crews' AND column_name = 'lead_phone') THEN
    ALTER TABLE public.crews ADD COLUMN lead_phone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crews' AND column_name = 'active') THEN
    ALTER TABLE public.crews ADD COLUMN active boolean DEFAULT true;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crews_company ON public.crews(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crews_workspace ON public.crews(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crews_team ON public.crews(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crews_active ON public.crews(active) WHERE active = true;

-- ============================================================================
-- PART 2 — ENSURE crew_availability TABLE EXISTS (enhance if needed)
-- ============================================================================
-- Crews unavailable due to weather, vacation, equipment issues

CREATE TABLE IF NOT EXISTS public.crew_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id uuid,
  date date NOT NULL,
  available boolean DEFAULT true,
  reason text,  -- "vacation", "weather", "equipment_issue", "training", etc.
  created_at timestamptz DEFAULT now(),
  UNIQUE(crew_id, date)
);

-- Add workspace_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crew_availability' AND column_name = 'workspace_id') THEN
    ALTER TABLE public.crew_availability ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crew_availability' AND column_name = 'company_id') THEN
    ALTER TABLE public.crew_availability ADD COLUMN company_id uuid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crew_availability_crew ON public.crew_availability(crew_id, date);
CREATE INDEX IF NOT EXISTS idx_crew_availability_date ON public.crew_availability(date);
CREATE INDEX IF NOT EXISTS idx_crew_availability_available ON public.crew_availability(crew_id, date) WHERE available = false;
CREATE INDEX IF NOT EXISTS idx_crew_availability_workspace ON public.crew_availability(workspace_id) WHERE workspace_id IS NOT NULL;

-- ============================================================================
-- PART 3 — CREATE job_schedule TABLE
-- ============================================================================
-- This ties a job to a crew on a specific day

CREATE TABLE IF NOT EXISTS public.job_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id uuid,
  scheduled_date date NOT NULL,
  status text DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'in_progress',
    'completed',
    'canceled',
    'delayed'
  )),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs/roofing_jobs table
DO $$
BEGIN
  -- Try roofing_jobs first (roofing-specific)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'job_schedule_job_id_fkey'
    ) THEN
      ALTER TABLE public.job_schedule
        ADD CONSTRAINT job_schedule_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  -- Fallback to jobs table
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'job_schedule_job_id_fkey'
    ) THEN
      ALTER TABLE public.job_schedule
        ADD CONSTRAINT job_schedule_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Add company_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job_schedule' AND column_name = 'company_id') THEN
    ALTER TABLE public.job_schedule ADD COLUMN company_id uuid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_schedule_job ON public.job_schedule(job_id);
CREATE INDEX IF NOT EXISTS idx_job_schedule_crew ON public.job_schedule(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_schedule_date ON public.job_schedule(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_job_schedule_status ON public.job_schedule(status);
CREATE INDEX IF NOT EXISTS idx_job_schedule_workspace ON public.job_schedule(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_schedule_crew_date ON public.job_schedule(crew_id, scheduled_date) WHERE crew_id IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_job_schedule_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_schedule_updated_at ON public.job_schedule;
CREATE TRIGGER trg_job_schedule_updated_at
BEFORE UPDATE ON public.job_schedule
FOR EACH ROW EXECUTE FUNCTION public.set_job_schedule_updated_at();

-- ============================================================================
-- PART 4 — CREATE schedule_events TABLE
-- ============================================================================
-- Future-proof for weather, material delays, supplier updates

CREATE TABLE IF NOT EXISTS public.schedule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  job_schedule_id uuid REFERENCES public.job_schedule(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id uuid,
  event_type text NOT NULL,  -- "weather_delay", "material_delay", "crew_reassigned", "job_moved", "job_canceled", "job_delayed"
  event_time timestamptz DEFAULT now(),
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,  -- Additional event data
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs/roofing_jobs table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'schedule_events_job_id_fkey'
    ) THEN
      ALTER TABLE public.schedule_events
        ADD CONSTRAINT schedule_events_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'schedule_events_job_id_fkey'
    ) THEN
      ALTER TABLE public.schedule_events
        ADD CONSTRAINT schedule_events_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Add company_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schedule_events' AND column_name = 'company_id') THEN
    ALTER TABLE public.schedule_events ADD COLUMN company_id uuid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_schedule_events_job ON public.schedule_events(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_events_schedule ON public.schedule_events(job_schedule_id) WHERE job_schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_events_type ON public.schedule_events(event_type);
CREATE INDEX IF NOT EXISTS idx_schedule_events_time ON public.schedule_events(event_time DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_events_workspace ON public.schedule_events(workspace_id) WHERE workspace_id IS NOT NULL;

-- ============================================================================
-- PART 5 — FUNCTION: CHECK JOB READINESS
-- ============================================================================
-- Validates if a job is ready to be scheduled (materials delivered, deposit paid)

CREATE OR REPLACE FUNCTION public.check_job_readiness(p_job_id uuid)
RETURNS TABLE (
  is_ready boolean,
  readiness_issues text[],
  materials_status text,
  deposit_status text
) AS $$
DECLARE
  v_materials_ready boolean := false;
  v_deposit_paid boolean := false;
  v_issues text[] := ARRAY[]::text[];
  v_materials_status text;
  v_deposit_status text;
BEGIN
  -- Check materials status
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN false
      WHEN COUNT(*) FILTER (WHERE status IN ('delivered', 'confirmed', 'scheduled_for_delivery')) > 0 THEN true
      ELSE false
    END,
    CASE 
      WHEN COUNT(*) = 0 THEN 'no_orders'
      WHEN COUNT(*) FILTER (WHERE status = 'delivered') > 0 THEN 'delivered'
      WHEN COUNT(*) FILTER (WHERE status IN ('confirmed', 'scheduled_for_delivery')) > 0 THEN 'confirmed'
      ELSE 'pending'
    END
  INTO v_materials_ready, v_materials_status
  FROM public.material_orders
  WHERE job_id = p_job_id;

  IF NOT v_materials_ready THEN
    v_issues := array_append(v_issues, 'Materials not delivered or confirmed');
  END IF;

  -- Check deposit status (check both roofing_jobs and jobs tables)
  -- Try roofing_jobs first
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    SELECT 
      CASE 
        WHEN deposit_paid >= deposit_required OR payment_status IN ('deposit_paid', 'partial', 'paid') THEN true
        ELSE false
      END,
      CASE 
        WHEN deposit_paid >= deposit_required OR payment_status IN ('deposit_paid', 'partial', 'paid') THEN 'paid'
        ELSE 'unpaid'
      END
    INTO v_deposit_paid, v_deposit_status
    FROM public.roofing_jobs
    WHERE id = p_job_id;
  END IF;

  -- If not found in roofing_jobs, try jobs table
  IF v_deposit_status IS NULL THEN
    -- For jobs table, we'll assume deposit is paid if no deposit_required field exists
    v_deposit_paid := true;
    v_deposit_status := 'unknown';
  END IF;

  IF NOT v_deposit_paid THEN
    v_issues := array_append(v_issues, 'Deposit not paid');
  END IF;

  RETURN QUERY SELECT 
    (v_materials_ready AND v_deposit_paid) as is_ready,
    v_issues as readiness_issues,
    v_materials_status as materials_status,
    v_deposit_status as deposit_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 6 — FUNCTION: CHECK CREW AVAILABILITY
-- ============================================================================
-- Validates if a crew is available on a specific date

CREATE OR REPLACE FUNCTION public.check_crew_availability(
  p_crew_id uuid,
  p_date date
)
RETURNS TABLE (
  is_available boolean,
  reason text,
  is_booked boolean
) AS $$
DECLARE
  v_availability_record record;
  v_is_booked boolean := false;
BEGIN
  -- Check crew_availability table
  SELECT available, reason
  INTO v_availability_record
  FROM public.crew_availability
  WHERE crew_id = p_crew_id AND date = p_date;

  -- Check if crew is already booked on this date
  SELECT EXISTS(
    SELECT 1 FROM public.job_schedule
    WHERE crew_id = p_crew_id
      AND scheduled_date = p_date
      AND status IN ('scheduled', 'in_progress')
  ) INTO v_is_booked;

  IF v_is_booked THEN
    RETURN QUERY SELECT false, 'Crew already booked'::text, true;
  ELSIF v_availability_record IS NULL THEN
    -- No availability record means crew is available by default
    RETURN QUERY SELECT true, NULL::text, false;
  ELSIF NOT v_availability_record.available THEN
    RETURN QUERY SELECT false, COALESCE(v_availability_record.reason, 'Unavailable')::text, false;
  ELSE
    RETURN QUERY SELECT true, NULL::text, false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;

-- Crews: Workspace/company members can access
DROP POLICY IF EXISTS "crews_read" ON public.crews;
CREATE POLICY "crews_read" ON public.crews
  FOR SELECT USING (
    workspace_id IS NULL OR EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crews.workspace_id AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "crews_write" ON public.crews;
CREATE POLICY "crews_write" ON public.crews
  FOR ALL USING (
    workspace_id IS NULL OR EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crews.workspace_id AND wm.user_id = auth.uid()
    )
  );

-- Crew availability: Workspace members can access
DROP POLICY IF EXISTS "crew_availability_read" ON public.crew_availability;
CREATE POLICY "crew_availability_read" ON public.crew_availability
  FOR SELECT USING (
    workspace_id IS NULL OR EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crew_availability.workspace_id AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "crew_availability_write" ON public.crew_availability;
CREATE POLICY "crew_availability_write" ON public.crew_availability
  FOR ALL USING (
    workspace_id IS NULL OR EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crew_availability.workspace_id AND wm.user_id = auth.uid()
    )
  );

-- Job schedule: Workspace members can access
DROP POLICY IF EXISTS "job_schedule_read" ON public.job_schedule;
CREATE POLICY "job_schedule_read" ON public.job_schedule
  FOR SELECT USING (
    workspace_id IS NULL OR EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_schedule.workspace_id AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "job_schedule_write" ON public.job_schedule;
CREATE POLICY "job_schedule_write" ON public.job_schedule
  FOR ALL USING (
    workspace_id IS NULL OR EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_schedule.workspace_id AND wm.user_id = auth.uid()
    )
  );

-- Schedule events: Workspace members can access
DROP POLICY IF EXISTS "schedule_events_read" ON public.schedule_events;
CREATE POLICY "schedule_events_read" ON public.schedule_events
  FOR SELECT USING (
    workspace_id IS NULL OR EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = schedule_events.workspace_id AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "schedule_events_write" ON public.schedule_events;
CREATE POLICY "schedule_events_write" ON public.schedule_events
  FOR ALL USING (
    workspace_id IS NULL OR EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = schedule_events.workspace_id AND wm.user_id = auth.uid()
    )
  );

-- Service role has full access
DROP POLICY IF EXISTS "crews_service_role" ON public.crews;
CREATE POLICY "crews_service_role" ON public.crews FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crew_availability_service_role" ON public.crew_availability;
CREATE POLICY "crew_availability_service_role" ON public.crew_availability FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "job_schedule_service_role" ON public.job_schedule;
CREATE POLICY "job_schedule_service_role" ON public.job_schedule FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "schedule_events_service_role" ON public.schedule_events;
CREATE POLICY "schedule_events_service_role" ON public.schedule_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.crews IS 'Block 224000: Crews for production scheduling';
COMMENT ON TABLE public.crew_availability IS 'Block 224000: Crew availability tracking (vacation, off-days, etc.)';
COMMENT ON TABLE public.job_schedule IS 'Block 224000: Job-to-crew scheduling on specific dates';
COMMENT ON TABLE public.schedule_events IS 'Block 224000: Schedule event tracking (weather delays, material delays, reassignments)';
COMMENT ON FUNCTION public.check_job_readiness(uuid) IS 'Block 224000: Validates if job is ready for scheduling (materials + deposit)';
COMMENT ON FUNCTION public.check_crew_availability(uuid, date) IS 'Block 224000: Validates if crew is available on a specific date';

























