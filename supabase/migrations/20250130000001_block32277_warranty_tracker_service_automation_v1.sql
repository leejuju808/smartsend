-- =========================================================
-- Block 32277 — SmartSend Roofing "Warranty Tracker + Service Visit Automation" v1
-- (Track every homeowner's warranty • Auto-schedule annual inspections • Generate service revenue • Reduce callbacks and complaints)
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE warranties TABLE
-- ============================================================================
-- Automatically created when a job hits Completed
-- Fields: warranty type, start date, expiration date, inspection frequency, notes

CREATE TABLE IF NOT EXISTS public.warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  homeowner_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  warranty_type text, -- 'workmanship', 'manufacturer', 'combined'
  start_date date NOT NULL DEFAULT current_date,
  expiration_date date NOT NULL,
  inspection_frequency int DEFAULT 365, -- days (default: yearly)
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranties_job ON public.warranties(job_id);
CREATE INDEX IF NOT EXISTS idx_warranties_homeowner ON public.warranties(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_warranties_expiration ON public.warranties(expiration_date);
CREATE INDEX IF NOT EXISTS idx_warranties_active ON public.warranties(expiration_date) WHERE expiration_date >= current_date;

COMMENT ON TABLE public.warranties IS 'Block 32277: Warranty records for completed jobs';
COMMENT ON COLUMN public.warranties.inspection_frequency IS 'Block 32277: Inspection frequency in days (default: 365 = yearly)';

-- ============================================================================
-- PART 2 — CREATE warranty_inspections TABLE
-- ============================================================================
-- Tracks scheduled and completed annual inspections

CREATE TABLE IF NOT EXISTS public.warranty_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_id uuid NOT NULL REFERENCES public.warranties(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranty_inspections_warranty ON public.warranty_inspections(warranty_id);
CREATE INDEX IF NOT EXISTS idx_warranty_inspections_due_date ON public.warranty_inspections(due_date) WHERE completed = false;
CREATE INDEX IF NOT EXISTS idx_warranty_inspections_completed ON public.warranty_inspections(completed);

COMMENT ON TABLE public.warranty_inspections IS 'Block 32277: Annual inspection tracking for warranties';

-- ============================================================================
-- PART 3 — CREATE warranty_claims TABLE
-- ============================================================================
-- Warranty claim intake when homeowner reports issues

CREATE TABLE IF NOT EXISTS public.warranty_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_id uuid NOT NULL REFERENCES public.warranties(id) ON DELETE CASCADE,
  issue text NOT NULL,
  homeowner_message text,
  status text DEFAULT 'open' CHECK (status IN ('open', 'scheduled', 'resolved', 'denied')),
  technician text,
  scheduled_for date,
  resolution text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranty_claims_warranty ON public.warranty_claims(warranty_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_status ON public.warranty_claims(status);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_open ON public.warranty_claims(status) WHERE status = 'open';

COMMENT ON TABLE public.warranty_claims IS 'Block 32277: Warranty claim intake and tracking';

-- ============================================================================
-- PART 4 — CREATE service_visits TABLE
-- ============================================================================
-- Service visit workflow for small repairs, tune-ups, storm checks, etc.

CREATE TABLE IF NOT EXISTS public.service_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_id uuid REFERENCES public.warranties(id) ON DELETE SET NULL,
  homeowner_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  scheduled_for date,
  technician text,
  notes text,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_visits_warranty ON public.service_visits(warranty_id);
CREATE INDEX IF NOT EXISTS idx_service_visits_homeowner ON public.service_visits(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_service_visits_scheduled ON public.service_visits(scheduled_for) WHERE completed = false;
CREATE INDEX IF NOT EXISTS idx_service_visits_completed ON public.service_visits(completed);

COMMENT ON TABLE public.service_visits IS 'Block 32277: Service visit tracking for warranty-related repairs and maintenance';

-- ============================================================================
-- PART 5 — TRIGGER: Create warranty on job completion
-- ============================================================================
-- Automatically creates warranty when job stage changes to 'completed'

CREATE OR REPLACE FUNCTION public.create_warranty_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_warranty_id uuid;
  v_expiration_date date;
BEGIN
  -- Only trigger when stage changes to 'completed'
  IF NEW.stage = 'completed' AND (OLD.stage IS NULL OR OLD.stage != 'completed') THEN
    -- Check if warranty already exists
    SELECT id INTO v_warranty_id
    FROM public.warranties
    WHERE job_id = NEW.id;
    
    -- Only create if warranty doesn't exist
    IF v_warranty_id IS NULL THEN
      -- Calculate expiration date (5 years from today for workmanship warranty)
      v_expiration_date := (now() + interval '5 years')::date;
      
      -- Create warranty record
      INSERT INTO public.warranties (
        job_id,
        homeowner_id,
        warranty_type,
        start_date,
        expiration_date,
        inspection_frequency
      )
      VALUES (
        NEW.id,
        NEW.lead_id,
        'workmanship',
        now()::date,
        v_expiration_date,
        365 -- Default: yearly inspections
      )
      RETURNING id INTO v_warranty_id;
      
      -- Create first annual inspection (1 year from now)
      INSERT INTO public.warranty_inspections (
        warranty_id,
        due_date
      )
      VALUES (
        v_warranty_id,
        (now() + interval '1 year')::date
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS warranty_create_trigger ON public.jobs;
CREATE TRIGGER warranty_create_trigger
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  WHEN (NEW.stage = 'completed' AND (OLD.stage IS NULL OR OLD.stage IS DISTINCT FROM NEW.stage))
  EXECUTE FUNCTION public.create_warranty_on_completion();

COMMENT ON FUNCTION public.create_warranty_on_completion IS 'Block 32277: Automatically creates warranty when job is completed';

-- ============================================================================
-- PART 6 — FUNCTION: Schedule next inspection
-- ============================================================================
-- Creates next annual inspection after one is completed

CREATE OR REPLACE FUNCTION public.schedule_next_inspection(p_warranty_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_warranty RECORD;
  v_next_due_date date;
  v_inspection_id uuid;
BEGIN
  -- Get warranty details
  SELECT * INTO v_warranty
  FROM public.warranties
  WHERE id = p_warranty_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Warranty not found';
  END IF;
  
  -- Calculate next inspection date (inspection_frequency days from now)
  v_next_due_date := (now() + (v_warranty.inspection_frequency || ' days')::interval)::date;
  
  -- Create next inspection
  INSERT INTO public.warranty_inspections (
    warranty_id,
    due_date
  )
  VALUES (
    p_warranty_id,
    v_next_due_date
  )
  RETURNING id INTO v_inspection_id;
  
  RETURN v_inspection_id;
END;
$$;

COMMENT ON FUNCTION public.schedule_next_inspection IS 'Block 32277: Schedules next annual inspection after one is completed';

-- ============================================================================
-- PART 7 — TRIGGERS: Update updated_at timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_warranty_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_warranties_updated_at
  BEFORE UPDATE ON public.warranties
  FOR EACH ROW
  EXECUTE FUNCTION public.set_warranty_updated_at();

CREATE TRIGGER trg_warranty_inspections_updated_at
  BEFORE UPDATE ON public.warranty_inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_warranty_updated_at();

CREATE TRIGGER trg_warranty_claims_updated_at
  BEFORE UPDATE ON public.warranty_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.set_warranty_updated_at();

CREATE TRIGGER trg_service_visits_updated_at
  BEFORE UPDATE ON public.service_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_warranty_updated_at();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_visits ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view warranties for jobs in their teams
CREATE POLICY "Users can view warranties in their teams"
  ON public.warranties FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = warranties.job_id AND tm.user_id = auth.uid()
    )
  );

-- Policy: Users can manage warranties in their teams
CREATE POLICY "Users can manage warranties in their teams"
  ON public.warranties FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = warranties.job_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = warranties.job_id AND tm.user_id = auth.uid()
    )
  );

-- Policy: Users can view warranty inspections in their teams
CREATE POLICY "Users can view warranty inspections in their teams"
  ON public.warranty_inspections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.warranties w
      JOIN public.jobs j ON w.job_id = j.id
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE w.id = warranty_inspections.warranty_id AND tm.user_id = auth.uid()
    )
  );

-- Policy: System can manage warranty inspections (for automated reminders)
CREATE POLICY "System can manage warranty inspections"
  ON public.warranty_inspections FOR ALL
  WITH CHECK (true);

-- Policy: Users can view warranty claims in their teams
CREATE POLICY "Users can view warranty claims in their teams"
  ON public.warranty_claims FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.warranties w
      JOIN public.jobs j ON w.job_id = j.id
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE w.id = warranty_claims.warranty_id AND tm.user_id = auth.uid()
    )
  );

-- Policy: Users can manage warranty claims in their teams
CREATE POLICY "Users can manage warranty claims in their teams"
  ON public.warranty_claims FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.warranties w
      JOIN public.jobs j ON w.job_id = j.id
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE w.id = warranty_claims.warranty_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.warranties w
      JOIN public.jobs j ON w.job_id = j.id
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE w.id = warranty_claims.warranty_id AND tm.user_id = auth.uid()
    )
  );

-- Policy: Users can view service visits in their teams
CREATE POLICY "Users can view service visits in their teams"
  ON public.service_visits FOR SELECT
  USING (
    (warranty_id IS NULL OR EXISTS (
      SELECT 1 FROM public.warranties w
      JOIN public.jobs j ON w.job_id = j.id
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE w.id = service_visits.warranty_id AND tm.user_id = auth.uid()
    ))
    OR
    (homeowner_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l
      JOIN public.jobs j ON l.id = j.lead_id
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE l.id = service_visits.homeowner_id AND tm.user_id = auth.uid()
    ))
  );

-- Policy: Users can manage service visits in their teams
CREATE POLICY "Users can manage service visits in their teams"
  ON public.service_visits FOR ALL
  USING (
    (warranty_id IS NULL OR EXISTS (
      SELECT 1 FROM public.warranties w
      JOIN public.jobs j ON w.job_id = j.id
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE w.id = service_visits.warranty_id AND tm.user_id = auth.uid()
    ))
    OR
    (homeowner_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l
      JOIN public.jobs j ON l.id = j.lead_id
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE l.id = service_visits.homeowner_id AND tm.user_id = auth.uid()
    ))
  )
  WITH CHECK (
    (warranty_id IS NULL OR EXISTS (
      SELECT 1 FROM public.warranties w
      JOIN public.jobs j ON w.job_id = j.id
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE w.id = service_visits.warranty_id AND tm.user_id = auth.uid()
    ))
    OR
    (homeowner_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.leads l
      JOIN public.jobs j ON l.id = j.lead_id
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE l.id = service_visits.homeowner_id AND tm.user_id = auth.uid()
    ))
  );

-- ============================================================================
-- PART 9 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_inspections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_visits TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_warranty_on_completion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_next_inspection(uuid) TO authenticated;

































