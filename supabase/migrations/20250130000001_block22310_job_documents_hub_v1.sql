-- =========================================================
-- Block 22310 — SmartSend Roofing Job Documents Hub v1
-- (The "All The Paperwork In One Place" Feature)
-- =========================================================
-- 
-- Every job gets its own Docs Hub, where the roofer can upload, view, and share:
-- Photos, Contracts, Insurance docs, Permits, Invoices, Before/after pictures,
-- Drone shots, Material receipts
-- 
-- This becomes a massive stickiness feature: once their documents sit inside SmartSend, they will NOT churn.

-- ============================================================================
-- PART 1 — CREATE job_documents TABLE
-- ============================================================================
-- Single table for all document types per job

CREATE TABLE IF NOT EXISTS public.job_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  doc_type text CHECK (doc_type IN (
    'photo_before',
    'photo_after',
    'contract',
    'invoice',
    'insurance',
    'permit',
    'receipt',
    'material_list',
    'other'
  )) DEFAULT 'other',

  title text,
  file_url text NOT NULL,
  file_ext text,
  file_size integer,

  uploaded_by uuid REFERENCES public.profiles(id),
  uploaded_at timestamptz DEFAULT now(),

  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS job_documents_job_idx ON public.job_documents(job_id);
CREATE INDEX IF NOT EXISTS job_documents_workspace_idx ON public.job_documents(workspace_id);
CREATE INDEX IF NOT EXISTS job_documents_doc_type_idx ON public.job_documents(doc_type);
CREATE INDEX IF NOT EXISTS job_documents_uploaded_at_idx ON public.job_documents(uploaded_at DESC);

-- ============================================================================
-- PART 2 — ROW LEVEL SECURITY FOR job_documents
-- ============================================================================

ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view documents in their workspace
CREATE POLICY "Users can view documents in their workspace"
  ON public.job_documents FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can insert documents in their workspace
CREATE POLICY "Users can insert documents in their workspace"
  ON public.job_documents FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update documents in their workspace
CREATE POLICY "Users can update documents in their workspace"
  ON public.job_documents FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can delete documents in their workspace
CREATE POLICY "Users can delete documents in their workspace"
  ON public.job_documents FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 3 — CREATE STORAGE BUCKET
-- ============================================================================
-- Create storage bucket for job documents (private bucket)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-documents',
  'job-documents',
  false, -- private bucket
  52428800, -- 50 MB file size limit
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for job-documents bucket
-- Policy: Users can upload files to their workspace folder
CREATE POLICY "Users can upload job documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'job-documents' AND
    (storage.foldername(name))[1] IN (
      SELECT workspace_id::text FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can view files in their workspace folders
CREATE POLICY "Users can view job documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'job-documents' AND
    (storage.foldername(name))[1] IN (
      SELECT workspace_id::text FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can delete files in their workspace folders
CREATE POLICY "Users can delete job documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'job-documents' AND
    (storage.foldername(name))[1] IN (
      SELECT workspace_id::text FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 4 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_documents TO authenticated;

-- ============================================================================
-- PART 5 — COMMENT
-- ============================================================================

COMMENT ON TABLE public.job_documents IS 'Documents hub for roofing jobs - photos, contracts, insurance docs, permits, invoices, receipts, and more. This is a major stickiness feature.';

