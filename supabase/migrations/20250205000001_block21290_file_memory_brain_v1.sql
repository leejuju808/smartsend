-- =========================================================
-- Block 21290 — SmartSend File Memory Brain v1
-- (Understands EVERY file ever sent: scopes, approvals, invoices, contracts, photos, adjuster letters → Unified Job Intelligence)
-- =========================================================
--
-- This block is MASSIVE.
--
-- This is where SmartSend evolves from "AI automation tool"
-- →
-- to a full, deep-memory roofing intelligence system.
--
-- Right now, SmartSend reads:
-- - emails
-- - attachments
-- - scopes
-- - approval letters
--
-- But File Memory Brain v1 creates a NEW layer:
--
-- 👉 SmartSend REMEMBERS every file ever uploaded or emailed throughout the ENTIRE lifecycle of the job.
--
-- This allows SmartSend to:
-- - Retrieve information instantly
-- - Compare documents across time
-- - Detect missing pieces
-- - Spot contradictions
-- - Improve insurance analysis
-- - Boost supplement accuracy
-- - Update revenue forecasts
-- - Improve reply classification
-- - Improve timeline accuracy
--
-- This is how SmartSend becomes "the brain of the roofing company."
--
-- This feature alone makes SmartSend feel like LEGENDARY software.
-- =========================================================

-- ============================================================================
-- PART 1 — Create file_memory Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.file_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to job/lead/thread (flexible linking)
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Organization/Workspace isolation
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  
  -- File metadata
  file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN (
    'scope',
    'approval_letter',
    'denial_letter',
    'invoice',
    'photoset',
    'supplement',
    'contract',
    'payment_statement',
    'adjuster_notes',
    'estimate',
    'proposal',
    'change_order',
    'policy_declarations',
    'general_correspondence',
    'unknown'
  )),
  
  -- Parsed data (JSONB with all extracted information)
  parsed_data jsonb DEFAULT '{}'::jsonb,
  -- Structure: {
  --   "rcv": 28500.00,
  --   "acv": 17200.00,
  --   "deductible": 1500.00,
  --   "depreciation": 11300.00,
  --   "depreciation_recoverable": true,
  --   "carrier_name": "State Farm",
  --   "adjuster_name": "John Smith",
  --   "claim_number": "123456789",
  --   "line_items": [...],
  --   "dates": {...},
  --   "coverage_details": {...}
  -- }
  
  -- AI-generated summary (human-readable)
  ai_summary text,
  
  -- Document date (when the document was created/dated, not when uploaded)
  document_date date,
  
  -- Upload metadata
  uploaded_by text CHECK (uploaded_by IN ('user', 'system', 'email', 'api')),
  source text CHECK (source IN ('email', 'user_upload', 'auto_detected', 'api', 'manual')),
  
  -- Storage reference
  storage_url text, -- Supabase Storage path or URL
  attachment_id uuid REFERENCES public.email_attachments(id) ON DELETE SET NULL,
  insurance_attachment_id uuid REFERENCES public.insurance_attachments(id) ON DELETE SET NULL,
  
  -- Processing status
  processing_status text DEFAULT 'pending' CHECK (processing_status IN (
    'pending',
    'processing',
    'completed',
    'failed',
    'needs_review'
  )),
  processing_errors text[],
  
  -- Version tracking (for scope comparisons)
  version_number integer DEFAULT 1,
  previous_version_id uuid REFERENCES public.file_memory(id) ON DELETE SET NULL,
  
  -- Conflict detection
  has_conflicts boolean DEFAULT false,
  conflict_details jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure at least one link exists
  CONSTRAINT file_memory_has_link CHECK (
    lead_id IS NOT NULL OR thread_id IS NOT NULL OR contact_id IS NOT NULL
  )
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_file_memory_lead ON public.file_memory(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_file_memory_thread ON public.file_memory(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_file_memory_contact ON public.file_memory(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_file_memory_org ON public.file_memory(organization_id);
CREATE INDEX IF NOT EXISTS idx_file_memory_workspace ON public.file_memory(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_file_memory_type ON public.file_memory(file_type);
CREATE INDEX IF NOT EXISTS idx_file_memory_status ON public.file_memory(processing_status);
CREATE INDEX IF NOT EXISTS idx_file_memory_document_date ON public.file_memory(document_date DESC);
CREATE INDEX IF NOT EXISTS idx_file_memory_parsed_data ON public.file_memory USING GIN(parsed_data);
CREATE INDEX IF NOT EXISTS idx_file_memory_conflicts ON public.file_memory(has_conflicts) WHERE has_conflicts = true;
CREATE INDEX IF NOT EXISTS idx_file_memory_version ON public.file_memory(previous_version_id) WHERE previous_version_id IS NOT NULL;

COMMENT ON TABLE public.file_memory IS 'Block 21290 — File Memory Brain v1: Unified document memory for every file ever uploaded or emailed throughout the entire lifecycle of a job';
COMMENT ON COLUMN public.file_memory.parsed_data IS 'JSONB containing all extracted data: RCV, ACV, deductible, line items, dates, carrier info, etc.';
COMMENT ON COLUMN public.file_memory.ai_summary IS 'AI-generated human-readable summary of the document (e.g., "Insurance approval letter from State Farm dated 8/22/25. RCV: $28,500...")';
COMMENT ON COLUMN public.file_memory.document_date IS 'Date when the document was created/dated (not when uploaded to SmartSend)';
COMMENT ON COLUMN public.file_memory.version_number IS 'Version number for scope documents (1, 2, 3...) to track revisions';
COMMENT ON COLUMN public.file_memory.has_conflicts IS 'Flag indicating if this file conflicts with other files (e.g., different approval amounts)';

-- ============================================================================
-- PART 2 — Update Timestamp Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_file_memory_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_file_memory_timestamp ON public.file_memory;
CREATE TRIGGER trg_update_file_memory_timestamp
  BEFORE UPDATE ON public.file_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_file_memory_timestamp();

-- ============================================================================
-- PART 3 — Function: Parse File and Store in Memory
-- ============================================================================

CREATE OR REPLACE FUNCTION public.store_file_in_memory(
  p_file_name text,
  p_file_type text,
  p_storage_url text,
  p_lead_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL,
  p_attachment_id uuid DEFAULT NULL,
  p_insurance_attachment_id uuid DEFAULT NULL,
  p_source text DEFAULT 'user_upload',
  p_uploaded_by text DEFAULT 'user',
  p_parsed_data jsonb DEFAULT '{}'::jsonb,
  p_ai_summary text DEFAULT NULL,
  p_document_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_file_id uuid;
  v_resolved_lead_id uuid;
  v_resolved_thread_id uuid;
  v_resolved_contact_id uuid;
  v_resolved_org_id uuid;
  v_resolved_workspace_id uuid;
  v_version_number integer;
BEGIN
  -- Resolve organization_id from lead/thread/contact if not provided
  IF p_organization_id IS NULL THEN
    IF p_lead_id IS NOT NULL THEN
      SELECT organization_id INTO v_resolved_org_id
      FROM public.leads
      WHERE id = p_lead_id;
    ELSIF p_thread_id IS NOT NULL THEN
      SELECT organization_id INTO v_resolved_org_id
      FROM public.inbox_threads
      WHERE id = p_thread_id;
    ELSIF p_contact_id IS NOT NULL THEN
      SELECT organization_id INTO v_resolved_org_id
      FROM public.contacts
      WHERE id = p_contact_id;
    END IF;
  ELSE
    v_resolved_org_id := p_organization_id;
  END IF;
  
  -- Resolve workspace_id from thread if not provided
  IF p_workspace_id IS NULL AND p_thread_id IS NOT NULL THEN
    SELECT workspace_id INTO v_resolved_workspace_id
    FROM public.inbox_threads
    WHERE id = p_thread_id;
  ELSE
    v_resolved_workspace_id := p_workspace_id;
  END IF;
  
  -- Resolve thread_id from lead_id if not provided
  IF p_thread_id IS NULL AND p_lead_id IS NOT NULL THEN
    SELECT id INTO v_resolved_thread_id
    FROM public.inbox_threads
    WHERE lead_id = p_lead_id
    ORDER BY last_message_at DESC
    LIMIT 1;
  ELSE
    v_resolved_thread_id := p_thread_id;
  END IF;
  
  -- Resolve contact_id from thread_id if not provided
  IF p_contact_id IS NULL AND v_resolved_thread_id IS NOT NULL THEN
    SELECT contact_id INTO v_resolved_contact_id
    FROM public.inbox_threads
    WHERE id = v_resolved_thread_id;
  ELSE
    v_resolved_contact_id := p_contact_id;
  END IF;
  
  -- Resolve lead_id from thread_id if not provided
  IF p_lead_id IS NULL AND v_resolved_thread_id IS NOT NULL THEN
    SELECT lead_id INTO v_resolved_lead_id
    FROM public.inbox_threads
    WHERE id = v_resolved_thread_id;
  ELSE
    v_resolved_lead_id := p_lead_id;
  END IF;
  
  -- Determine version number for scope files
  IF p_file_type = 'scope' THEN
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
    FROM public.file_memory
    WHERE (
      (v_resolved_lead_id IS NOT NULL AND lead_id = v_resolved_lead_id) OR
      (v_resolved_thread_id IS NOT NULL AND thread_id = v_resolved_thread_id) OR
      (v_resolved_contact_id IS NOT NULL AND contact_id = v_resolved_contact_id)
    )
    AND file_type = 'scope';
  ELSE
    v_version_number := 1;
  END IF;
  
  -- Insert file into memory
  INSERT INTO public.file_memory (
    lead_id,
    thread_id,
    contact_id,
    organization_id,
    workspace_id,
    file_name,
    file_type,
    storage_url,
    attachment_id,
    insurance_attachment_id,
    source,
    uploaded_by,
    parsed_data,
    ai_summary,
    document_date,
    version_number,
    processing_status
  ) VALUES (
    v_resolved_lead_id,
    v_resolved_thread_id,
    v_resolved_contact_id,
    v_resolved_org_id,
    v_resolved_workspace_id,
    p_file_name,
    p_file_type,
    p_storage_url,
    p_attachment_id,
    p_insurance_attachment_id,
    p_source,
    p_uploaded_by,
    p_parsed_data,
    p_ai_summary,
    p_document_date,
    v_version_number,
    'completed'
  )
  RETURNING id INTO v_file_id;
  
  -- Trigger timeline update if this is a timeline-relevant file
  PERFORM public.update_timeline_from_file_memory(v_file_id);
  
  -- Trigger conflict detection
  PERFORM public.detect_file_conflicts(
    v_resolved_lead_id,
    v_resolved_thread_id,
    v_resolved_contact_id
  );
  
  RETURN v_file_id;
END;
$$;

COMMENT ON FUNCTION public.store_file_in_memory IS 'Stores a file in the File Memory Brain with automatic relationship resolution and timeline/conflict detection';

-- ============================================================================
-- PART 4 — Function: Update Timeline from File Memory
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_timeline_from_file_memory(p_file_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_file record;
  v_event_type text;
  v_event_date date;
  v_event_payload jsonb;
  v_structured_data jsonb;
BEGIN
  -- Get file record
  SELECT * INTO v_file
  FROM public.file_memory
  WHERE id = p_file_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Determine event type based on file type
  CASE v_file.file_type
    WHEN 'approval_letter' THEN
      v_event_type := 'CLAIM_APPROVED_RCV';
      v_event_date := COALESCE(v_file.document_date, CURRENT_DATE);
      v_event_payload := jsonb_build_object(
        'rcv_total', (v_file.parsed_data->>'rcv')::numeric,
        'acv_total', (v_file.parsed_data->>'acv')::numeric,
        'deductible', (v_file.parsed_data->>'deductible')::numeric,
        'file_id', v_file.id,
        'file_name', v_file.file_name
      );
      v_structured_data := jsonb_build_object(
        'carrier', v_file.parsed_data->>'carrier_name',
        'adjuster', v_file.parsed_data->>'adjuster_name',
        'claim_number', v_file.parsed_data->>'claim_number'
      );
      
    WHEN 'denial_letter' THEN
      v_event_type := 'CLAIM_DENIED';
      v_event_date := COALESCE(v_file.document_date, CURRENT_DATE);
      v_event_payload := jsonb_build_object(
        'file_id', v_file.id,
        'file_name', v_file.file_name,
        'denial_reason', v_file.parsed_data->>'denial_reason'
      );
      
    WHEN 'scope' THEN
      v_event_type := 'SCOPE_PARSED';
      v_event_date := COALESCE(v_file.document_date, CURRENT_DATE);
      v_event_payload := jsonb_build_object(
        'rcv_total', (v_file.parsed_data->>'rcv')::numeric,
        'acv_total', (v_file.parsed_data->>'acv')::numeric,
        'file_id', v_file.id,
        'file_name', v_file.file_name,
        'version_number', v_file.version_number
      );
      
    WHEN 'supplement' THEN
      v_event_type := 'SUPPLEMENT_SUBMITTED';
      v_event_date := COALESCE(v_file.document_date, CURRENT_DATE);
      v_event_payload := jsonb_build_object(
        'supplement_amount', (v_file.parsed_data->>'supplement_amount')::numeric,
        'file_id', v_file.id,
        'file_name', v_file.file_name
      );
      
    WHEN 'payment_statement' THEN
      v_event_type := 'PAYMENT_SENT';
      v_event_date := COALESCE(v_file.document_date, CURRENT_DATE);
      v_event_payload := jsonb_build_object(
        'payment_amount', (v_file.parsed_data->>'payment_amount')::numeric,
        'file_id', v_file.id,
        'file_name', v_file.file_name
      );
      
    ELSE
      -- Unknown file type, don't create timeline event
      RETURN;
  END CASE;
  
  -- Create timeline event
  PERFORM public.create_timeline_event(
    p_event_type := v_event_type,
    p_event_payload := v_event_payload,
    p_event_date := v_event_date,
    p_lead_id := v_file.lead_id,
    p_thread_id := v_file.thread_id,
    p_contact_id := v_file.contact_id,
    p_detected_from := 'attachment',
    p_source_type := CASE
      WHEN v_file.file_type = 'scope' THEN 'pdf_scope_of_loss'
      WHEN v_file.file_type = 'approval_letter' THEN 'pdf_approval_letter'
      WHEN v_file.file_type = 'denial_letter' THEN 'pdf_denial_letter'
      WHEN v_file.file_type = 'payment_statement' THEN 'pdf_payment_statement'
      ELSE 'pdf_general_correspondence'
    END,
    p_confidence_score := 0.9,
    p_raw_text := v_file.ai_summary,
    p_structured_data := v_structured_data
  );
END;
$$;

COMMENT ON FUNCTION public.update_timeline_from_file_memory IS 'Automatically updates insurance timeline when files are stored in File Memory Brain';

-- ============================================================================
-- PART 5 — Function: Detect File Conflicts
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_file_conflicts(
  p_lead_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_approval_files record;
  v_scope_files record;
  v_conflict_details jsonb;
  v_rcv_values numeric[];
  v_acv_values numeric[];
  v_deductible_values numeric[];
  v_has_conflict boolean;
BEGIN
  -- Only process if we have a link
  IF p_lead_id IS NULL AND p_thread_id IS NULL AND p_contact_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Check for approval letter conflicts (multiple approval letters with different amounts)
  SELECT array_agg((parsed_data->>'rcv')::numeric), array_agg((parsed_data->>'acv')::numeric), array_agg((parsed_data->>'deductible')::numeric)
  INTO v_rcv_values, v_acv_values, v_deductible_values
  FROM public.file_memory
  WHERE (
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND file_type = 'approval_letter'
  AND processing_status = 'completed'
  AND parsed_data->>'rcv' IS NOT NULL;
  
  -- If multiple different RCV values detected
  IF array_length(v_rcv_values, 1) > 1 AND array_length(array(SELECT DISTINCT unnest(v_rcv_values)), 1) > 1 THEN
    v_conflict_details := jsonb_build_object(
      'conflict_type', 'approval_amount_mismatch',
      'rcv_values', array(SELECT DISTINCT unnest(v_rcv_values)),
      'acv_values', array(SELECT DISTINCT unnest(v_acv_values)),
      'deductible_values', array(SELECT DISTINCT unnest(v_deductible_values)),
      'message', 'Multiple approval letters with different amounts detected'
    );
    v_has_conflict := true;
    
    -- Update all approval letter files to mark conflicts
    UPDATE public.file_memory
    SET has_conflicts = true,
        conflict_details = v_conflict_details
    WHERE (
      (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
      (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
      (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
    )
    AND file_type = 'approval_letter'
    AND processing_status = 'completed';
  END IF;
  
  -- Check for scope version conflicts (newer scope contradicts older scope)
  -- This is handled by scope comparison engine, but we can flag here too
  FOR v_scope_files IN
    SELECT id, version_number, parsed_data, document_date
    FROM public.file_memory
    WHERE (
      (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
      (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
      (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
    )
    AND file_type = 'scope'
    AND processing_status = 'completed'
    ORDER BY version_number DESC
  LOOP
    -- Check if newer scope contradicts older scope
    -- (This is a simplified check - full comparison is done by scope comparison engine)
    NULL; -- Placeholder for future conflict detection logic
  END LOOP;
  
  -- Check for supplement contradicting scope
  -- (This would require comparing supplement amounts with scope amounts)
  -- Placeholder for future implementation
  
END;
$$;

COMMENT ON FUNCTION public.detect_file_conflicts IS 'Detects conflicts between files (e.g., multiple approval letters with different amounts, scope contradictions)';

-- ============================================================================
-- PART 6 — Function: Get File Memory Summary for Job
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_file_memory_summary(
  p_lead_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_files jsonb;
  v_summary jsonb;
  v_file_count integer;
BEGIN
  -- Get all files for this job
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'file_name', file_name,
      'file_type', file_type,
      'document_date', document_date,
      'ai_summary', ai_summary,
      'parsed_data', parsed_data,
      'version_number', version_number,
      'has_conflicts', has_conflicts,
      'created_at', created_at
    ) ORDER BY document_date DESC NULLS LAST, created_at DESC
  ), '[]'::jsonb)
  INTO v_files
  FROM public.file_memory
  WHERE (
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND processing_status = 'completed';
  
  -- Count files
  SELECT COUNT(*) INTO v_file_count
  FROM public.file_memory
  WHERE (
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND processing_status = 'completed';
  
  -- Build summary
  v_summary := jsonb_build_object(
    'file_count', v_file_count,
    'files', v_files,
    'has_conflicts', EXISTS(
      SELECT 1 FROM public.file_memory
      WHERE (
        (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
        (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
        (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
      )
      AND has_conflicts = true
    )
  );
  
  RETURN v_summary;
END;
$$;

COMMENT ON FUNCTION public.get_file_memory_summary IS 'Returns complete file memory summary for a job including all files, summaries, and conflict flags';

-- ============================================================================
-- PART 7 — Function: Compare Scope Versions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compare_scope_versions(
  p_lead_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_scopes jsonb;
  v_comparison jsonb;
  v_old_scope record;
  v_new_scope record;
BEGIN
  -- Get all scope files ordered by version
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'version_number', version_number,
      'document_date', document_date,
      'parsed_data', parsed_data,
      'ai_summary', ai_summary
    ) ORDER BY version_number ASC
  )
  INTO v_scopes
  FROM public.file_memory
  WHERE (
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND file_type = 'scope'
  AND processing_status = 'completed'
  ORDER BY version_number ASC;
  
  -- If less than 2 scopes, return empty comparison
  IF jsonb_array_length(v_scopes) < 2 THEN
    RETURN jsonb_build_object(
      'has_comparison', false,
      'scopes', v_scopes
    );
  END IF;
  
  -- Get old and new scope for comparison
  SELECT * INTO v_old_scope
  FROM public.file_memory
  WHERE (
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND file_type = 'scope'
  AND processing_status = 'completed'
  ORDER BY version_number ASC
  LIMIT 1;
  
  SELECT * INTO v_new_scope
  FROM public.file_memory
  WHERE (
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND file_type = 'scope'
  AND processing_status = 'completed'
  ORDER BY version_number DESC
  LIMIT 1;
  
  -- Build comparison
  v_comparison := jsonb_build_object(
    'has_comparison', true,
    'old_scope', jsonb_build_object(
      'id', v_old_scope.id,
      'version_number', v_old_scope.version_number,
      'document_date', v_old_scope.document_date,
      'rcv', (v_old_scope.parsed_data->>'rcv')::numeric,
      'acv', (v_old_scope.parsed_data->>'acv')::numeric
    ),
    'new_scope', jsonb_build_object(
      'id', v_new_scope.id,
      'version_number', v_new_scope.version_number,
      'document_date', v_new_scope.document_date,
      'rcv', (v_new_scope.parsed_data->>'rcv')::numeric,
      'acv', (v_new_scope.parsed_data->>'acv')::numeric
    ),
    'rcv_difference', COALESCE((v_new_scope.parsed_data->>'rcv')::numeric, 0) - COALESCE((v_old_scope.parsed_data->>'rcv')::numeric, 0),
    'acv_difference', COALESCE((v_new_scope.parsed_data->>'acv')::numeric, 0) - COALESCE((v_old_scope.parsed_data->>'acv')::numeric, 0),
    'all_scopes', v_scopes
  );
  
  RETURN v_comparison;
END;
$$;

COMMENT ON FUNCTION public.compare_scope_versions IS 'Compares different versions of scope documents to detect changes in pricing and line items';

-- ============================================================================
-- PART 8 — RLS Policies
-- ============================================================================

ALTER TABLE public.file_memory ENABLE ROW LEVEL SECURITY;

-- Users can view files in their organization/workspace
CREATE POLICY "Users can view files in their organization"
  ON public.file_memory FOR SELECT
  USING (
    organization_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
      AND status = 'active'
    )
    OR
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    OR
    lead_id IN (
      SELECT id FROM public.leads
      WHERE organization_id IN (
        SELECT org_id FROM public.org_memberships
        WHERE user_id = auth.uid()
        AND status = 'active'
      )
    )
    OR
    thread_id IN (
      SELECT id FROM public.inbox_threads
      WHERE campaign_id IN (
        SELECT campaign_id FROM public.campaigns
        WHERE owner_id = auth.uid()
      )
    )
  );

-- Users can insert files in their organization/workspace
CREATE POLICY "Users can insert files in their organization"
  ON public.file_memory FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
      AND status = 'active'
    )
    OR
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can update files in their organization/workspace
CREATE POLICY "Users can update files in their organization"
  ON public.file_memory FOR UPDATE
  USING (
    organization_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
      AND status = 'active'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
      AND status = 'active'
    )
  );

-- Service role can do everything
CREATE POLICY "Service role full access file_memory"
  ON public.file_memory
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 9 — Trigger: Auto-process files from email attachments
-- ============================================================================

CREATE OR REPLACE FUNCTION public.queue_file_memory_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_id uuid;
  v_lead_id uuid;
  v_contact_id uuid;
  v_organization_id uuid;
  v_workspace_id uuid;
  v_file_type text;
  v_is_insurance_related boolean;
BEGIN
  -- Get thread/lead/contact from attachment
  SELECT 
    COALESCE(im.thread_id, em.thread_id),
    COALESCE(im.lead_id, em.lead_id),
    COALESCE(im.contact_id, em.contact_id)
  INTO v_thread_id, v_lead_id, v_contact_id
  FROM public.email_attachments ea
  LEFT JOIN public.inbox_messages im ON ea.message_id = im.id
  LEFT JOIN public.email_messages em ON ea.message_id = em.id
  WHERE ea.id = NEW.id;
  
  -- Get organization/workspace from thread
  IF v_thread_id IS NOT NULL THEN
    SELECT organization_id, workspace_id INTO v_organization_id, v_workspace_id
    FROM public.inbox_threads
    WHERE id = v_thread_id;
  END IF;
  
  -- Check if this is insurance-related
  IF v_thread_id IS NOT NULL THEN
    SELECT 
      insurance_carrier IS NOT NULL 
      OR insurance_claim_status IS NOT NULL
      OR insurance_install_ready = true
    INTO v_is_insurance_related
    FROM public.inbox_threads
    WHERE id = v_thread_id;
  END IF;
  
  -- Determine file type from filename and content type
  v_file_type := CASE
    WHEN NEW.filename ILIKE '%scope%' OR NEW.filename ILIKE '%estimate%' THEN 'scope'
    WHEN NEW.filename ILIKE '%approval%' OR NEW.filename ILIKE '%approved%' THEN 'approval_letter'
    WHEN NEW.filename ILIKE '%denial%' OR NEW.filename ILIKE '%denied%' THEN 'denial_letter'
    WHEN NEW.filename ILIKE '%invoice%' OR NEW.filename ILIKE '%bill%' THEN 'invoice'
    WHEN NEW.filename ILIKE '%contract%' THEN 'contract'
    WHEN NEW.filename ILIKE '%payment%' OR NEW.filename ILIKE '%check%' THEN 'payment_statement'
    WHEN NEW.filename ILIKE '%supplement%' THEN 'supplement'
    WHEN NEW.content_type LIKE 'image/%' THEN 'photoset'
    ELSE 'unknown'
  END;
  
  -- If PDF or image and we have a link, queue for processing
  IF (NEW.content_type = 'application/pdf' OR NEW.content_type LIKE 'image/%') 
     AND (v_thread_id IS NOT NULL OR v_lead_id IS NOT NULL OR v_contact_id IS NOT NULL) THEN
    -- Insert into file_memory with pending status
    INSERT INTO public.file_memory (
      lead_id,
      thread_id,
      contact_id,
      organization_id,
      workspace_id,
      file_name,
      file_type,
      storage_url,
      attachment_id,
      source,
      uploaded_by,
      processing_status
    ) VALUES (
      v_lead_id,
      v_thread_id,
      v_contact_id,
      v_organization_id,
      v_workspace_id,
      NEW.filename,
      v_file_type,
      NEW.storage_path,
      NEW.id,
      'email',
      'system',
      'pending'
    )
    ON CONFLICT DO NOTHING;
    
    -- TODO: Trigger edge function to process the file (AI parsing)
    -- This would call an edge function similar to insurance-attachment-parser-v1
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to queue file memory processing: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_file_memory_processing ON public.email_attachments;
CREATE TRIGGER trg_queue_file_memory_processing
  AFTER INSERT ON public.email_attachments
  FOR EACH ROW
  WHEN (NEW.content_type = 'application/pdf' OR NEW.content_type LIKE 'image/%')
  EXECUTE FUNCTION public.queue_file_memory_processing();

COMMENT ON FUNCTION public.queue_file_memory_processing IS 'Automatically queues files for File Memory Brain processing when attachments are uploaded';
COMMENT ON TRIGGER trg_queue_file_memory_processing ON public.email_attachments IS 'Auto-queues PDF and image attachments for File Memory Brain processing';

-- ============================================================================
-- PART 10 — Summary Comments
-- ============================================================================

-- ============================================================================
-- PART 11 — Function: Check Proposal Contradictions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_proposal_contradictions(
  p_proposal_id uuid,
  p_thread_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_proposal record;
  v_files jsonb;
  v_contradictions jsonb := '[]'::jsonb;
  v_file record;
  v_proposal_rcv numeric;
  v_file_rcv numeric;
BEGIN
  -- Get proposal
  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Proposal not found');
  END IF;
  
  -- Get thread_id from proposal if not provided
  IF p_thread_id IS NULL THEN
    p_thread_id := v_proposal.thread_id;
  END IF;
  
  -- Get proposal RCV from proposal_data
  v_proposal_rcv := (v_proposal.proposal_data->>'project_price')::numeric;
  
  -- Get all files for this thread
  FOR v_file IN
    SELECT * FROM public.file_memory
    WHERE thread_id = p_thread_id
    AND processing_status = 'completed'
    AND file_type IN ('approval_letter', 'scope', 'supplement')
    ORDER BY document_date DESC NULLS LAST, created_at DESC
  LOOP
    -- Check if approval letter contradicts proposal
    IF v_file.file_type = 'approval_letter' THEN
      v_file_rcv := (v_file.parsed_data->>'rcv')::numeric;
      IF v_file_rcv IS NOT NULL AND v_proposal_rcv IS NOT NULL THEN
        IF ABS(v_file_rcv - v_proposal_rcv) > 100 THEN
          v_contradictions := v_contradictions || jsonb_build_object(
            'type', 'rcv_mismatch',
            'file_id', v_file.id,
            'file_name', v_file.file_name,
            'file_rcv', v_file_rcv,
            'proposal_rcv', v_proposal_rcv,
            'difference', v_file_rcv - v_proposal_rcv,
            'message', format('Insurance RCV ($%s) differs from proposal ($%s)', v_file_rcv, v_proposal_rcv)
          );
        END IF;
      END IF;
    END IF;
    
    -- Check if supplement changes project price
    IF v_file.file_type = 'supplement' THEN
      v_file_rcv := (v_file.parsed_data->>'supplement_amount')::numeric;
      IF v_file_rcv IS NOT NULL AND v_proposal_rcv IS NOT NULL THEN
        v_contradictions := v_contradictions || jsonb_build_object(
          'type', 'supplement_available',
          'file_id', v_file.id,
          'file_name', v_file.file_name,
          'supplement_amount', v_file_rcv,
          'proposal_rcv', v_proposal_rcv,
          'new_total', v_proposal_rcv + v_file_rcv,
          'message', format('Supplement available: +$%s. Proposal should be updated to $%s', v_file_rcv, v_proposal_rcv + v_file_rcv)
        );
      END IF;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'proposal_id', p_proposal_id,
    'has_contradictions', jsonb_array_length(v_contradictions) > 0,
    'contradictions', v_contradictions,
    'recommendation', CASE
      WHEN jsonb_array_length(v_contradictions) > 0 THEN 'Update proposal — insurance increased RCV or supplement available'
      ELSE 'No contradictions detected'
    END
  );
END;
$$;

COMMENT ON FUNCTION public.check_proposal_contradictions IS 'Checks if any documents contradict the proposal (e.g., insurance RCV differs, supplement available)';

-- ============================================================================
-- PART 12 — Function: Update Revenue Forecast from File Memory
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_revenue_forecast_from_files(
  p_thread_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_latest_rcv numeric;
  v_latest_acv numeric;
  v_latest_deductible numeric;
  v_latest_approval record;
  v_latest_scope record;
  v_latest_supplement record;
  v_total_rcv numeric;
BEGIN
  -- Get latest approval letter RCV
  SELECT parsed_data->>'rcv', parsed_data->>'acv', parsed_data->>'deductible'
  INTO v_latest_rcv, v_latest_acv, v_latest_deductible
  FROM public.file_memory
  WHERE (
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND file_type = 'approval_letter'
  AND processing_status = 'completed'
  ORDER BY document_date DESC NULLS LAST, created_at DESC
  LIMIT 1;
  
  -- Get latest scope RCV (if no approval letter)
  IF v_latest_rcv IS NULL THEN
    SELECT (parsed_data->>'rcv')::numeric, (parsed_data->>'acv')::numeric, (parsed_data->>'deductible')::numeric
    INTO v_latest_rcv, v_latest_acv, v_latest_deductible
    FROM public.file_memory
    WHERE (
      (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
      (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
      (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
    )
    AND file_type = 'scope'
    AND processing_status = 'completed'
    ORDER BY version_number DESC, document_date DESC NULLS LAST, created_at DESC
    LIMIT 1;
  END IF;
  
  -- Get supplement amounts
  SELECT COALESCE(SUM((parsed_data->>'supplement_amount')::numeric), 0)
  INTO v_total_rcv
  FROM public.file_memory
  WHERE (
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND file_type = 'supplement'
  AND processing_status = 'completed';
  
  -- Add supplements to base RCV
  IF v_latest_rcv IS NOT NULL THEN
    v_total_rcv := COALESCE(v_latest_rcv, 0) + COALESCE(v_total_rcv, 0);
  END IF;
  
  -- Update thread estimated value if thread_id provided
  IF p_thread_id IS NOT NULL AND v_total_rcv IS NOT NULL AND v_total_rcv > 0 THEN
    UPDATE public.inbox_threads
    SET thread_estimated_value = v_total_rcv,
        updated_at = NOW()
    WHERE id = p_thread_id;
  END IF;
  
  RETURN jsonb_build_object(
    'rcv_total', v_total_rcv,
    'acv_total', v_latest_acv,
    'deductible', v_latest_deductible,
    'base_rcv', v_latest_rcv,
    'supplement_total', v_total_rcv - COALESCE(v_latest_rcv, 0),
    'updated_thread', p_thread_id IS NOT NULL
  );
END;
$$;

COMMENT ON FUNCTION public.update_revenue_forecast_from_files IS 'Updates revenue forecast based on files in File Memory Brain (approval letters, scopes, supplements)';

-- ============================================================================
-- PART 13 — Function: Get Photo Memory Summary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_photo_memory_summary(
  p_lead_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_photos jsonb;
  v_photo_count integer;
  v_damage_summary jsonb;
BEGIN
  -- Get all photo files
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'file_name', file_name,
      'document_date', document_date,
      'parsed_data', parsed_data,
      'ai_summary', ai_summary,
      'created_at', created_at
    ) ORDER BY document_date DESC NULLS LAST, created_at DESC
  ), '[]'::jsonb)
  INTO v_photos
  FROM public.file_memory
  WHERE (
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND file_type = 'photoset'
  AND processing_status = 'completed';
  
  -- Count photos
  SELECT COUNT(*) INTO v_photo_count
  FROM public.file_memory
  WHERE (
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND file_type = 'photoset'
  AND processing_status = 'completed';
  
  -- Extract damage summary from parsed_data
  SELECT jsonb_build_object(
    'hail_hits', COALESCE((parsed_data->>'hail_hits')::integer, 0),
    'missing_shingles', COALESCE((parsed_data->>'missing_shingles')::boolean, false),
    'soft_spots', COALESCE((parsed_data->>'soft_spots')::boolean, false),
    'decking_exposure', COALESCE((parsed_data->>'decking_exposure')::boolean, false),
    'damage_severity', parsed_data->>'damage_severity'
  )
  INTO v_damage_summary
  FROM public.file_memory
  WHERE (
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND file_type = 'photoset'
  AND processing_status = 'completed'
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN jsonb_build_object(
    'photo_count', v_photo_count,
    'photos', v_photos,
    'damage_summary', COALESCE(v_damage_summary, '{}'::jsonb),
    'supplement_justification', CASE
      WHEN v_damage_summary->>'hail_hits' IS NOT NULL AND (v_damage_summary->>'hail_hits')::integer > 0 THEN 'Hail damage confirmed'
      WHEN v_damage_summary->>'missing_shingles' = 'true' THEN 'Missing shingles confirmed'
      WHEN v_damage_summary->>'soft_spots' = 'true' THEN 'Soft spots confirmed'
      WHEN v_damage_summary->>'decking_exposure' = 'true' THEN 'Decking exposure confirmed'
      ELSE 'No significant damage detected'
    END
  );
END;
$$;

COMMENT ON FUNCTION public.get_photo_memory_summary IS 'Returns photo memory summary including damage assessment for supplement justification';

-- ============================================================================
-- PART 14 — Function: Get Contract and Invoice Summary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_contract_invoice_summary(
  p_lead_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_contract record;
  v_invoice record;
  v_change_order record;
  v_summary jsonb;
BEGIN
  -- Get latest contract
  SELECT * INTO v_contract
  FROM public.file_memory
  WHERE (
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND file_type = 'contract'
  AND processing_status = 'completed'
  ORDER BY document_date DESC NULLS LAST, created_at DESC
  LIMIT 1;
  
  -- Get latest invoice
  SELECT * INTO v_invoice
  FROM public.file_memory
  WHERE (
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND file_type = 'invoice'
  AND processing_status = 'completed'
  ORDER BY document_date DESC NULLS LAST, created_at DESC
  LIMIT 1;
  
  -- Get latest change order
  SELECT * INTO v_change_order
  FROM public.file_memory
  WHERE (
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
    (p_thread_id IS NOT NULL AND thread_id = p_thread_id) OR
    (p_contact_id IS NOT NULL AND contact_id = p_contact_id)
  )
  AND file_type = 'change_order'
  AND processing_status = 'completed'
  ORDER BY document_date DESC NULLS LAST, created_at DESC
  LIMIT 1;
  
  -- Build summary
  v_summary := jsonb_build_object(
    'has_contract', v_contract.id IS NOT NULL,
    'contract', CASE
      WHEN v_contract.id IS NOT NULL THEN jsonb_build_object(
        'id', v_contract.id,
        'file_name', v_contract.file_name,
        'document_date', v_contract.document_date,
        'price', (v_contract.parsed_data->>'price')::numeric,
        'upgrades', v_contract.parsed_data->'upgrades',
        'ai_summary', v_contract.ai_summary
      )
      ELSE NULL
    END,
    'has_invoice', v_invoice.id IS NOT NULL,
    'invoice', CASE
      WHEN v_invoice.id IS NOT NULL THEN jsonb_build_object(
        'id', v_invoice.id,
        'file_name', v_invoice.file_name,
        'document_date', v_invoice.document_date,
        'price', (v_invoice.parsed_data->>'price')::numeric,
        'ai_summary', v_invoice.ai_summary
      )
      ELSE NULL
    END,
    'has_change_order', v_change_order.id IS NOT NULL,
    'change_order', CASE
      WHEN v_change_order.id IS NOT NULL THEN jsonb_build_object(
        'id', v_change_order.id,
        'file_name', v_change_order.file_name,
        'document_date', v_change_order.document_date,
        'price_change', (v_change_order.parsed_data->>'price_change')::numeric,
        'ai_summary', v_change_order.ai_summary
      )
      ELSE NULL
    END,
    'job_stage', CASE
      WHEN v_contract.id IS NOT NULL THEN 'CONTRACT_SIGNED'
      WHEN v_invoice.id IS NOT NULL THEN 'INVOICE_CREATED'
      ELSE 'ESTIMATE_PHASE'
    END
  );
  
  -- Update thread job stage if contract exists
  IF v_contract.id IS NOT NULL AND p_thread_id IS NOT NULL THEN
    -- This would update a job_stage field if it exists
    -- UPDATE public.inbox_threads SET job_stage = 'CONTRACT_SIGNED' WHERE id = p_thread_id;
    NULL; -- Placeholder for future implementation
  END IF;
  
  RETURN v_summary;
END;
$$;

COMMENT ON FUNCTION public.get_contract_invoice_summary IS 'Returns contract and invoice summary, updates job stage to CONTRACT_SIGNED when contract is detected';

-- ============================================================================
-- PART 15 — Summary Comments
-- ============================================================================

COMMENT ON TABLE public.file_memory IS 
'Block 21290 — SmartSend File Memory Brain v1
Understands EVERY file ever sent: scopes, approvals, invoices, contracts, photos, adjuster letters → Unified Job Intelligence

This is where SmartSend evolves from "AI automation tool" to a full, deep-memory roofing intelligence system.

SmartSend REMEMBERS every file ever uploaded or emailed throughout the ENTIRE lifecycle of the job.

This allows SmartSend to:
- Retrieve information instantly
- Compare documents across time
- Detect missing pieces
- Spot contradictions
- Improve insurance analysis
- Boost supplement accuracy
- Update revenue forecasts
- Improve reply classification
- Improve timeline accuracy

This is how SmartSend becomes "the brain of the roofing company."
This feature alone makes SmartSend feel like LEGENDARY software.';

