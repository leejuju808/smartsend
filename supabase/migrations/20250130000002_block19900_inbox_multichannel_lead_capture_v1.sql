-- =========================================================
-- Block 19900 — Inbox Multi-Channel Lead Capture v1
-- (Web Forms → Inbox, Landing Pages → Inbox, Facebook Leads → Inbox, 
--  Missed Calls → Inbox, Voicemail → Inbox, Smart Intake Parsing)
-- =========================================================

-- =====================================================
-- PART 1: Lead Capture Forms
-- =====================================================

CREATE TABLE IF NOT EXISTS public.lead_capture_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Form configuration
  form_slug text NOT NULL, -- e.g., "lead" -> roofingsolutions.smartsendhq.com/lead
  form_name text NOT NULL DEFAULT 'Lead Capture Form',
  is_active boolean DEFAULT true,
  
  -- Form fields configuration (JSONB for flexibility)
  fields_config jsonb DEFAULT '{
    "name": {"required": true, "label": "Name"},
    "email": {"required": true, "label": "Email"},
    "phone": {"required": true, "label": "Phone"},
    "address": {"required": false, "label": "Address"},
    "job_type": {"required": false, "label": "Job Type", "type": "dropdown", "options": ["Roof Repair", "Roof Replacement", "Inspection", "Gutters", "Other"]},
    "description": {"required": false, "label": "Description", "type": "textarea"},
    "photos": {"required": false, "label": "Photos", "type": "file"},
    "preferred_time": {"required": false, "label": "Preferred Time", "type": "datetime"}
  }'::jsonb,
  
  -- Auto-actions
  auto_create_thread boolean DEFAULT true,
  auto_score_lead boolean DEFAULT true,
  auto_create_tasks boolean DEFAULT true,
  auto_generate_ai_reply boolean DEFAULT true,
  notify_owner boolean DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, form_slug)
);

CREATE INDEX IF NOT EXISTS idx_lead_capture_forms_workspace 
  ON public.lead_capture_forms(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_capture_forms_slug 
  ON public.lead_capture_forms(form_slug) WHERE is_active = true;

-- Form submissions
CREATE TABLE IF NOT EXISTS public.lead_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.lead_capture_forms(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  
  -- Submission data
  submission_data jsonb NOT NULL DEFAULT '{}'::jsonb, -- stores all form fields
  
  -- Processing status
  processed boolean DEFAULT false,
  processed_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_workspace 
  ON public.lead_form_submissions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form 
  ON public.lead_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_thread 
  ON public.lead_form_submissions(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_form_submissions_processed 
  ON public.lead_form_submissions(processed, created_at) WHERE processed = false;

-- =====================================================
-- PART 2: Landing Pages
-- =====================================================

CREATE TABLE IF NOT EXISTS public.landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Page configuration
  page_slug text NOT NULL, -- e.g., "free-estimate"
  page_name text NOT NULL DEFAULT 'Free Roof Estimate',
  is_active boolean DEFAULT true,
  
  -- Page content (JSONB for flexible content)
  content_config jsonb DEFAULT '{
    "headline": "Free Roof Estimate",
    "subheadline": "Get your free roof inspection today",
    "form_id": null,
    "testimonials": [],
    "company_logo_url": null,
    "hero_image_url": null,
    "call_now_button": {"enabled": true, "phone": null}
  }'::jsonb,
  
  -- Linked form
  form_id uuid REFERENCES public.lead_capture_forms(id) ON DELETE SET NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, page_slug)
);

CREATE INDEX IF NOT EXISTS idx_landing_pages_workspace 
  ON public.landing_pages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_landing_pages_slug 
  ON public.landing_pages(page_slug) WHERE is_active = true;

-- =====================================================
-- PART 3: Lead Source Tracking
-- =====================================================

-- Extend contacts table with lead source (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contacts' AND column_name = 'lead_source'
  ) THEN
    ALTER TABLE public.contacts 
      ADD COLUMN lead_source text CHECK (
        lead_source IN (
          'web_form',
          'landing_page',
          'facebook_lead',
          'missed_call',
          'voicemail',
          'google_local_services',
          'sms',
          'email',
          'referral',
          'unknown'
        )
      ) DEFAULT 'unknown';
  END IF;
END $$;

-- Lead source metadata (stores additional info about the source)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contacts' AND column_name = 'source_meta'
  ) THEN
    ALTER TABLE public.contacts 
      ADD COLUMN source_meta jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contacts_lead_source 
  ON public.contacts(lead_source) WHERE lead_source IS NOT NULL;

-- =====================================================
-- PART 4: Missed Calls → Inbox
-- =====================================================

CREATE TABLE IF NOT EXISTS public.missed_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  
  -- Call details
  caller_phone text NOT NULL,
  caller_name text, -- Caller ID if available
  called_at timestamptz NOT NULL DEFAULT now(),
  call_duration_seconds int DEFAULT 0,
  
  -- Processing
  auto_sms_sent boolean DEFAULT false,
  auto_sms_sent_at timestamptz,
  sms_message text, -- The auto-sent SMS content
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb, -- stores provider info, etc.
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missed_calls_workspace 
  ON public.missed_calls(workspace_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_missed_calls_thread 
  ON public.missed_calls(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_missed_calls_phone 
  ON public.missed_calls(caller_phone);

-- =====================================================
-- PART 5: Voicemail → Inbox
-- =====================================================

CREATE TABLE IF NOT EXISTS public.voicemails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  
  -- Voicemail details
  caller_phone text NOT NULL,
  caller_name text,
  audio_url text, -- Storage URL for audio file
  duration_seconds int NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  
  -- Transcription
  transcript text, -- AI-transcribed text
  transcript_status text DEFAULT 'pending' CHECK (transcript_status IN ('pending', 'processing', 'completed', 'failed')),
  transcripted_at timestamptz,
  
  -- AI Analysis
  ai_summary text, -- AI-generated summary
  urgency_level text CHECK (urgency_level IN ('low', 'medium', 'high', 'urgent')),
  lead_score numeric(5,2), -- 0-100 lead score
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voicemails_workspace 
  ON public.voicemails(workspace_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_voicemails_thread 
  ON public.voicemails(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voicemails_transcript_status 
  ON public.voicemails(transcript_status) WHERE transcript_status != 'completed';

-- =====================================================
-- PART 6: Facebook Lead Ads Integration
-- =====================================================

CREATE TABLE IF NOT EXISTS public.facebook_lead_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  
  -- Facebook Lead Ad data
  fb_lead_id text NOT NULL, -- Facebook's lead ID
  ad_id text,
  ad_name text,
  form_id text,
  form_name text,
  
  -- Lead data from Facebook
  lead_data jsonb NOT NULL DEFAULT '{}'::jsonb, -- stores all fields from FB
  
  -- Processing status
  processed boolean DEFAULT false,
  processed_at timestamptz,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(fb_lead_id)
);

CREATE INDEX IF NOT EXISTS idx_fb_lead_ads_workspace 
  ON public.facebook_lead_ads(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_lead_ads_thread 
  ON public.facebook_lead_ads(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fb_lead_ads_processed 
  ON public.facebook_lead_ads(processed) WHERE processed = false;

-- Facebook webhook configuration
CREATE TABLE IF NOT EXISTS public.facebook_webhook_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Webhook config
  verify_token text NOT NULL,
  app_secret text NOT NULL,
  page_access_token text,
  
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id)
);

-- =====================================================
-- PART 7: Google Local Services Leads
-- =====================================================

CREATE TABLE IF NOT EXISTS public.google_local_services_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  
  -- GLS Lead data
  gls_lead_id text,
  email_subject text,
  email_body text,
  raw_email_data jsonb DEFAULT '{}'::jsonb,
  
  -- Parsed data
  parsed_data jsonb DEFAULT '{}'::jsonb, -- name, phone, job_type, etc.
  
  -- Processing status
  processed boolean DEFAULT false,
  processed_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gls_leads_workspace 
  ON public.google_local_services_leads(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gls_leads_thread 
  ON public.google_local_services_leads(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gls_leads_processed 
  ON public.google_local_services_leads(processed) WHERE processed = false;

-- =====================================================
-- PART 8: Smart Intake Parser Metadata
-- =====================================================

CREATE TABLE IF NOT EXISTS public.smart_intake_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  
  -- Source reference (polymorphic)
  source_type text NOT NULL CHECK (source_type IN ('form_submission', 'voicemail', 'fb_lead', 'gls_lead', 'missed_call', 'email', 'sms')),
  source_id uuid, -- References the source record
  
  -- AI Analysis Results
  detected_job_types text[], -- ['leak', 'storm_damage', 'insurance_claim', 'replacement', 'gutter_issue', 'inspection']
  urgency_level text CHECK (urgency_level IN ('low', 'medium', 'high', 'urgent')),
  expected_job_value numeric(12,2), -- Estimated job value
  lead_score numeric(5,2) DEFAULT 0, -- 0-100 score
  
  -- Missing Information
  missing_info jsonb DEFAULT '{}'::jsonb, -- {"address": true, "photos": true, "timeline": false}
  
  -- Next Steps Suggestions
  suggested_next_steps text[], -- ['call', 'send_insurance_instructions', 'schedule_inspection', 'send_estimator']
  
  -- Full AI analysis
  ai_analysis jsonb DEFAULT '{}'::jsonb, -- Full AI response
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_intake_workspace 
  ON public.smart_intake_analysis(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_smart_intake_thread 
  ON public.smart_intake_analysis(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_smart_intake_source 
  ON public.smart_intake_analysis(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_smart_intake_urgency 
  ON public.smart_intake_analysis(urgency_level) WHERE urgency_level IN ('high', 'urgent');

-- =====================================================
-- PART 9: Intake Performance Dashboard Views
-- =====================================================

-- View: Leads by source
CREATE OR REPLACE VIEW public.v_intake_leads_by_source AS
SELECT 
  workspace_id,
  lead_source,
  COUNT(*) as lead_count,
  COUNT(DISTINCT contact_id) as unique_contacts,
  DATE_TRUNC('day', created_at) as date
FROM public.contacts
WHERE lead_source IS NOT NULL
GROUP BY workspace_id, lead_source, DATE_TRUNC('day', created_at);

-- View: Form submission stats
CREATE OR REPLACE VIEW public.v_form_submission_stats AS
SELECT 
  f.workspace_id,
  f.form_id,
  f.form_slug,
  COUNT(*) as total_submissions,
  COUNT(DISTINCT f.contact_id) as unique_leads,
  COUNT(DISTINCT f.thread_id) as threads_created,
  DATE_TRUNC('day', f.created_at) as date
FROM public.lead_form_submissions f
GROUP BY f.workspace_id, f.form_id, f.form_slug, DATE_TRUNC('day', f.created_at);

-- View: Missed call recovery stats
CREATE OR REPLACE VIEW public.v_missed_call_recovery AS
SELECT 
  workspace_id,
  COUNT(*) as total_missed_calls,
  COUNT(DISTINCT thread_id) as threads_created,
  COUNT(DISTINCT CASE WHEN auto_sms_sent THEN id END) as sms_sent_count,
  DATE_TRUNC('day', called_at) as date
FROM public.missed_calls
GROUP BY workspace_id, DATE_TRUNC('day', called_at);

-- View: Facebook Lead Ads stats
CREATE OR REPLACE VIEW public.v_facebook_lead_stats AS
SELECT 
  workspace_id,
  COUNT(*) as total_leads,
  COUNT(DISTINCT thread_id) as threads_created,
  COUNT(DISTINCT CASE WHEN processed THEN id END) as processed_count,
  AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time_seconds,
  DATE_TRUNC('day', created_at) as date
FROM public.facebook_lead_ads
GROUP BY workspace_id, DATE_TRUNC('day', created_at);

-- View: Response time by source
CREATE OR REPLACE VIEW public.v_response_time_by_source AS
SELECT 
  c.workspace_id,
  c.lead_source,
  AVG(EXTRACT(EPOCH FROM (t.last_message_at - c.created_at))) as avg_response_time_seconds,
  MIN(EXTRACT(EPOCH FROM (t.last_message_at - c.created_at))) as min_response_time_seconds,
  MAX(EXTRACT(EPOCH FROM (t.last_message_at - c.created_at))) as max_response_time_seconds,
  COUNT(*) as lead_count
FROM public.contacts c
JOIN public.inbox_threads t ON t.contact_id = c.id
WHERE c.lead_source IS NOT NULL
  AND t.last_message_at > c.created_at
GROUP BY c.workspace_id, c.lead_source;

-- =====================================================
-- RLS Policies
-- =====================================================

ALTER TABLE public.lead_capture_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missed_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voicemails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_lead_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_local_services_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_intake_analysis ENABLE ROW LEVEL SECURITY;

-- Lead capture forms: workspace members can read/write
CREATE POLICY "lead_capture_forms_workspace_member" ON public.lead_capture_forms
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Form submissions: workspace members can read/write
CREATE POLICY "lead_form_submissions_workspace_member" ON public.lead_form_submissions
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Landing pages: workspace members can read/write
CREATE POLICY "landing_pages_workspace_member" ON public.landing_pages
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Missed calls: workspace members can read/write
CREATE POLICY "missed_calls_workspace_member" ON public.missed_calls
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Voicemails: workspace members can read/write
CREATE POLICY "voicemails_workspace_member" ON public.voicemails
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Facebook lead ads: workspace members can read/write
CREATE POLICY "facebook_lead_ads_workspace_member" ON public.facebook_lead_ads
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Facebook webhook configs: workspace members can read/write
CREATE POLICY "facebook_webhook_configs_workspace_member" ON public.facebook_webhook_configs
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Google Local Services leads: workspace members can read/write
CREATE POLICY "gls_leads_workspace_member" ON public.google_local_services_leads
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Smart intake analysis: workspace members can read/write
CREATE POLICY "smart_intake_analysis_workspace_member" ON public.smart_intake_analysis
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- Triggers
-- =====================================================

-- Update timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_capture_forms_updated_at ON public.lead_capture_forms;
CREATE TRIGGER trg_lead_capture_forms_updated_at
  BEFORE UPDATE ON public.lead_capture_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_landing_pages_updated_at ON public.landing_pages;
CREATE TRIGGER trg_landing_pages_updated_at
  BEFORE UPDATE ON public.landing_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_smart_intake_analysis_updated_at ON public.smart_intake_analysis;
CREATE TRIGGER trg_smart_intake_analysis_updated_at
  BEFORE UPDATE ON public.smart_intake_analysis
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_facebook_webhook_configs_updated_at ON public.facebook_webhook_configs;
CREATE TRIGGER trg_facebook_webhook_configs_updated_at
  BEFORE UPDATE ON public.facebook_webhook_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function: Get or create contact from form submission
CREATE OR REPLACE FUNCTION public.get_or_create_contact_from_form(
  p_workspace_id uuid,
  p_email text,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_lead_source text DEFAULT 'web_form'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
BEGIN
  -- Try to find existing contact
  SELECT id INTO v_contact_id
  FROM public.contacts
  WHERE workspace_id = p_workspace_id
    AND lower(email) = lower(p_email)
  LIMIT 1;

  -- If found, update lead source if needed
  IF v_contact_id IS NOT NULL THEN
    UPDATE public.contacts
    SET 
      lead_source = COALESCE(lead_source, p_lead_source),
      phone = COALESCE(phone, p_phone),
      updated_at = now()
    WHERE id = v_contact_id;
    RETURN v_contact_id;
  END IF;

  -- Create new contact
  INSERT INTO public.contacts (
    workspace_id,
    email,
    first_name,
    phone,
    lead_source,
    source_meta
  )
  VALUES (
    p_workspace_id,
    lower(p_email),
    p_name,
    p_phone,
    p_lead_source,
    jsonb_build_object('created_from', 'form_submission')
  )
  RETURNING id INTO v_contact_id;

  RETURN v_contact_id;
END;
$$;

-- Comments
COMMENT ON TABLE public.lead_capture_forms IS 'Hosted lead capture forms for each workspace';
COMMENT ON TABLE public.lead_form_submissions IS 'Form submissions that create inbox threads';
COMMENT ON TABLE public.landing_pages IS 'Landing page templates for lead capture';
COMMENT ON TABLE public.missed_calls IS 'Missed calls converted to inbox threads';
COMMENT ON TABLE public.voicemails IS 'Voicemails transcribed and added to inbox';
COMMENT ON TABLE public.facebook_lead_ads IS 'Facebook Lead Ads integrated into inbox';
COMMENT ON TABLE public.google_local_services_leads IS 'Google Local Services leads via email forwarding';
COMMENT ON TABLE public.smart_intake_analysis IS 'AI analysis of all captured leads';



















































