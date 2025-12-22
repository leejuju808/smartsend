-- =========================================================
-- Block 50000 — SmartSend Roofing "Quality Control + Post-Install Inspection System" v1
-- (QC CHECKLIST • SUPERVISOR SIGN-OFF • HOMEOWNER VERIFICATION • PHOTO-BACKED QC SCORES • WARRANTY COMPLIANCE)
-- =========================================================
-- 
-- THE QC ENGINE THAT PREVENTS CALLBACKS AND INCREASES PROFITS.
-- This block completes the production lifecycle of SmartSend by adding formal QC inspection workflow
-- that prevents leaks, warranty disputes, angry homeowners, bad reviews, and lost profit.
-- 
-- Every feature below directly helps roofers:
-- ✔ Documented proof of quality
-- ✔ Clear accountability
-- ✔ Reduced warranty claims
-- ✔ Increased homeowner trust
-- ✔ 5-star reviews
-- ✔ Enforced crew discipline

-- ============================================================================
-- PART 1 — CREATE qc_inspections TABLE
-- ============================================================================
-- Main QC inspection record created when job is marked complete by crew

CREATE TABLE IF NOT EXISTS public.qc_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  supervisor_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  
  -- Checklist data: JSONB with array of items, each with: {item: text, status: pass/fail/pending, notes: text, requires_photo: boolean, photo_uploaded: boolean}
  checklist jsonb DEFAULT '[]'::jsonb,
  
  -- QC Score: 0-100 based on passed items, photos submitted, failed items
  score numeric(5,2) DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  
  -- Status workflow: pending → in_review → completed → failed
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',           -- QC required, waiting for supervisor
    'in_review',         -- Supervisor actively inspecting
    'completed',         -- Passed QC threshold
    'failed',            -- Failed QC, punch tasks created
    're_inspection'      -- Re-inspection after punch fixes
  )),
  
  -- Threshold score required to pass (default 85, customizable per workspace)
  pass_threshold numeric(5,2) DEFAULT 85 CHECK (pass_threshold >= 0 AND pass_threshold <= 100),
  
  -- Photo requirements tracking
  photos_required_count integer DEFAULT 0,
  photos_uploaded_count integer DEFAULT 0,
  
  -- Completion tracking
  completed_at timestamptz,
  completed_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  
  -- Notes
  supervisor_notes text,
  overall_notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'qc_inspections_job_id_fkey'
    ) THEN
      ALTER TABLE public.qc_inspections
        ADD CONSTRAINT qc_inspections_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'qc_inspections_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.qc_inspections
        ADD CONSTRAINT qc_inspections_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_qc_inspections_job ON public.qc_inspections(job_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_workspace ON public.qc_inspections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_status ON public.qc_inspections(status);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_supervisor ON public.qc_inspections(supervisor_id) WHERE supervisor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qc_inspections_created ON public.qc_inspections(created_at DESC);

-- ============================================================================
-- PART 2 — CREATE qc_photos TABLE
-- ============================================================================
-- Photos uploaded as proof for QC checklist items

CREATE TABLE IF NOT EXISTS public.qc_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_inspection_id uuid NOT NULL REFERENCES public.qc_inspections(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  
  -- Which checklist item this photo proves
  checklist_item text NOT NULL,
  
  -- Photo URL (Supabase Storage or external URL)
  url text NOT NULL,
  
  -- Photo metadata
  uploaded_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  photo_type text CHECK (photo_type IN ('ridge', 'flashing', 'pipe_boot', 'field_shingles', 'eaves_edges', 'cleanup', 'other')),
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'qc_photos_job_id_fkey'
    ) THEN
      ALTER TABLE public.qc_photos
        ADD CONSTRAINT qc_photos_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_qc_photos_qc ON public.qc_photos(qc_inspection_id);
CREATE INDEX IF NOT EXISTS idx_qc_photos_job ON public.qc_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_qc_photos_item ON public.qc_photos(checklist_item);
CREATE INDEX IF NOT EXISTS idx_qc_photos_type ON public.qc_photos(photo_type);

-- ============================================================================
-- PART 3 — CREATE qc_failures TABLE
-- ============================================================================
-- Failed QC items that trigger punch list tasks

CREATE TABLE IF NOT EXISTS public.qc_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_inspection_id uuid NOT NULL REFERENCES public.qc_inspections(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  
  -- Failed checklist item
  item text NOT NULL,
  item_key text, -- Unique key for the checklist item (for tracking)
  
  -- Failure details
  notes text,
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Punch list task created (linked to punch_list table)
  punch_list_id uuid REFERENCES public.punch_list(id) ON DELETE SET NULL,
  
  -- Resolution tracking
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  resolution_notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to roofing_jobs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'qc_failures_job_id_fkey'
    ) THEN
      ALTER TABLE public.qc_failures
        ADD CONSTRAINT qc_failures_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_qc_failures_qc ON public.qc_failures(qc_inspection_id);
CREATE INDEX IF NOT EXISTS idx_qc_failures_job ON public.qc_failures(job_id);
CREATE INDEX IF NOT EXISTS idx_qc_failures_resolved ON public.qc_failures(resolved_at) WHERE resolved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qc_failures_punch_list ON public.qc_failures(punch_list_id) WHERE punch_list_id IS NOT NULL;

-- ============================================================================
-- PART 4 — CREATE homeowner_qc_verification TABLE
-- ============================================================================
-- Homeowner's final sign-off after QC completion

CREATE TABLE IF NOT EXISTS public.homeowner_qc_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  qc_inspection_id uuid REFERENCES public.qc_inspections(id) ON DELETE SET NULL,
  homeowner_id uuid, -- References leads or contacts table
  
  -- Homeowner response
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'needs_attention', 'rejected')),
  
  -- Homeowner feedback
  feedback text,
  concerns text,
  
  -- Verification metadata
  verified_at timestamptz,
  verified_ip text,
  
  -- Support workflow tracking
  support_ticket_created boolean DEFAULT false,
  support_ticket_id uuid,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign keys
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_qc_verification_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_qc_verification
        ADD CONSTRAINT homeowner_qc_verification_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_qc_verification_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_qc_verification
        ADD CONSTRAINT homeowner_qc_verification_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_homeowner_qc_verification_job ON public.homeowner_qc_verification(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_qc_verification_status ON public.homeowner_qc_verification(status);
CREATE INDEX IF NOT EXISTS idx_homeowner_qc_verification_qc ON public.homeowner_qc_verification(qc_inspection_id) WHERE qc_inspection_id IS NOT NULL;

-- ============================================================================
-- PART 5 — CREATE qc_checklist_templates TABLE
-- ============================================================================
-- Customizable QC checklist templates per workspace

CREATE TABLE IF NOT EXISTS public.qc_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Default QC Checklist',
  
  -- Checklist items: JSONB array of {key: text, label: text, requires_photo: boolean, weight: numeric}
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Default threshold
  default_pass_threshold numeric(5,2) DEFAULT 85,
  
  -- Template metadata
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'qc_checklist_templates_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.qc_checklist_templates
        ADD CONSTRAINT qc_checklist_templates_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_qc_checklist_templates_workspace ON public.qc_checklist_templates(workspace_id, is_active);

-- ============================================================================
-- PART 6 — FUNCTIONS
-- ============================================================================

-- Function: Calculate QC score based on checklist
CREATE OR REPLACE FUNCTION public.calculate_qc_score(
  p_checklist jsonb,
  p_photos_uploaded_count integer,
  p_photos_required_count integer
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_items integer;
  v_passed_items integer;
  v_failed_items integer;
  v_item_score numeric;
  v_photo_score numeric;
  v_final_score numeric;
  v_item jsonb;
BEGIN
  -- Count items
  v_total_items := jsonb_array_length(p_checklist);
  
  IF v_total_items = 0 THEN
    RETURN 0;
  END IF;
  
  -- Count passed and failed items
  v_passed_items := 0;
  v_failed_items := 0;
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_checklist)
  LOOP
    IF (v_item->>'status')::text = 'pass' THEN
      v_passed_items := v_passed_items + 1;
    ELSIF (v_item->>'status')::text = 'fail' THEN
      v_failed_items := v_failed_items + 1;
    END IF;
  END LOOP;
  
  -- Calculate item score (passed items / total items * 70% weight)
  IF v_total_items > 0 THEN
    v_item_score := (v_passed_items::numeric / v_total_items::numeric) * 70;
  ELSE
    v_item_score := 0;
  END IF;
  
  -- Calculate photo score (uploaded / required * 30% weight, if photos required)
  IF p_photos_required_count > 0 THEN
    v_photo_score := LEAST(p_photos_uploaded_count::numeric / p_photos_required_count::numeric * 30, 30);
  ELSE
    v_photo_score := 30; -- Full photo points if no photos required
  END IF;
  
  -- Deduct for failed items (10 points per failed item, max -50)
  v_final_score := v_item_score + v_photo_score - LEAST(v_failed_items * 10, 50);
  
  -- Ensure score is between 0 and 100
  v_final_score := GREATEST(0, LEAST(100, v_final_score));
  
  RETURN ROUND(v_final_score, 2);
END;
$$;

-- Function: Create QC inspection when job is marked complete
CREATE OR REPLACE FUNCTION public.create_qc_inspection_on_job_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_checklist_template jsonb;
  v_default_checklist jsonb;
BEGIN
  -- Only trigger when status changes to 'completed' or when crew_completion_workflow is created
  IF TG_TABLE_NAME = 'crew_completion_workflow' AND NEW.status = 'marked_complete' THEN
    -- Get workspace_id from job
    SELECT workspace_id INTO v_workspace_id
    FROM public.roofing_jobs
    WHERE id = NEW.job_id;
    
    IF v_workspace_id IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Check if QC inspection already exists
    IF EXISTS (
      SELECT 1 FROM public.qc_inspections
      WHERE job_id = NEW.job_id
    ) THEN
      RETURN NEW;
    END IF;
    
    -- Get default checklist template for workspace
    SELECT items INTO v_checklist_template
    FROM public.qc_checklist_templates
    WHERE workspace_id = v_workspace_id
      AND is_default = true
      AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- If no template, use default checklist
    IF v_checklist_template IS NULL THEN
      v_default_checklist := '[
        {"key": "shingles_sealed", "label": "All shingles properly sealed", "status": "pending", "requires_photo": true, "weight": 10},
        {"key": "nailing_pattern", "label": "Proper nailing pattern", "status": "pending", "requires_photo": false, "weight": 8},
        {"key": "ridge_cap", "label": "Ridge cap straight + secure", "status": "pending", "requires_photo": true, "weight": 10},
        {"key": "flashings_sealed", "label": "Flashings sealed", "status": "pending", "requires_photo": true, "weight": 12},
        {"key": "pipe_boots", "label": "Pipe boots tight", "status": "pending", "requires_photo": true, "weight": 8},
        {"key": "ventilation", "label": "Ventilation installed correctly", "status": "pending", "requires_photo": false, "weight": 7},
        {"key": "gutters_cleaned", "label": "Gutters cleaned", "status": "pending", "requires_photo": false, "weight": 5},
        {"key": "yard_cleaned", "label": "Yard cleaned (metal / trash)", "status": "pending", "requires_photo": true, "weight": 8},
        {"key": "nails_swept", "label": "Nails magnet sweep done", "status": "pending", "requires_photo": false, "weight": 5},
        {"key": "downspouts", "label": "Downspouts protected", "status": "pending", "requires_photo": false, "weight": 5}
      ]'::jsonb;
      
      -- Initialize each item with status: pending
      v_checklist_template := v_default_checklist;
    END IF;
    
    -- Count required photos
    DECLARE
      v_photo_count integer;
    BEGIN
      SELECT COUNT(*) INTO v_photo_count
      FROM jsonb_array_elements(v_checklist_template)
      WHERE (value->>'requires_photo')::boolean = true;
      
      -- Create QC inspection
      INSERT INTO public.qc_inspections (
        job_id,
        workspace_id,
        checklist,
        photos_required_count,
        status
      ) VALUES (
        NEW.job_id,
        v_workspace_id,
        v_checklist_template,
        v_photo_count,
        'pending'
      );
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function: Create punch list tasks from QC failures
CREATE OR REPLACE FUNCTION public.create_punch_tasks_from_qc_failures(
  p_qc_inspection_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_failure RECORD;
  v_job_id uuid;
  v_punch_id uuid;
  v_checklist jsonb;
  v_item jsonb;
BEGIN
  -- Get QC inspection details
  SELECT job_id, checklist INTO v_job_id, v_checklist
  FROM public.qc_inspections
  WHERE id = p_qc_inspection_id;
  
  IF v_job_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Loop through checklist items and create failures for failed items
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_checklist)
  LOOP
    IF (v_item->>'status')::text = 'fail' THEN
      -- Create QC failure record
      INSERT INTO public.qc_failures (
        qc_inspection_id,
        job_id,
        item,
        item_key,
        notes,
        severity
      ) VALUES (
        p_qc_inspection_id,
        v_job_id,
        COALESCE((v_item->>'label')::text, (v_item->>'key')::text),
        (v_item->>'key')::text,
        COALESCE((v_item->>'notes')::text, 'QC inspection failed'),
        COALESCE((v_item->>'severity')::text, 'medium')::text
      )
      RETURNING id INTO v_punch_id;
      
      -- Create punch list task
      INSERT INTO public.punch_list (
        job_id,
        description,
        status,
        created_at
      ) VALUES (
        v_job_id,
        'QC Repair: ' || COALESCE((v_item->>'label')::text, (v_item->>'key')::text) || 
        CASE 
          WHEN (v_item->>'notes')::text IS NOT NULL THEN ' - ' || (v_item->>'notes')::text
          ELSE ''
        END,
        'needs_qc',
        now()
      )
      RETURNING id INTO v_punch_id;
      
      -- Link punch list to QC failure
      UPDATE public.qc_failures
      SET punch_list_id = v_punch_id
      WHERE id = v_punch_id;
    END IF;
  END LOOP;
END;
$$;

-- Function: Update QC score when checklist or photos change
CREATE OR REPLACE FUNCTION public.update_qc_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_score numeric;
BEGIN
  -- Recalculate score
  v_new_score := public.calculate_qc_score(
    COALESCE(NEW.checklist, '[]'::jsonb),
    COALESCE(NEW.photos_uploaded_count, 0),
    COALESCE(NEW.photos_required_count, 0)
  );
  
  NEW.score := v_new_score;
  NEW.updated_at := now();
  
  -- Auto-update status based on score
  IF v_new_score >= NEW.pass_threshold AND NEW.status = 'in_review' THEN
    NEW.status := 'completed';
    NEW.completed_at := now();
  ELSIF v_new_score < NEW.pass_threshold AND NEW.status = 'completed' THEN
    NEW.status := 'failed';
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- PART 7 — TRIGGERS
-- ============================================================================

-- Trigger: Create QC inspection when crew marks job complete
DROP TRIGGER IF EXISTS trg_create_qc_on_job_complete ON public.crew_completion_workflow;
CREATE TRIGGER trg_create_qc_on_job_complete
AFTER INSERT OR UPDATE ON public.crew_completion_workflow
FOR EACH ROW
WHEN (NEW.status = 'marked_complete')
EXECUTE FUNCTION public.create_qc_inspection_on_job_complete();

-- Trigger: Update QC score when checklist or photos change
DROP TRIGGER IF EXISTS trg_update_qc_score ON public.qc_inspections;
CREATE TRIGGER trg_update_qc_score
BEFORE INSERT OR UPDATE ON public.qc_inspections
FOR EACH ROW
WHEN (NEW.checklist IS DISTINCT FROM OLD.checklist OR NEW.photos_uploaded_count IS DISTINCT FROM OLD.photos_uploaded_count)
EXECUTE FUNCTION public.update_qc_score();

-- Trigger: Create punch tasks when QC status becomes 'failed'
DROP TRIGGER IF EXISTS trg_create_punch_from_qc_failures ON public.qc_inspections;
CREATE TRIGGER trg_create_punch_from_qc_failures
AFTER UPDATE ON public.qc_inspections
FOR EACH ROW
WHEN (NEW.status = 'failed' AND OLD.status != 'failed')
EXECUTE FUNCTION public.create_punch_tasks_from_qc_failures(NEW.id);

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_qc_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qc_inspections_updated_at ON public.qc_inspections;
CREATE TRIGGER trg_qc_inspections_updated_at
BEFORE UPDATE ON public.qc_inspections
FOR EACH ROW
EXECUTE FUNCTION public.set_qc_updated_at();

DROP TRIGGER IF EXISTS trg_qc_failures_updated_at ON public.qc_failures;
CREATE TRIGGER trg_qc_failures_updated_at
BEFORE UPDATE ON public.qc_failures
FOR EACH ROW
EXECUTE FUNCTION public.set_qc_updated_at();

DROP TRIGGER IF EXISTS trg_qc_checklist_templates_updated_at ON public.qc_checklist_templates;
CREATE TRIGGER trg_qc_checklist_templates_updated_at
BEFORE UPDATE ON public.qc_checklist_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_qc_updated_at();

DROP TRIGGER IF EXISTS trg_homeowner_qc_verification_updated_at ON public.homeowner_qc_verification;
CREATE TRIGGER trg_homeowner_qc_verification_updated_at
BEFORE UPDATE ON public.homeowner_qc_verification
FOR EACH ROW
EXECUTE FUNCTION public.set_qc_updated_at();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE public.qc_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_qc_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_checklist_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for qc_inspections
CREATE POLICY "qc_inspections_select_workspace"
  ON public.qc_inspections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = qc_inspections.workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "qc_inspections_insert_workspace"
  ON public.qc_inspections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "qc_inspections_update_workspace"
  ON public.qc_inspections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for qc_photos
CREATE POLICY "qc_photos_select_workspace"
  ON public.qc_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.qc_inspections qi
      JOIN public.workspaces w ON w.id = qi.workspace_id
      WHERE qi.id = qc_photos.qc_inspection_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "qc_photos_insert_workspace"
  ON public.qc_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.qc_inspections qi
      JOIN public.workspaces w ON w.id = qi.workspace_id
      WHERE qi.id = qc_inspection_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for qc_failures
CREATE POLICY "qc_failures_select_workspace"
  ON public.qc_failures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.qc_inspections qi
      JOIN public.workspaces w ON w.id = qi.workspace_id
      WHERE qi.id = qc_failures.qc_inspection_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "qc_failures_insert_workspace"
  ON public.qc_failures FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.qc_inspections qi
      JOIN public.workspaces w ON w.id = qi.workspace_id
      WHERE qi.id = qc_inspection_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for homeowner_qc_verification (read-only for homeowners via portal token)
CREATE POLICY "homeowner_qc_verification_select_workspace"
  ON public.homeowner_qc_verification FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
    OR status = 'pending' -- Allow public access for pending verifications (homeowner portal)
  );

CREATE POLICY "homeowner_qc_verification_insert_workspace"
  ON public.homeowner_qc_verification FOR INSERT
  WITH CHECK (true); -- Allow inserts (for homeowner portal public access)

CREATE POLICY "homeowner_qc_verification_update_workspace"
  ON public.homeowner_qc_verification FOR UPDATE
  USING (true); -- Allow updates (for homeowner portal public access)

-- RLS Policies for qc_checklist_templates
CREATE POLICY "qc_checklist_templates_select_workspace"
  ON public.qc_checklist_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "qc_checklist_templates_insert_workspace"
  ON public.qc_checklist_templates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "qc_checklist_templates_update_workspace"
  ON public.qc_checklist_templates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id
      AND (
        w.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.workspace_id = w.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- PART 9 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.qc_inspections IS 'QC inspection records created when jobs are marked complete (Block 50000)';
COMMENT ON TABLE public.qc_photos IS 'Photos uploaded as proof for QC checklist items (Block 50000)';
COMMENT ON TABLE public.qc_failures IS 'Failed QC items that trigger punch list tasks (Block 50000)';
COMMENT ON TABLE public.homeowner_qc_verification IS 'Homeowner final sign-off after QC completion (Block 50000)';
COMMENT ON TABLE public.qc_checklist_templates IS 'Customizable QC checklist templates per workspace (Block 50000)';

COMMENT ON FUNCTION public.calculate_qc_score IS 'Calculates QC score (0-100) based on checklist items and photos';
COMMENT ON FUNCTION public.create_qc_inspection_on_job_complete IS 'Auto-creates QC inspection when crew marks job complete';
COMMENT ON FUNCTION public.create_punch_tasks_from_qc_failures IS 'Creates punch list tasks from failed QC items';
































