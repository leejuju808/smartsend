-- =========================================================
-- Block 253100 — SmartSend Job Documentation Engine v1
-- "Contracts, Change Orders, Photos, Plans, Permits, Inspection Reports, Document Sharing"
-- =========================================================
-- 
-- This block makes SmartSend the central source of truth for every roofing job.
-- 
-- Roofers will say:
-- "SmartSend stores everything in one place — we never lose documents anymore."
-- "We finally feel organized."
-- "We'd be idiots not using this."
-- 
-- This becomes mission-critical infrastructure.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE job_documents TABLE
-- ============================================================================
-- Central document repository per job

CREATE TABLE IF NOT EXISTS public.job_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  doc_type text NOT NULL CHECK (doc_type IN (
    'contract', 
    'change_order', 
    'permit', 
    'plan', 
    'inspection', 
    'photo',
    'misc'
  )),
  name text NOT NULL,
  file_url text NOT NULL,
  storage_path text, -- Path in Supabase storage
  file_size bigint, -- File size in bytes
  mime_type text, -- MIME type (application/pdf, image/jpeg, etc.)
  
  version int DEFAULT 1,
  is_active boolean DEFAULT true, -- For contracts: only one active version per job
  
  -- Photo-specific fields
  photo_category text CHECK (photo_category IN (
    'before',
    'during',
    'after',
    'material_delivery',
    'damage_report',
    'qc_inspection',
    'warranty_item'
  )),
  
  -- Metadata
  uploaded_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  description text,
  tags text[], -- Array of tags for filtering
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_documents_job ON public.job_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_job_documents_company ON public.job_documents(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_documents_type ON public.job_documents(job_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_job_documents_active ON public.job_documents(job_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_job_documents_photo_category ON public.job_documents(job_id, photo_category) WHERE doc_type = 'photo';
CREATE INDEX IF NOT EXISTS idx_job_documents_uploaded_by ON public.job_documents(uploaded_by) WHERE uploaded_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_documents_created ON public.job_documents(created_at DESC);

COMMENT ON TABLE public.job_documents IS 'Central document repository for all job documents (Block 253100)';
COMMENT ON COLUMN public.job_documents.doc_type IS 'Document type: contract, change_order, permit, plan, inspection, photo, misc';
COMMENT ON COLUMN public.job_documents.is_active IS 'For contracts: only one active version per job';
COMMENT ON COLUMN public.job_documents.photo_category IS 'Photo category: before, during, after, material_delivery, damage_report, qc_inspection, warranty_item';

-- ============================================================================
-- PART 2 — CREATE change_orders TABLE
-- ============================================================================
-- Change order workflow with approval and signatures

CREATE TABLE IF NOT EXISTS public.change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  change_order_number text, -- e.g. "CO-00417"
  description text NOT NULL,
  price_difference numeric(12,2) NOT NULL, -- Can be positive (add) or negative (deduct)
  
  -- Document reference
  document_id uuid REFERENCES public.job_documents(id) ON DELETE SET NULL,
  
  -- Signature workflow
  customer_signature_url text,
  customer_signature_data text, -- Base64 signature data
  customer_signed_name text,
  customer_signed_at timestamptz,
  
  -- Status tracking
  status text DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Created, awaiting customer review
    'sent',         -- Sent to customer
    'approved',     -- Customer approved (adds to job revenue)
    'rejected',     -- Customer rejected (flagged red)
    'signed'        -- Fully signed (PDF generated)
  )),
  
  -- Signature link (for customer portal)
  signature_token text UNIQUE, -- Token for public signature link
  signature_link_expires_at timestamptz,
  
  -- Metadata
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  signed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_change_orders_job ON public.change_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_company ON public.change_orders(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_change_orders_status ON public.change_orders(job_id, status);
CREATE INDEX IF NOT EXISTS idx_change_orders_number ON public.change_orders(change_order_number) WHERE change_order_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_change_orders_signature_token ON public.change_orders(signature_token) WHERE signature_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_change_orders_created ON public.change_orders(created_at DESC);

COMMENT ON TABLE public.change_orders IS 'Change order workflow with customer signatures (Block 253100)';
COMMENT ON COLUMN public.change_orders.status IS 'Status: pending, sent, approved, rejected, signed';
COMMENT ON COLUMN public.change_orders.price_difference IS 'Price difference in dollars (positive = add, negative = deduct)';
COMMENT ON COLUMN public.change_orders.signature_token IS 'Unique token for public signature link (smartsend.app/sign/change-order/TOKEN)';

-- ============================================================================
-- PART 3 — CREATE permits TABLE
-- ============================================================================
-- Permit management with expiration tracking

CREATE TABLE IF NOT EXISTS public.permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  permit_number text,
  issued_by text, -- City/County name
  permit_type text, -- building, electrical, plumbing, etc.
  
  -- Status tracking
  status text DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Application submitted
    'approved',     -- Permit approved
    'rejected',     -- Permit rejected
    'expired'       -- Permit expired
  )),
  
  -- Dates
  applied_date date,
  issued_date date,
  expires_on date,
  
  -- Document reference
  document_id uuid REFERENCES public.job_documents(id) ON DELETE SET NULL,
  file_url text,
  
  -- Contact info
  city_contact_name text,
  city_contact_phone text,
  city_contact_email text,
  
  -- Metadata
  notes text,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permits_job ON public.permits(job_id);
CREATE INDEX IF NOT EXISTS idx_permits_company ON public.permits(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permits_status ON public.permits(job_id, status);
CREATE INDEX IF NOT EXISTS idx_permits_expires ON public.permits(expires_on) WHERE expires_on IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permits_number ON public.permits(permit_number) WHERE permit_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permits_expiring_soon ON public.permits(expires_on, status) 
  WHERE expires_on IS NOT NULL AND status = 'approved';

COMMENT ON TABLE public.permits IS 'Permit management with expiration tracking (Block 253100)';
COMMENT ON COLUMN public.permits.status IS 'Status: pending, approved, rejected, expired';
COMMENT ON COLUMN public.permits.expires_on IS 'Permit expiration date (triggers alerts if < 10 days)';

-- ============================================================================
-- PART 4 — CREATE inspection_reports TABLE
-- ============================================================================
-- Inspection report storage (city + internal)

CREATE TABLE IF NOT EXISTS public.inspection_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  
  inspector_name text,
  inspector_type text CHECK (inspector_type IN (
    'city',
    'county',
    'internal_qc',
    'third_party'
  )),
  
  -- Document reference
  document_id uuid REFERENCES public.job_documents(id) ON DELETE SET NULL,
  report_url text,
  
  -- Results
  passed boolean,
  status text CHECK (status IN (
    'scheduled',
    'in_progress',
    'passed',
    'failed',
    're_inspection_required'
  )),
  
  -- Details
  inspection_date date,
  notes text,
  deficiencies text[], -- Array of deficiency descriptions
  
  -- Metadata
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_reports_job ON public.inspection_reports(job_id);
CREATE INDEX IF NOT EXISTS idx_inspection_reports_company ON public.inspection_reports(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inspection_reports_status ON public.inspection_reports(job_id, status);
CREATE INDEX IF NOT EXISTS idx_inspection_reports_passed ON public.inspection_reports(job_id, passed) WHERE passed IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inspection_reports_date ON public.inspection_reports(inspection_date DESC) WHERE inspection_date IS NOT NULL;

COMMENT ON TABLE public.inspection_reports IS 'Inspection report storage (city + internal QC) (Block 253100)';
COMMENT ON COLUMN public.inspection_reports.status IS 'Status: scheduled, in_progress, passed, failed, re_inspection_required';
COMMENT ON COLUMN public.inspection_reports.inspector_type IS 'Inspector type: city, county, internal_qc, third_party';

-- ============================================================================
-- PART 5 — CREATE STORAGE BUCKETS
-- ============================================================================

-- Job documents bucket (main bucket)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-documents',
  'job-documents',
  false,
  52428800, -- 50MB limit
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Contracts bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contracts',
  'contracts',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Change orders bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'change-orders',
  'change-orders',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Permits bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'permits',
  'permits',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Inspection reports bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inspection-reports',
  'inspection-reports',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Plans bucket (blueprints, drawings)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'plans',
  'plans',
  false,
  52428800, -- 50MB limit (larger for detailed plans)
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']
)
ON CONFLICT (id) DO NOTHING;

-- Photos bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  false,
  10485760, -- 10MB limit per photo
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 6 — STORAGE POLICIES (RLS)
-- ============================================================================

-- Job documents bucket policies
CREATE POLICY IF NOT EXISTS "job_documents_read_company_members"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'job-documents' AND
  (
    -- Check if user is a company member
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.roofing_companies
      WHERE id IN (
        SELECT roofing_company_id FROM public.roofing_company_members
        WHERE user_id = auth.uid()
      )
      OR owner_id = auth.uid()
    )
  )
);

CREATE POLICY IF NOT EXISTS "job_documents_upload_company_members"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'job-documents' AND
  (
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.roofing_companies
      WHERE id IN (
        SELECT roofing_company_id FROM public.roofing_company_members
        WHERE user_id = auth.uid()
      )
      OR owner_id = auth.uid()
    )
  )
);

CREATE POLICY IF NOT EXISTS "job_documents_delete_company_members"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'job-documents' AND
  (
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.roofing_companies
      WHERE id IN (
        SELECT roofing_company_id FROM public.roofing_company_members
        WHERE user_id = auth.uid()
      )
      OR owner_id = auth.uid()
    )
  )
);

-- Apply same policies to all document buckets
DO $$
DECLARE
  bucket_name text;
BEGIN
  FOR bucket_name IN SELECT unnest(ARRAY['contracts', 'change-orders', 'permits', 'inspection-reports', 'plans', 'photos']) LOOP
    -- Read policy
    EXECUTE format('
      CREATE POLICY IF NOT EXISTS "%s_read_company_members"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = %L AND
        (
          (storage.foldername(name))[1] IN (
            SELECT id::text FROM public.roofing_companies
            WHERE id IN (
              SELECT roofing_company_id FROM public.roofing_company_members
              WHERE user_id = auth.uid()
            )
            OR owner_id = auth.uid()
          )
        )
      )', bucket_name || '_read', bucket_name);
    
    -- Insert policy
    EXECUTE format('
      CREATE POLICY IF NOT EXISTS "%s_upload_company_members"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = %L AND
        (
          (storage.foldername(name))[1] IN (
            SELECT id::text FROM public.roofing_companies
            WHERE id IN (
              SELECT roofing_company_id FROM public.roofing_company_members
              WHERE user_id = auth.uid()
            )
            OR owner_id = auth.uid()
          )
        )
      )', bucket_name || '_upload', bucket_name);
    
    -- Delete policy
    EXECUTE format('
      CREATE POLICY IF NOT EXISTS "%s_delete_company_members"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = %L AND
        (
          (storage.foldername(name))[1] IN (
            SELECT id::text FROM public.roofing_companies
            WHERE id IN (
              SELECT roofing_company_id FROM public.roofing_company_members
              WHERE user_id = auth.uid()
            )
            OR owner_id = auth.uid()
          )
        )
      )', bucket_name || '_delete', bucket_name);
  END LOOP;
END $$;

-- Service role full access
CREATE POLICY IF NOT EXISTS "job_documents_service_role_all"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id IN ('job-documents', 'contracts', 'change-orders', 'permits', 'inspection-reports', 'plans', 'photos'))
WITH CHECK (bucket_id IN ('job-documents', 'contracts', 'change-orders', 'permits', 'inspection-reports', 'plans', 'photos'));

-- ============================================================================
-- PART 7 — FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function: Auto-increment version when uploading contract with same name
CREATE OR REPLACE FUNCTION public.increment_contract_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_version int;
BEGIN
  -- Only for contracts
  IF NEW.doc_type = 'contract' THEN
    -- Get max version for this job and name
    SELECT COALESCE(MAX(version), 0) INTO v_max_version
    FROM public.job_documents
    WHERE job_id = NEW.job_id
      AND name = NEW.name
      AND doc_type = 'contract';
    
    -- Set new version
    NEW.version := v_max_version + 1;
    
    -- Deactivate old versions
    UPDATE public.job_documents
    SET is_active = false
    WHERE job_id = NEW.job_id
      AND name = NEW.name
      AND doc_type = 'contract'
      AND id != NEW.id;
    
    -- Set new version as active
    NEW.is_active := true;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_increment_contract_version
BEFORE INSERT ON public.job_documents
FOR EACH ROW
WHEN (NEW.doc_type = 'contract')
EXECUTE FUNCTION public.increment_contract_version();

COMMENT ON FUNCTION public.increment_contract_version IS 'Auto-increment contract version and deactivate old versions (Block 253100)';

-- Function: Auto-update job contract_value when change order is approved
CREATE OR REPLACE FUNCTION public.update_job_value_on_co_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id uuid;
  v_price_diff numeric;
  v_current_value numeric;
BEGIN
  -- Only process when status changes to 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    v_job_id := NEW.job_id;
    v_price_diff := NEW.price_difference;
    
    -- Get current contract value
    SELECT COALESCE(contract_value, final_value, estimated_value, 0)
    INTO v_current_value
    FROM public.jobs
    WHERE id = v_job_id;
    
    -- Update contract_value (add the price difference)
    UPDATE public.jobs
    SET contract_value = v_current_value + v_price_diff,
        updated_at = now()
    WHERE id = v_job_id;
    
    -- This will trigger the profitability engine to recalculate
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_job_value_on_co_approval
AFTER UPDATE OF status ON public.change_orders
FOR EACH ROW
WHEN (NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved'))
EXECUTE FUNCTION public.update_job_value_on_co_approval();

COMMENT ON FUNCTION public.update_job_value_on_co_approval IS 'Auto-update job contract_value when change order is approved (Block 253100)';

-- Function: Generate change order number
CREATE OR REPLACE FUNCTION public.generate_change_order_number(p_job_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
  v_co_number text;
BEGIN
  -- Count existing change orders for this job
  SELECT COUNT(*) INTO v_count
  FROM public.change_orders
  WHERE job_id = p_job_id;
  
  -- Generate number: CO-00001, CO-00002, etc.
  v_co_number := 'CO-' || LPAD((v_count + 1)::text, 5, '0');
  
  RETURN v_co_number;
END;
$$;

COMMENT ON FUNCTION public.generate_change_order_number IS 'Generate sequential change order number (Block 253100)';

-- Function: Check permit expiration and update status
CREATE OR REPLACE FUNCTION public.check_permit_expiration()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If expires_on is in the past and status is 'approved', mark as expired
  IF NEW.expires_on IS NOT NULL 
     AND NEW.expires_on < CURRENT_DATE 
     AND NEW.status = 'approved' THEN
    NEW.status := 'expired';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_permit_expiration
BEFORE INSERT OR UPDATE ON public.permits
FOR EACH ROW
EXECUTE FUNCTION public.check_permit_expiration();

COMMENT ON FUNCTION public.check_permit_expiration IS 'Auto-update permit status to expired when expires_on passes (Block 253100)';

-- Function: Updated_at triggers
CREATE OR REPLACE FUNCTION public.set_job_documents_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_job_documents_updated_at
BEFORE UPDATE ON public.job_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_job_documents_updated_at();

CREATE OR REPLACE FUNCTION public.set_change_orders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_change_orders_updated_at
BEFORE UPDATE ON public.change_orders
FOR EACH ROW
EXECUTE FUNCTION public.set_change_orders_updated_at();

CREATE OR REPLACE FUNCTION public.set_permits_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_permits_updated_at
BEFORE UPDATE ON public.permits
FOR EACH ROW
EXECUTE FUNCTION public.set_permits_updated_at();

CREATE OR REPLACE FUNCTION public.set_inspection_reports_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inspection_reports_updated_at
BEFORE UPDATE ON public.inspection_reports
FOR EACH ROW
EXECUTE FUNCTION public.set_inspection_reports_updated_at();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_reports ENABLE ROW LEVEL SECURITY;

-- Job documents policies
CREATE POLICY "job_documents_select_company_members"
  ON public.job_documents FOR SELECT
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "job_documents_insert_company_members"
  ON public.job_documents FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "job_documents_update_company_members"
  ON public.job_documents FOR UPDATE
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "job_documents_delete_company_members"
  ON public.job_documents FOR DELETE
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

-- Change orders policies
CREATE POLICY "change_orders_select_company_members"
  ON public.change_orders FOR SELECT
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "change_orders_insert_company_members"
  ON public.change_orders FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "change_orders_update_company_members"
  ON public.change_orders FOR UPDATE
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

-- Permits policies
CREATE POLICY "permits_select_company_members"
  ON public.permits FOR SELECT
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "permits_insert_company_members"
  ON public.permits FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "permits_update_company_members"
  ON public.permits FOR UPDATE
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

-- Inspection reports policies
CREATE POLICY "inspection_reports_select_company_members"
  ON public.inspection_reports FOR SELECT
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "inspection_reports_insert_company_members"
  ON public.inspection_reports FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "inspection_reports_update_company_members"
  ON public.inspection_reports FOR UPDATE
  USING (
    company_id IN (
      SELECT roofing_company_id FROM public.roofing_company_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT id FROM public.roofing_companies
      WHERE owner_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 9 — VIEWS FOR PERMIT EXPIRATION ALERTS
-- ============================================================================

-- View: Permits expiring soon (within 10 days)
CREATE OR REPLACE VIEW public.permits_expiring_soon AS
SELECT 
  p.*,
  j.homeowner_name,
  j.address,
  (p.expires_on - CURRENT_DATE) as days_until_expiration
FROM public.permits p
JOIN public.jobs j ON j.id = p.job_id
WHERE p.status = 'approved'
  AND p.expires_on IS NOT NULL
  AND p.expires_on >= CURRENT_DATE
  AND p.expires_on <= (CURRENT_DATE + INTERVAL '10 days')
ORDER BY p.expires_on ASC;

COMMENT ON VIEW public.permits_expiring_soon IS 'Permits expiring within 10 days (Block 253100)';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
























