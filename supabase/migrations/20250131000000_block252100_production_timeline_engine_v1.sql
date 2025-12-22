-- =========================================================
-- Block 252100 — SmartSend Production Timeline Engine v1
-- "Milestones, Task Dependencies, Gantt View, Auto-Foreman Notifications"
-- =========================================================
-- 
-- This is the feature that turns SmartSend into the brain of roofing production
-- — not just tracking work, but ORCHESTRATING it.
-- 
-- Roofers will tell EVERYONE:
-- "SmartSend literally runs our jobs for us.
-- We never miss steps anymore — zero chaos."
-- 
-- This is where SmartSend starts feeling like a $500/month+ premium operations platform.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE production_milestones TABLE
-- ============================================================================
-- Tracks every milestone in a job's production timeline

CREATE TABLE IF NOT EXISTS public.production_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  name text NOT NULL,                    -- "Material Delivery", "Tear-Off", "Install", etc.
  description text,
  scheduled_date date,
  due_date date,
  completed_date date,
  started_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'delayed')),
  depends_on uuid REFERENCES public.production_milestones(id) ON DELETE SET NULL,
  order_index int DEFAULT 0,             -- Order in the sequence (0, 1, 2, ...)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_milestones_job ON public.production_milestones(job_id);
CREATE INDEX IF NOT EXISTS idx_production_milestones_status ON public.production_milestones(job_id, status);
CREATE INDEX IF NOT EXISTS idx_production_milestones_depends_on ON public.production_milestones(depends_on) WHERE depends_on IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_production_milestones_order ON public.production_milestones(job_id, order_index);
CREATE INDEX IF NOT EXISTS idx_production_milestones_due_date ON public.production_milestones(due_date) WHERE due_date IS NOT NULL;

COMMENT ON TABLE public.production_milestones IS 'Production milestones for jobs (Block 252100)';
COMMENT ON COLUMN public.production_milestones.status IS 'Status: pending, in_progress, completed, delayed';
COMMENT ON COLUMN public.production_milestones.depends_on IS 'Milestone that must be completed before this one';

-- ============================================================================
-- PART 2 — CREATE milestone_blockers TABLE
-- ============================================================================
-- Tracks blockers that prevent milestone progress

CREATE TABLE IF NOT EXISTS public.milestone_blockers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.production_milestones(id) ON DELETE CASCADE,
  description text NOT NULL,
  blocker_type text CHECK (blocker_type IN ('safety_hazard', 'deck_rot', 'wrong_material', 'customer_unavailable', 'weather', 'permit', 'material_shortage', 'crew_unavailable', 'other')) DEFAULT 'other',
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  resolution_notes text
);

CREATE INDEX IF NOT EXISTS idx_milestone_blockers_milestone ON public.milestone_blockers(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_blockers_resolved ON public.milestone_blockers(milestone_id, resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_milestone_blockers_created_by ON public.milestone_blockers(created_by) WHERE created_by IS NOT NULL;

COMMENT ON TABLE public.milestone_blockers IS 'Blockers preventing milestone progress (Block 252100)';
COMMENT ON COLUMN public.milestone_blockers.blocker_type IS 'Type: safety_hazard, deck_rot, wrong_material, customer_unavailable, weather, permit, material_shortage, crew_unavailable, other';

-- ============================================================================
-- PART 3 — FUNCTION: Create Default Milestones for a Job
-- ============================================================================
-- Auto-generates the standard roofing workflow milestones

CREATE OR REPLACE FUNCTION create_default_milestones(p_job_id uuid)
RETURNS void AS $$
DECLARE
  milestone_names text[] := ARRAY[
    'Permit Submitted',
    'Permit Approved',
    'Material Ordered',
    'Material Delivered',
    'Tear-Off',
    'Deck Inspection',
    'Install',
    'Final Inspection',
    'Cleanup',
    'QC Walkthrough',
    'Job Complete'
  ];
  milestone_descriptions text[] := ARRAY[
    'Building permit application submitted to local authority',
    'Building permit approved and received',
    'Materials ordered from supplier',
    'Materials delivered to job site',
    'Old roofing removed from structure',
    'Deck inspection completed for damage/rot',
    'New roofing installed',
    'Final inspection by inspector',
    'Job site cleanup completed',
    'Quality control walkthrough with homeowner',
    'Job fully completed and signed off'
  ];
  i int;
  prev_milestone_id uuid := NULL;
  current_milestone_id uuid;
BEGIN
  -- Delete any existing milestones for this job (in case of re-run)
  DELETE FROM public.production_milestones WHERE job_id = p_job_id;
  
  -- Create each milestone with dependencies
  FOR i IN 1..array_length(milestone_names, 1)
  LOOP
    INSERT INTO public.production_milestones (
      job_id,
      name,
      description,
      status,
      depends_on,
      order_index
    )
    VALUES (
      p_job_id,
      milestone_names[i],
      milestone_descriptions[i],
      'pending',
      prev_milestone_id,
      i - 1
    )
    RETURNING id INTO current_milestone_id;
    
    prev_milestone_id := current_milestone_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_default_milestones IS 'Auto-creates default roofing milestones for a job (Block 252100)';

-- ============================================================================
-- PART 4 — FUNCTION: Check if Milestone Can Be Completed
-- ============================================================================
-- Validates that dependencies are met before allowing completion

CREATE OR REPLACE FUNCTION can_complete_milestone(p_milestone_id uuid)
RETURNS boolean AS $$
DECLARE
  dep_id uuid;
  dep_status text;
BEGIN
  -- Get the dependency milestone ID
  SELECT depends_on INTO dep_id 
  FROM public.production_milestones 
  WHERE id = p_milestone_id;
  
  -- If no dependency, can complete
  IF dep_id IS NULL THEN 
    RETURN true; 
  END IF;
  
  -- Check dependency status
  SELECT status INTO dep_status 
  FROM public.production_milestones 
  WHERE id = dep_id;
  
  -- Can only complete if dependency is completed
  RETURN dep_status = 'completed';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION can_complete_milestone IS 'Checks if milestone dependencies are met (Block 252100)';

-- ============================================================================
-- PART 5 — FUNCTION: Calculate Job Health Score
-- ============================================================================
-- Formula: 100 - (delayed milestones * 10) - (open blockers * 7) - (days behind * 5)

CREATE OR REPLACE FUNCTION calculate_job_health_score(p_job_id uuid)
RETURNS int AS $$
DECLARE
  delayed_count int;
  blocker_count int;
  days_behind int;
  health_score int;
BEGIN
  -- Count delayed milestones
  SELECT COUNT(*) INTO delayed_count
  FROM public.production_milestones
  WHERE job_id = p_job_id AND status = 'delayed';
  
  -- Count unresolved blockers
  SELECT COUNT(*) INTO blocker_count
  FROM public.milestone_blockers mb
  JOIN public.production_milestones pm ON pm.id = mb.milestone_id
  WHERE pm.job_id = p_job_id AND mb.resolved = false;
  
  -- Calculate days behind schedule (milestones past due_date)
  SELECT COALESCE(SUM(
    CASE 
      WHEN due_date < CURRENT_DATE AND status != 'completed' 
      THEN CURRENT_DATE - due_date 
      ELSE 0 
    END
  ), 0) INTO days_behind
  FROM public.production_milestones
  WHERE job_id = p_job_id;
  
  -- Calculate health score
  health_score := 100 - (delayed_count * 10) - (blocker_count * 7) - (days_behind * 5);
  
  -- Ensure score is between 0 and 100
  RETURN GREATEST(0, LEAST(100, health_score));
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_job_health_score IS 'Calculates job health score based on delays, blockers, and schedule (Block 252100)';

-- ============================================================================
-- PART 6 — TRIGGER: Auto-create Milestones on Job Creation
-- ============================================================================
-- Automatically creates default milestones when a job is created

CREATE OR REPLACE FUNCTION trigger_create_job_milestones()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create milestones if job has a company_id (production job)
  IF NEW.company_id IS NOT NULL THEN
    PERFORM create_default_milestones(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_job_milestones ON public.jobs;
CREATE TRIGGER trg_create_job_milestones
AFTER INSERT ON public.jobs
FOR EACH ROW
WHEN (NEW.company_id IS NOT NULL)
EXECUTE FUNCTION trigger_create_job_milestones();

-- ============================================================================
-- PART 7 — TRIGGER: Update Milestone Status with Validation
-- ============================================================================
-- Validates dependencies before allowing status changes

CREATE OR REPLACE FUNCTION trigger_validate_milestone_status()
RETURNS TRIGGER AS $$
DECLARE
  can_complete boolean;
BEGIN
  -- If trying to mark as completed, check dependencies
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    SELECT can_complete_milestone(NEW.id) INTO can_complete;
    
    IF NOT can_complete THEN
      RAISE EXCEPTION 'Cannot complete milestone. Dependency milestone must be completed first.';
    END IF;
    
    -- Set completed_date if not already set
    IF NEW.completed_date IS NULL THEN
      NEW.completed_date := CURRENT_DATE;
    END IF;
  END IF;
  
  -- If marking as in_progress, set started_date
  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
    IF NEW.started_date IS NULL THEN
      NEW.started_date := CURRENT_DATE;
    END IF;
  END IF;
  
  -- If marking as delayed, check if past due_date
  IF NEW.status = 'delayed' AND OLD.status != 'delayed' THEN
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      -- Already past due, status change is valid
      NULL;
    END IF;
  END IF;
  
  -- Update updated_at
  NEW.updated_at := now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_milestone_status ON public.production_milestones;
CREATE TRIGGER trg_validate_milestone_status
BEFORE UPDATE ON public.production_milestones
FOR EACH ROW
EXECUTE FUNCTION trigger_validate_milestone_status();

-- ============================================================================
-- PART 8 — TRIGGER: Auto-notify on Milestone Status Changes
-- ============================================================================
-- Sends notifications when milestones are completed, delayed, or dependencies unblocked

CREATE OR REPLACE FUNCTION trigger_milestone_notifications()
RETURNS TRIGGER AS $$
DECLARE
  job_record RECORD;
  next_milestone RECORD;
BEGIN
  -- Get job info
  SELECT j.*, rc.name as company_name
  INTO job_record
  FROM public.jobs j
  LEFT JOIN public.roofing_companies rc ON rc.id = j.company_id
  WHERE j.id = (SELECT job_id FROM public.production_milestones WHERE id = NEW.id);
  
  -- Milestone completed → notify about next step
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Find next milestone in sequence
    SELECT * INTO next_milestone
    FROM public.production_milestones
    WHERE job_id = NEW.job_id 
      AND depends_on = NEW.id
      AND status = 'pending'
    ORDER BY order_index
    LIMIT 1;
    
    IF next_milestone.id IS NOT NULL THEN
      -- Notify that next milestone can begin
      PERFORM pg_notify('milestone_completed', json_build_object(
        'job_id', job_record.id,
        'milestone_id', NEW.id,
        'milestone_name', NEW.name,
        'next_milestone_id', next_milestone.id,
        'next_milestone_name', next_milestone.name,
        'notification_type', 'milestone_completed',
        'message', 'Milestone "' || NEW.name || '" completed. Next step: ' || next_milestone.name || ' can now begin.'
      )::text);
    END IF;
  END IF;
  
  -- Milestone delayed → alert PM
  IF NEW.status = 'delayed' AND OLD.status != 'delayed' THEN
    PERFORM pg_notify('milestone_delayed', json_build_object(
      'job_id', job_record.id,
      'milestone_id', NEW.id,
      'milestone_name', NEW.name,
      'due_date', NEW.due_date,
      'notification_type', 'milestone_delayed',
      'message', 'Milestone "' || NEW.name || '" is delayed. PM Action Required.'
    )::text);
  END IF;
  
  -- Dependency unblocked → notify that dependent milestone can proceed
  IF OLD.status = 'delayed' AND NEW.status = 'completed' THEN
    -- Find milestones that depend on this one
    FOR next_milestone IN
      SELECT * FROM public.production_milestones
      WHERE job_id = NEW.job_id 
        AND depends_on = NEW.id
        AND status = 'pending'
    LOOP
      PERFORM pg_notify('dependency_unblocked', json_build_object(
        'job_id', job_record.id,
        'milestone_id', next_milestone.id,
        'milestone_name', next_milestone.name,
        'unblocked_by', NEW.name,
        'notification_type', 'dependency_unblocked',
        'message', 'Dependency resolved. "' || next_milestone.name || '" can now begin.'
      )::text);
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_milestone_notifications ON public.production_milestones;
CREATE TRIGGER trg_milestone_notifications
AFTER UPDATE ON public.production_milestones
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION trigger_milestone_notifications();

-- ============================================================================
-- PART 9 — FUNCTION: Reschedule Milestone and Shift Dependencies
-- ============================================================================
-- When a milestone is rescheduled, automatically shifts dependent milestones

CREATE OR REPLACE FUNCTION reschedule_milestone(
  p_milestone_id uuid,
  p_new_scheduled_date date,
  p_new_due_date date
)
RETURNS void AS $$
DECLARE
  milestone_record RECORD;
  days_shift int;
  dependent_milestone RECORD;
BEGIN
  -- Get the milestone
  SELECT * INTO milestone_record
  FROM public.production_milestones
  WHERE id = p_milestone_id;
  
  -- Calculate days to shift
  IF milestone_record.scheduled_date IS NOT NULL THEN
    days_shift := p_new_scheduled_date - milestone_record.scheduled_date;
  ELSE
    days_shift := 0;
  END IF;
  
  -- Update the milestone
  UPDATE public.production_milestones
  SET 
    scheduled_date = p_new_scheduled_date,
    due_date = p_new_due_date,
    updated_at = now()
  WHERE id = p_milestone_id;
  
  -- Shift all dependent milestones by the same number of days
  IF days_shift != 0 THEN
    FOR dependent_milestone IN
      SELECT * FROM public.production_milestones
      WHERE depends_on = p_milestone_id
        AND status IN ('pending', 'in_progress')
    LOOP
      UPDATE public.production_milestones
      SET 
        scheduled_date = scheduled_date + (days_shift || ' days')::interval,
        due_date = due_date + (days_shift || ' days')::interval,
        updated_at = now()
      WHERE id = dependent_milestone.id;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reschedule_milestone IS 'Reschedules a milestone and automatically shifts dependent milestones (Block 252100)';

-- ============================================================================
-- PART 10 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE IF EXISTS public.production_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.milestone_blockers ENABLE ROW LEVEL SECURITY;

-- Production milestones: Company members can view/manage milestones for their company's jobs
DROP POLICY IF EXISTS "production_milestones_company_member" ON public.production_milestones;
CREATE POLICY "production_milestones_company_member" ON public.production_milestones
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = j.company_id
      WHERE j.id = production_milestones.job_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = j.company_id
      WHERE j.id = production_milestones.job_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
    )
  );

-- Milestone blockers: Company members can view/manage blockers
DROP POLICY IF EXISTS "milestone_blockers_company_member" ON public.milestone_blockers;
CREATE POLICY "milestone_blockers_company_member" ON public.milestone_blockers
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.production_milestones pm
      JOIN public.jobs j ON j.id = pm.job_id
      JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = j.company_id
      WHERE pm.id = milestone_blockers.milestone_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.production_milestones pm
      JOIN public.jobs j ON j.id = pm.job_id
      JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = j.company_id
      WHERE pm.id = milestone_blockers.milestone_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
    )
  );

-- ============================================================================
-- PART 11 — COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.production_milestones IS 'Block 252100: Production milestones with dependencies for job orchestration';
COMMENT ON TABLE public.milestone_blockers IS 'Block 252100: Blockers preventing milestone progress';
COMMENT ON FUNCTION create_default_milestones IS 'Block 252100: Auto-creates default roofing workflow milestones';
COMMENT ON FUNCTION can_complete_milestone IS 'Block 252100: Validates milestone dependencies before completion';
COMMENT ON FUNCTION calculate_job_health_score IS 'Block 252100: Calculates job health score (0-100) based on delays and blockers';
COMMENT ON FUNCTION reschedule_milestone IS 'Block 252100: Reschedules milestone and shifts dependent milestones automatically';
























