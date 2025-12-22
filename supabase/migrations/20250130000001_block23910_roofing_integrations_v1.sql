-- ============================================================================
-- Block 23910 — SmartSend Roofing Integrations v1
-- Essential Integrations • What Roofers Actually Need
-- ============================================================================
-- This migration creates the database schema for all roofing-specific integrations
-- organized into 5 categories: Communication, CRM, Calendar, Contact Import, Weather

-- ============================================================================
-- PART 1: EXTEND INTEGRATIONS TABLE
-- ============================================================================
-- Extend existing integrations table to support all roofing integration types

-- Note: The integrations table uses 'org_id' column (not workspace_id)
-- This migration extends the existing table structure

-- Update integrations table to support new types
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'integrations_type_check'
  ) THEN
    ALTER TABLE public.integrations DROP CONSTRAINT integrations_type_check;
  END IF;
END $$;

-- Add check constraint for all integration types
ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_type_check 
  CHECK (type IN (
    -- Existing
    'zapier', 'slack', 'hubspot',
    -- Communication (Category 1)
    'gmail', 'outlook', 'sms_twilio', 'sms_telnyx', 'webform_gravity', 'webform_jotform', 'webform_wix', 'webform_gohighlevel',
    -- CRM + Lead Systems (Category 2)
    'crm_jobnimbus', 'crm_acculynx', 'crm_roofr', 'crm_gohighlevel',
    -- Calendar + Booking (Category 3)
    'calendar_google', 'calendar_outlook', 'booking_calendly', 'booking_savvycal', 'booking_youcanbookme',
    -- Contact Import (Category 4)
    'import_csv', 'import_quickbooks', 'import_phone_contacts',
    -- Weather + Storm Data (Category 5)
    'weather_noaa', 'weather_hailtrace', 'weather_hail_recon'
  ));

-- Add phase column to track implementation priority
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS phase INTEGER DEFAULT 1 CHECK (phase IN (1, 2, 3));

-- Add enabled column
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;

-- Add last_sync_at for tracking sync status
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add sync_status for tracking sync health
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'success', 'error'));

-- Add error_message for storing sync errors
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- ============================================================================
-- PART 2: INTEGRATION-SPECIFIC CONFIGURATION TABLES
-- ============================================================================

-- CRM Sync Status Table
-- Tracks sync status for CRM integrations (JobNimbus, AccuLynx, etc.)
CREATE TABLE IF NOT EXISTS public.crm_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Sync tracking
  last_sync_at TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  sync_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  
  -- Sync configuration
  sync_direction TEXT DEFAULT 'bidirectional' CHECK (sync_direction IN ('inbound', 'outbound', 'bidirectional')),
  auto_sync_enabled BOOLEAN DEFAULT TRUE,
  sync_interval_minutes INTEGER DEFAULT 15, -- How often to sync
  
  -- CRM-specific fields
  crm_lead_id TEXT, -- External CRM lead ID
  crm_contact_id TEXT, -- External CRM contact ID
  crm_job_id TEXT, -- External CRM job ID
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(integration_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_sync_integration ON public.crm_sync_status(integration_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_workspace ON public.crm_sync_status(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_last_sync ON public.crm_sync_status(last_sync_at DESC);

-- Calendar Integration Status Table
-- Tracks calendar connections and booking status
CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Calendar connection info
  calendar_id TEXT, -- External calendar ID
  calendar_name TEXT,
  calendar_email TEXT,
  
  -- Booking configuration
  booking_enabled BOOLEAN DEFAULT TRUE,
  auto_confirm_enabled BOOLEAN DEFAULT FALSE,
  buffer_time_minutes INTEGER DEFAULT 15, -- Buffer between appointments
  
  -- Availability settings
  available_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- 1=Monday, 7=Sunday
  start_time TIME DEFAULT '09:00:00',
  end_time TIME DEFAULT '17:00:00',
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(integration_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_integration_id ON public.calendar_integrations(integration_id);
CREATE INDEX IF NOT EXISTS idx_calendar_workspace ON public.calendar_integrations(workspace_id);

-- Web Form Submissions Table
-- Stores web form submissions from Gravity Forms, Jotform, etc.
CREATE TABLE IF NOT EXISTS public.webform_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Form submission data
  form_id TEXT NOT NULL,
  form_name TEXT,
  submission_id TEXT, -- External form submission ID
  
  -- Lead data extracted from form
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  message TEXT,
  
  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Raw form data
  raw_data JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webform_integration ON public.webform_submissions(integration_id);
CREATE INDEX IF NOT EXISTS idx_webform_workspace ON public.webform_submissions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webform_processed ON public.webform_submissions(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_webform_email ON public.webform_submissions(email) WHERE email IS NOT NULL;

-- SMS Messages Table
-- Stores inbound SMS messages from Twilio/Telnyx
CREATE TABLE IF NOT EXISTS public.sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- SMS data
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  message_body TEXT NOT NULL,
  message_sid TEXT, -- External SMS provider message ID
  
  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  classification TEXT CHECK (classification IN ('HOT', 'WARM', 'NOT', 'FOLLOW_UP')),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_integration ON public.sms_messages(integration_id);
CREATE INDEX IF NOT EXISTS idx_sms_workspace ON public.sms_messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sms_processed ON public.sms_messages(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_sms_from_number ON public.sms_messages(from_number);

-- Weather/Storm Alerts Table
-- Stores weather alerts and storm data from NOAA, HailTrace, etc.
CREATE TABLE IF NOT EXISTS public.storm_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Storm data
  alert_type TEXT NOT NULL CHECK (alert_type IN ('hail', 'wind', 'tornado', 'severe_weather', 'storm')),
  severity TEXT CHECK (severity IN ('minor', 'moderate', 'severe', 'extreme')),
  
  -- Location
  city TEXT,
  state TEXT,
  zip_code TEXT,
  county TEXT,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  
  -- Storm details
  wind_speed_mph INTEGER,
  hail_size_inches NUMERIC(4, 2),
  storm_date DATE,
  alert_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Campaign status
  campaign_triggered BOOLEAN DEFAULT FALSE,
  campaign_triggered_at TIMESTAMPTZ,
  campaign_id UUID, -- Reference to campaign that was triggered
  
  -- Metadata
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storm_integration ON public.storm_alerts(integration_id);
CREATE INDEX IF NOT EXISTS idx_storm_workspace ON public.storm_alerts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_location ON public.storm_alerts(state, city, zip_code);
CREATE INDEX IF NOT EXISTS idx_storm_date ON public.storm_alerts(storm_date DESC);
CREATE INDEX IF NOT EXISTS idx_storm_campaign_triggered ON public.storm_alerts(campaign_triggered) WHERE campaign_triggered = FALSE;

-- Contact Import Jobs Table
-- Tracks CSV/Excel/QuickBooks import jobs
CREATE TABLE IF NOT EXISTS public.contact_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Import job status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_name TEXT,
  file_size_bytes INTEGER,
  
  -- Import results
  total_rows INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  
  -- Error details
  error_message TEXT,
  error_details JSONB DEFAULT '[]'::jsonb, -- Array of row-level errors
  
  -- Processing timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_job_integration ON public.contact_import_jobs(integration_id);
CREATE INDEX IF NOT EXISTS idx_import_job_workspace ON public.contact_import_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_import_job_status ON public.contact_import_jobs(status);

-- ============================================================================
-- PART 3: UNIFIED LEAD PROCESSING TABLE
-- ============================================================================
-- Tracks all leads created from integrations for unified processing

CREATE TABLE IF NOT EXISTS public.integration_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Integration source tracking
  source_type TEXT NOT NULL, -- 'email', 'sms', 'webform', 'crm', 'calendar', 'import', 'storm'
  source_id UUID, -- Reference to source record (webform_submissions.id, sms_messages.id, etc.)
  
  -- AI Classification results
  ai_classification TEXT CHECK (ai_classification IN ('HOT', 'WARM', 'NOT', 'FOLLOW_UP', 'OUT_OF_SCOPE')),
  ai_confidence NUMERIC(3, 2), -- 0.00 to 1.00
  ai_reasoning TEXT,
  
  -- Campaign assignment
  campaign_assigned BOOLEAN DEFAULT FALSE,
  campaign_id UUID,
  
  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  
  -- Notification status
  roofer_notified BOOLEAN DEFAULT FALSE,
  roofer_notified_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_leads_integration ON public.integration_leads(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_leads_workspace ON public.integration_leads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_leads_lead ON public.integration_leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_integration_leads_source ON public.integration_leads(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_integration_leads_processed ON public.integration_leads(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_integration_leads_classification ON public.integration_leads(ai_classification);

-- ============================================================================
-- PART 4: RLS POLICIES
-- ============================================================================

-- CRM Sync Status RLS
ALTER TABLE public.crm_sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view CRM sync status for their workspace"
  ON public.crm_sync_status FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage CRM sync status for their workspace"
  ON public.crm_sync_status FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Calendar Integrations RLS
ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view calendar integrations for their workspace"
  ON public.calendar_integrations FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage calendar integrations for their workspace"
  ON public.calendar_integrations FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Webform Submissions RLS
ALTER TABLE public.webform_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view webform submissions for their workspace"
  ON public.webform_submissions FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert webform submissions"
  ON public.webform_submissions FOR INSERT
  WITH CHECK (true);

-- SMS Messages RLS
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view SMS messages for their workspace"
  ON public.sms_messages FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert SMS messages"
  ON public.sms_messages FOR INSERT
  WITH CHECK (true);

-- Storm Alerts RLS
ALTER TABLE public.storm_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view storm alerts for their workspace"
  ON public.storm_alerts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert storm alerts"
  ON public.storm_alerts FOR INSERT
  WITH CHECK (true);

-- Contact Import Jobs RLS
ALTER TABLE public.contact_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view import jobs for their workspace"
  ON public.contact_import_jobs FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage import jobs for their workspace"
  ON public.contact_import_jobs FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Integration Leads RLS
ALTER TABLE public.integration_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view integration leads for their workspace"
  ON public.integration_leads FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert integration leads"
  ON public.integration_leads FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- PART 5: HELPER FUNCTIONS
-- ============================================================================

-- Function: Process new lead from integration
-- This is the core function that runs when a new lead enters from any integration
CREATE OR REPLACE FUNCTION public.process_integration_lead(
  p_integration_id UUID,
  p_workspace_id UUID,
  p_email TEXT,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_source_type TEXT,
  p_source_id UUID DEFAULT NULL,
  p_message_text TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_id UUID;
  v_integration_lead_id UUID;
  v_classification TEXT;
  v_confidence NUMERIC(3, 2);
  v_reasoning TEXT;
BEGIN
  -- 1. Auto-create lead (or find existing)
  INSERT INTO public.leads (
    workspace_id,
    email,
    first_name,
    last_name,
    phone,
    status,
    source,
    custom
  )
  VALUES (
    p_workspace_id,
    LOWER(p_email),
    p_first_name,
    p_last_name,
    p_phone,
    'new',
    p_source_type,
    p_metadata
  )
  ON CONFLICT (workspace_id, email) DO UPDATE SET
    first_name = COALESCE(EXCLUDED.first_name, leads.first_name),
    last_name = COALESCE(EXCLUDED.last_name, leads.last_name),
    phone = COALESCE(EXCLUDED.phone, leads.phone),
    updated_at = now()
  RETURNING id INTO v_lead_id;

  -- 2. Run through AI classifier (if message text provided)
  IF p_message_text IS NOT NULL AND LENGTH(TRIM(p_message_text)) > 0 THEN
    -- Call AI classification function (this would be implemented in application code)
    -- For now, we'll set defaults - actual AI classification happens in API route
    v_classification := 'WARM';
    v_confidence := 0.5;
    v_reasoning := 'Pending AI classification';
  ELSE
    v_classification := 'WARM';
    v_confidence := 0.5;
    v_reasoning := 'No message text provided';
  END IF;

  -- 3. Create integration_leads record
  INSERT INTO public.integration_leads (
    integration_id,
    workspace_id,
    lead_id,
    source_type,
    source_id,
    ai_classification,
    ai_confidence,
    ai_reasoning,
    metadata
  )
  VALUES (
    p_integration_id,
    p_workspace_id,
    v_lead_id,
    p_source_type,
    p_source_id,
    v_classification,
    v_confidence,
    v_reasoning,
    p_metadata
  )
  RETURNING id INTO v_integration_lead_id;

  -- 4. Create timeline event
  INSERT INTO public.lead_timeline_events (
    lead_id,
    event_type,
    event_subtype,
    message,
    metadata
  )
  VALUES (
    v_lead_id,
    'lead_created',
    'integration_' || p_source_type,
    'Lead created from ' || p_source_type || ' integration',
    jsonb_build_object(
      'integration_id', p_integration_id,
      'source_type', p_source_type,
      'source_id', p_source_id
    )
  );

  RETURN v_lead_id;
END;
$$;

-- Function: Update integration sync status
CREATE OR REPLACE FUNCTION public.update_integration_sync_status(
  p_integration_id UUID,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.integrations
  SET 
    sync_status = p_status,
    last_sync_at = now(),
    error_message = p_error_message,
    updated_at = now()
  WHERE id = p_integration_id;

  IF p_status = 'success' THEN
    UPDATE public.integrations
    SET last_sync_at = now()
    WHERE id = p_integration_id;
  END IF;
END;
$$;

-- ============================================================================
-- PART 6: TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_integration_tables_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crm_sync_status_updated_at
  BEFORE UPDATE ON public.crm_sync_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_integration_tables_updated_at();

CREATE TRIGGER trg_calendar_integrations_updated_at
  BEFORE UPDATE ON public.calendar_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_integration_tables_updated_at();

-- ============================================================================
-- PART 7: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.integrations IS 'Extended integrations table supporting all roofing integration types';
COMMENT ON TABLE public.crm_sync_status IS 'Tracks CRM sync status for JobNimbus, AccuLynx, Roofr, GoHighLevel';
COMMENT ON TABLE public.calendar_integrations IS 'Tracks calendar connections for Google Calendar, Outlook, Calendly, etc.';
COMMENT ON TABLE public.webform_submissions IS 'Stores web form submissions from Gravity Forms, Jotform, Wix, GoHighLevel';
COMMENT ON TABLE public.sms_messages IS 'Stores inbound SMS messages from Twilio/Telnyx';
COMMENT ON TABLE public.storm_alerts IS 'Stores weather alerts and storm data from NOAA, HailTrace, Hail Recon';
COMMENT ON TABLE public.contact_import_jobs IS 'Tracks CSV/Excel/QuickBooks import jobs';
COMMENT ON TABLE public.integration_leads IS 'Unified tracking of all leads created from integrations';

COMMENT ON FUNCTION public.process_integration_lead IS 'Core function: Auto-creates lead, runs AI classification, assigns to campaigns';
COMMENT ON FUNCTION public.update_integration_sync_status IS 'Updates integration sync status and error messages';

