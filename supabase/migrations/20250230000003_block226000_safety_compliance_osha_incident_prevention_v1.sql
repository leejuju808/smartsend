-- Block 226000 — SmartSend Roofing "Safety Compliance + OSHA Incident Prevention System" v1
-- 
-- THIS is the block that makes SmartSend UNDENIABLE.
-- 
-- Production is running.
-- Crews are using the app.
-- 
-- Now we introduce the system that NO other roofing CRM has:
-- A full Safety Engine that makes roofing companies OSHA-compliant, avoids fines, avoids injuries,
-- and makes owners feel like:
-- 
-- "SmartSend protects my crews, protects my company, and protects my money.
-- We were idiots not using this before."
-- 
-- This is how SmartSend becomes elite infrastructure, not just software.

-- ============================================================================
-- PART 1 — CREATE safety_policies TABLE
-- ============================================================================
-- Company-specific safety programs

CREATE TABLE IF NOT EXISTS public.safety_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to companies/roofing_companies if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_companies') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'safety_policies_company_id_fkey'
    ) THEN
      ALTER TABLE public.safety_policies
        ADD CONSTRAINT safety_policies_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.roofing_companies(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'safety_policies_company_id_fkey'
    ) THEN
      ALTER TABLE public.safety_policies
        ADD CONSTRAINT safety_policies_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_safety_policies_company ON public.safety_policies(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_policies_workspace ON public.safety_policies(workspace_id);

-- ============================================================================
-- PART 2 — CREATE safety_checklists TABLE
-- ============================================================================
-- Safety checklists tied to daily logs (different from crew_checklists)

CREATE TABLE IF NOT EXISTS public.safety_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id uuid NOT NULL REFERENCES public.crew_daily_logs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  checklist_type text NOT NULL CHECK (checklist_type IN ('ppe_check', 'fall_protection', 'ladder_safety', 'site_assessment', 'toolbox_talk')),
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'safety_checklists_job_id_fkey'
    ) THEN
      ALTER TABLE public.safety_checklists
        ADD CONSTRAINT safety_checklists_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'safety_checklists_job_id_fkey'
    ) THEN
      ALTER TABLE public.safety_checklists
        ADD CONSTRAINT safety_checklists_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_safety_checklists_daily_log ON public.safety_checklists(daily_log_id);
CREATE INDEX IF NOT EXISTS idx_safety_checklists_job ON public.safety_checklists(job_id);
CREATE INDEX IF NOT EXISTS idx_safety_checklists_crew ON public.safety_checklists(crew_id);
CREATE INDEX IF NOT EXISTS idx_safety_checklists_type ON public.safety_checklists(checklist_type);
CREATE INDEX IF NOT EXISTS idx_safety_checklists_completed ON public.safety_checklists(completed);

-- ============================================================================
-- PART 3 — CREATE safety_checklist_items TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.safety_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.safety_checklists(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_required boolean DEFAULT true,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_checklist_items_checklist ON public.safety_checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_safety_checklist_items_completed ON public.safety_checklist_items(completed);
CREATE INDEX IF NOT EXISTS idx_safety_checklist_items_required ON public.safety_checklist_items(checklist_id, is_required) WHERE is_required = true;

-- Function to auto-update safety checklist completion
CREATE OR REPLACE FUNCTION update_safety_checklist_completion()
RETURNS TRIGGER AS $$
DECLARE
  all_required_done boolean;
BEGIN
  -- Check if all required items are completed
  SELECT bool_and(completed = true OR is_required = false)
  INTO all_required_done
  FROM public.safety_checklist_items
  WHERE checklist_id = COALESCE(NEW.checklist_id, OLD.checklist_id);
  
  -- Update checklist completion status
  UPDATE public.safety_checklists
  SET 
    completed = COALESCE(all_required_done, false),
    completed_at = CASE WHEN all_required_done THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = COALESCE(NEW.checklist_id, OLD.checklist_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_safety_checklist_completion
AFTER INSERT OR UPDATE ON public.safety_checklist_items
FOR EACH ROW
EXECUTE FUNCTION update_safety_checklist_completion();

-- ============================================================================
-- PART 4 — ENHANCE toolbox_talks TABLE (if exists, add document_url)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'toolbox_talks') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'toolbox_talks' 
      AND column_name = 'document_url'
    ) THEN
      ALTER TABLE public.toolbox_talks ADD COLUMN document_url text;
    END IF;
    
    -- Add company_id if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'toolbox_talks' 
      AND column_name = 'company_id'
    ) THEN
      ALTER TABLE public.toolbox_talks ADD COLUMN company_id uuid;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 5 — ENHANCE toolbox_attendance TABLE (if exists, add crew_id and signed boolean)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'toolbox_attendance') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'toolbox_attendance' 
      AND column_name = 'crew_id'
    ) THEN
      ALTER TABLE public.toolbox_attendance ADD COLUMN crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'toolbox_attendance' 
      AND column_name = 'signed'
    ) THEN
      ALTER TABLE public.toolbox_attendance ADD COLUMN signed boolean DEFAULT false;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 6 — CREATE safety_incidents TABLE
-- ============================================================================
-- Full OSHA-ready event logging (separate from incident_reports for block 226000)

CREATE TABLE IF NOT EXISTS public.safety_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  daily_log_id uuid REFERENCES public.crew_daily_logs(id) ON DELETE SET NULL,
  incident_type text NOT NULL CHECK (incident_type IN ('fall', 'cut', 'near_miss', 'equipment_failure', 'electrical', 'struck_by', 'caught_in', 'other')),
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  photo_url text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  requires_shutdown boolean DEFAULT false,
  status text DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'closed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to jobs table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'safety_incidents_job_id_fkey'
    ) THEN
      ALTER TABLE public.safety_incidents
        ADD CONSTRAINT safety_incidents_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'safety_incidents_job_id_fkey'
    ) THEN
      ALTER TABLE public.safety_incidents
        ADD CONSTRAINT safety_incidents_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_safety_incidents_job ON public.safety_incidents(job_id);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_crew ON public.safety_incidents(crew_id);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_daily_log ON public.safety_incidents(daily_log_id);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_type ON public.safety_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_severity ON public.safety_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_status ON public.safety_incidents(status);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_shutdown ON public.safety_incidents(requires_shutdown) WHERE requires_shutdown = true;
CREATE INDEX IF NOT EXISTS idx_safety_incidents_occurred_at ON public.safety_incidents(occurred_at DESC);

-- ============================================================================
-- PART 7 — CREATE safety_scores TABLE
-- ============================================================================
-- Automatic grading per crew

CREATE TABLE IF NOT EXISTS public.safety_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  score numeric NOT NULL CHECK (score >= 0 AND score <= 100),
  period_start date NOT NULL,
  period_end date NOT NULL,
  ppe_compliance_score numeric,
  checklist_completion_score numeric,
  incident_frequency_score numeric,
  toolbox_participation_score numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(crew_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_safety_scores_crew ON public.safety_scores(crew_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_safety_scores_period ON public.safety_scores(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_safety_scores_score ON public.safety_scores(score);

-- ============================================================================
-- PART 8 — ADD safety_status COLUMN TO jobs/roofing_jobs
-- ============================================================================
-- Track if job is blocked due to safety issues

DO $$
BEGIN
  -- Add to jobs table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'jobs' 
      AND column_name = 'safety_status'
    ) THEN
      ALTER TABLE public.jobs ADD COLUMN safety_status text DEFAULT 'clear' CHECK (safety_status IN ('clear', 'pending_review', 'blocked'));
    END IF;
  END IF;
  
  -- Add to roofing_jobs table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'roofing_jobs' 
      AND column_name = 'safety_status'
    ) THEN
      ALTER TABLE public.roofing_jobs ADD COLUMN safety_status text DEFAULT 'clear' CHECK (safety_status IN ('clear', 'pending_review', 'blocked'));
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 9 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.safety_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_scores ENABLE ROW LEVEL SECURITY;

-- Safety policies: Access via workspace or company
DROP POLICY IF EXISTS "safety_policies_workspace_member" ON public.safety_policies;
CREATE POLICY "safety_policies_workspace_member" ON public.safety_policies
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = safety_policies.workspace_id AND wm.user_id = auth.uid()
    )
  );

-- Safety checklists: Access via daily log's job workspace
DROP POLICY IF EXISTS "safety_checklists_workspace_member" ON public.safety_checklists;
CREATE POLICY "safety_checklists_workspace_member" ON public.safety_checklists
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.crew_daily_logs cdl
      JOIN public.jobs j ON cdl.job_id = j.id
      JOIN public.workspace_members wm ON j.workspace_id = wm.workspace_id
      WHERE cdl.id = safety_checklists.daily_log_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.crew_daily_logs cdl
      JOIN public.roofing_jobs rj ON cdl.job_id = rj.id
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE cdl.id = safety_checklists.daily_log_id AND wm.user_id = auth.uid()
    )
  );

-- Safety checklist items: Inherit from checklist
DROP POLICY IF EXISTS "safety_checklist_items_workspace_member" ON public.safety_checklist_items;
CREATE POLICY "safety_checklist_items_workspace_member" ON public.safety_checklist_items
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.safety_checklists sc
      JOIN public.crew_daily_logs cdl ON sc.daily_log_id = cdl.id
      JOIN public.jobs j ON cdl.job_id = j.id
      JOIN public.workspace_members wm ON j.workspace_id = wm.workspace_id
      WHERE sc.id = safety_checklist_items.checklist_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.safety_checklists sc
      JOIN public.crew_daily_logs cdl ON sc.daily_log_id = cdl.id
      JOIN public.roofing_jobs rj ON cdl.job_id = rj.id
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE sc.id = safety_checklist_items.checklist_id AND wm.user_id = auth.uid()
    )
  );

-- Safety incidents: Access via job workspace
DROP POLICY IF EXISTS "safety_incidents_workspace_member" ON public.safety_incidents;
CREATE POLICY "safety_incidents_workspace_member" ON public.safety_incidents
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.workspace_members wm ON j.workspace_id = wm.workspace_id
      WHERE j.id = safety_incidents.job_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.workspace_members wm ON rj.workspace_id = wm.workspace_id
      WHERE rj.id = safety_incidents.job_id AND wm.user_id = auth.uid()
    )
  );

-- Safety scores: Access via crew's workspace
DROP POLICY IF EXISTS "safety_scores_workspace_member" ON public.safety_scores;
CREATE POLICY "safety_scores_workspace_member" ON public.safety_scores
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.crews c
      JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
      WHERE c.id = safety_scores.crew_id AND wm.user_id = auth.uid()
    )
    OR
    EXISTS(
      SELECT 1 FROM public.crews c
      JOIN public.teams t ON c.team_id = t.id
      JOIN public.workspace_members wm ON t.workspace_id = wm.workspace_id
      WHERE c.id = safety_scores.crew_id AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 10 — TRIGGERS AND AUTOMATIONS
-- ============================================================================

-- Update updated_at timestamps
CREATE OR REPLACE FUNCTION update_safety_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_safety_policies_updated_at
BEFORE UPDATE ON public.safety_policies
FOR EACH ROW
EXECUTE FUNCTION update_safety_updated_at();

CREATE TRIGGER trg_safety_checklists_updated_at
BEFORE UPDATE ON public.safety_checklists
FOR EACH ROW
EXECUTE FUNCTION update_safety_updated_at();

CREATE TRIGGER trg_safety_incidents_updated_at
BEFORE UPDATE ON public.safety_incidents
FOR EACH ROW
EXECUTE FUNCTION update_safety_updated_at();

CREATE TRIGGER trg_safety_scores_updated_at
BEFORE UPDATE ON public.safety_scores
FOR EACH ROW
EXECUTE FUNCTION update_safety_updated_at();

-- Auto-block job if severe hazard is reported
CREATE OR REPLACE FUNCTION auto_block_job_on_severe_hazard()
RETURNS TRIGGER AS $$
BEGIN
  -- If incident requires shutdown or is critical severity, block the job
  IF NEW.requires_shutdown = true OR NEW.severity = 'critical' THEN
    -- Update job safety status
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
      UPDATE public.jobs
      SET safety_status = 'blocked', updated_at = now()
      WHERE id = NEW.job_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
      UPDATE public.roofing_jobs
      SET safety_status = 'blocked', updated_at = now()
      WHERE id = NEW.job_id;
    END IF;
    
    -- Mark daily log as paused if it exists
    IF NEW.daily_log_id IS NOT NULL THEN
      UPDATE public.crew_daily_logs
      SET status = 'paused', updated_at = now()
      WHERE id = NEW.daily_log_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_block_job_on_severe_hazard
AFTER INSERT OR UPDATE ON public.safety_incidents
FOR EACH ROW
WHEN (NEW.requires_shutdown = true OR NEW.severity = 'critical')
EXECUTE FUNCTION auto_block_job_on_severe_hazard();

-- Auto-mark job as pending review if high severity incident
CREATE OR REPLACE FUNCTION auto_mark_job_pending_review()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.severity = 'high' AND NEW.requires_shutdown = false THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
      UPDATE public.jobs
      SET safety_status = 'pending_review', updated_at = now()
      WHERE id = NEW.job_id AND safety_status = 'clear';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
      UPDATE public.roofing_jobs
      SET safety_status = 'pending_review', updated_at = now()
      WHERE id = NEW.job_id AND safety_status = 'clear';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_mark_job_pending_review
AFTER INSERT OR UPDATE ON public.safety_incidents
FOR EACH ROW
WHEN (NEW.severity = 'high' AND NEW.requires_shutdown = false)
EXECUTE FUNCTION auto_mark_job_pending_review();

-- ============================================================================
-- PART 11 — HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate safety score for a crew
CREATE OR REPLACE FUNCTION calculate_crew_safety_score(
  p_crew_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS numeric AS $$
DECLARE
  v_ppe_score numeric := 0;
  v_checklist_score numeric := 0;
  v_incident_score numeric := 0;
  v_toolbox_score numeric := 0;
  v_final_score numeric;
BEGIN
  -- PPE Compliance (40% weight)
  -- Calculate based on PPE checks completed vs required
  SELECT COALESCE(
    (COUNT(*) FILTER (WHERE completed = true)::numeric / NULLIF(COUNT(*), 0) * 100),
    0
  ) INTO v_ppe_score
  FROM public.safety_checklists sc
  JOIN public.crew_daily_logs cdl ON sc.daily_log_id = cdl.id
  WHERE cdl.crew_id = p_crew_id
    AND cdl.date BETWEEN p_period_start AND p_period_end
    AND sc.checklist_type = 'ppe_check';
  
  -- Checklist Completion (20% weight)
  SELECT COALESCE(
    (COUNT(*) FILTER (WHERE completed = true)::numeric / NULLIF(COUNT(*), 0) * 100),
    0
  ) INTO v_checklist_score
  FROM public.safety_checklists sc
  JOIN public.crew_daily_logs cdl ON sc.daily_log_id = cdl.id
  WHERE cdl.crew_id = p_crew_id
    AND cdl.date BETWEEN p_period_start AND p_period_end;
  
  -- Incident Frequency (20% weight) - lower incidents = higher score
  SELECT COALESCE(
    GREATEST(0, 100 - (COUNT(*)::numeric * 10)),
    100
  ) INTO v_incident_score
  FROM public.safety_incidents si
  WHERE si.crew_id = p_crew_id
    AND si.occurred_at::date BETWEEN p_period_start AND p_period_end;
  
  -- Toolbox Talk Participation (20% weight)
  SELECT COALESCE(
    (COUNT(DISTINCT ta.talk_id)::numeric / NULLIF(
      (SELECT COUNT(*) FROM public.toolbox_talks tt 
       WHERE tt.date BETWEEN p_period_start AND p_period_end), 0
    ) * 100),
    0
  ) INTO v_toolbox_score
  FROM public.toolbox_attendance ta
  JOIN public.toolbox_talks tt ON ta.talk_id = tt.id
  WHERE ta.crew_id = p_crew_id
    AND tt.date BETWEEN p_period_start AND p_period_end
    AND ta.signed = true;
  
  -- Calculate weighted final score
  v_final_score := 
    (v_ppe_score * 0.40) +
    (v_checklist_score * 0.20) +
    (v_incident_score * 0.20) +
    (v_toolbox_score * 0.20);
  
  -- Ensure score is between 0 and 100
  v_final_score := GREATEST(0, LEAST(100, v_final_score));
  
  RETURN v_final_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_crew_safety_score IS 'Block 226000: Calculate safety score for a crew over a period (40% PPE, 20% checklists, 20% incidents, 20% toolbox talks)';

























