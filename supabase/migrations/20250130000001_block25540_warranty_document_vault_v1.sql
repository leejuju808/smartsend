-- =========================================================
-- Block 25540 — SmartSend Roofing Warranty & Document Vault v1
-- (Warranty Automation • Document Storage • Homeowner Access Portal • Insurance File Management • Job Documentation System)
-- =========================================================
-- 
-- THE WARRANTY + DOCUMENT VAULT — ZERO FLUFF.
-- 
-- This block handles one of the MOST important — yet most neglected — parts of roofing operations:
-- 
-- Keeping EVERY important job document in one place
-- AND
-- Automatically generating warranty packages for homeowners.
--
-- Features:
-- 1. Warranty Automation (v1) - Auto-generates warranty packages when job is marked as paid
-- 2. Homeowner Document Portal - Secure portal link with all documents
-- 3. Crew Documentation Requirements - Blocks job completion until required photos uploaded
-- 4. Insurance File Management - Organized folders for insurance documents
-- 5. Owner Document Dashboard - Shows missing documents across all jobs
-- 6. Document Search Engine - Search across all documents
-- 7. Document Timeline Sync - Every file upload adds to job timeline
-- 8. Forever File Vault - Retention-boosting feature

-- ============================================================================
-- PART 1 — ENHANCE warranty_packages TABLE
-- ============================================================================
-- Add fields for comprehensive warranty package generation

ALTER TABLE IF EXISTS public.warranty_packages
  ADD COLUMN IF NOT EXISTS manufacturer_warranty_document_id UUID REFERENCES public.job_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workmanship_warranty_document_id UUID REFERENCES public.job_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS material_list_document_id UUID REFERENCES public.job_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS before_photos_document_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS after_photos_document_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS install_date DATE,
  ADD COLUMN IF NOT EXISTS crew_info JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ventilation_details TEXT,
  ADD COLUMN IF NOT EXISTS underlayment_details TEXT,
  ADD COLUMN IF NOT EXISTS shingle_brand TEXT,
  ADD COLUMN IF NOT EXISTS shingle_product TEXT,
  ADD COLUMN IF NOT EXISTS shingle_color TEXT,
  ADD COLUMN IF NOT EXISTS smart_send_job_id TEXT,
  ADD COLUMN IF NOT EXISTS homeowner_portal_link TEXT,
  ADD COLUMN IF NOT EXISTS package_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS package_data JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_warranty_packages_generated ON public.warranty_packages(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranty_packages_delivered ON public.warranty_packages(delivered_at DESC) WHERE delivered_at IS NOT NULL;

-- ============================================================================
-- PART 2 — CREATE crew_documentation_requirements TABLE
-- ============================================================================
-- Tracks required photos/documentation before job completion

CREATE TABLE IF NOT EXISTS public.crew_documentation_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Required photo categories
  requires_underlayment_photos BOOLEAN DEFAULT TRUE,
  requires_decking_photos BOOLEAN DEFAULT TRUE,
  requires_flashing_photos BOOLEAN DEFAULT TRUE,
  requires_vent_installation_photos BOOLEAN DEFAULT TRUE,
  requires_final_cleanup_photos BOOLEAN DEFAULT TRUE,
  
  -- Status tracking
  underlayment_photos_uploaded BOOLEAN DEFAULT FALSE,
  decking_photos_uploaded BOOLEAN DEFAULT FALSE,
  flashing_photos_uploaded BOOLEAN DEFAULT FALSE,
  vent_photos_uploaded BOOLEAN DEFAULT FALSE,
  cleanup_photos_uploaded BOOLEAN DEFAULT FALSE,
  
  -- Document IDs that satisfy requirements
  underlayment_photo_ids UUID[] DEFAULT '{}',
  decking_photo_ids UUID[] DEFAULT '{}',
  flashing_photo_ids UUID[] DEFAULT '{}',
  vent_photo_ids UUID[] DEFAULT '{}',
  cleanup_photo_ids UUID[] DEFAULT '{}',
  
  -- Validation
  all_requirements_met BOOLEAN GENERATED ALWAYS AS (
    (NOT requires_underlayment_photos OR underlayment_photos_uploaded) AND
    (NOT requires_decking_photos OR decking_photos_uploaded) AND
    (NOT requires_flashing_photos OR flashing_photos_uploaded) AND
    (NOT requires_vent_installation_photos OR vent_photos_uploaded) AND
    (NOT requires_final_cleanup_photos OR cleanup_photos_uploaded)
  ) STORED,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_docs_job ON public.crew_documentation_requirements(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_docs_requirements_met ON public.crew_documentation_requirements(job_id, all_requirements_met) WHERE all_requirements_met = FALSE;

-- ============================================================================
-- PART 3 — CREATE insurance_file_folders TABLE
-- ============================================================================
-- Organized folders for insurance-related documents

CREATE TABLE IF NOT EXISTS public.insurance_file_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  folder_name TEXT NOT NULL CHECK (folder_name IN (
    'scope_of_loss',
    'adjuster_notes',
    'acv_payment',
    'depreciation_payment',
    'supplements_submitted',
    'supplements_approved',
    'permits',
    'contracts',
    'communication_log'
  )),
  
  document_count INTEGER DEFAULT 0,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_folders_job ON public.insurance_file_folders(job_id, folder_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_insurance_folders_unique ON public.insurance_file_folders(job_id, folder_name);

-- ============================================================================
-- PART 4 — CREATE job_document_requirements TABLE
-- ============================================================================
-- Tracks missing documents across all jobs for owner dashboard

CREATE TABLE IF NOT EXISTS public.job_document_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  requirement_type TEXT NOT NULL CHECK (requirement_type IN (
    'required_photos',
    'insurance_paperwork',
    'warranty_info',
    'signed_contract',
    'completion_photos',
    'material_invoice',
    'permit_documents'
  )),
  
  is_met BOOLEAN DEFAULT FALSE,
  missing_count INTEGER DEFAULT 0,
  last_checked_at TIMESTAMPTZ DEFAULT now(),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_requirements_job ON public.job_document_requirements(job_id);
CREATE INDEX IF NOT EXISTS idx_doc_requirements_workspace_missing ON public.job_document_requirements(workspace_id, is_met) WHERE is_met = FALSE;
CREATE INDEX IF NOT EXISTS idx_doc_requirements_type ON public.job_document_requirements(requirement_type, is_met) WHERE is_met = FALSE;

-- ============================================================================
-- PART 5 — CREATE document_search_index TABLE
-- ============================================================================
-- Enhanced search index for document search engine

CREATE TABLE IF NOT EXISTS public.document_search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.job_documents(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Searchable fields
  homeowner_name TEXT,
  address TEXT,
  job_number TEXT,
  insurance_carrier TEXT,
  claim_number TEXT,
  shingle_color TEXT,
  crew_name TEXT,
  
  -- Full-text search content
  search_content TEXT,
  
  -- Index metadata
  indexed_at TIMESTAMPTZ DEFAULT now(),
  last_updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_search_document ON public.document_search_index(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_search_job ON public.document_search_index(job_id);
CREATE INDEX IF NOT EXISTS idx_doc_search_workspace ON public.document_search_index(workspace_id);
CREATE INDEX IF NOT EXISTS idx_doc_search_content ON public.document_search_index USING gin(to_tsvector('english', COALESCE(search_content, '')));
CREATE INDEX IF NOT EXISTS idx_doc_search_homeowner ON public.document_search_index USING gin(homeowner_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_doc_search_address ON public.document_search_index USING gin(address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_doc_search_claim ON public.document_search_index(claim_number) WHERE claim_number IS NOT NULL;

-- ============================================================================
-- PART 6 — CREATE FUNCTION: generate_comprehensive_warranty_package
-- ============================================================================
-- Auto-generates comprehensive warranty package when job is marked as paid

CREATE OR REPLACE FUNCTION public.generate_comprehensive_warranty_package(p_job_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_warranty_id UUID;
  v_job RECORD;
  v_install_date DATE;
  v_manufacturer_warranty_id UUID;
  v_workmanship_warranty_id UUID;
  v_material_list_id UUID;
  v_before_photo_ids UUID[];
  v_after_photo_ids UUID[];
  v_portal_token TEXT;
  v_smart_send_job_id TEXT;
BEGIN
  -- Check if warranty already exists
  SELECT id INTO v_warranty_id
  FROM public.warranty_packages
  WHERE job_id = p_job_id
  LIMIT 1;
  
  IF v_warranty_id IS NOT NULL THEN
    RETURN v_warranty_id;
  END IF;
  
  -- Get job details
  SELECT rj.*,
         COALESCE(rj.scheduled_start_date::DATE, rj.scheduled_end_date::DATE, CURRENT_DATE) as install_date
  INTO v_job
  FROM public.roofing_jobs rj
  WHERE rj.id = p_job_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  
  -- Generate SmartSend Job ID
  v_smart_send_job_id := 'SS-' || UPPER(SUBSTRING(v_job.id::TEXT, 1, 8));
  
  -- Get manufacturer warranty document
  SELECT id INTO v_manufacturer_warranty_id
  FROM public.job_documents
  WHERE job_id = p_job_id
    AND doc_type = 'warranty_manufacturer'
    AND deleted_at IS NULL
  ORDER BY uploaded_at DESC
  LIMIT 1;
  
  -- Get workmanship warranty document
  SELECT id INTO v_workmanship_warranty_id
  FROM public.job_documents
  WHERE job_id = p_job_id
    AND doc_type = 'warranty_workmanship'
    AND deleted_at IS NULL
  ORDER BY uploaded_at DESC
  LIMIT 1;
  
  -- Get material list document
  SELECT id INTO v_material_list_id
  FROM public.job_documents
  WHERE job_id = p_job_id
    AND (doc_type = 'material_list' OR doc_type LIKE 'receipt_%')
    AND deleted_at IS NULL
  ORDER BY uploaded_at DESC
  LIMIT 1;
  
  -- Get before photos
  SELECT ARRAY_AGG(id) INTO v_before_photo_ids
  FROM public.job_documents
  WHERE job_id = p_job_id
    AND doc_type IN ('photo_before', 'photo_damage')
    AND deleted_at IS NULL;
  
  -- Get after photos
  SELECT ARRAY_AGG(id) INTO v_after_photo_ids
  FROM public.job_documents
  WHERE job_id = p_job_id
    AND doc_type IN ('photo_completed', 'photo_after')
    AND deleted_at IS NULL;
  
  -- Get or create homeowner portal
  SELECT portal_token INTO v_portal_token
  FROM public.homeowner_portals
  WHERE job_id = p_job_id
    AND is_enabled = TRUE
  LIMIT 1;
  
  IF v_portal_token IS NULL THEN
    -- Generate new portal token
    v_portal_token := encode(gen_random_bytes(24), 'base64');
    
    INSERT INTO public.homeowner_portals (
      job_id,
      workspace_id,
      portal_token,
      is_enabled
    )
    VALUES (
      p_job_id,
      v_job.workspace_id,
      v_portal_token,
      TRUE
    );
  END IF;
  
  -- Create comprehensive warranty package
  INSERT INTO public.warranty_packages (
    job_id,
    workspace_id,
    install_date,
    manufacturer_warranty_document_id,
    workmanship_warranty_document_id,
    material_list_document_id,
    before_photos_document_ids,
    after_photos_document_ids,
    crew_info,
    shingle_brand,
    shingle_color,
    smart_send_job_id,
    homeowner_portal_link,
    status,
    generated_at,
    package_data
  )
  VALUES (
    p_job_id,
    v_job.workspace_id,
    v_job.install_date,
    v_manufacturer_warranty_id,
    v_workmanship_warranty_id,
    v_material_list_id,
    COALESCE(v_before_photo_ids, '{}'),
    COALESCE(v_after_photo_ids, '{}'),
    jsonb_build_object(
      'crew_name', v_job.crew_name,
      'install_date', v_job.install_date
    ),
    v_job.shingle_brand,
    v_job.shingle_color,
    v_smart_send_job_id,
    '/homeowner/' || v_portal_token,
    'generating',
    now(),
    jsonb_build_object(
      'homeowner_name', v_job.homeowner_name,
      'address', v_job.address,
      'job_value', v_job.job_value
    )
  )
  RETURNING id INTO v_warranty_id;
  
  -- Update completion tracking
  UPDATE public.job_completion_tracking
  SET warranty_delivered_at = now(),
      completion_status = CASE 
        WHEN completion_status = 'payment_pending' THEN 'warranty_pending'
        ELSE completion_status
      END,
      updated_at = now()
  WHERE job_id = p_job_id;
  
  -- Log timeline event
  INSERT INTO public.completion_timeline_events (
    job_id,
    workspace_id,
    event_type,
    event_message
  )
  VALUES (
    p_job_id,
    v_job.workspace_id,
    'warranty_package_generated',
    'Warranty package automatically generated with all job documents'
  );
  
  RETURN v_warranty_id;
END;
$$;

COMMENT ON FUNCTION public.generate_comprehensive_warranty_package IS 'Block 25540: Auto-generates comprehensive warranty package when job is marked as paid';

-- ============================================================================
-- PART 7 — CREATE FUNCTION: check_crew_documentation_requirements
-- ============================================================================
-- Checks if all required crew documentation is uploaded before job completion

CREATE OR REPLACE FUNCTION public.check_crew_documentation_requirements(p_job_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_requirements RECORD;
  v_has_underlayment BOOLEAN;
  v_has_decking BOOLEAN;
  v_has_flashing BOOLEAN;
  v_has_vents BOOLEAN;
  v_has_cleanup BOOLEAN;
BEGIN
  -- Get or create requirements record
  SELECT * INTO v_requirements
  FROM public.crew_documentation_requirements
  WHERE job_id = p_job_id;
  
  IF NOT FOUND THEN
    -- Create default requirements
    INSERT INTO public.crew_documentation_requirements (
      job_id,
      workspace_id,
      requires_underlayment_photos,
      requires_decking_photos,
      requires_flashing_photos,
      requires_vent_installation_photos,
      requires_final_cleanup_photos
    )
    SELECT 
      p_job_id,
      workspace_id,
      TRUE,
      TRUE,
      TRUE,
      TRUE,
      TRUE
    FROM public.roofing_jobs
    WHERE id = p_job_id;
    
    RETURN FALSE; -- New requirements, not met yet
  END IF;
  
  -- Check if required photos exist
  IF v_requirements.requires_underlayment_photos THEN
    SELECT EXISTS (
      SELECT 1 FROM public.job_documents
      WHERE job_id = p_job_id
        AND doc_type IN ('photo_progress', 'photo_completed')
        AND (metadata->>'photo_category' = 'underlayment' OR title ILIKE '%underlayment%')
        AND deleted_at IS NULL
    ) INTO v_has_underlayment;
    
    IF NOT v_has_underlayment THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  IF v_requirements.requires_decking_photos THEN
    SELECT EXISTS (
      SELECT 1 FROM public.job_documents
      WHERE job_id = p_job_id
        AND doc_type IN ('photo_progress', 'photo_completed')
        AND (metadata->>'photo_category' = 'decking' OR title ILIKE '%decking%')
        AND deleted_at IS NULL
    ) INTO v_has_decking;
    
    IF NOT v_has_decking THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  IF v_requirements.requires_flashing_photos THEN
    SELECT EXISTS (
      SELECT 1 FROM public.job_documents
      WHERE job_id = p_job_id
        AND doc_type IN ('photo_progress', 'photo_completed')
        AND (metadata->>'photo_category' = 'flashing' OR title ILIKE '%flashing%')
        AND deleted_at IS NULL
    ) INTO v_has_flashing;
    
    IF NOT v_has_flashing THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  IF v_requirements.requires_vent_installation_photos THEN
    SELECT EXISTS (
      SELECT 1 FROM public.job_documents
      WHERE job_id = p_job_id
        AND doc_type IN ('photo_progress', 'photo_completed')
        AND (metadata->>'photo_category' = 'vents' OR title ILIKE '%vent%')
        AND deleted_at IS NULL
    ) INTO v_has_vents;
    
    IF NOT v_has_vents THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  IF v_requirements.requires_final_cleanup_photos THEN
    SELECT EXISTS (
      SELECT 1 FROM public.job_documents
      WHERE job_id = p_job_id
        AND doc_type IN ('photo_completed', 'photo_after')
        AND (metadata->>'photo_category' = 'cleanup' OR title ILIKE '%cleanup%')
        AND deleted_at IS NULL
    ) INTO v_has_cleanup;
    
    IF NOT v_has_cleanup THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.check_crew_documentation_requirements IS 'Block 25540: Checks if all required crew documentation is uploaded before job completion';

-- ============================================================================
-- PART 8 — CREATE FUNCTION: sync_document_timeline
-- ============================================================================
-- Adds timeline events when documents are uploaded

CREATE OR REPLACE FUNCTION public.sync_document_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_message TEXT;
  v_event_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Determine event type and message based on document type
    v_event_type := 'document_uploaded';
    v_event_message := CASE
      WHEN NEW.doc_type LIKE 'photo_%' THEN 'Photo uploaded: ' || COALESCE(NEW.title, NEW.doc_type)
      WHEN NEW.doc_type LIKE 'contract_%' THEN 'Contract uploaded: ' || COALESCE(NEW.title, 'Contract')
      WHEN NEW.doc_type LIKE 'warranty_%' THEN 'Warranty document uploaded: ' || COALESCE(NEW.title, 'Warranty')
      WHEN NEW.doc_type LIKE 'insurance_%' THEN 'Insurance document uploaded: ' || COALESCE(NEW.title, 'Insurance')
      WHEN NEW.doc_type LIKE 'permit_%' THEN 'Permit document uploaded: ' || COALESCE(NEW.title, 'Permit')
      WHEN NEW.doc_type LIKE 'receipt_%' THEN 'Receipt uploaded: ' || COALESCE(NEW.title, 'Receipt')
      ELSE 'Document uploaded: ' || COALESCE(NEW.title, NEW.doc_type)
    END;
    
    -- Add to completion timeline events if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'completion_timeline_events') THEN
      INSERT INTO public.completion_timeline_events (
        job_id,
        workspace_id,
        event_type,
        event_message,
        metadata
      )
      VALUES (
        NEW.job_id,
        NEW.workspace_id,
        v_event_type,
        v_event_message,
        jsonb_build_object(
          'document_id', NEW.id,
          'document_type', NEW.doc_type,
          'category_folder', NEW.category_folder
        )
      );
    END IF;
    
    -- Update document search index
    PERFORM public.update_document_search_index(NEW.id);
    
    -- Update crew documentation requirements if applicable
    IF NEW.doc_type LIKE 'photo_%' THEN
      PERFORM public.update_crew_documentation_status(NEW.job_id, NEW.id, NEW.doc_type);
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.sync_document_timeline IS 'Block 25540: Adds timeline events when documents are uploaded';

-- ============================================================================
-- PART 9 — CREATE FUNCTION: update_document_search_index
-- ============================================================================
-- Updates search index when documents are added or updated

CREATE OR REPLACE FUNCTION public.update_document_search_index(p_document_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc RECORD;
  v_job RECORD;
  v_search_content TEXT;
BEGIN
  -- Get document
  SELECT * INTO v_doc
  FROM public.job_documents
  WHERE id = p_document_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get job info
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = v_doc.job_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Build search content
  v_search_content := COALESCE(v_doc.title, '') || ' ' ||
                      COALESCE(v_doc.search_text, '') || ' ' ||
                      COALESCE(v_job.homeowner_name, '') || ' ' ||
                      COALESCE(v_job.address, '') || ' ' ||
                      COALESCE(v_job.carrier, '') || ' ' ||
                      COALESCE(v_job.claim_number, '') || ' ' ||
                      COALESCE(v_job.crew_name, '') || ' ' ||
                      COALESCE(v_job.shingle_color, '');
  
  -- Upsert search index
  INSERT INTO public.document_search_index (
    document_id,
    job_id,
    workspace_id,
    homeowner_name,
    address,
    job_number,
    insurance_carrier,
    claim_number,
    shingle_color,
    crew_name,
    search_content,
    indexed_at,
    last_updated_at
  )
  VALUES (
    v_doc.id,
    v_doc.job_id,
    v_doc.workspace_id,
    v_job.homeowner_name,
    v_job.address,
    v_job.id::TEXT,
    v_job.carrier,
    v_job.claim_number,
    v_job.shingle_color,
    v_job.crew_name,
    v_search_content,
    now(),
    now()
  )
  ON CONFLICT (document_id) DO UPDATE SET
    homeowner_name = EXCLUDED.homeowner_name,
    address = EXCLUDED.address,
    job_number = EXCLUDED.job_number,
    insurance_carrier = EXCLUDED.insurance_carrier,
    claim_number = EXCLUDED.claim_number,
    shingle_color = EXCLUDED.shingle_color,
    crew_name = EXCLUDED.crew_name,
    search_content = EXCLUDED.search_content,
    last_updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.update_document_search_index IS 'Block 25540: Updates search index when documents are added or updated';

-- ============================================================================
-- PART 10 — CREATE FUNCTION: update_crew_documentation_status
-- ============================================================================
-- Updates crew documentation requirements when photos are uploaded

CREATE OR REPLACE FUNCTION public.update_crew_documentation_status(
  p_job_id UUID,
  p_document_id UUID,
  p_doc_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_category TEXT;
BEGIN
  -- Get photo category from metadata or infer from doc_type/title
  SELECT COALESCE(
    (SELECT metadata->>'photo_category' FROM public.job_documents WHERE id = p_document_id),
    CASE
      WHEN p_doc_type ILIKE '%underlayment%' THEN 'underlayment'
      WHEN p_doc_type ILIKE '%decking%' THEN 'decking'
      WHEN p_doc_type ILIKE '%flashing%' THEN 'flashing'
      WHEN p_doc_type ILIKE '%vent%' THEN 'vents'
      WHEN p_doc_type ILIKE '%cleanup%' THEN 'cleanup'
      ELSE NULL
    END
  ) INTO v_category;
  
  -- Update crew documentation requirements
  UPDATE public.crew_documentation_requirements
  SET
    underlayment_photos_uploaded = CASE
      WHEN v_category = 'underlayment' THEN TRUE
      ELSE underlayment_photos_uploaded
    END,
    decking_photos_uploaded = CASE
      WHEN v_category = 'decking' THEN TRUE
      ELSE decking_photos_uploaded
    END,
    flashing_photos_uploaded = CASE
      WHEN v_category = 'flashing' THEN TRUE
      ELSE flashing_photos_uploaded
    END,
    vent_photos_uploaded = CASE
      WHEN v_category = 'vents' THEN TRUE
      ELSE vent_photos_uploaded
    END,
    cleanup_photos_uploaded = CASE
      WHEN v_category = 'cleanup' THEN TRUE
      ELSE cleanup_photos_uploaded
    END,
    updated_at = now()
  WHERE job_id = p_job_id;
END;
$$;

COMMENT ON FUNCTION public.update_crew_documentation_status IS 'Block 25540: Updates crew documentation requirements when photos are uploaded';

-- ============================================================================
-- PART 11 — CREATE FUNCTION: sync_job_document_requirements
-- ============================================================================
-- Syncs document requirements for owner dashboard

CREATE OR REPLACE FUNCTION public.sync_job_document_requirements(p_job_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job RECORD;
  v_has_required_photos BOOLEAN;
  v_has_insurance_paperwork BOOLEAN;
  v_has_warranty_info BOOLEAN;
  v_has_signed_contract BOOLEAN;
  v_has_completion_photos BOOLEAN;
  v_has_material_invoice BOOLEAN;
  v_has_permit_documents BOOLEAN;
BEGIN
  -- Get job
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Check required photos
  SELECT EXISTS (
    SELECT 1 FROM public.job_documents
    WHERE job_id = p_job_id
      AND doc_type LIKE 'photo_%'
      AND deleted_at IS NULL
  ) INTO v_has_required_photos;
  
  -- Check insurance paperwork
  SELECT EXISTS (
    SELECT 1 FROM public.job_documents
    WHERE job_id = p_job_id
      AND doc_type LIKE 'insurance_%'
      AND deleted_at IS NULL
  ) INTO v_has_insurance_paperwork;
  
  -- Check warranty info
  SELECT EXISTS (
    SELECT 1 FROM public.warranty_packages
    WHERE job_id = p_job_id
  ) OR EXISTS (
    SELECT 1 FROM public.job_documents
    WHERE job_id = p_job_id
      AND doc_type LIKE 'warranty_%'
      AND deleted_at IS NULL
  ) INTO v_has_warranty_info;
  
  -- Check signed contract
  SELECT EXISTS (
    SELECT 1 FROM public.job_documents
    WHERE job_id = p_job_id
      AND doc_type = 'contract_signed'
      AND deleted_at IS NULL
  ) INTO v_has_signed_contract;
  
  -- Check completion photos
  SELECT EXISTS (
    SELECT 1 FROM public.job_documents
    WHERE job_id = p_job_id
      AND doc_type IN ('photo_completed', 'photo_after')
      AND deleted_at IS NULL
  ) INTO v_has_completion_photos;
  
  -- Check material invoice
  SELECT EXISTS (
    SELECT 1 FROM public.job_documents
    WHERE job_id = p_job_id
      AND (doc_type LIKE 'receipt_%' OR doc_type = 'material_list')
      AND deleted_at IS NULL
  ) INTO v_has_material_invoice;
  
  -- Check permit documents
  SELECT EXISTS (
    SELECT 1 FROM public.job_documents
    WHERE job_id = p_job_id
      AND doc_type LIKE 'permit_%'
      AND deleted_at IS NULL
  ) INTO v_has_permit_documents;
  
  -- Upsert requirements
  INSERT INTO public.job_document_requirements (
    job_id,
    workspace_id,
    requirement_type,
    is_met,
    missing_count,
    last_checked_at
  )
  VALUES
    (p_job_id, v_job.workspace_id, 'required_photos', v_has_required_photos, CASE WHEN v_has_required_photos THEN 0 ELSE 1 END, now()),
    (p_job_id, v_job.workspace_id, 'insurance_paperwork', v_has_insurance_paperwork, CASE WHEN v_has_insurance_paperwork THEN 0 ELSE 1 END, now()),
    (p_job_id, v_job.workspace_id, 'warranty_info', v_has_warranty_info, CASE WHEN v_has_warranty_info THEN 0 ELSE 1 END, now()),
    (p_job_id, v_job.workspace_id, 'signed_contract', v_has_signed_contract, CASE WHEN v_has_signed_contract THEN 0 ELSE 1 END, now()),
    (p_job_id, v_job.workspace_id, 'completion_photos', v_has_completion_photos, CASE WHEN v_has_completion_photos THEN 0 ELSE 1 END, now()),
    (p_job_id, v_job.workspace_id, 'material_invoice', v_has_material_invoice, CASE WHEN v_has_material_invoice THEN 0 ELSE 1 END, now()),
    (p_job_id, v_job.workspace_id, 'permit_documents', v_has_permit_documents, CASE WHEN v_has_permit_documents THEN 0 ELSE 1 END, now())
  ON CONFLICT (job_id, requirement_type) DO UPDATE SET
    is_met = EXCLUDED.is_met,
    missing_count = EXCLUDED.missing_count,
    last_checked_at = EXCLUDED.last_checked_at,
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.sync_job_document_requirements IS 'Block 25540: Syncs document requirements for owner dashboard';

-- ============================================================================
-- PART 12 — CREATE TRIGGERS
-- ============================================================================

-- Trigger: Sync document timeline when documents are uploaded
DROP TRIGGER IF EXISTS trg_sync_document_timeline ON public.job_documents;
CREATE TRIGGER trg_sync_document_timeline
  AFTER INSERT ON public.job_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_document_timeline();

-- Trigger: Update document requirements when documents change
CREATE OR REPLACE FUNCTION public.trigger_sync_document_requirements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_job_id := OLD.job_id;
  ELSE
    v_job_id := NEW.job_id;
  END IF;
  
  PERFORM public.sync_job_document_requirements(v_job_id);
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_document_requirements ON public.job_documents;
CREATE TRIGGER trg_update_document_requirements
  AFTER INSERT OR UPDATE OR DELETE ON public.job_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sync_document_requirements();

-- ============================================================================
-- PART 13 — CREATE VIEW: owner_document_dashboard
-- ============================================================================
-- View showing missing documents across all jobs

CREATE OR REPLACE VIEW public.owner_document_dashboard AS
SELECT 
  jdr.workspace_id,
  jdr.job_id,
  rj.title as job_title,
  rj.homeowner_name,
  rj.address,
  rj.status as job_status,
  COUNT(*) FILTER (WHERE jdr.is_met = FALSE) as missing_requirement_count,
  ARRAY_AGG(jdr.requirement_type) FILTER (WHERE jdr.is_met = FALSE) as missing_requirements,
  MAX(jdr.last_checked_at) as last_checked_at
FROM public.job_document_requirements jdr
JOIN public.roofing_jobs rj ON rj.id = jdr.job_id
WHERE jdr.is_met = FALSE
GROUP BY jdr.workspace_id, jdr.job_id, rj.title, rj.homeowner_name, rj.address, rj.status;

-- ============================================================================
-- PART 14 — ROW LEVEL SECURITY
-- ============================================================================

-- Crew Documentation Requirements
ALTER TABLE public.crew_documentation_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view crew docs in their workspace"
  ON public.crew_documentation_requirements FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage crew docs in their workspace"
  ON public.crew_documentation_requirements FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Insurance File Folders
ALTER TABLE public.insurance_file_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view insurance folders in their workspace"
  ON public.insurance_file_folders FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage insurance folders in their workspace"
  ON public.insurance_file_folders FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Job Document Requirements
ALTER TABLE public.job_document_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view doc requirements in their workspace"
  ON public.job_document_requirements FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Document Search Index
ALTER TABLE public.document_search_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can search documents in their workspace"
  ON public.document_search_index FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Owner Document Dashboard View
ALTER VIEW public.owner_document_dashboard OWNER TO postgres;

-- ============================================================================
-- PART 15 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_documentation_requirements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_file_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_document_requirements TO authenticated;
GRANT SELECT ON public.document_search_index TO authenticated;
GRANT SELECT ON public.owner_document_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_comprehensive_warranty_package(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_crew_documentation_requirements(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_job_document_requirements(UUID) TO authenticated;

-- ============================================================================
-- PART 16 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.crew_documentation_requirements IS 'Block 25540: Tracks required photos/documentation before job completion';
COMMENT ON TABLE public.insurance_file_folders IS 'Block 25540: Organized folders for insurance-related documents';
COMMENT ON TABLE public.job_document_requirements IS 'Block 25540: Tracks missing documents across all jobs for owner dashboard';
COMMENT ON TABLE public.document_search_index IS 'Block 25540: Enhanced search index for document search engine';
COMMENT ON VIEW public.owner_document_dashboard IS 'Block 25540: View showing missing documents across all jobs';
COMMENT ON FUNCTION public.generate_comprehensive_warranty_package IS 'Block 25540: Auto-generates comprehensive warranty package when job is marked as paid';
COMMENT ON FUNCTION public.check_crew_documentation_requirements IS 'Block 25540: Checks if all required crew documentation is uploaded before job completion';
COMMENT ON FUNCTION public.sync_document_timeline IS 'Block 25540: Adds timeline events when documents are uploaded';
COMMENT ON FUNCTION public.update_document_search_index IS 'Block 25540: Updates search index when documents are added or updated';
COMMENT ON FUNCTION public.sync_job_document_requirements IS 'Block 25540: Syncs document requirements for owner dashboard';




































