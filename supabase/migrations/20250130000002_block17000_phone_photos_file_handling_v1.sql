-- =========================================================
-- Block 17000 — SmartSend Phone, Photos & File Handling v1
-- (Roofing Reality Features: MMS Photo Intake, Document Uploads, 
--  Insurance Paperwork, Before/After Shots & Mobile-Friendly Media Flow)
-- =========================================================

-- ============================================================================
-- 1. EXTEND ATTACHMENTS TABLE WITH AI ANALYSIS FIELDS
-- ============================================================================

-- Add folder/category field for automatic organization
ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS folder text,
  ADD COLUMN IF NOT EXISTS ai_tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_label text, -- Main AI categorization label
  ADD COLUMN IF NOT EXISTS ai_confidence numeric(3,2), -- 0.00 to 1.00
  ADD COLUMN IF NOT EXISTS detected_damage_type text, -- 'hail', 'wind', 'leak', 'shingle', 'gutter', 'skylight', 'general'
  ADD COLUMN IF NOT EXISTS photo_metadata jsonb DEFAULT '{}', -- EXIF data, dimensions, etc.
  ADD COLUMN IF NOT EXISTS is_before_after boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS before_after_pair_id uuid, -- Links before/after photos together
  ADD COLUMN IF NOT EXISTS analysis_status text DEFAULT 'pending', -- 'pending', 'analyzing', 'completed', 'failed'
  ADD COLUMN IF NOT EXISTS analysis_completed_at timestamptz;

-- Add indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_attachments_folder ON public.attachments(folder) WHERE folder IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_ai_label ON public.attachments(ai_label) WHERE ai_label IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_damage_type ON public.attachments(detected_damage_type) WHERE detected_damage_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_before_after_pair ON public.attachments(before_after_pair_id) WHERE before_after_pair_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_analysis_status ON public.attachments(analysis_status);

-- ============================================================================
-- 2. CREATE PHOTO_ANALYSIS TABLE FOR DETAILED AI ANALYSIS RESULTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.photo_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL REFERENCES public.attachments(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- AI Analysis Results
  detected_damage_type text, -- 'shingle_damage', 'hail_damage', 'wind_damage', 'leak_water_stain', 'gutter_damage', 'skylight_issue', 'general_roof_overview', 'insurance_document', 'before_after_photo'
  confidence numeric(3,2), -- 0.00 to 1.00
  ai_tags text[] DEFAULT '{}', -- Array of detected tags
  ai_summary text, -- AI-generated description of what's in the photo
  
  -- Photo-specific metadata
  photo_dimensions jsonb, -- {width: 1920, height: 1080}
  photo_location jsonb, -- GPS coordinates if available
  photo_timestamp timestamptz, -- When photo was taken (from EXIF)
  
  -- Analysis metadata
  analysis_model text, -- Which AI model was used
  analysis_version text, -- Version of analysis logic
  analysis_timestamp timestamptz DEFAULT now(),
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photo_analysis_attachment ON public.photo_analysis(attachment_id);
CREATE INDEX IF NOT EXISTS idx_photo_analysis_contact ON public.photo_analysis(contact_id);
CREATE INDEX IF NOT EXISTS idx_photo_analysis_org ON public.photo_analysis(org_id);
CREATE INDEX IF NOT EXISTS idx_photo_analysis_damage_type ON public.photo_analysis(detected_damage_type) WHERE detected_damage_type IS NOT NULL;

-- Enable RLS
ALTER TABLE public.photo_analysis ENABLE ROW LEVEL SECURITY;

-- RLS Policies for photo_analysis (same as attachments)
CREATE POLICY "photo_analysis_view_org_members" ON public.photo_analysis
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_id = photo_analysis.org_id
        AND user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "photo_analysis_service_role_full_access" ON public.photo_analysis
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 3. CREATE INSURANCE_DOCS TABLE FOR INSURANCE DOCUMENT INTELLIGENCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL REFERENCES public.attachments(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Extracted Insurance Data
  claim_number text,
  deductible numeric(12,2),
  acv numeric(12,2), -- Actual Cash Value
  rcv numeric(12,2), -- Replacement Cost Value
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  inspection_date date,
  date_of_loss date,
  carrier_name text, -- Insurance company name
  policy_number text,
  policy_type text, -- 'homeowners', 'commercial', etc.
  
  -- Document metadata
  document_type text, -- 'estimate', 'claim_summary', 'adjuster_report', 'policy_page', 'other'
  extracted_text text, -- Full text extracted from PDF/image
  extraction_confidence numeric(3,2), -- How confident we are in the extraction
  
  -- Analysis metadata
  extraction_model text,
  extraction_timestamp timestamptz DEFAULT now(),
  extraction_status text DEFAULT 'pending', -- 'pending', 'extracting', 'completed', 'failed'
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_docs_attachment ON public.insurance_docs(attachment_id);
CREATE INDEX IF NOT EXISTS idx_insurance_docs_contact ON public.insurance_docs(contact_id);
CREATE INDEX IF NOT EXISTS idx_insurance_docs_org ON public.insurance_docs(org_id);
CREATE INDEX IF NOT EXISTS idx_insurance_docs_claim_number ON public.insurance_docs(claim_number) WHERE claim_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_docs_carrier ON public.insurance_docs(carrier_name) WHERE carrier_name IS NOT NULL;

-- Enable RLS
ALTER TABLE public.insurance_docs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for insurance_docs
CREATE POLICY "insurance_docs_view_org_members" ON public.insurance_docs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_id = insurance_docs.org_id
        AND user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "insurance_docs_service_role_full_access" ON public.insurance_docs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger for insurance_docs
CREATE OR REPLACE FUNCTION public.set_insurance_docs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_insurance_docs_updated_at ON public.insurance_docs;
CREATE TRIGGER trg_set_insurance_docs_updated_at
  BEFORE UPDATE ON public.insurance_docs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_insurance_docs_updated_at();

-- ============================================================================
-- 4. FUNCTION TO AUTO-ASSIGN FOLDER BASED ON FILE TYPE AND LABEL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_assign_attachment_folder()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Auto-assign folder based on file type and AI label
  IF NEW.folder IS NULL THEN
    IF NEW.file_type LIKE 'image/%' THEN
      -- Photo categorization
      IF NEW.ai_label IN ('shingle_damage', 'hail_damage', 'wind_damage', 'leak_water_stain', 'gutter_damage', 'skylight_issue', 'general_roof_overview') THEN
        NEW.folder := 'Damage Photos';
      ELSIF NEW.ai_label = 'before_after_photo' OR NEW.is_before_after = true THEN
        NEW.folder := 'Before/After';
      ELSIF NEW.ai_label = 'insurance_document' THEN
        NEW.folder := 'Insurance Documents';
      ELSE
        NEW.folder := 'Roof Photos';
      END IF;
    ELSIF NEW.file_type = 'application/pdf' THEN
      -- PDF categorization
      IF NEW.ai_label = 'insurance_document' OR NEW.linked_to = 'insurance' THEN
        NEW.folder := 'Insurance Documents';
      ELSIF NEW.linked_to = 'estimate' THEN
        NEW.folder := 'Job Quotes';
      ELSE
        NEW.folder := 'Other Files';
      END IF;
    ELSE
      -- Default folder for other file types
      NEW.folder := 'Other Files';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_attachment_folder ON public.attachments;
CREATE TRIGGER trg_auto_assign_attachment_folder
  BEFORE INSERT OR UPDATE ON public.attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_attachment_folder();

-- ============================================================================
-- 5. FUNCTION TO UPDATE CONTACT INSURANCE FIELDS FROM INSURANCE_DOCS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_contact_insurance_from_docs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When insurance document is extracted, update contact record
  IF NEW.extraction_status = 'completed' AND NEW.claim_number IS NOT NULL THEN
    UPDATE public.contacts
    SET 
      -- Update insurance likelihood based on document presence
      insurance_likelihood = CASE 
        WHEN NEW.claim_number IS NOT NULL THEN 'high'
        ELSE insurance_likelihood
      END,
      updated_at = now()
    WHERE id = NEW.contact_id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_contact_insurance_from_docs ON public.insurance_docs;
CREATE TRIGGER trg_update_contact_insurance_from_docs
  AFTER INSERT OR UPDATE ON public.insurance_docs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_contact_insurance_from_docs();

-- ============================================================================
-- 6. UPDATE STORAGE BUCKET TO SUPPORT MP4 VIDEOS
-- ============================================================================

-- Update attachments bucket to allow MP4 videos (short videos only, max 50MB)
UPDATE storage.buckets
SET 
  file_size_limit = 52428800, -- 50MB for videos
  allowed_mime_types = array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', -- docx
    'application/msword', -- doc
    'video/mp4' -- short videos
  ]
WHERE id = 'attachments';

-- ============================================================================
-- 7. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.photo_analysis IS 'Stores AI analysis results for uploaded photos, including damage detection and categorization';
COMMENT ON TABLE public.insurance_docs IS 'Stores extracted data from insurance documents (PDFs/photos), including claim numbers, deductibles, adjuster info';
COMMENT ON COLUMN public.attachments.folder IS 'Auto-assigned folder name: Roof Photos, Damage Photos, Insurance Documents, Job Quotes, Before/After, Other Files';
COMMENT ON COLUMN public.attachments.ai_label IS 'Main AI categorization: shingle_damage, hail_damage, wind_damage, leak_water_stain, gutter_damage, skylight_issue, general_roof_overview, insurance_document, before_after_photo';
COMMENT ON COLUMN public.attachments.detected_damage_type IS 'Type of damage detected: hail, wind, leak, shingle, gutter, skylight, general';
COMMENT ON COLUMN public.attachments.is_before_after IS 'Whether this photo is part of a before/after pair';
COMMENT ON COLUMN public.attachments.before_after_pair_id IS 'Links before/after photos together for side-by-side viewing';





















































