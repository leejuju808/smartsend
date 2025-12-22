-- =========================================================
-- Block 27940 — SmartSend Roofing QA & Completion Verification Engine v1
-- (AI checks photos • Verifies install quality • Flags issues • Generates completion report for homeowner + insurance)
-- =========================================================
-- 
-- This block makes SmartSend the quality inspector for every roof.
-- 
-- Most roofers:
-- - Don't have consistent QA
-- - Rely on "crew says it's done"
-- - Forget final photos or miss angles
-- - Only find problems when a homeowner complains
-- - Don't have clean completion reports for insurance / realtors
-- 
-- SmartSend will now:
-- - Take the crew photos + job data → run an AI QA check → confirm key install points → flag possible issues → generate a "Completion Report" for the homeowner & insurance.
-- 
-- This is huge for trust, referrals, and reducing callbacks.

-- ============================================================================
-- PART 1 — CREATE roofing_qa_templates TABLE
-- ============================================================================
-- QA Checklist Template (for future versions / different roof types)

CREATE TABLE IF NOT EXISTS public.roofing_qa_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                    -- "Standard Asphalt Roof QA v1"
  roof_type text,                        -- 'asphalt','metal','flat'
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_qa_templates_active ON public.roofing_qa_templates(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_roofing_qa_templates_roof_type ON public.roofing_qa_templates(roof_type);

-- ============================================================================
-- PART 2 — CREATE roofing_qa_template_items TABLE
-- ============================================================================
-- QA Template Items (optional, v1 simple)

CREATE TABLE IF NOT EXISTS public.roofing_qa_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.roofing_qa_templates(id) ON DELETE CASCADE,
  item_key text NOT NULL,               -- 'photos_before','photos_after','ridge_caps','vents'
  item_label text NOT NULL,             -- "Before photos (front/back/sides)"
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_qa_template_items_template ON public.roofing_qa_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_roofing_qa_template_items_key ON public.roofing_qa_template_items(item_key);

-- ============================================================================
-- PART 3 — CREATE roofing_job_qa_runs TABLE
-- ============================================================================
-- QA Run (per job)

CREATE TABLE IF NOT EXISTS public.roofing_job_qa_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.roofing_qa_templates(id),
  status text CHECK (
    status IN ('pending','in_progress','completed','failed')
  ) DEFAULT 'pending',
  
  overall_result text CHECK (
    overall_result IN ('pass','minor_issues','major_issues')
  ),
  
  ai_summary text,                   -- text summary from model
  homeowner_summary text,            -- nice version for completion report
  
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_roofing_job_qa_runs_job ON public.roofing_job_qa_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_job_qa_runs_status ON public.roofing_job_qa_runs(status);
CREATE INDEX IF NOT EXISTS idx_roofing_job_qa_runs_result ON public.roofing_job_qa_runs(overall_result);
CREATE INDEX IF NOT EXISTS idx_roofing_job_qa_runs_job_status ON public.roofing_job_qa_runs(job_id, status);

-- ============================================================================
-- PART 4 — CREATE roofing_job_qa_findings TABLE
-- ============================================================================
-- QA Findings (issues / confirmations)

CREATE TABLE IF NOT EXISTS public.roofing_job_qa_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_run_id uuid NOT NULL REFERENCES public.roofing_job_qa_runs(id) ON DELETE CASCADE,
  severity text CHECK (severity IN ('info','warning','critical')) DEFAULT 'info',
  category text,                   -- 'photos','flashing','cleanup','ventilation'
  message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_job_qa_findings_run ON public.roofing_job_qa_findings(qa_run_id);
CREATE INDEX IF NOT EXISTS idx_roofing_job_qa_findings_severity ON public.roofing_job_qa_findings(severity);
CREATE INDEX IF NOT EXISTS idx_roofing_job_qa_findings_category ON public.roofing_job_qa_findings(category);

-- ============================================================================
-- PART 5 — SEED DEFAULT QA TEMPLATE
-- ============================================================================
-- Pre-seed a default template for standard asphalt roofs

INSERT INTO public.roofing_qa_templates (name, roof_type, active)
VALUES ('Standard Asphalt Roof QA v1', 'asphalt', true)
ON CONFLICT DO NOTHING;

-- Get the template ID and insert items
DO $$
DECLARE
  template_uuid uuid;
BEGIN
  SELECT id INTO template_uuid FROM public.roofing_qa_templates WHERE name = 'Standard Asphalt Roof QA v1' LIMIT 1;
  
  IF template_uuid IS NOT NULL THEN
    INSERT INTO public.roofing_qa_template_items (template_id, item_key, item_label)
    VALUES
      (template_uuid, 'photos_before', 'Before photos (front/back/sides)'),
      (template_uuid, 'photos_after', 'After photos (front/back/sides)'),
      (template_uuid, 'photos_closeup', 'Close-up photos of key areas'),
      (template_uuid, 'ridge_caps', 'Ridge caps properly installed'),
      (template_uuid, 'vents', 'Ventilation properly installed'),
      (template_uuid, 'flashing', 'Flashing properly installed'),
      (template_uuid, 'cleanup', 'Job site cleanup complete')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.roofing_qa_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_qa_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_job_qa_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_job_qa_findings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view QA templates
CREATE POLICY "qa_templates_select"
  ON public.roofing_qa_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Users can view QA template items
CREATE POLICY "qa_template_items_select"
  ON public.roofing_qa_template_items
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Users can view QA runs for jobs in their workspace
CREATE POLICY "qa_runs_select"
  ON public.roofing_job_qa_runs
  FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM public.roofing_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
  );

-- Policy: Users can insert QA runs for jobs in their workspace
CREATE POLICY "qa_runs_insert"
  ON public.roofing_job_qa_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.roofing_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
  );

-- Policy: Users can update QA runs for jobs in their workspace
CREATE POLICY "qa_runs_update"
  ON public.roofing_job_qa_runs
  FOR UPDATE
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM public.roofing_jobs
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
      OR workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE owner_id = auth.uid()
      )
    )
  );

-- Policy: Users can view QA findings for runs they can access
CREATE POLICY "qa_findings_select"
  ON public.roofing_job_qa_findings
  FOR SELECT
  TO authenticated
  USING (
    qa_run_id IN (
      SELECT id FROM public.roofing_job_qa_runs
      WHERE job_id IN (
        SELECT id FROM public.roofing_jobs
        WHERE workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

-- Policy: Users can insert QA findings for runs they can access
CREATE POLICY "qa_findings_insert"
  ON public.roofing_job_qa_findings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    qa_run_id IN (
      SELECT id FROM public.roofing_job_qa_runs
      WHERE job_id IN (
        SELECT id FROM public.roofing_jobs
        WHERE workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- PART 7 — ADD html_content COLUMN TO job_documents (if not exists)
-- ============================================================================
-- For storing completion report HTML

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS html_content text;

COMMENT ON COLUMN public.job_documents.html_content IS 'Block 27940: HTML content for completion reports and other generated documents';

-- ============================================================================
-- PART 8 — CREATE TRIGGER FUNCTION: Auto-create QA run when job completed
-- ============================================================================
-- Automatically creates a pending QA run when a job is marked as completed

CREATE OR REPLACE FUNCTION public.trigger_qa_run_on_job_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template_id uuid;
BEGIN
  -- Only trigger when status changes to 'completed'
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    -- Get the first active QA template
    SELECT id INTO v_template_id
    FROM public.roofing_qa_templates
    WHERE active = true
    LIMIT 1;
    
    -- Create a pending QA run
    INSERT INTO public.roofing_job_qa_runs (
      job_id,
      template_id,
      status
    )
    VALUES (
      NEW.id,
      v_template_id,
      'pending'
    )
    ON CONFLICT DO NOTHING; -- Prevent duplicates if trigger fires multiple times
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_qa_run_on_job_completion ON public.roofing_jobs;
CREATE TRIGGER trg_qa_run_on_job_completion
  AFTER UPDATE OF status ON public.roofing_jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
  EXECUTE FUNCTION public.trigger_qa_run_on_job_completion();

COMMENT ON FUNCTION public.trigger_qa_run_on_job_completion IS 'Block 27940: Automatically creates a pending QA run when job is marked as completed';
COMMENT ON TRIGGER trg_qa_run_on_job_completion ON public.roofing_jobs IS 'Block 27940: Triggers QA run creation when job status changes to completed';



































