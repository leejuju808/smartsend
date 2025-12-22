-- Block 257000 — SmartSend AI Office Admin Engine v1
-- Email Handling, Voicemail Transcription, Task Automation, Document Filing, Customer Intake
-- This block turns SmartSend into the office assistant every roofing company dreams of

-- ============================================================================
-- PART 1 — CREATE office_users TABLE
-- ============================================================================
-- Office staff members who can be assigned tasks and handle inbox items

CREATE TABLE IF NOT EXISTS public.office_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_member_id uuid REFERENCES public.roofing_company_members(id) ON DELETE SET NULL,
  
  -- Office Role
  role text NOT NULL DEFAULT 'office_staff' CHECK (role IN (
    'office_manager',
    'office_staff',
    'admin',
    'scheduler',
    'customer_service'
  )),
  
  -- Assignment preferences
  can_handle_emails boolean DEFAULT true,
  can_handle_voicemails boolean DEFAULT true,
  can_handle_tasks boolean DEFAULT true,
  can_handle_documents boolean DEFAULT true,
  
  -- Metadata
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- One office user record per user per company
  CONSTRAINT unique_office_user_company UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_office_users_company ON public.office_users(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_office_users_user ON public.office_users(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_office_users_role ON public.office_users(company_id, role) WHERE is_active = true;

COMMENT ON TABLE public.office_users IS 'Office staff members for AI Office Admin Engine (Block 257000)';

-- ============================================================================
-- PART 2 — CREATE office_inbox TABLE
-- ============================================================================
-- Unified inbox for all office communications (email, voicemail, SMS, webform)

CREATE TABLE IF NOT EXISTS public.office_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Source information
  source text NOT NULL CHECK (source IN ('email', 'voicemail', 'sms', 'webform')),
  from_name text,
  from_email text,
  from_phone text,
  
  -- Message content
  subject text,
  message text,
  transcription text, -- For voicemails
  
  -- AI Analysis
  ai_category text, -- 'warranty_issue', 'new_lead', 'scheduling', 'payment', 'general', etc.
  ai_urgency text DEFAULT 'normal' CHECK (ai_urgency IN ('low', 'normal', 'high', 'urgent')),
  ai_summary text,
  ai_sentiment text, -- 'positive', 'neutral', 'negative', 'frustrated'
  ai_extracted_data jsonb DEFAULT '{}'::jsonb, -- Extracted structured data (job_id, customer_name, etc.)
  
  -- Assignment
  assigned_to uuid REFERENCES public.office_users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  assigned_by uuid REFERENCES auth.users(id),
  
  -- Status tracking
  status text DEFAULT 'new' CHECK (status IN ('new', 'open', 'in_progress', 'closed', 'archived')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Related entities
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Response tracking
  response_sent boolean DEFAULT false,
  response_sent_at timestamptz,
  response_draft text, -- AI-generated response draft
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_inbox_company ON public.office_inbox(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_inbox_status ON public.office_inbox(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_inbox_assigned ON public.office_inbox(assigned_to, status) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_office_inbox_source ON public.office_inbox(company_id, source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_inbox_priority ON public.office_inbox(company_id, priority, status) WHERE status != 'closed';
CREATE INDEX IF NOT EXISTS idx_office_inbox_lead ON public.office_inbox(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_office_inbox_job ON public.office_inbox(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_office_inbox_category ON public.office_inbox(company_id, ai_category) WHERE ai_category IS NOT NULL;

COMMENT ON TABLE public.office_inbox IS 'Unified office inbox for all communications (Block 257000)';

-- ============================================================================
-- PART 3 — CREATE office_tasks TABLE
-- ============================================================================
-- Tasks created from inbox items or manually

CREATE TABLE IF NOT EXISTS public.office_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  inbox_id uuid REFERENCES public.office_inbox(id) ON DELETE SET NULL,
  
  -- Task details
  task text NOT NULL,
  description text,
  task_type text DEFAULT 'general' CHECK (task_type IN (
    'follow_up',
    'scheduling',
    'admin',
    'pm_task',
    'sales_followup',
    'customer_service',
    'general'
  )),
  
  -- Assignment
  assigned_to uuid REFERENCES public.office_users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  assigned_by uuid REFERENCES auth.users(id),
  
  -- Due date
  due_date date,
  due_time time,
  
  -- Status
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id),
  
  -- Related entities
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  
  -- Priority
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_tasks_company ON public.office_tasks(company_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_office_tasks_assigned ON public.office_tasks(assigned_to, status) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_office_tasks_due ON public.office_tasks(company_id, due_date, status) WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_office_tasks_inbox ON public.office_tasks(inbox_id) WHERE inbox_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_office_tasks_priority ON public.office_tasks(company_id, priority, status) WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_office_tasks_lead ON public.office_tasks(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_office_tasks_job ON public.office_tasks(job_id) WHERE job_id IS NOT NULL;

COMMENT ON TABLE public.office_tasks IS 'Office tasks created from inbox items or manually (Block 257000)';

-- ============================================================================
-- PART 4 — CREATE office_documents TABLE
-- ============================================================================
-- Documents filed by AI (contracts, invoices, permits, etc.)

CREATE TABLE IF NOT EXISTS public.office_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Document details
  doc_type text NOT NULL CHECK (doc_type IN (
    'contract',
    'invoice',
    'permit',
    'inspection',
    'warranty',
    'supplement',
    'coi',
    'photo',
    'estimate',
    'other'
  )),
  
  -- File information
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  mime_type text,
  
  -- AI Recognition
  ai_recognized_type text, -- What AI thinks the document type is
  ai_extracted_data jsonb DEFAULT '{}'::jsonb, -- Extracted data (amounts, dates, job numbers, etc.)
  ai_confidence numeric(5,2) CHECK (ai_confidence >= 0 AND ai_confidence <= 100),
  
  -- Filing
  filed_path text, -- Virtual path like "/contracts/2025/Job_1102.pdf"
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_ai boolean DEFAULT false, -- True if uploaded/processed by AI
  
  -- Metadata
  tags text[] DEFAULT '{}'::text[],
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_documents_company ON public.office_documents(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_documents_job ON public.office_documents(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_office_documents_lead ON public.office_documents(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_office_documents_type ON public.office_documents(company_id, doc_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_documents_tags ON public.office_documents USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_office_documents_path ON public.office_documents(company_id, filed_path) WHERE filed_path IS NOT NULL;

COMMENT ON TABLE public.office_documents IS 'Documents filed by AI document filing engine (Block 257000)';

-- ============================================================================
-- PART 5 — CREATE office_activity_log TABLE
-- ============================================================================
-- Activity log for dashboard and tracking

CREATE TABLE IF NOT EXISTS public.office_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Activity details
  activity_type text NOT NULL CHECK (activity_type IN (
    'email_received',
    'email_processed',
    'voicemail_received',
    'voicemail_transcribed',
    'task_created',
    'task_completed',
    'document_uploaded',
    'document_filed',
    'response_sent',
    'customer_intake_completed',
    'follow_up_sent'
  )),
  
  -- Related entities
  inbox_id uuid REFERENCES public.office_inbox(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.office_tasks(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.office_documents(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  
  -- Actor
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_ai boolean DEFAULT false,
  
  -- Details
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_activity_company ON public.office_activity_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_activity_type ON public.office_activity_log(company_id, activity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_activity_date ON public.office_activity_log(company_id, created_at::date, activity_type);

COMMENT ON TABLE public.office_activity_log IS 'Activity log for office admin dashboard (Block 257000)';

-- ============================================================================
-- PART 6 — TRIGGERS
-- ============================================================================

-- Update updated_at on office_users
CREATE OR REPLACE FUNCTION update_office_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_office_users_updated_at ON public.office_users;
CREATE TRIGGER trg_office_users_updated_at
BEFORE UPDATE ON public.office_users
FOR EACH ROW
EXECUTE FUNCTION update_office_users_updated_at();

-- Update updated_at on office_inbox
CREATE OR REPLACE FUNCTION update_office_inbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_office_inbox_updated_at ON public.office_inbox;
CREATE TRIGGER trg_office_inbox_updated_at
BEFORE UPDATE ON public.office_inbox
FOR EACH ROW
EXECUTE FUNCTION update_office_inbox_updated_at();

-- Update updated_at on office_tasks
CREATE OR REPLACE FUNCTION update_office_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_office_tasks_updated_at ON public.office_tasks;
CREATE TRIGGER trg_office_tasks_updated_at
BEFORE UPDATE ON public.office_tasks
FOR EACH ROW
EXECUTE FUNCTION update_office_tasks_updated_at();

-- Update updated_at on office_documents
CREATE OR REPLACE FUNCTION update_office_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_office_documents_updated_at ON public.office_documents;
CREATE TRIGGER trg_office_documents_updated_at
BEFORE UPDATE ON public.office_documents
FOR EACH ROW
EXECUTE FUNCTION update_office_documents_updated_at();

-- Auto-log activity when inbox item is created
CREATE OR REPLACE FUNCTION log_office_inbox_activity()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.office_activity_log (
    company_id,
    activity_type,
    inbox_id,
    lead_id,
    job_id,
    performed_by_ai,
    details
  ) VALUES (
    NEW.company_id,
    CASE 
      WHEN NEW.source = 'email' THEN 'email_received'
      WHEN NEW.source = 'voicemail' THEN 'voicemail_received'
      ELSE 'email_received'
    END,
    NEW.id,
    NEW.lead_id,
    NEW.job_id,
    true,
    jsonb_build_object(
      'source', NEW.source,
      'subject', NEW.subject,
      'from_name', NEW.from_name,
      'from_email', NEW.from_email,
      'from_phone', NEW.from_phone
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_office_inbox_activity ON public.office_inbox;
CREATE TRIGGER trg_log_office_inbox_activity
AFTER INSERT ON public.office_inbox
FOR EACH ROW
EXECUTE FUNCTION log_office_inbox_activity();

-- Auto-log activity when task is created
CREATE OR REPLACE FUNCTION log_office_task_activity()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.office_activity_log (
    company_id,
    activity_type,
    task_id,
    inbox_id,
    lead_id,
    job_id,
    performed_by,
    performed_by_ai,
    details
  ) VALUES (
    NEW.company_id,
    'task_created',
    NEW.id,
    NEW.inbox_id,
    NEW.lead_id,
    NEW.job_id,
    NEW.assigned_by,
    NEW.assigned_by IS NULL, -- If no assigned_by, it was AI
    jsonb_build_object(
      'task', NEW.task,
      'task_type', NEW.task_type,
      'priority', NEW.priority,
      'due_date', NEW.due_date
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_office_task_activity ON public.office_tasks;
CREATE TRIGGER trg_log_office_task_activity
AFTER INSERT ON public.office_tasks
FOR EACH ROW
EXECUTE FUNCTION log_office_task_activity();

-- Auto-log activity when task is completed
CREATE OR REPLACE FUNCTION log_office_task_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
    INSERT INTO public.office_activity_log (
      company_id,
      activity_type,
      task_id,
      lead_id,
      job_id,
      performed_by,
      details
    ) VALUES (
      NEW.company_id,
      'task_completed',
      NEW.id,
      NEW.lead_id,
      NEW.job_id,
      NEW.completed_by,
      jsonb_build_object(
        'task', NEW.task,
        'completed_at', NEW.completed_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_office_task_completed ON public.office_tasks;
CREATE TRIGGER trg_log_office_task_completed
AFTER UPDATE ON public.office_tasks
FOR EACH ROW
EXECUTE FUNCTION log_office_task_completed();

-- Auto-log activity when document is uploaded
CREATE OR REPLACE FUNCTION log_office_document_activity()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.office_activity_log (
    company_id,
    activity_type,
    document_id,
    job_id,
    lead_id,
    performed_by,
    performed_by_ai,
    details
  ) VALUES (
    NEW.company_id,
    CASE 
      WHEN NEW.uploaded_by_ai THEN 'document_filed'
      ELSE 'document_uploaded'
    END,
    NEW.id,
    NEW.job_id,
    NEW.lead_id,
    NEW.uploaded_by,
    NEW.uploaded_by_ai,
    jsonb_build_object(
      'doc_type', NEW.doc_type,
      'file_name', NEW.file_name,
      'ai_recognized_type', NEW.ai_recognized_type,
      'filed_path', NEW.filed_path
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_office_document_activity ON public.office_documents;
CREATE TRIGGER trg_log_office_document_activity
AFTER INSERT ON public.office_documents
FOR EACH ROW
EXECUTE FUNCTION log_office_document_activity();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.office_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_activity_log ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is office staff for company
CREATE OR REPLACE FUNCTION is_office_staff_for_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.office_users ou
    WHERE ou.company_id = p_company_id
      AND ou.user_id = auth.uid()
      AND ou.is_active = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.roofing_companies rc
    WHERE rc.id = p_company_id
      AND rc.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.roofing_company_members rcm
    WHERE rcm.roofing_company_id = p_company_id
      AND rcm.user_id = auth.uid()
      AND rcm.is_active = true
      AND rcm.role IN ('owner', 'admin', 'ops')
  );
$$;

-- office_users: Company members can view office users for their company
DROP POLICY IF EXISTS "office_users_company_access" ON public.office_users;
CREATE POLICY "office_users_company_access" ON public.office_users
  FOR ALL USING (is_office_staff_for_company(company_id))
  WITH CHECK (is_office_staff_for_company(company_id));

-- office_inbox: Company members can access inbox for their company
DROP POLICY IF EXISTS "office_inbox_company_access" ON public.office_inbox;
CREATE POLICY "office_inbox_company_access" ON public.office_inbox
  FOR ALL USING (is_office_staff_for_company(company_id))
  WITH CHECK (is_office_staff_for_company(company_id));

-- office_tasks: Company members can access tasks for their company
DROP POLICY IF EXISTS "office_tasks_company_access" ON public.office_tasks;
CREATE POLICY "office_tasks_company_access" ON public.office_tasks
  FOR ALL USING (is_office_staff_for_company(company_id))
  WITH CHECK (is_office_staff_for_company(company_id));

-- office_documents: Company members can access documents for their company
DROP POLICY IF EXISTS "office_documents_company_access" ON public.office_documents;
CREATE POLICY "office_documents_company_access" ON public.office_documents
  FOR ALL USING (is_office_staff_for_company(company_id))
  WITH CHECK (is_office_staff_for_company(company_id));

-- office_activity_log: Company members can view activity for their company
DROP POLICY IF EXISTS "office_activity_log_company_access" ON public.office_activity_log;
CREATE POLICY "office_activity_log_company_access" ON public.office_activity_log
  FOR SELECT USING (is_office_staff_for_company(company_id));

-- Service role has full access
DROP POLICY IF EXISTS "office_service_role_full_access" ON public.office_users;
CREATE POLICY "office_service_role_full_access" ON public.office_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_inbox_service_role_full_access" ON public.office_inbox;
CREATE POLICY "office_inbox_service_role_full_access" ON public.office_inbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_tasks_service_role_full_access" ON public.office_tasks;
CREATE POLICY "office_tasks_service_role_full_access" ON public.office_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_documents_service_role_full_access" ON public.office_documents;
CREATE POLICY "office_documents_service_role_full_access" ON public.office_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "office_activity_log_service_role_full_access" ON public.office_activity_log;
CREATE POLICY "office_activity_log_service_role_full_access" ON public.office_activity_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 8 — HELPER FUNCTIONS
-- ============================================================================

-- Function to get office dashboard summary
CREATE OR REPLACE FUNCTION get_office_dashboard_summary(p_company_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'date', p_date,
    'messages_received', (
      SELECT COUNT(*) 
      FROM public.office_inbox 
      WHERE company_id = p_company_id 
        AND created_at::date = p_date
    ),
    'messages_handled_automatically', (
      SELECT COUNT(*) 
      FROM public.office_inbox 
      WHERE company_id = p_company_id 
        AND created_at::date = p_date
        AND assigned_to IS NULL
        AND status IN ('closed', 'archived')
    ),
    'messages_assigned_to_staff', (
      SELECT COUNT(*) 
      FROM public.office_inbox 
      WHERE company_id = p_company_id 
        AND created_at::date = p_date
        AND assigned_to IS NOT NULL
    ),
    'avg_response_time_minutes', (
      SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (response_sent_at - created_at)) / 60), 0)::numeric(10,2)
      FROM public.office_inbox
      WHERE company_id = p_company_id
        AND created_at::date = p_date
        AND response_sent = true
        AND response_sent_at IS NOT NULL
    ),
    'overdue_tasks', (
      SELECT COUNT(*)
      FROM public.office_tasks
      WHERE company_id = p_company_id
        AND status IN ('open', 'in_progress')
        AND due_date < p_date
    ),
    'open_tasks', (
      SELECT COUNT(*)
      FROM public.office_tasks
      WHERE company_id = p_company_id
        AND status IN ('open', 'in_progress')
    ),
    'completed_tasks', (
      SELECT COUNT(*)
      FROM public.office_tasks
      WHERE company_id = p_company_id
        AND created_at::date = p_date
        AND status = 'completed'
    ),
    'documents_filed', (
      SELECT COUNT(*)
      FROM public.office_documents
      WHERE company_id = p_company_id
        AND created_at::date = p_date
    ),
    'voicemails_transcribed', (
      SELECT COUNT(*)
      FROM public.office_inbox
      WHERE company_id = p_company_id
        AND source = 'voicemail'
        AND created_at::date = p_date
        AND transcription IS NOT NULL
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

COMMENT ON FUNCTION get_office_dashboard_summary IS 'Get office dashboard summary for a company on a specific date (Block 257000)';

-- ============================================================================
-- PART 9 — STORAGE BUCKET FOR OFFICE DOCUMENTS
-- ============================================================================

-- Create storage bucket for office documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'office-documents',
  'office-documents',
  false, -- private bucket
  52428800, -- 50 MB limit per file
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for office-documents bucket
-- Policy: Office staff can upload documents for their company
CREATE POLICY IF NOT EXISTS "office_documents_company_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'office-documents'
    AND EXISTS(
      SELECT 1 FROM public.office_users ou
      WHERE ou.company_id::text = (storage.foldername(name))[1]
        AND ou.user_id = auth.uid()
        AND ou.is_active = true
    )
  );

-- Policy: Office staff can read documents for their company
CREATE POLICY IF NOT EXISTS "office_documents_company_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'office-documents'
    AND EXISTS(
      SELECT 1 FROM public.office_users ou
      WHERE ou.company_id::text = (storage.foldername(name))[1]
        AND ou.user_id = auth.uid()
        AND ou.is_active = true
    )
  );

-- Policy: Office staff can delete documents for their company
CREATE POLICY IF NOT EXISTS "office_documents_company_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'office-documents'
    AND EXISTS(
      SELECT 1 FROM public.office_users ou
      WHERE ou.company_id::text = (storage.foldername(name))[1]
        AND ou.user_id = auth.uid()
        AND ou.is_active = true
    )
  );

-- Service role has full access
CREATE POLICY IF NOT EXISTS "office_documents_service_role_full_access"
  ON storage.objects
  TO service_role
  FOR ALL
  USING (bucket_id = 'office-documents')
  WITH CHECK (bucket_id = 'office-documents');





















