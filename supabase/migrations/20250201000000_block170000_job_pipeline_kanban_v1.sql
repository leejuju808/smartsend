-- Block 170000 — SmartSend Roofing "Job Pipeline + Kanban Board + Production Tracking" v1
-- This block makes SmartSend a true operations platform, not just marketing
-- Full roofing pipeline system with Kanban, drag & drop, production tracking

-- ============================================================
-- PART 1 — CREATE job_stages TABLE
-- ============================================================
-- Customizable job stages per company

CREATE TABLE IF NOT EXISTS public.job_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  name text NOT NULL,        -- "Lead", "Estimate Scheduled", "Estimate Completed", etc.
  order_index int NOT NULL,  -- Order in the pipeline (0, 1, 2, ...)
  color text,                -- Hex color for UI (optional)
  icon text,                 -- Icon name for UI (optional)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique stage names per company and unique order_index per company
  CONSTRAINT unique_stage_name_per_company UNIQUE (company_id, name),
  CONSTRAINT unique_order_index_per_company UNIQUE (company_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_job_stages_company ON public.job_stages(company_id);
CREATE INDEX IF NOT EXISTS idx_job_stages_order ON public.job_stages(company_id, order_index);

-- ============================================================
-- PART 2 — EXPAND jobs TABLE
-- ============================================================
-- Add new columns to support the full pipeline system

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.job_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS progress int DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  ADD COLUMN IF NOT EXISTS materials jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS production_date date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS homeowner_name text,
  ADD COLUMN IF NOT EXISTS homeowner_phone text,
  ADD COLUMN IF NOT EXISTS homeowner_email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS job_type text,              -- "roof_replacement", "repair", "inspection"
  ADD COLUMN IF NOT EXISTS roof_type text,             -- "shingles", "tile", "metal", etc.
  ADD COLUMN IF NOT EXISTS insurance_claim boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimated_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS final_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON public.jobs(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_stage_id ON public.jobs(stage_id) WHERE stage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_progress ON public.jobs(progress);
CREATE INDEX IF NOT EXISTS idx_jobs_production_date ON public.jobs(production_date) WHERE production_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_crew_id ON public.jobs(crew_id) WHERE crew_id IS NOT NULL;

-- ============================================================
-- PART 3 — CREATE job_activity TABLE
-- ============================================================
-- Timeline of all activities for a job

CREATE TABLE IF NOT EXISTS public.job_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,              -- "stage_changed", "crew_assigned", "note_added", "material_ordered", etc.
  message text,                      -- Human-readable description
  metadata jsonb DEFAULT '{}'::jsonb, -- Additional data (old_stage, new_stage, crew_name, etc.)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_activity_job ON public.job_activity(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_activity_user ON public.job_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_job_activity_action ON public.job_activity(action);

-- ============================================================
-- PART 4 — SEED DEFAULT ROOFING STAGES
-- ============================================================
-- Create default stages for all existing companies

DO $$
DECLARE
  company_record RECORD;
  stage_names text[] := ARRAY['Lead', 'Estimate Scheduled', 'Estimate Completed', 'Insurance Review', 'Approved / Signed Contract', 'Production', 'Completed', 'Paid'];
  stage_colors text[] := ARRAY['#94a3b8', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#6366f1', '#6b7280', '#059669'];
  i int;
BEGIN
  -- For each roofing company, create default stages
  FOR company_record IN SELECT id FROM public.roofing_companies WHERE is_active = true
  LOOP
    -- Only create if stages don't already exist
    IF NOT EXISTS (SELECT 1 FROM public.job_stages WHERE company_id = company_record.id) THEN
      FOR i IN 1..array_length(stage_names, 1)
      LOOP
        INSERT INTO public.job_stages (company_id, name, order_index, color)
        VALUES (company_record.id, stage_names[i], i - 1, stage_colors[i])
        ON CONFLICT (company_id, name) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
  
  -- Also create default stages for jobs that might use team_id (backward compatibility)
  -- Link jobs to companies through leads if possible
  UPDATE public.jobs j
  SET company_id = (
    SELECT rc.id 
    FROM public.roofing_companies rc
    JOIN public.teams t ON t.id = j.team_id
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = rc.owner_id
    LIMIT 1
  )
  WHERE j.company_id IS NULL AND j.team_id IS NOT NULL;
END $$;

-- ============================================================
-- PART 5 — TRIGGERS
-- ============================================================

-- Update updated_at on job_stages
CREATE OR REPLACE FUNCTION update_job_stages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_stages_updated_at ON public.job_stages;
CREATE TRIGGER trg_job_stages_updated_at
BEFORE UPDATE ON public.job_stages
FOR EACH ROW
EXECUTE FUNCTION update_job_stages_updated_at();

-- Auto-create job_activity when stage changes
CREATE OR REPLACE FUNCTION log_job_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Log activity when stage_id changes
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    INSERT INTO public.job_activity (job_id, user_id, action, message, metadata)
    VALUES (
      NEW.id,
      auth.uid(),
      'stage_changed',
      CASE 
        WHEN OLD.stage_id IS NULL THEN 'Job moved to ' || (SELECT name FROM public.job_stages WHERE id = NEW.stage_id)
        WHEN NEW.stage_id IS NULL THEN 'Job removed from stage'
        ELSE 'Job moved from ' || (SELECT name FROM public.job_stages WHERE id = OLD.stage_id) || 
             ' to ' || (SELECT name FROM public.job_stages WHERE id = NEW.stage_id)
      END,
      jsonb_build_object(
        'old_stage_id', OLD.stage_id,
        'new_stage_id', NEW.stage_id,
        'old_stage_name', (SELECT name FROM public.job_stages WHERE id = OLD.stage_id),
        'new_stage_name', (SELECT name FROM public.job_stages WHERE id = NEW.stage_id)
      )
    );
  END IF;
  
  -- Log activity when crew is assigned
  IF OLD.crew_id IS DISTINCT FROM NEW.crew_id THEN
    INSERT INTO public.job_activity (job_id, user_id, action, message, metadata)
    VALUES (
      NEW.id,
      auth.uid(),
      'crew_assigned',
      CASE 
        WHEN OLD.crew_id IS NULL THEN 'Crew assigned: ' || (SELECT name FROM public.crews WHERE id = NEW.crew_id)
        WHEN NEW.crew_id IS NULL THEN 'Crew unassigned'
        ELSE 'Crew changed from ' || (SELECT name FROM public.crews WHERE id = OLD.crew_id) || 
             ' to ' || (SELECT name FROM public.crews WHERE id = NEW.crew_id)
      END,
      jsonb_build_object(
        'old_crew_id', OLD.crew_id,
        'new_crew_id', NEW.crew_id,
        'crew_name', (SELECT name FROM public.crews WHERE id = NEW.crew_id)
      )
    );
  END IF;
  
  -- Log activity when progress changes significantly (>10%)
  IF ABS(COALESCE(NEW.progress, 0) - COALESCE(OLD.progress, 0)) >= 10 THEN
    INSERT INTO public.job_activity (job_id, user_id, action, message, metadata)
    VALUES (
      NEW.id,
      auth.uid(),
      'progress_updated',
      'Progress updated to ' || NEW.progress || '%',
      jsonb_build_object(
        'old_progress', OLD.progress,
        'new_progress', NEW.progress
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_job_stage_change_trigger ON public.jobs;
CREATE TRIGGER log_job_stage_change_trigger
AFTER UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION log_job_stage_change();

-- ============================================================
-- PART 6 — PIPELINE AUTOMATION TRIGGERS
-- ============================================================

-- Automation: When job moves to "Estimate Completed"
CREATE OR REPLACE FUNCTION pipeline_automation_estimate_completed()
RETURNS TRIGGER AS $$
DECLARE
  stage_name text;
BEGIN
  IF NEW.stage_id IS NOT NULL THEN
    SELECT name INTO stage_name FROM public.job_stages WHERE id = NEW.stage_id;
    
    IF stage_name = 'Estimate Completed' THEN
      -- Trigger: assign to estimator (could trigger notification/assignment)
      -- Trigger: send thank-you SMS (via pg_notify for edge function)
      PERFORM pg_notify('pipeline_automation', json_build_object(
        'job_id', NEW.id,
        'trigger', 'estimate_completed',
        'lead_id', NEW.lead_id,
        'action', 'send_thank_you_sms'
      )::text);
    END IF;
    
    IF stage_name = 'Approved / Signed Contract' THEN
      -- Trigger: notify production manager
      -- Trigger: create crew assignment
      PERFORM pg_notify('pipeline_automation', json_build_object(
        'job_id', NEW.id,
        'trigger', 'contract_signed',
        'action', 'notify_production_manager'
      )::text);
    END IF;
    
    IF stage_name = 'Production' THEN
      -- Trigger: send homeowner scheduling confirmation
      PERFORM pg_notify('pipeline_automation', json_build_object(
        'job_id', NEW.id,
        'trigger', 'production_started',
        'action', 'send_scheduling_confirmation'
      )::text);
    END IF;
    
    IF stage_name = 'Completed' THEN
      -- Trigger: send thank-you + review request
      -- Trigger: update revenue dashboard
      PERFORM pg_notify('pipeline_automation', json_build_object(
        'job_id', NEW.id,
        'trigger', 'job_completed',
        'action', 'send_completion_followup'
      )::text);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pipeline_automation_trigger ON public.jobs;
CREATE TRIGGER pipeline_automation_trigger
AFTER UPDATE ON public.jobs
FOR EACH ROW
WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
EXECUTE FUNCTION pipeline_automation_estimate_completed();

-- ============================================================
-- PART 7 — HELPER FUNCTIONS
-- ============================================================

-- Get jobs by stage for a company
CREATE OR REPLACE FUNCTION get_jobs_by_stage_id(p_company_id uuid, p_stage_id uuid)
RETURNS TABLE (
  id uuid,
  lead_id uuid,
  stage_id uuid,
  stage_name text,
  progress int,
  contract_value numeric,
  insurance boolean,
  notes text,
  created_at timestamptz,
  homeowner_name text,
  address text,
  crew_name text,
  production_date date,
  estimated_value numeric,
  final_value numeric,
  job_type text,
  roof_type text,
  insurance_claim boolean,
  materials jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id,
    j.lead_id,
    j.stage_id,
    js.name as stage_name,
    j.progress,
    j.contract_value,
    j.insurance,
    j.notes,
    j.created_at,
    COALESCE(j.homeowner_name, l.first_name || ' ' || l.last_name) as homeowner_name,
    COALESCE(j.address, l.address) as address,
    c.name as crew_name,
    j.production_date,
    j.estimated_value,
    j.final_value,
    j.job_type,
    j.roof_type,
    j.insurance_claim,
    j.materials
  FROM public.jobs j
  LEFT JOIN public.leads l ON j.lead_id = l.id
  LEFT JOIN public.job_stages js ON js.id = j.stage_id
  LEFT JOIN public.crews c ON c.id = j.crew_id
  WHERE j.company_id = p_company_id
    AND j.stage_id = p_stage_id
  ORDER BY j.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all stages with job counts for a company
CREATE OR REPLACE FUNCTION get_pipeline_stages_with_counts(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  order_index int,
  color text,
  icon text,
  job_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    js.id,
    js.name,
    js.order_index,
    js.color,
    js.icon,
    COUNT(j.id) as job_count
  FROM public.job_stages js
  LEFT JOIN public.jobs j ON j.stage_id = js.id AND j.company_id = p_company_id
  WHERE js.company_id = p_company_id
  GROUP BY js.id, js.name, js.order_index, js.color, js.icon
  ORDER BY js.order_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PART 8 — ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on new tables
ALTER TABLE IF EXISTS public.job_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_activity ENABLE ROW LEVEL SECURITY;

-- Job stages: Company members can view/manage stages
DROP POLICY IF EXISTS "job_stages_company_member" ON public.job_stages;
CREATE POLICY "job_stages_company_member" ON public.job_stages
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.roofing_company_members rcm
      WHERE rcm.roofing_company_id = job_stages.company_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.roofing_company_members rcm
      WHERE rcm.roofing_company_id = job_stages.company_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
    )
  );

-- Job activity: Company members can view activity
DROP POLICY IF EXISTS "job_activity_company_member" ON public.job_activity;
CREATE POLICY "job_activity_company_member" ON public.job_activity
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = j.company_id
      WHERE j.id = job_activity.job_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
    )
  );

-- Job activity: Company members can insert activity
DROP POLICY IF EXISTS "job_activity_company_member_insert" ON public.job_activity;
CREATE POLICY "job_activity_company_member_insert" ON public.job_activity
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = j.company_id
      WHERE j.id = job_activity.job_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
    )
  );

-- Update jobs RLS to support company_id (in addition to existing team_id policies)
-- Note: This works alongside existing team-based RLS policies

-- ============================================================
-- PART 9 — COMMENTS FOR DOCUMENTATION
-- ============================================================

COMMENT ON TABLE public.job_stages IS 'Block 170000: Customizable job pipeline stages per company';
COMMENT ON TABLE public.job_activity IS 'Block 170000: Timeline of all activities for a job';
COMMENT ON COLUMN public.jobs.stage_id IS 'Block 170000: Reference to job_stages table';
COMMENT ON COLUMN public.jobs.progress IS 'Block 170000: Production progress percentage (0-100)';
COMMENT ON COLUMN public.jobs.materials IS 'Block 170000: JSON array of materials needed for the job';


























