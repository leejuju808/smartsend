-- =========================================================
-- Block 252200 — SmartSend QC Engine v1
-- "Final Walkthrough Checklist, Punch List System, Customer Sign-Off, Warranty Packet Generator"
-- =========================================================
-- 
-- This is the feature that will make roofers FALL IN LOVE with SmartSend because:
-- 
-- callbacks DESTROY profit
-- sloppy final inspections RUIN reputation
-- warranty issues cost THOUSANDS
-- customers feel unsure after install
-- foremen forget half the QC steps
-- 
-- SmartSend fixes ALL of it by giving them a professional-grade quality control engine.
-- 
-- Roofers will say:
-- "SmartSend's QC system alone makes us look like a $10M company.
-- We'd be idiots not to use it."
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE qc_checklist_templates TABLE
-- ============================================================================
-- Admin creates QC items per job type

CREATE TABLE IF NOT EXISTS public.qc_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  job_type text NOT NULL,              -- "roof_replacement", "repair", "inspection", etc.
  category text NOT NULL,              -- "Roof Surface", "Flashings", "Gutters", "Vents", "Cleanup", etc.
  item text NOT NULL,                  -- "Ridge caps installed correctly"
  requires_photo boolean DEFAULT false,
  display_order int DEFAULT 0,        -- Order within category
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qc_checklist_templates_company ON public.qc_checklist_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_qc_checklist_templates_job_type ON public.qc_checklist_templates(company_id, job_type);
CREATE INDEX IF NOT EXISTS idx_qc_checklist_templates_category ON public.qc_checklist_templates(company_id, job_type, category);

COMMENT ON TABLE public.qc_checklist_templates IS 'QC checklist items per job type (Block 252200)';
COMMENT ON COLUMN public.qc_checklist_templates.job_type IS 'Job type: roof_replacement, repair, inspection, gutter, etc.';
COMMENT ON COLUMN public.qc_checklist_templates.category IS 'Category: Roof Surface, Flashings, Gutters, Vents, Cleanup, etc.';
COMMENT ON COLUMN public.qc_checklist_templates.requires_photo IS 'Whether this item requires a photo for verification';

-- ============================================================================
-- PART 2 — CREATE qc_inspections TABLE
-- ============================================================================
-- Each job's QC session

CREATE TABLE IF NOT EXISTS public.qc_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  foreman_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'pending_customer_signoff')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qc_inspections_job ON public.qc_inspections(job_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_foreman ON public.qc_inspections(foreman_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_status ON public.qc_inspections(status);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_completed ON public.qc_inspections(completed_at) WHERE completed_at IS NOT NULL;

COMMENT ON TABLE public.qc_inspections IS 'QC inspection sessions for jobs (Block 252200)';
COMMENT ON COLUMN public.qc_inspections.status IS 'Status: in_progress, completed, pending_customer_signoff';

-- ============================================================================
-- PART 3 — CREATE qc_inspection_items TABLE
-- ============================================================================
-- Actual checklist items answered by the foreman

CREATE TABLE IF NOT EXISTS public.qc_inspection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.qc_inspections(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.qc_checklist_templates(id) ON DELETE SET NULL,
  category text,                       -- Denormalized for quick access
  item text,                           -- Denormalized for quick access
  passed boolean,
  photo_url text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qc_inspection_items_inspection ON public.qc_inspection_items(inspection_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspection_items_template ON public.qc_inspection_items(template_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspection_items_passed ON public.qc_inspection_items(inspection_id, passed);

COMMENT ON TABLE public.qc_inspection_items IS 'Individual QC checklist items answered by foreman (Block 252200)';
COMMENT ON COLUMN public.qc_inspection_items.passed IS 'Whether this item passed inspection (null = not checked yet)';

-- ============================================================================
-- PART 4 — CREATE qc_punch_list TABLE
-- ============================================================================
-- Items needing fixes

CREATE TABLE IF NOT EXISTS public.qc_punch_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  inspection_id uuid REFERENCES public.qc_inspections(id) ON DELETE SET NULL,
  inspection_item_id uuid REFERENCES public.qc_inspection_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  assigned_to uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed')),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qc_punch_list_job ON public.qc_punch_list(job_id);
CREATE INDEX IF NOT EXISTS idx_qc_punch_list_inspection ON public.qc_punch_list(inspection_id);
CREATE INDEX IF NOT EXISTS idx_qc_punch_list_assigned ON public.qc_punch_list(assigned_to);
CREATE INDEX IF NOT EXISTS idx_qc_punch_list_status ON public.qc_punch_list(job_id, status);

COMMENT ON TABLE public.qc_punch_list IS 'Items needing fixes after QC inspection (Block 252200)';
COMMENT ON COLUMN public.qc_punch_list.status IS 'Status: open, in_progress, completed';

-- ============================================================================
-- PART 5 — CREATE customer_signoff TABLE
-- ============================================================================
-- Customer signature after walkthrough

CREATE TABLE IF NOT EXISTS public.customer_signoff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  inspection_id uuid REFERENCES public.qc_inspections(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  signature_url text NOT NULL,         -- URL to signature image in Supabase storage
  signed_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_signoff_job ON public.customer_signoff(job_id);
CREATE INDEX IF NOT EXISTS idx_customer_signoff_inspection ON public.customer_signoff(inspection_id);
CREATE INDEX IF NOT EXISTS idx_customer_signoff_signed_at ON public.customer_signoff(signed_at);

COMMENT ON TABLE public.customer_signoff IS 'Customer signature after QC walkthrough (Block 252200)';

-- ============================================================================
-- PART 6 — TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_qc_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_qc_checklist_templates_updated_at
BEFORE UPDATE ON public.qc_checklist_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_qc_updated_at();

CREATE TRIGGER trg_qc_inspections_updated_at
BEFORE UPDATE ON public.qc_inspections
FOR EACH ROW
EXECUTE FUNCTION public.set_qc_updated_at();

CREATE TRIGGER trg_qc_inspection_items_updated_at
BEFORE UPDATE ON public.qc_inspection_items
FOR EACH ROW
EXECUTE FUNCTION public.set_qc_updated_at();

CREATE TRIGGER trg_qc_punch_list_updated_at
BEFORE UPDATE ON public.qc_punch_list
FOR EACH ROW
EXECUTE FUNCTION public.set_qc_updated_at();

-- ============================================================================
-- PART 7 — FUNCTION: Auto-create punch list item when QC item fails
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_create_punch_list_on_fail()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id uuid;
  v_inspection_id uuid;
BEGIN
  -- Only create punch list if item failed (passed = false)
  IF NEW.passed = false AND (OLD.passed IS NULL OR OLD.passed = true) THEN
    -- Get job_id from inspection
    SELECT job_id INTO v_job_id
    FROM public.qc_inspections
    WHERE id = NEW.inspection_id;
    
    -- Create punch list item
    INSERT INTO public.qc_punch_list (
      job_id,
      inspection_id,
      inspection_item_id,
      description,
      status
    ) VALUES (
      v_job_id,
      NEW.inspection_id,
      NEW.id,
      COALESCE(NEW.item, 'QC item failed inspection'),
      'open'
    );
  END IF;
  
  -- If item passes and was previously failed, mark punch list as completed if it exists
  IF NEW.passed = true AND OLD.passed = false THEN
    UPDATE public.qc_punch_list
    SET status = 'completed',
        completed_at = now()
    WHERE inspection_item_id = NEW.id
      AND status != 'completed';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_punch_list_on_fail
AFTER INSERT OR UPDATE ON public.qc_inspection_items
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_punch_list_on_fail();

COMMENT ON FUNCTION public.auto_create_punch_list_on_fail IS 'Auto-creates punch list item when QC item fails (Block 252200)';

-- ============================================================================
-- PART 8 — FUNCTION: Calculate QC score for a job
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_qc_score(p_job_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_passed_count int;
  v_total_count int;
  v_score numeric;
BEGIN
  -- Get counts from the most recent completed inspection
  SELECT 
    COUNT(*) FILTER (WHERE passed = true),
    COUNT(*) FILTER (WHERE passed IS NOT NULL)
  INTO v_passed_count, v_total_count
  FROM public.qc_inspection_items qi
  INNER JOIN public.qc_inspections q ON qi.inspection_id = q.id
  WHERE q.job_id = p_job_id
    AND q.status = 'completed'
    AND q.completed_at IS NOT NULL
  ORDER BY q.completed_at DESC
  LIMIT 1;
  
  -- Calculate score (0-100)
  IF v_total_count > 0 THEN
    v_score := (v_passed_count::numeric / v_total_count::numeric) * 100;
  ELSE
    v_score := NULL; -- No QC data available
  END IF;
  
  RETURN v_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_qc_score IS 'Calculates QC score (0-100) for a job based on passed/total items (Block 252200)';

-- ============================================================================
-- PART 9 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.qc_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_punch_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_signoff ENABLE ROW LEVEL SECURITY;

-- RLS Policies will be added in a separate migration or via application-level auth
-- For now, we'll rely on application-level security

-- ============================================================================
-- PART 10 — SEED DEFAULT QC TEMPLATES (Optional - can be done via UI)
-- ============================================================================
-- This can be uncommented to seed default templates for testing

-- Example default templates would be inserted here based on company_id
-- For now, templates will be created via the admin UI
























