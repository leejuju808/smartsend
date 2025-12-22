-- =========================================================
-- Block 24660 — SmartSend Roofing Document Vault v1
-- (The "All-In-One" Job Folder Roofers Always Needed)
-- =========================================================
-- 
-- This block gives SmartSend the ability to store, organize, and protect
-- EVERY document a roofer needs for EVERY job.
--
-- Features:
-- - Organized folder structure (Estimates, Insurance, Permits, Photos, etc.)
-- - AI auto-categorization
-- - Document versioning and history
-- - Search functionality
-- - Document linking to Insurance Flow, Payments, etc.
-- - Pipeline automation integration
-- - Permission-based access control

-- ============================================================================
-- PART 1 — ENHANCE job_documents TABLE
-- ============================================================================

-- Add new document categories matching the spec
ALTER TABLE IF EXISTS public.job_documents
  DROP CONSTRAINT IF EXISTS job_documents_doc_type_check;

ALTER TABLE IF EXISTS public.job_documents
  ADD CONSTRAINT job_documents_doc_type_check CHECK (doc_type IN (
    -- Estimates & Proposals
    'estimate_roofr',
    'estimate_xactimate',
    'estimate_smartsend',
    'pricing_breakdown',
    'proposal',
    
    -- Insurance Documents
    'insurance_claim_form',
    'insurance_adjuster_summary',
    'insurance_supplement',
    'insurance_approval_letter',
    'insurance_depreciation_statement',
    'insurance_acv_rcv_calculation',
    'insurance_scope_of_loss',
    'insurance_check',
    
    -- Permits & Municipal
    'permit_city',
    'permit_hoa_approval',
    'permit_inspection_status',
    
    -- Photos & Videos
    'photo_before',
    'photo_damage',
    'photo_inspection',
    'photo_crew_arrival',
    'photo_progress',
    'photo_completed',
    'video_before',
    'video_damage',
    'video_progress',
    'video_completed',
    
    -- Material Receipts
    'receipt_supplier',
    'receipt_delivery_confirmation',
    'receipt_supplemental',
    
    -- Contracts & Signatures
    'contract_signed',
    'contract_digital_signature_log',
    
    -- Warranty & Post-Job
    'warranty_manufacturer',
    'warranty_workmanship',
    'warranty_completion_certificate',
    
    -- Internal Office Notes
    'note_job',
    'note_todo',
    'note_internal_message',
    
    -- Legacy types (for backward compatibility)
    'photo_after',
    'contract',
    'invoice',
    'insurance',
    'permit',
    'receipt',
    'material_list',
    'other'
  ));

-- Add new columns for enhanced functionality
ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS category_folder TEXT; -- Maps doc_type to folder: 'estimates', 'insurance', 'permits', 'photos', 'receipts', 'contracts', 'warranty', 'notes'

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS auto_categorized BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS categorization_confidence NUMERIC(3,2) CHECK (categorization_confidence >= 0.0 AND categorization_confidence <= 1.0);

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS search_text TEXT; -- Full-text searchable content

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1;

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS parent_document_id UUID REFERENCES public.job_documents(id) ON DELETE SET NULL; -- For versioning

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN DEFAULT TRUE;

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS linked_to_insurance_flow BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS linked_to_payment_tracking BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS linked_to_job_health BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS linked_to_supplier_tracking BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS linked_to_quote_followup BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS extracted_data JSONB DEFAULT '{}'::jsonb; -- Store extracted data (claim numbers, amounts, dates, etc.)

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ; -- Soft delete

ALTER TABLE IF EXISTS public.job_documents
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id);

-- Update metadata column to be more comprehensive
ALTER TABLE IF EXISTS public.job_documents
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

-- ============================================================================
-- PART 2 — CREATE document_history TABLE (Version Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_document_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.job_documents(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'viewed', 'categorized', 'linked')),
  action_by UUID REFERENCES public.profiles(id),
  action_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  old_values JSONB DEFAULT '{}'::jsonb,
  new_values JSONB DEFAULT '{}'::jsonb,
  
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_document_history_document ON public.job_document_history(document_id, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_history_job ON public.job_document_history(job_id);
CREATE INDEX IF NOT EXISTS idx_document_history_workspace ON public.job_document_history(workspace_id);

-- RLS for document_history
ALTER TABLE public.job_document_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view document history in their workspace"
  ON public.job_document_history FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert document history"
  ON public.job_document_history FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- PART 3 — CREATE document_views TABLE (View Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_document_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.job_documents(id) ON DELETE CASCADE,
  viewed_by UUID NOT NULL REFERENCES public.profiles(id),
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(document_id, viewed_by, viewed_at)
);

CREATE INDEX IF NOT EXISTS idx_document_views_document ON public.job_document_views(document_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_views_user ON public.job_document_views(viewed_by);

-- RLS for document_views
ALTER TABLE public.job_document_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view document views in their workspace"
  ON public.job_document_views FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.job_documents jd
      JOIN public.workspace_members wm ON wm.workspace_id = jd.workspace_id
      WHERE jd.id = document_id AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own document views"
  ON public.job_document_views FOR INSERT
  WITH CHECK (viewed_by = auth.uid());

-- ============================================================================
-- PART 4 — CREATE FUNCTION TO AUTO-CATEGORIZE DOCUMENTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_categorize_document_folder()
RETURNS TRIGGER AS $$
BEGIN
  -- Map doc_type to category_folder
  NEW.category_folder = CASE
    WHEN NEW.doc_type LIKE 'estimate_%' OR NEW.doc_type = 'proposal' OR NEW.doc_type = 'pricing_breakdown' THEN 'estimates'
    WHEN NEW.doc_type LIKE 'insurance_%' THEN 'insurance'
    WHEN NEW.doc_type LIKE 'permit_%' THEN 'permits'
    WHEN NEW.doc_type LIKE 'photo_%' OR NEW.doc_type LIKE 'video_%' THEN 'photos'
    WHEN NEW.doc_type LIKE 'receipt_%' THEN 'receipts'
    WHEN NEW.doc_type LIKE 'contract_%' THEN 'contracts'
    WHEN NEW.doc_type LIKE 'warranty_%' OR NEW.doc_type = 'warranty_completion_certificate' THEN 'warranty'
    WHEN NEW.doc_type LIKE 'note_%' THEN 'notes'
    WHEN NEW.doc_type = 'invoice' THEN 'receipts'
    WHEN NEW.doc_type = 'material_list' THEN 'receipts'
    ELSE 'other'
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_categorize_document_folder
  BEFORE INSERT OR UPDATE ON public.job_documents
  FOR EACH ROW
  WHEN (NEW.category_folder IS NULL)
  EXECUTE FUNCTION public.auto_categorize_document_folder();

-- ============================================================================
-- PART 5 — CREATE FUNCTION TO UPDATE VIEW COUNT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_document_view_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.job_documents
  SET 
    view_count = view_count + 1,
    last_viewed_at = now()
  WHERE id = NEW.document_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_document_view_count
  AFTER INSERT ON public.job_document_views
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_document_view_count();

-- ============================================================================
-- PART 6 — CREATE FUNCTION TO LOG DOCUMENT HISTORY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_document_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.job_document_history (
      document_id, job_id, workspace_id, action, action_by, new_values
    ) VALUES (
      NEW.id, NEW.job_id, NEW.workspace_id, 'created', NEW.uploaded_by,
      jsonb_build_object(
        'doc_type', NEW.doc_type,
        'title', NEW.title,
        'category_folder', NEW.category_folder
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.job_document_history (
      document_id, job_id, workspace_id, action, action_by, old_values, new_values
    ) VALUES (
      NEW.id, NEW.job_id, NEW.workspace_id, 'updated', auth.uid(),
      jsonb_build_object(
        'doc_type', OLD.doc_type,
        'title', OLD.title,
        'category_folder', OLD.category_folder
      ),
      jsonb_build_object(
        'doc_type', NEW.doc_type,
        'title', NEW.title,
        'category_folder', NEW.category_folder
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.job_document_history (
      document_id, job_id, workspace_id, action, action_by, old_values
    ) VALUES (
      OLD.id, OLD.job_id, OLD.workspace_id, 'deleted', auth.uid(),
      jsonb_build_object(
        'doc_type', OLD.doc_type,
        'title', OLD.title
      )
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_document_history
  AFTER INSERT OR UPDATE OR DELETE ON public.job_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.log_document_history();

-- ============================================================================
-- PART 7 — CREATE FULL-TEXT SEARCH INDEX
-- ============================================================================

-- Add GIN index for full-text search on search_text
CREATE INDEX IF NOT EXISTS idx_job_documents_search_text 
  ON public.job_documents USING gin(to_tsvector('english', COALESCE(search_text, '')));

-- Add index for category_folder for fast folder filtering
CREATE INDEX IF NOT EXISTS idx_job_documents_category_folder 
  ON public.job_documents(category_folder);

-- Add index for soft delete filtering
CREATE INDEX IF NOT EXISTS idx_job_documents_not_deleted 
  ON public.job_documents(job_id, category_folder) 
  WHERE deleted_at IS NULL;

-- Add index for version tracking
CREATE INDEX IF NOT EXISTS idx_job_documents_parent_version 
  ON public.job_documents(parent_document_id, version_number DESC);

-- ============================================================================
-- PART 8 — CREATE VIEW FOR DOCUMENT VAULT SUMMARY
-- ============================================================================

CREATE OR REPLACE VIEW public.job_document_vault_summary AS
SELECT 
  jd.job_id,
  jd.workspace_id,
  jd.category_folder,
  COUNT(*) FILTER (WHERE jd.deleted_at IS NULL) as document_count,
  COUNT(*) FILTER (WHERE jd.deleted_at IS NULL AND jd.doc_type LIKE 'photo_%') as photo_count,
  COUNT(*) FILTER (WHERE jd.deleted_at IS NULL AND jd.doc_type LIKE 'insurance_%') as insurance_count,
  COUNT(*) FILTER (WHERE jd.deleted_at IS NULL AND jd.doc_type LIKE 'permit_%') as permit_count,
  SUM(jd.file_size) FILTER (WHERE jd.deleted_at IS NULL) as total_size_bytes,
  MAX(jd.uploaded_at) FILTER (WHERE jd.deleted_at IS NULL) as last_uploaded_at
FROM public.job_documents jd
GROUP BY jd.job_id, jd.workspace_id, jd.category_folder;

-- ============================================================================
-- PART 9 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_document_history TO authenticated;
GRANT SELECT, INSERT ON public.job_document_views TO authenticated;
GRANT SELECT ON public.job_document_vault_summary TO authenticated;

-- ============================================================================
-- PART 10 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.job_documents IS 'Block 24660: Document Vault - Complete document storage and organization system for roofing jobs';
COMMENT ON COLUMN public.job_documents.category_folder IS 'Block 24660: Folder category: estimates, insurance, permits, photos, receipts, contracts, warranty, notes';
COMMENT ON COLUMN public.job_documents.auto_categorized IS 'Block 24660: Whether document was auto-categorized by AI';
COMMENT ON COLUMN public.job_documents.search_text IS 'Block 24660: Full-text searchable content extracted from document';
COMMENT ON COLUMN public.job_documents.version_number IS 'Block 24660: Version number for document versioning';
COMMENT ON COLUMN public.job_documents.parent_document_id IS 'Block 24660: Parent document ID for version tracking';
COMMENT ON COLUMN public.job_documents.extracted_data IS 'Block 24660: Extracted structured data (claim numbers, amounts, dates, etc.)';
COMMENT ON TABLE public.job_document_history IS 'Block 24660: Complete audit trail of all document actions';
COMMENT ON TABLE public.job_document_views IS 'Block 24660: Tracks who viewed which documents and when';






































