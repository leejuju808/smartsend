-- =========================================================
-- Block 28000 — SmartSend Roofing Warranty & Service Call Engine v1
-- (Track warranties • Auto check-ins • Manage repairs • Build long-term relationship & referral pipeline)
-- =========================================================
-- 
-- This block transforms SmartSend from "job software" into a lifetime customer system.
-- 
-- Most roofers close the job and never talk to the homeowner again.
-- This kills:
-- - Referral pipelines
-- - Review opportunities
-- - Warranty trust
-- - Long-term brand reputation
-- - Add-on service revenue (repairs, gutters, insulation, ventilation upgrades, etc.)
-- 
-- SmartSend will now:
-- Track warranty periods, automatically trigger customer check-ins, log service calls, 
-- schedule repair crews, and generate warranty documentation — all tied to the original job.
-- 
-- This is how you build repeat customer value and protect the company from warranty disasters.

-- ============================================================================
-- PART 1 — CREATE roofing_warranties TABLE
-- ============================================================================
-- Warranty Registry: Tracks warranty periods for each completed job

CREATE TABLE IF NOT EXISTS public.roofing_warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  warranty_type text CHECK (warranty_type IN ('labor', 'material', 'combined')) DEFAULT 'combined',
  labor_years integer DEFAULT 5,
  material_years integer DEFAULT 30,
  
  start_date date NOT NULL DEFAULT current_date,
  end_date date, -- Calculated based on start_date + material_years (longest warranty)
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_warranties_job ON public.roofing_warranties(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_warranties_workspace ON public.roofing_warranties(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roofing_warranties_start_date ON public.roofing_warranties(start_date);
CREATE INDEX IF NOT EXISTS idx_roofing_warranties_end_date ON public.roofing_warranties(end_date);

COMMENT ON TABLE public.roofing_warranties IS 'Block 28000: Warranty registry for completed roofing jobs';
COMMENT ON COLUMN public.roofing_warranties.warranty_type IS 'Block 28000: Type of warranty - labor, material, or combined';
COMMENT ON COLUMN public.roofing_warranties.labor_years IS 'Block 28000: Labor warranty period in years';
COMMENT ON COLUMN public.roofing_warranties.material_years IS 'Block 28000: Material warranty period in years';

-- ============================================================================
-- PART 2 — CREATE roofing_warranty_events TABLE
-- ============================================================================
-- Warranty Events: Auto check-ins scheduled throughout warranty period

CREATE TABLE IF NOT EXISTS public.roofing_warranty_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_id uuid NOT NULL REFERENCES public.roofing_warranties(id) ON DELETE CASCADE,
  
  event_type text CHECK (event_type IN ('6_month_check', 'annual_check', 'storm_check', 'custom')) NOT NULL,
  due_date date NOT NULL,
  
  sent boolean DEFAULT false,
  sent_at timestamptz,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(warranty_id, event_type, due_date)
);

CREATE INDEX IF NOT EXISTS idx_warranty_events_warranty ON public.roofing_warranty_events(warranty_id);
CREATE INDEX IF NOT EXISTS idx_warranty_events_due_date ON public.roofing_warranty_events(due_date) WHERE sent = false;
CREATE INDEX IF NOT EXISTS idx_warranty_events_type ON public.roofing_warranty_events(event_type);

COMMENT ON TABLE public.roofing_warranty_events IS 'Block 28000: Scheduled warranty check-in events';
COMMENT ON COLUMN public.roofing_warranty_events.event_type IS 'Block 28000: Type of check-in event';
COMMENT ON COLUMN public.roofing_warranty_events.sent IS 'Block 28000: Whether check-in message has been sent';

-- ============================================================================
-- PART 3 — CREATE roofing_service_calls TABLE
-- ============================================================================
-- Service Call Tickets: Tracks repair requests and warranty service calls

CREATE TABLE IF NOT EXISTS public.roofing_service_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  warranty_id uuid REFERENCES public.roofing_warranties(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  homeowner_message text,
  issue_type text, -- 'leak', 'shingle_loss', 'vent_issue', 'flashing', 'other'
  severity text CHECK (severity IN ('low', 'medium', 'high')) DEFAULT 'low',
  
  source text CHECK (source IN ('homeowner', 'auto_checkin', 'internal')) DEFAULT 'homeowner',
  
  status text CHECK (
    status IN ('open', 'assigned', 'in_progress', 'completed', 'closed', 'cancelled')
  ) DEFAULT 'open',
  
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  scheduled_date date,
  completed_at timestamptz,
  
  materials_needed text,
  notes text,
  is_warranty_covered boolean DEFAULT true,
  billable_amount numeric(12,2),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_calls_job ON public.roofing_service_calls(job_id);
CREATE INDEX IF NOT EXISTS idx_service_calls_warranty ON public.roofing_service_calls(warranty_id);
CREATE INDEX IF NOT EXISTS idx_service_calls_workspace ON public.roofing_service_calls(workspace_id);
CREATE INDEX IF NOT EXISTS idx_service_calls_status ON public.roofing_service_calls(status);
CREATE INDEX IF NOT EXISTS idx_service_calls_crew ON public.roofing_service_calls(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_calls_scheduled_date ON public.roofing_service_calls(scheduled_date) WHERE status IN ('open', 'assigned', 'in_progress');

COMMENT ON TABLE public.roofing_service_calls IS 'Block 28000: Service call tickets for warranty repairs and maintenance';
COMMENT ON COLUMN public.roofing_service_calls.source IS 'Block 28000: How the service call was created';
COMMENT ON COLUMN public.roofing_service_calls.is_warranty_covered IS 'Block 28000: Whether this service call is covered under warranty';

-- ============================================================================
-- PART 4 — CREATE roofing_service_call_photos TABLE
-- ============================================================================
-- Service Call Photos: Before/after photos for service calls

CREATE TABLE IF NOT EXISTS public.roofing_service_call_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_call_id uuid NOT NULL REFERENCES public.roofing_service_calls(id) ON DELETE CASCADE,
  
  url text NOT NULL,
  category text CHECK (category IN ('before', 'after', 'damage', 'repair', 'other')),
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_call_photos_service_call ON public.roofing_service_call_photos(service_call_id);
CREATE INDEX IF NOT EXISTS idx_service_call_photos_category ON public.roofing_service_call_photos(category);

COMMENT ON TABLE public.roofing_service_call_photos IS 'Block 28000: Photos associated with service calls';

-- ============================================================================
-- PART 5 — TRIGGER: Auto-create warranty when job is completed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_warranty_after_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_warranty_id uuid;
BEGIN
  -- Only create warranty when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Check if warranty already exists
    SELECT id INTO v_warranty_id
    FROM public.roofing_warranties
    WHERE job_id = NEW.id;
    
    -- Only create if warranty doesn't exist
    IF v_warranty_id IS NULL THEN
      INSERT INTO public.roofing_warranties (
        job_id,
        workspace_id,
        warranty_type,
        labor_years,
        material_years,
        start_date,
        end_date
      )
      VALUES (
        NEW.id,
        NEW.workspace_id,
        'combined',
        5,
        30,
        COALESCE(NEW.scheduled_end_date::date, current_date),
        COALESCE(NEW.scheduled_end_date::date, current_date) + interval '30 years'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_warranty_after_completion ON public.roofing_jobs;
CREATE TRIGGER trg_create_warranty_after_completion
  AFTER UPDATE ON public.roofing_jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.create_warranty_after_completion();

COMMENT ON FUNCTION public.create_warranty_after_completion IS 'Block 28000: Automatically creates warranty when job status changes to completed';

-- ============================================================================
-- PART 6 — FUNCTION: Calculate warranty end date
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_warranty_end_date(
  p_start_date date,
  p_material_years integer
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_start_date + (p_material_years || ' years')::interval;
END;
$$;

COMMENT ON FUNCTION public.calculate_warranty_end_date IS 'Block 28000: Calculates warranty end date based on start date and material years';

-- ============================================================================
-- PART 7 — TRIGGERS: Update updated_at timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_roofing_warranties_updated_at
  BEFORE UPDATE ON public.roofing_warranties
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_roofing_warranty_events_updated_at
  BEFORE UPDATE ON public.roofing_warranty_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_roofing_service_calls_updated_at
  BEFORE UPDATE ON public.roofing_service_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.roofing_warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_warranty_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_service_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_service_call_photos ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view warranties in their workspace
CREATE POLICY "Users can view warranties in their workspace"
  ON public.roofing_warranties FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can manage warranties in their workspace
CREATE POLICY "Users can manage warranties in their workspace"
  ON public.roofing_warranties FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can view warranty events in their workspace
CREATE POLICY "Users can view warranty events in their workspace"
  ON public.roofing_warranty_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_warranties w
      WHERE w.id = roofing_warranty_events.warranty_id
      AND w.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: System can manage warranty events
CREATE POLICY "System can manage warranty events"
  ON public.roofing_warranty_events FOR ALL
  WITH CHECK (true);

-- Policy: Users can view service calls in their workspace
CREATE POLICY "Users can view service calls in their workspace"
  ON public.roofing_service_calls FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can manage service calls in their workspace
CREATE POLICY "Users can manage service calls in their workspace"
  ON public.roofing_service_calls FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can view service call photos in their workspace
CREATE POLICY "Users can view service call photos in their workspace"
  ON public.roofing_service_call_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_service_calls sc
      WHERE sc.id = roofing_service_call_photos.service_call_id
      AND sc.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Users can manage service call photos in their workspace
CREATE POLICY "Users can manage service call photos in their workspace"
  ON public.roofing_service_call_photos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_service_calls sc
      WHERE sc.id = roofing_service_call_photos.service_call_id
      AND sc.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_service_calls sc
      WHERE sc.id = roofing_service_call_photos.service_call_id
      AND sc.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- PART 9 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_warranties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_warranty_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_service_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_service_call_photos TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_warranty_end_date(date, integer) TO authenticated;



































