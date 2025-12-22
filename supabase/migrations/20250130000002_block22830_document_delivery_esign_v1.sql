-- ============================================================================
-- Block 22830 — SmartSend Roofing Document Delivery & E-Sign v1
-- "Estimates, Invoices, Warranties — delivered & signed inside SmartSend."
-- ============================================================================
-- 
-- This block brings official documents into SmartSend's ecosystem:
-- - Estimates
-- - Scope of work
-- - Change orders
-- - Invoices
-- - Completion certificates
-- - Warranties
-- 
-- All delivered to homeowners, all trackable, all signable — all tied to the job.
-- This makes SmartSend the core legal + financial infrastructure of the roofing workflow.

-- ============================================================================
-- PART 1 — CREATE job_documents TABLE (E-Signature Documents)
-- ============================================================================
-- Note: This is separate from the existing job_documents table used for general
-- document storage. This table is specifically for signable documents.

CREATE TABLE IF NOT EXISTS public.job_signable_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,

  document_type text CHECK (
    document_type IN ('estimate', 'contract', 'change_order', 'invoice', 'warranty', 'other')
  ) NOT NULL,

  version int DEFAULT 1,
  storage_path text NOT NULL, -- original PDF path in documents-original bucket
  signed_storage_path text,   -- signed version path in documents-signed bucket

  status text CHECK (
    status IN ('sent', 'viewed', 'signed', 'void')
  ) DEFAULT 'sent',

  signer_name text,
  signer_email text,
  signer_ip text,
  signed_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_job_signable_documents_job_id 
  ON public.job_signable_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_job_signable_documents_workspace_id 
  ON public.job_signable_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_signable_documents_status 
  ON public.job_signable_documents(status);
CREATE INDEX IF NOT EXISTS idx_job_signable_documents_document_type 
  ON public.job_signable_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_job_signable_documents_signer_email 
  ON public.job_signable_documents(signer_email);

-- ============================================================================
-- PART 2 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.job_signable_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view documents in their workspace
CREATE POLICY "docs select"
  ON public.job_signable_documents
  FOR SELECT
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

-- Policy: Users can insert documents in their workspace
CREATE POLICY "docs insert"
  ON public.job_signable_documents
  FOR INSERT
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

-- Policy: Users can update documents in their workspace
CREATE POLICY "docs update"
  ON public.job_signable_documents
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  )
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

-- Policy: Service role can do everything (for edge functions)
CREATE POLICY "docs service role all"
  ON public.job_signable_documents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 3 — CREATE STORAGE BUCKETS
-- ============================================================================

-- Bucket for original documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents-original',
  'documents-original',
  false, -- private bucket
  52428800, -- 50 MB file size limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket for signed documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents-signed',
  'documents-signed',
  false, -- private bucket
  52428800, -- 50 MB file size limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for documents-original bucket
CREATE POLICY "documents-original users can upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents-original' AND
    (storage.foldername(name))[1] IN (
      SELECT workspace_id::text FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "documents-original users can read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents-original' AND
    (storage.foldername(name))[1] IN (
      SELECT workspace_id::text FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "documents-original service role full access"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'documents-original')
  WITH CHECK (bucket_id = 'documents-original');

-- Storage policies for documents-signed bucket
CREATE POLICY "documents-signed users can read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents-signed' AND
    (storage.foldername(name))[1] IN (
      SELECT workspace_id::text FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "documents-signed service role full access"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'documents-signed')
  WITH CHECK (bucket_id = 'documents-signed');

-- ============================================================================
-- PART 4 — CREATE FUNCTION TO AUTO-UPDATE JOB STATUS ON DOCUMENT SIGNING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_document_signed()
RETURNS TRIGGER AS $$
DECLARE
  v_job_id uuid;
  v_document_type text;
  v_workspace_id uuid;
BEGIN
  -- Only trigger on status change to 'signed'
  IF NEW.status = 'signed' AND (OLD.status IS NULL OR OLD.status != 'signed') THEN
    v_job_id := NEW.job_id;
    v_document_type := NEW.document_type;
    v_workspace_id := NEW.workspace_id;

    -- Update job status based on document type
    IF v_document_type = 'estimate' THEN
      -- When estimate is signed, mark job as "Approved"
      UPDATE public.roofing_jobs
      SET status = 'scheduled'
      WHERE id = v_job_id
        AND status IN ('unscheduled', 'awaiting_approval');
      
      -- Add timeline event
      INSERT INTO public.job_timeline (
        job_id,
        event_type,
        description,
        metadata
      ) VALUES (
        v_job_id,
        'job_status_changed',
        'Estimate accepted and signed by homeowner',
        jsonb_build_object(
          'old_status', (SELECT status FROM public.roofing_jobs WHERE id = v_job_id),
          'new_status', 'scheduled',
          'document_id', NEW.id,
          'document_type', 'estimate'
        )
      );

    ELSIF v_document_type = 'contract' THEN
      -- When contract is signed, mark job as "Scheduled"
      UPDATE public.roofing_jobs
      SET status = 'scheduled'
      WHERE id = v_job_id;
      
      INSERT INTO public.job_timeline (
        job_id,
        event_type,
        description,
        metadata
      ) VALUES (
        v_job_id,
        'job_status_changed',
        'Contract signed by homeowner',
        jsonb_build_object(
          'document_id', NEW.id,
          'document_type', 'contract'
        )
      );

    ELSIF v_document_type = 'change_order' THEN
      -- Change order signed - add to job revenue (if amount is stored in metadata)
      INSERT INTO public.job_timeline (
        job_id,
        event_type,
        description,
        metadata
      ) VALUES (
        v_job_id,
        'change_order_signed',
        'Change order signed by homeowner',
        jsonb_build_object(
          'document_id', NEW.id,
          'document_type', 'change_order'
        )
      );

    ELSIF v_document_type = 'invoice' THEN
      -- Invoice signed - mark as "Pending Payment" or update payment status
      INSERT INTO public.job_timeline (
        job_id,
        event_type,
        description,
        metadata
      ) VALUES (
        v_job_id,
        'invoice_signed',
        'Invoice signed by homeowner',
        jsonb_build_object(
          'document_id', NEW.id,
          'document_type', 'invoice'
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_document_signed ON public.job_signable_documents;
CREATE TRIGGER trigger_document_signed
  AFTER UPDATE ON public.job_signable_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_document_signed();

-- ============================================================================
-- PART 5 — CREATE FUNCTION TO UPDATE updated_at TIMESTAMP
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_job_signable_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_job_signable_documents_updated_at
  BEFORE UPDATE ON public.job_signable_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_job_signable_documents_updated_at();

-- ============================================================================
-- PART 6 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.job_signable_documents TO authenticated;

-- ============================================================================
-- PART 7 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.job_signable_documents IS 'Block 22830: E-signature documents for roofing jobs - estimates, contracts, invoices, change orders, warranties';
COMMENT ON COLUMN public.job_signable_documents.document_type IS 'Block 22830: Type of document: estimate, contract, change_order, invoice, warranty, other';
COMMENT ON COLUMN public.job_signable_documents.status IS 'Block 22830: Document status: sent, viewed, signed, void';
COMMENT ON COLUMN public.job_signable_documents.storage_path IS 'Block 22830: Path to original PDF in documents-original bucket';
COMMENT ON COLUMN public.job_signable_documents.signed_storage_path IS 'Block 22830: Path to signed PDF in documents-signed bucket';







































