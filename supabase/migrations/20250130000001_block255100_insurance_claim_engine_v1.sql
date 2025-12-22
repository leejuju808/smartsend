-- ============================================================
-- Block 255100 — SmartSend AI Insurance Claim Engine v1
-- Claim Documentation, Photo Evidence Packs, Scope Comparison,
-- Adjuster Negotiation Support, ACV/RCV Automation
-- ============================================================
-- 
-- This block turns SmartSend into the ultimate insurance claims weapon 
-- for roofing companies — something NO CRM, no contractor software, 
-- and no adjuster tool can compete with.
-- 
-- Roofers LOSE MONEY on insurance jobs BECAUSE:
-- - They don't document damage properly
-- - Adjusters underpay them
-- - Homeowners don't understand the process
-- - Scope of loss is missing items
-- - Contractors fail to prove damage
-- - They don't track supplements
-- - Paperwork gets lost
-- - There's no standardized claim pack
-- - Adjusters control the narrative
-- - No one knows what's owed in ACV/RCV
-- - Supplement requests take too long
-- 
-- SmartSend FIXES. ALL. OF. THIS.
-- ============================================================

-- ============================================================================
-- PART 1 — CREATE insurance_claims TABLE
-- ============================================================================
-- Central table for all insurance claims linked to jobs

CREATE TABLE IF NOT EXISTS public.insurance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  -- Claim identification
  claim_number text NOT NULL,
  carrier text NOT NULL, -- Insurance company name
  policy_number text,
  
  -- Adjuster information
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  adjuster_company text,
  
  -- Claim status tracking
  claim_status text NOT NULL DEFAULT 'filed' CHECK (claim_status IN (
    'filed',                    -- Claim filed with insurance
    'inspection_scheduled',     -- Adjuster inspection scheduled
    'inspection_completed',     -- Inspection done, awaiting decision
    'approved',                 -- Claim approved
    'denied',                   -- Claim denied
    'supplement_pending',       -- Supplement submitted, awaiting response
    'supplement_approved',      -- Supplement approved
    'supplement_denied',        -- Supplement denied
    'completed',                -- Claim fully processed and paid
    'closed'                    -- Claim closed
  )),
  
  -- Financial information
  deductible numeric(12,2),
  acv numeric(12,2),           -- Actual Cash Value
  rcv numeric(12,2),          -- Replacement Cost Value
  depreciation numeric(12,2),
  total_claim_value numeric(12,2), -- Total approved claim amount
  total_supplement_value numeric(12,2) DEFAULT 0, -- Total supplement value
  
  -- Scope information
  approved_scope jsonb DEFAULT '[]'::jsonb, -- Adjuster's approved scope (line items)
  contractor_scope jsonb DEFAULT '[]'::jsonb, -- Contractor's scope (line items)
  missing_items jsonb DEFAULT '[]'::jsonb, -- Items missing from adjuster scope
  
  -- Document references
  claim_document_pack_url text, -- PDF of complete claim pack
  adjuster_scope_pdf_url text,  -- Adjuster's scope PDF
  supplement_pack_url text,     -- Supplement request PDF
  
  -- Dates
  claim_filed_date date,
  inspection_scheduled_date date,
  inspection_completed_date date,
  approval_date date,
  first_check_received_date date,
  depreciation_check_received_date date,
  final_check_received_date date,
  
  -- Notes and communication
  adjuster_notes text,
  contractor_notes text,
  communication_log jsonb DEFAULT '[]'::jsonb, -- Array of communication events
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for insurance_claims
CREATE INDEX IF NOT EXISTS idx_insurance_claims_job ON public.insurance_claims(job_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_workspace ON public.insurance_claims(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_claims_company ON public.insurance_claims(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON public.insurance_claims(claim_status);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_claim_number ON public.insurance_claims(claim_number);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_carrier ON public.insurance_claims(carrier);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_created ON public.insurance_claims(created_at DESC);

COMMENT ON TABLE public.insurance_claims IS 'Central table for all insurance claims linked to jobs (Block 255100)';
COMMENT ON COLUMN public.insurance_claims.claim_status IS 'Status: filed, inspection_scheduled, inspection_completed, approved, denied, supplement_pending, supplement_approved, supplement_denied, completed, closed';
COMMENT ON COLUMN public.insurance_claims.approved_scope IS 'Adjuster approved scope as JSONB array of line items';
COMMENT ON COLUMN public.insurance_claims.contractor_scope IS 'Contractor scope as JSONB array of line items';
COMMENT ON COLUMN public.insurance_claims.missing_items IS 'Items detected as missing from adjuster scope';

-- ============================================================================
-- PART 2 — CREATE supplement_items TABLE
-- ============================================================================
-- Tracks individual supplement line items

CREATE TABLE IF NOT EXISTS public.supplement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  
  -- Supplement identification
  supplement_number int NOT NULL, -- e.g., 1, 2, 3 for Supplement #1, #2, #3
  line_item text NOT NULL, -- e.g., "Drip Edge", "Ice & Water Shield"
  
  -- Cost and justification
  cost numeric(12,2) NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit text, -- e.g., "LF" (linear feet), "SQ" (squares), "EA" (each)
  reason text NOT NULL, -- Justification for supplement
  reason_type text CHECK (reason_type IN (
    'code_required',      -- Required by local building code
    'damage_item',        -- Damage discovered during work
    'scope_missing',      -- Missing from original scope
    'upgrade_required',   -- Upgrade required for code compliance
    'measurement_error',  -- Original measurement was incorrect
    'other'               -- Other reason
  )),
  
  -- Status tracking
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',    -- Not yet submitted
    'submitted',  -- Submitted to adjuster
    'approved',   -- Approved by adjuster
    'denied',     -- Denied by adjuster
    'negotiating' -- Under negotiation
  )),
  
  -- Supporting evidence
  evidence_photo_ids uuid[], -- Array of evidence_photos IDs
  code_reference text, -- Building code reference if code_required
  notes text,
  
  -- Dates
  submitted_at timestamptz,
  approved_at timestamptz,
  denied_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for supplement_items
CREATE INDEX IF NOT EXISTS idx_supplement_items_claim ON public.supplement_items(claim_id);
CREATE INDEX IF NOT EXISTS idx_supplement_items_status ON public.supplement_items(claim_id, status);
CREATE INDEX IF NOT EXISTS idx_supplement_items_supplement_number ON public.supplement_items(claim_id, supplement_number);

COMMENT ON TABLE public.supplement_items IS 'Tracks individual supplement line items (Block 255100)';
COMMENT ON COLUMN public.supplement_items.supplement_number IS 'Supplement number (1, 2, 3, etc.) for grouping items';
COMMENT ON COLUMN public.supplement_items.reason_type IS 'Type of reason: code_required, damage_item, scope_missing, upgrade_required, measurement_error, other';

-- ============================================================================
-- PART 3 — CREATE evidence_photos TABLE
-- ============================================================================
-- AI-analyzed evidence photos for claims

CREATE TABLE IF NOT EXISTS public.evidence_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  
  -- Photo storage
  photo_url text NOT NULL,
  storage_path text, -- Path in Supabase storage
  thumbnail_url text,
  
  -- AI damage classification
  ai_damage_type text, -- Primary damage type: 'hail', 'wind', 'mechanical', 'age', 'water', 'other'
  ai_damage_types text[], -- Array of all detected damage types
  ai_confidence numeric(5,2) CHECK (ai_confidence >= 0 AND ai_confidence <= 100), -- 0-100%
  
  -- AI analysis details
  ai_analysis jsonb DEFAULT '{}'::jsonb, -- Full AI analysis result
  ai_findings text, -- Human-readable AI findings
  ai_location text, -- Location on roof: 'north_slope', 'south_slope', 'ridge', 'valley', etc.
  ai_severity text CHECK (ai_severity IN ('minor', 'moderate', 'severe', 'critical')),
  
  -- Photo metadata
  photo_category text CHECK (photo_category IN (
    'before',
    'during',
    'after',
    'damage_closeup',
    'damage_overview',
    'material',
    'code_item',
    'supplement_evidence'
  )),
  taken_at timestamptz,
  taken_by text, -- Crew member name or user ID
  
  -- Manual classification (overrides AI if set)
  manual_damage_type text,
  manual_notes text,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for evidence_photos
CREATE INDEX IF NOT EXISTS idx_evidence_photos_claim ON public.evidence_photos(claim_id);
CREATE INDEX IF NOT EXISTS idx_evidence_photos_damage_type ON public.evidence_photos(ai_damage_type) WHERE ai_damage_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_evidence_photos_category ON public.evidence_photos(claim_id, photo_category);
CREATE INDEX IF NOT EXISTS idx_evidence_photos_created ON public.evidence_photos(created_at DESC);

COMMENT ON TABLE public.evidence_photos IS 'AI-analyzed evidence photos for insurance claims (Block 255100)';
COMMENT ON COLUMN public.evidence_photos.ai_damage_type IS 'Primary damage type detected by AI: hail, wind, mechanical, age, water, other';
COMMENT ON COLUMN public.evidence_photos.ai_confidence IS 'AI confidence score (0-100%)';

-- ============================================================================
-- PART 4 — CREATE claim_tasks TABLE
-- ============================================================================
-- Task board for managing claim workflow

CREATE TABLE IF NOT EXISTS public.claim_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  
  -- Task information
  task_type text NOT NULL CHECK (task_type IN (
    'file_claim',
    'adjuster_call',
    'adjuster_meeting',
    'submit_documents',
    'submit_supplement',
    'follow_up_supplement',
    'receive_check_1',
    'receive_depreciation_check',
    'receive_final_check',
    'schedule_build',
    'complete_build',
    'final_invoice',
    'other'
  )),
  title text NOT NULL,
  description text,
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
  )),
  
  -- Assignment
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_name text, -- Denormalized name for quick display
  
  -- Dates
  due_date date,
  completed_at timestamptz,
  
  -- Priority
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for claim_tasks
CREATE INDEX IF NOT EXISTS idx_claim_tasks_claim ON public.claim_tasks(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_tasks_status ON public.claim_tasks(claim_id, status);
CREATE INDEX IF NOT EXISTS idx_claim_tasks_assigned ON public.claim_tasks(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claim_tasks_due_date ON public.claim_tasks(due_date) WHERE due_date IS NOT NULL;

COMMENT ON TABLE public.claim_tasks IS 'Task board for managing insurance claim workflow (Block 255100)';

-- ============================================================================
-- PART 5 — CREATE homeowner_insurance_portal TABLE
-- ============================================================================
-- Homeowner-facing insurance claim portal

CREATE TABLE IF NOT EXISTS public.homeowner_insurance_portal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  
  -- Portal access
  access_token text UNIQUE NOT NULL, -- Token for secure portal access
  token_expires_at timestamptz,
  
  -- Homeowner information
  homeowner_name text,
  homeowner_email text,
  homeowner_phone text,
  
  -- Portal settings
  is_active boolean DEFAULT true,
  last_accessed_at timestamptz,
  access_count int DEFAULT 0,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for homeowner_insurance_portal
CREATE INDEX IF NOT EXISTS idx_homeowner_insurance_portal_claim ON public.homeowner_insurance_portal(claim_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_insurance_portal_job ON public.homeowner_insurance_portal(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_insurance_portal_token ON public.homeowner_insurance_portal(access_token);

COMMENT ON TABLE public.homeowner_insurance_portal IS 'Homeowner-facing insurance claim portal access (Block 255100)';

-- ============================================================================
-- PART 6 — CREATE STORAGE BUCKETS
-- ============================================================================

-- Insurance claim documents bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'insurance-claims',
  'insurance-claims',
  false,
  52428800, -- 50MB limit
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Evidence photos bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence-photos',
  'evidence-photos',
  false,
  10485760, -- 10MB limit per photo
  ARRAY['image/jpeg', 'image/png', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 7 — FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_insurance_claims_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_insurance_claims_updated_at
BEFORE UPDATE ON public.insurance_claims
FOR EACH ROW
EXECUTE FUNCTION public.set_insurance_claims_updated_at();

CREATE OR REPLACE FUNCTION public.set_supplement_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_supplement_items_updated_at
BEFORE UPDATE ON public.supplement_items
FOR EACH ROW
EXECUTE FUNCTION public.set_supplement_items_updated_at();

CREATE OR REPLACE FUNCTION public.set_evidence_photos_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_evidence_photos_updated_at
BEFORE UPDATE ON public.evidence_photos
FOR EACH ROW
EXECUTE FUNCTION public.set_evidence_photos_updated_at();

CREATE OR REPLACE FUNCTION public.set_claim_tasks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_claim_tasks_updated_at
BEFORE UPDATE ON public.claim_tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_claim_tasks_updated_at();

-- Function: Auto-calculate total supplement value
CREATE OR REPLACE FUNCTION public.calculate_total_supplement_value()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(cost * COALESCE(quantity, 1)), 0)
  INTO v_total
  FROM public.supplement_items
  WHERE claim_id = COALESCE(NEW.claim_id, OLD.claim_id)
    AND status IN ('submitted', 'approved', 'negotiating');
  
  UPDATE public.insurance_claims
  SET total_supplement_value = v_total,
      updated_at = now()
  WHERE id = COALESCE(NEW.claim_id, OLD.claim_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_calculate_total_supplement_value
AFTER INSERT OR UPDATE OR DELETE ON public.supplement_items
FOR EACH ROW
EXECUTE FUNCTION public.calculate_total_supplement_value();

-- Function: Generate supplement number
CREATE OR REPLACE FUNCTION public.generate_supplement_number(p_claim_id uuid)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_number int;
BEGIN
  SELECT COALESCE(MAX(supplement_number), 0)
  INTO v_max_number
  FROM public.supplement_items
  WHERE claim_id = p_claim_id;
  
  RETURN v_max_number + 1;
END;
$$;

COMMENT ON FUNCTION public.generate_supplement_number IS 'Generate next supplement number for a claim (Block 255100)';

-- Function: Auto-create claim tasks based on status
CREATE OR REPLACE FUNCTION public.auto_create_claim_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create tasks based on claim status
  IF NEW.claim_status = 'filed' AND (OLD.claim_status IS NULL OR OLD.claim_status != 'filed') THEN
    INSERT INTO public.claim_tasks (claim_id, task_type, title, status, priority)
    VALUES (NEW.id, 'file_claim', 'File claim with insurance', 'completed', 'normal');
  END IF;
  
  IF NEW.claim_status = 'inspection_scheduled' AND (OLD.claim_status IS NULL OR OLD.claim_status != 'inspection_scheduled') THEN
    INSERT INTO public.claim_tasks (claim_id, task_type, title, status, priority, due_date)
    VALUES (NEW.id, 'adjuster_meeting', 'Attend adjuster inspection', 'pending', 'high', NEW.inspection_scheduled_date);
  END IF;
  
  IF NEW.claim_status = 'approved' AND (OLD.claim_status IS NULL OR OLD.claim_status != 'approved') THEN
    INSERT INTO public.claim_tasks (claim_id, task_type, title, status, priority)
    VALUES (NEW.id, 'receive_check_1', 'Receive first check', 'pending', 'high');
  END IF;
  
  IF NEW.claim_status = 'supplement_pending' AND (OLD.claim_status IS NULL OR OLD.claim_status != 'supplement_pending') THEN
    INSERT INTO public.claim_tasks (claim_id, task_type, title, status, priority)
    VALUES (NEW.id, 'follow_up_supplement', 'Follow up on supplement request', 'pending', 'high');
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_claim_tasks
AFTER INSERT OR UPDATE OF claim_status ON public.insurance_claims
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_claim_tasks();

COMMENT ON FUNCTION public.auto_create_claim_tasks IS 'Auto-create claim tasks based on status changes (Block 255100)';

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_insurance_portal ENABLE ROW LEVEL SECURITY;

-- Insurance claims policies (workspace-based)
CREATE POLICY "insurance_claims_select_workspace_members"
  ON public.insurance_claims FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "insurance_claims_insert_workspace_members"
  ON public.insurance_claims FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "insurance_claims_update_workspace_members"
  ON public.insurance_claims FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces
      WHERE owner_id = auth.uid()
    )
  );

-- Supplement items policies
CREATE POLICY "supplement_items_select_claim_access"
  ON public.supplement_items FOR SELECT
  USING (
    claim_id IN (
      SELECT id FROM public.insurance_claims
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

CREATE POLICY "supplement_items_insert_claim_access"
  ON public.supplement_items FOR INSERT
  WITH CHECK (
    claim_id IN (
      SELECT id FROM public.insurance_claims
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

CREATE POLICY "supplement_items_update_claim_access"
  ON public.supplement_items FOR UPDATE
  USING (
    claim_id IN (
      SELECT id FROM public.insurance_claims
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

-- Evidence photos policies
CREATE POLICY "evidence_photos_select_claim_access"
  ON public.evidence_photos FOR SELECT
  USING (
    claim_id IN (
      SELECT id FROM public.insurance_claims
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

CREATE POLICY "evidence_photos_insert_claim_access"
  ON public.evidence_photos FOR INSERT
  WITH CHECK (
    claim_id IN (
      SELECT id FROM public.insurance_claims
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

CREATE POLICY "evidence_photos_update_claim_access"
  ON public.evidence_photos FOR UPDATE
  USING (
    claim_id IN (
      SELECT id FROM public.insurance_claims
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

-- Claim tasks policies
CREATE POLICY "claim_tasks_select_claim_access"
  ON public.claim_tasks FOR SELECT
  USING (
    claim_id IN (
      SELECT id FROM public.insurance_claims
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

CREATE POLICY "claim_tasks_insert_claim_access"
  ON public.claim_tasks FOR INSERT
  WITH CHECK (
    claim_id IN (
      SELECT id FROM public.insurance_claims
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

CREATE POLICY "claim_tasks_update_claim_access"
  ON public.claim_tasks FOR UPDATE
  USING (
    claim_id IN (
      SELECT id FROM public.insurance_claims
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

-- Homeowner portal policies (public access via token)
CREATE POLICY "homeowner_insurance_portal_select_public"
  ON public.homeowner_insurance_portal FOR SELECT
  USING (true); -- Public access via token (handled in application layer)

-- ============================================================================
-- PART 9 — VIEWS FOR ANALYTICS
-- ============================================================================

-- View: Claim summary with financials
CREATE OR REPLACE VIEW public.insurance_claims_summary AS
SELECT 
  ic.id,
  ic.job_id,
  ic.claim_number,
  ic.carrier,
  ic.claim_status,
  ic.deductible,
  ic.acv,
  ic.rcv,
  ic.depreciation,
  ic.total_claim_value,
  ic.total_supplement_value,
  (ic.total_claim_value + ic.total_supplement_value) as total_approved_value,
  ic.claim_filed_date,
  ic.approval_date,
  COUNT(DISTINCT si.id) as supplement_count,
  COUNT(DISTINCT ep.id) as photo_count,
  COUNT(DISTINCT ct.id) FILTER (WHERE ct.status = 'pending') as pending_tasks_count
FROM public.insurance_claims ic
LEFT JOIN public.supplement_items si ON si.claim_id = ic.id
LEFT JOIN public.evidence_photos ep ON ep.claim_id = ic.id
LEFT JOIN public.claim_tasks ct ON ct.claim_id = ic.id
GROUP BY ic.id;

COMMENT ON VIEW public.insurance_claims_summary IS 'Summary view of insurance claims with financials and counts (Block 255100)';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================





















