-- ============================================================
-- Block 92000 — SmartSend Roofing "Warranty System + Service Tickets + Repair Tracking" v1
-- ============================================================
-- 
-- This block turns SmartSend into a long-term revenue engine, not just a "job → done → goodbye" system.
-- 
-- Features:
-- - Warranty lifetime tracking
-- - Service ticket workflow
-- - Repair management
-- - Homeowner service request portal
-- - Warranty coverage checker
-- - Repair crew scheduling
-- - Service revenue tracking
-- ============================================================

-- ============================================================================
-- PART 1 — CREATE warranties TABLE
-- ============================================================================
-- Tracks warranties for every completed job

CREATE TABLE IF NOT EXISTS public.warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Homeowner info
  homeowner_name text NOT NULL,
  homeowner_email text,
  homeowner_phone text,
  
  -- Warranty details
  warranty_type text NOT NULL CHECK (warranty_type IN (
    'workmanship',
    'manufacturer',
    'extended',
    'lifetime',
    'limited',
    'other'
  )),
  warranty_length_years integer, -- e.g., 5, 10, 25, lifetime = NULL
  start_date date NOT NULL,
  end_date date,
  coverage_description text,
  
  -- Status
  is_active boolean DEFAULT true,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranties_workspace ON public.warranties(workspace_id);
CREATE INDEX IF NOT EXISTS idx_warranties_job ON public.warranties(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranties_active ON public.warranties(workspace_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_warranties_end_date ON public.warranties(end_date) WHERE end_date IS NOT NULL;

-- ============================================================================
-- PART 2 — CREATE service_tickets TABLE
-- ============================================================================
-- Service tickets for repairs and warranty claims

CREATE TABLE IF NOT EXISTS public.service_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  warranty_id uuid REFERENCES public.warranties(id) ON DELETE SET NULL,
  
  -- Homeowner info
  homeowner_name text NOT NULL,
  homeowner_email text,
  homeowner_phone text,
  homeowner_address text,
  
  -- Issue details
  issue_description text NOT NULL,
  issue_category text CHECK (issue_category IN (
    'nail_pop',
    'missing_shingle',
    'leak',
    'vent_issue',
    'flashing_failure',
    'storm_damage',
    'warranty_claim',
    'maintenance',
    'other'
  )),
  
  -- Status tracking
  ticket_status text NOT NULL DEFAULT 'open' CHECK (ticket_status IN (
    'open',
    'scheduled',
    'in_progress',
    'completed',
    'closed'
  )),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN (
    'low',
    'normal',
    'high',
    'emergency'
  )),
  
  -- Warranty coverage
  is_warranty_covered boolean DEFAULT false,
  warranty_coverage_notes text,
  should_charge_homeowner boolean DEFAULT false,
  
  -- Financial tracking
  labor_cost numeric DEFAULT 0,
  material_cost numeric DEFAULT 0,
  total_cost numeric GENERATED ALWAYS AS (labor_cost + material_cost) STORED,
  charged_amount numeric DEFAULT 0,
  is_paid boolean DEFAULT false,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  scheduled_date date,
  completed_at timestamptz,
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_service_tickets_workspace ON public.service_tickets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_service_tickets_job ON public.service_tickets(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tickets_warranty ON public.service_tickets(warranty_id) WHERE warranty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tickets_status ON public.service_tickets(workspace_id, ticket_status);
CREATE INDEX IF NOT EXISTS idx_service_tickets_priority ON public.service_tickets(workspace_id, priority) WHERE priority IN ('high', 'emergency');
CREATE INDEX IF NOT EXISTS idx_service_tickets_scheduled_date ON public.service_tickets(scheduled_date) WHERE scheduled_date IS NOT NULL;

-- ============================================================================
-- PART 3 — CREATE service_ticket_photos TABLE
-- ============================================================================
-- Photos attached to service tickets

CREATE TABLE IF NOT EXISTS public.service_ticket_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  photo_type text CHECK (photo_type IN (
    'before',
    'damage',
    'during',
    'after',
    'other'
  )) DEFAULT 'other',
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_ticket_photos_ticket ON public.service_ticket_photos(ticket_id);

-- ============================================================================
-- PART 4 — CREATE service_actions TABLE
-- ============================================================================
-- Tracks all actions taken on a service ticket

CREATE TABLE IF NOT EXISTS public.service_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN (
    'inspection',
    'repair',
    'part_order',
    'completion',
    'notes',
    'status_change',
    'crew_assigned',
    'cost_update'
  )),
  description text NOT NULL,
  cost numeric DEFAULT 0,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_actions_ticket ON public.service_actions(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_actions_type ON public.service_actions(ticket_id, action_type);
CREATE INDEX IF NOT EXISTS idx_service_actions_created ON public.service_actions(ticket_id, created_at DESC);

-- ============================================================================
-- PART 5 — CREATE service_assignments TABLE
-- ============================================================================
-- Links service tickets to repair crews

CREATE TABLE IF NOT EXISTS public.service_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'in_progress',
    'completed',
    'cancelled'
  )),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_assignments_ticket ON public.service_assignments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_assignments_crew ON public.service_assignments(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_assignments_scheduled_date ON public.service_assignments(scheduled_date, status);

-- ============================================================================
-- PART 6 — CREATE TRIGGERS
-- ============================================================================

-- Update updated_at timestamps
CREATE OR REPLACE FUNCTION update_warranties_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_warranties_updated_at
BEFORE UPDATE ON public.warranties
FOR EACH ROW
EXECUTE FUNCTION update_warranties_updated_at();

CREATE OR REPLACE FUNCTION update_service_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_service_tickets_updated_at
BEFORE UPDATE ON public.service_tickets
FOR EACH ROW
EXECUTE FUNCTION update_service_tickets_updated_at();

CREATE OR REPLACE FUNCTION update_service_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_service_assignments_updated_at
BEFORE UPDATE ON public.service_assignments
FOR EACH ROW
EXECUTE FUNCTION update_service_assignments_updated_at();

-- Auto-calculate end_date for warranties based on length
CREATE OR REPLACE FUNCTION calculate_warranty_end_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.warranty_length_years IS NOT NULL AND NEW.start_date IS NOT NULL THEN
    NEW.end_date := NEW.start_date + (NEW.warranty_length_years || ' years')::interval;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_warranty_end_date
BEFORE INSERT OR UPDATE ON public.warranties
FOR EACH ROW
WHEN (NEW.warranty_length_years IS NOT NULL)
EXECUTE FUNCTION calculate_warranty_end_date();

-- Auto-update ticket completed_at when status changes to completed
CREATE OR REPLACE FUNCTION update_ticket_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_status = 'completed' AND OLD.ticket_status != 'completed' THEN
    NEW.completed_at := now();
  END IF;
  IF NEW.ticket_status = 'closed' AND OLD.ticket_status != 'closed' THEN
    NEW.closed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_ticket_completed_at
BEFORE UPDATE ON public.service_tickets
FOR EACH ROW
EXECUTE FUNCTION update_ticket_completed_at();

-- ============================================================================
-- PART 7 — CREATE WARRANTY COVERAGE CHECKER FUNCTION
-- ============================================================================
-- Determines if an issue is covered by warranty

CREATE OR REPLACE FUNCTION check_warranty_coverage(
  p_ticket_id uuid,
  p_issue_category text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket RECORD;
  v_warranty RECORD;
  v_is_covered boolean := false;
  v_coverage_notes text;
  v_should_charge boolean := false;
BEGIN
  -- Get ticket info
  SELECT * INTO v_ticket
  FROM public.service_tickets
  WHERE id = p_ticket_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'Ticket not found'
    );
  END IF;
  
  -- Get warranty if exists
  IF v_ticket.warranty_id IS NOT NULL THEN
    SELECT * INTO v_warranty
    FROM public.warranties
    WHERE id = v_ticket.warranty_id
      AND is_active = true;
    
    IF FOUND THEN
      -- Check if warranty is still active
      IF v_warranty.end_date IS NULL OR v_warranty.end_date >= CURRENT_DATE THEN
        -- Check if issue category is typically covered
        -- Workmanship warranties typically cover installation issues
        IF v_warranty.warranty_type IN ('workmanship', 'extended', 'lifetime') THEN
          IF p_issue_category IN ('nail_pop', 'missing_shingle', 'flashing_failure', 'vent_issue') THEN
            v_is_covered := true;
            v_coverage_notes := 'Covered under ' || v_warranty.warranty_type || ' warranty';
          ELSIF p_issue_category = 'leak' AND v_warranty.warranty_type IN ('workmanship', 'extended', 'lifetime') THEN
            v_is_covered := true;
            v_coverage_notes := 'Leak covered under ' || v_warranty.warranty_type || ' warranty';
          ELSIF p_issue_category = 'storm_damage' THEN
            v_is_covered := false;
            v_should_charge := true;
            v_coverage_notes := 'Storm damage typically not covered by workmanship warranty';
          ELSE
            v_is_covered := false;
            v_should_charge := true;
            v_coverage_notes := 'Issue may not be covered - review required';
          END IF;
        ELSIF v_warranty.warranty_type = 'manufacturer' THEN
          -- Manufacturer warranties typically cover material defects
          IF p_issue_category IN ('missing_shingle') THEN
            v_is_covered := true;
            v_coverage_notes := 'Covered under manufacturer warranty';
          ELSE
            v_is_covered := false;
            v_should_charge := true;
            v_coverage_notes := 'Manufacturer warranty typically covers material defects only';
          END IF;
        END IF;
      ELSE
        v_is_covered := false;
        v_should_charge := true;
        v_coverage_notes := 'Warranty expired on ' || v_warranty.end_date::text;
      END IF;
    ELSE
      v_is_covered := false;
      v_should_charge := true;
      v_coverage_notes := 'No active warranty found';
    END IF;
  ELSE
    v_is_covered := false;
    v_should_charge := true;
    v_coverage_notes := 'No warranty linked to this ticket';
  END IF;
  
  -- Update ticket with coverage determination
  UPDATE public.service_tickets
  SET 
    is_warranty_covered = v_is_covered,
    warranty_coverage_notes = v_coverage_notes,
    should_charge_homeowner = v_should_charge
  WHERE id = p_ticket_id;
  
  -- Log action
  INSERT INTO public.service_actions (
    ticket_id,
    action_type,
    description
  ) VALUES (
    p_ticket_id,
    'notes',
    'Warranty coverage checked: ' || v_coverage_notes
  );
  
  RETURN jsonb_build_object(
    'is_covered', v_is_covered,
    'coverage_notes', v_coverage_notes,
    'should_charge', v_should_charge
  );
END;
$$;

COMMENT ON FUNCTION check_warranty_coverage IS 'Block 92000: Checks if a service ticket issue is covered by warranty';

-- ============================================================================
-- PART 8 — ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_ticket_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_assignments ENABLE ROW LEVEL SECURITY;

-- Warranties: Workspace members can view/manage warranties in their workspace
CREATE POLICY "warranties_select_workspace"
  ON public.warranties FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "warranties_insert_workspace"
  ON public.warranties FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "warranties_update_workspace"
  ON public.warranties FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Service tickets: Workspace members can view/manage tickets in their workspace
CREATE POLICY "service_tickets_select_workspace"
  ON public.service_tickets FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_tickets_insert_workspace"
  ON public.service_tickets FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_tickets_update_workspace"
  ON public.service_tickets FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Service ticket photos: Accessible via ticket
CREATE POLICY "service_ticket_photos_select_workspace"
  ON public.service_ticket_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      JOIN public.workspace_members wm ON st.workspace_id = wm.workspace_id
      WHERE st.id = service_ticket_photos.ticket_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "service_ticket_photos_insert_workspace"
  ON public.service_ticket_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      JOIN public.workspace_members wm ON st.workspace_id = wm.workspace_id
      WHERE st.id = service_ticket_photos.ticket_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service actions: Accessible via ticket
CREATE POLICY "service_actions_select_workspace"
  ON public.service_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      JOIN public.workspace_members wm ON st.workspace_id = wm.workspace_id
      WHERE st.id = service_actions.ticket_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "service_actions_insert_workspace"
  ON public.service_actions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      JOIN public.workspace_members wm ON st.workspace_id = wm.workspace_id
      WHERE st.id = service_actions.ticket_id
        AND wm.user_id = auth.uid()
    )
  );

-- Service assignments: Accessible via ticket
CREATE POLICY "service_assignments_select_workspace"
  ON public.service_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      JOIN public.workspace_members wm ON st.workspace_id = wm.workspace_id
      WHERE st.id = service_assignments.ticket_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "service_assignments_insert_workspace"
  ON public.service_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      JOIN public.workspace_members wm ON st.workspace_id = wm.workspace_id
      WHERE st.id = service_assignments.ticket_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "service_assignments_update_workspace"
  ON public.service_assignments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      JOIN public.workspace_members wm ON st.workspace_id = wm.workspace_id
      WHERE st.id = service_assignments.ticket_id
        AND wm.user_id = auth.uid()
    )
  );

-- Allow service role full access
CREATE POLICY "warranties_service_role_all"
  ON public.warranties FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_tickets_service_role_all"
  ON public.service_tickets FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_ticket_photos_service_role_all"
  ON public.service_ticket_photos FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_actions_service_role_all"
  ON public.service_actions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_assignments_service_role_all"
  ON public.service_assignments FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
