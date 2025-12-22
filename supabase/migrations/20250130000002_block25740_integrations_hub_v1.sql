-- ============================================================================
-- Block 25740 — SmartSend Roofing Integrations Hub v1
-- THE INTEGRATIONS HUB — ZERO FLUFF
-- ============================================================================
-- This migration creates the comprehensive integrations hub that connects
-- SmartSend to EVERYTHING roofers use: QuickBooks, Calendars, Email, SMS,
-- Phone, Supplier APIs, Weather API, Google Maps, E-Signatures, Push Notifications
--
-- This is where SmartSend becomes THE system they rely on 24/7.
-- ============================================================================

-- ============================================================================
-- PART 1: EXTEND INTEGRATIONS CATALOG
-- ============================================================================
-- Ensure the integrations catalog table exists and supports all hub integrations

-- Create integrations catalog if it doesn't exist (from revenue_growth_system)
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  category TEXT CHECK (category IN ('accounting', 'communication', 'scheduling', 'supplier', 'weather', 'maps', 'signature', 'notification', 'crm', 'productivity', 'automation')),
  is_active BOOLEAN DEFAULT TRUE,
  config_schema JSONB,
  webhook_url_template TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed integration definitions for Integrations Hub v1
INSERT INTO public.integrations (service_name, display_name, description, category, is_active, config_schema)
VALUES
  -- Accounting
  ('quickbooks_online', 'QuickBooks Online', 'Sync invoices, payments, customers, and job IDs with QuickBooks Online', 'accounting', TRUE, '{"oauth": true, "scopes": ["com.intuit.quickbooks.accounting"]}'),
  ('quickbooks_desktop', 'QuickBooks Desktop', 'Export invoices, payments, and customers to QuickBooks Desktop', 'accounting', TRUE, '{"file_export": true, "formats": ["csv", "iif"]}'),
  
  -- Calendar
  ('google_calendar', 'Google Calendar', 'Sync scheduled inspections, quotes, deliveries, install dates, and crew schedules', 'scheduling', TRUE, '{"oauth": true, "scopes": ["https://www.googleapis.com/auth/calendar"]}'),
  ('outlook_calendar', 'Outlook Calendar', 'Sync scheduled inspections, quotes, deliveries, install dates, and crew schedules', 'scheduling', TRUE, '{"oauth": true, "scopes": ["Calendars.ReadWrite"]}'),
  
  -- Email
  ('gmail', 'Gmail', 'Send quotes, updates, receive homeowner replies, track open rates and reply intent', 'communication', TRUE, '{"oauth": true, "scopes": ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"]}'),
  ('outlook_email', 'Outlook Email', 'Send quotes, updates, receive homeowner replies, track open rates and reply intent', 'communication', TRUE, '{"oauth": true, "scopes": ["Mail.Send", "Mail.Read"]}'),
  
  -- SMS
  ('twilio_sms', 'Twilio SMS', 'Two-way texting, automated reminders, install-day updates, homeowner replies → SmartSend Inbox', 'communication', TRUE, '{"api_key": true, "phone_number": true}'),
  ('telnyx_sms', 'Telnyx SMS', 'Two-way texting, automated reminders, install-day updates, homeowner replies → SmartSend Inbox', 'communication', TRUE, '{"api_key": true, "phone_number": true}'),
  
  -- Phone
  ('twilio_phone', 'Twilio Phone', 'Virtual roofing phone system, call logging, call recordings, call outcome tagging', 'communication', TRUE, '{"api_key": true, "phone_number": true, "recordings": true}'),
  ('telnyx_phone', 'Telnyx Phone', 'Virtual roofing phone system, call logging, call recordings, call outcome tagging', 'communication', TRUE, '{"api_key": true, "phone_number": true, "recordings": true}'),
  
  -- Weather
  ('weather_noaa', 'NOAA Weather API', 'Hourly rain, wind gusts, storm path, lightning risk, hail probability, extreme temperatures', 'weather', TRUE, '{"api_key": true}'),
  ('weather_openweather', 'OpenWeather API', 'Hourly weather data, storm alerts, risk scoring', 'weather', TRUE, '{"api_key": true}'),
  
  -- Supplier APIs
  ('supplier_abc_supply', 'ABC Supply', 'PO sync, delivery confirmations, cost upload', 'supplier', TRUE, '{"api_key": true, "phase": 3}'),
  ('supplier_beacon', 'Beacon', 'PO sync, delivery confirmations, cost upload', 'supplier', TRUE, '{"api_key": true, "phase": 3}'),
  ('supplier_email_po', 'Email PO Sync', 'Email-based PO syncing (Phase 1)', 'supplier', TRUE, '{"email": true, "phase": 1}'),
  
  -- Maps
  ('google_maps', 'Google Maps', 'Lead address verification, job travel times, crew routing, storm impact by location, job clusters', 'maps', TRUE, '{"api_key": true, "scopes": ["maps"]}'),
  
  -- E-Signature
  ('esign_docusign', 'DocuSign', 'Signature for contracts, supplements, change orders, finance disclosures', 'signature', TRUE, '{"oauth": true, "api_key": true}'),
  ('esign_hellosign', 'HelloSign', 'Signature for contracts, supplements, change orders, finance disclosures', 'signature', TRUE, '{"oauth": true, "api_key": true}'),
  ('esign_pandadoc', 'PandaDoc', 'Signature for contracts, supplements, change orders, finance disclosures', 'signature', TRUE, '{"oauth": true, "api_key": true}'),
  
  -- Push Notifications
  ('push_notifications', 'Push Notifications', 'Mobile push notifications for lead alerts, scheduling updates, crew arrival, material delays, weather alerts, payment updates', 'notification', TRUE, '{"fcm": true, "apns": true}')
ON CONFLICT (service_name) DO NOTHING;

-- ============================================================================
-- PART 2: PHONE CALL INTEGRATION TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.phone_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integration_tokens(id) ON DELETE SET NULL,
  
  -- Call details
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  call_sid TEXT, -- External provider call ID (Twilio SID, etc.)
  
  -- Call metadata
  duration_seconds INTEGER,
  call_status TEXT CHECK (call_status IN ('initiated', 'ringing', 'answered', 'completed', 'busy', 'failed', 'no-answer', 'canceled')),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  
  -- Recording
  recording_url TEXT,
  recording_sid TEXT,
  recording_duration_seconds INTEGER,
  
  -- Job association
  job_id UUID REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Call outcome
  outcome TEXT CHECK (outcome IN ('quote_requested', 'appointment_scheduled', 'payment_received', 'follow_up_needed', 'not_interested', 'voicemail', 'no_answer', 'other')),
  outcome_notes TEXT,
  
  -- Call notes
  notes TEXT,
  transcribed_text TEXT, -- AI transcription if available
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_calls_workspace ON public.phone_calls(workspace_id);
CREATE INDEX IF NOT EXISTS idx_phone_calls_integration ON public.phone_calls(integration_id);
CREATE INDEX IF NOT EXISTS idx_phone_calls_job ON public.phone_calls(job_id);
CREATE INDEX IF NOT EXISTS idx_phone_calls_lead ON public.phone_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_phone_calls_from_number ON public.phone_calls(from_number);
CREATE INDEX IF NOT EXISTS idx_phone_calls_to_number ON public.phone_calls(to_number);
CREATE INDEX IF NOT EXISTS idx_phone_calls_created_at ON public.phone_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_calls_outcome ON public.phone_calls(outcome);

-- ============================================================================
-- PART 3: E-SIGNATURE INTEGRATION TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.esignature_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integration_tokens(id) ON DELETE SET NULL,
  
  -- Document details
  document_type TEXT NOT NULL CHECK (document_type IN ('contract', 'supplement', 'change_order', 'finance_disclosure', 'other')),
  document_name TEXT NOT NULL,
  external_document_id TEXT, -- DocuSign envelope ID, HelloSign signature request ID, etc.
  
  -- Job/Lead association
  job_id UUID REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Signers
  signer_email TEXT NOT NULL,
  signer_name TEXT,
  signer_role TEXT CHECK (signer_role IN ('homeowner', 'contractor', 'insurance', 'other')),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'signed', 'declined', 'expired', 'canceled', 'completed')),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Document storage
  document_url TEXT, -- Link to signed document
  document_vault_id UUID, -- Reference to document_vault if stored
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esignature_workspace ON public.esignature_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_esignature_integration ON public.esignature_documents(integration_id);
CREATE INDEX IF NOT EXISTS idx_esignature_job ON public.esignature_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_esignature_lead ON public.esignature_documents(lead_id);
CREATE INDEX IF NOT EXISTS idx_esignature_status ON public.esignature_documents(status);
CREATE INDEX IF NOT EXISTS idx_esignature_signer_email ON public.esignature_documents(signer_email);
CREATE INDEX IF NOT EXISTS idx_esignature_external_id ON public.esignature_documents(external_document_id);

-- ============================================================================
-- PART 4: SUPPLIER API INTEGRATION TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integration_tokens(id) ON DELETE SET NULL,
  job_id UUID NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  
  -- PO details
  po_number TEXT NOT NULL,
  external_po_id TEXT, -- Supplier's PO ID
  supplier_name TEXT NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'acknowledged', 'processing', 'shipped', 'delivered', 'cancelled')),
  
  -- Items
  items JSONB DEFAULT '[]'::jsonb, -- Array of {item_name, quantity, unit_price, total}
  total_amount NUMERIC(10, 2),
  
  -- Delivery
  delivery_date DATE,
  delivery_address TEXT,
  delivery_confirmed BOOLEAN DEFAULT FALSE,
  delivery_confirmed_at TIMESTAMPTZ,
  
  -- Cost sync
  cost_synced_to_accounting BOOLEAN DEFAULT FALSE,
  cost_synced_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_po_workspace ON public.supplier_purchase_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_supplier_po_integration ON public.supplier_purchase_orders(integration_id);
CREATE INDEX IF NOT EXISTS idx_supplier_po_job ON public.supplier_purchase_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_supplier_po_status ON public.supplier_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_supplier_po_number ON public.supplier_purchase_orders(po_number);

CREATE TABLE IF NOT EXISTS public.supplier_delivery_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES public.supplier_purchase_orders(id) ON DELETE CASCADE,
  
  -- Update details
  update_type TEXT NOT NULL CHECK (update_type IN ('acknowledged', 'processing', 'shipped', 'delivered', 'delayed', 'cancelled')),
  update_message TEXT,
  
  -- Delivery details
  tracking_number TEXT,
  carrier TEXT,
  estimated_delivery_date DATE,
  actual_delivery_date DATE,
  
  -- Metadata
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_delivery_po ON public.supplier_delivery_updates(po_id);
CREATE INDEX IF NOT EXISTS idx_supplier_delivery_created_at ON public.supplier_delivery_updates(created_at DESC);

-- ============================================================================
-- PART 5: GOOGLE MAPS INTEGRATION TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.address_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Address details
  input_address TEXT NOT NULL,
  verified_address TEXT,
  formatted_address TEXT,
  
  -- Location data
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  place_id TEXT, -- Google Places API place_id
  
  -- Verification status
  verification_status TEXT CHECK (verification_status IN ('verified', 'partial', 'failed', 'pending')),
  confidence_score NUMERIC(3, 2), -- 0.00 to 1.00
  
  -- Additional data
  city TEXT,
  state TEXT,
  zip_code TEXT,
  county TEXT,
  
  -- Travel time data (cached)
  travel_time_from_office_seconds INTEGER,
  distance_from_office_miles NUMERIC(8, 2),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_address_verification_workspace ON public.address_verifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_address_verification_lead ON public.address_verifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_address_verification_job ON public.address_verifications(job_id);
CREATE INDEX IF NOT EXISTS idx_address_verification_place_id ON public.address_verifications(place_id);
CREATE INDEX IF NOT EXISTS idx_address_verification_location ON public.address_verifications(latitude, longitude);

CREATE TABLE IF NOT EXISTS public.job_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Cluster details
  cluster_name TEXT NOT NULL,
  center_latitude NUMERIC(10, 8) NOT NULL,
  center_longitude NUMERIC(11, 8) NOT NULL,
  radius_miles NUMERIC(5, 2) NOT NULL DEFAULT 5.0,
  
  -- Job associations
  job_ids UUID[] DEFAULT '{}'::uuid[],
  job_count INTEGER DEFAULT 0,
  
  -- Marketing use
  marketing_enabled BOOLEAN DEFAULT FALSE,
  marketing_campaign_id UUID,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_clusters_workspace ON public.job_clusters(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_clusters_location ON public.job_clusters(center_latitude, center_longitude);

-- ============================================================================
-- PART 6: PUSH NOTIFICATIONS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_notification_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Device details
  device_token TEXT NOT NULL, -- FCM token or APNS device token
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_name TEXT,
  
  -- Notification preferences
  enabled BOOLEAN DEFAULT TRUE,
  notification_types TEXT[] DEFAULT ARRAY['all'], -- ['lead_alerts', 'scheduling', 'crew', 'material', 'weather', 'payment', 'timeline', 'all']
  
  -- Status
  last_seen_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, user_id, device_token)
);

CREATE INDEX IF NOT EXISTS idx_push_devices_workspace ON public.push_notification_devices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_user ON public.push_notification_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_active ON public.push_notification_devices(is_active) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS public.push_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.push_notification_devices(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Notification details
  notification_type TEXT NOT NULL CHECK (notification_type IN ('lead_alert', 'scheduling_update', 'crew_arrival', 'material_delay', 'weather_alert', 'payment_update', 'timeline_change', 'other')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  
  -- Association
  job_id UUID REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'failed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  
  -- Error tracking
  error_message TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_notifications_workspace ON public.push_notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_push_notifications_device ON public.push_notifications(device_id);
CREATE INDEX IF NOT EXISTS idx_push_notifications_user ON public.push_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_push_notifications_status ON public.push_notifications(status);
CREATE INDEX IF NOT EXISTS idx_push_notifications_created_at ON public.push_notifications(created_at DESC);

-- ============================================================================
-- PART 7: CALENDAR EVENT SYNC TABLE (Enhanced)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integration_tokens(id) ON DELETE SET NULL,
  
  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN ('inspection', 'quote', 'material_delivery', 'install', 'crew_schedule', 'owner_reminder', 'follow_up_task', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  
  -- Timing
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'America/New_York',
  
  -- External calendar sync
  external_calendar_id TEXT, -- Google Calendar event ID, Outlook event ID, etc.
  external_calendar_name TEXT,
  synced_to_calendar BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ,
  
  -- Associations
  job_id UUID REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Attendees
  attendee_emails TEXT[],
  attendee_names TEXT[],
  
  -- Reminders
  reminder_minutes INTEGER[] DEFAULT ARRAY[1440, 60], -- 24 hours, 1 hour before
  
  -- Status
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('tentative', 'confirmed', 'cancelled')),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_workspace ON public.calendar_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_integration ON public.calendar_events(integration_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_job ON public.calendar_events(job_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_lead ON public.calendar_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON public.calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_external_id ON public.calendar_events(external_calendar_id);

-- ============================================================================
-- PART 8: RLS POLICIES
-- ============================================================================

-- Phone Calls RLS
ALTER TABLE public.phone_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view phone calls for their workspace"
  ON public.phone_calls FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert phone calls"
  ON public.phone_calls FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update phone calls for their workspace"
  ON public.phone_calls FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- E-Signature Documents RLS
ALTER TABLE public.esignature_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view e-signature documents for their workspace"
  ON public.esignature_documents FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage e-signature documents for their workspace"
  ON public.esignature_documents FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Supplier Purchase Orders RLS
ALTER TABLE public.supplier_purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view supplier POs for their workspace"
  ON public.supplier_purchase_orders FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage supplier POs for their workspace"
  ON public.supplier_purchase_orders FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert supplier delivery updates"
  ON public.supplier_delivery_updates FOR INSERT
  WITH CHECK (true);

-- Address Verifications RLS
ALTER TABLE public.address_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view address verifications for their workspace"
  ON public.address_verifications FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage address verifications for their workspace"
  ON public.address_verifications FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Job Clusters RLS
ALTER TABLE public.job_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view job clusters for their workspace"
  ON public.job_clusters FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage job clusters for their workspace"
  ON public.job_clusters FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Push Notification Devices RLS
ALTER TABLE public.push_notification_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own push devices"
  ON public.push_notification_devices FOR ALL
  USING (auth.uid() = user_id);

-- Push Notifications RLS
ALTER TABLE public.push_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own push notifications"
  ON public.push_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert push notifications"
  ON public.push_notifications FOR INSERT
  WITH CHECK (true);

-- Calendar Events RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view calendar events for their workspace"
  ON public.calendar_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage calendar events for their workspace"
  ON public.calendar_events FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 9: HELPER FUNCTIONS
-- ============================================================================

-- Function: Log phone call and create timeline event
CREATE OR REPLACE FUNCTION public.log_phone_call(
  p_workspace_id UUID,
  p_from_number TEXT,
  p_to_number TEXT,
  p_direction TEXT,
  p_call_sid TEXT,
  p_duration_seconds INTEGER DEFAULT NULL,
  p_call_status TEXT DEFAULT 'completed',
  p_job_id UUID DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL,
  p_outcome TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_call_id UUID;
BEGIN
  -- Insert phone call
  INSERT INTO public.phone_calls (
    workspace_id,
    from_number,
    to_number,
    direction,
    call_sid,
    duration_seconds,
    call_status,
    job_id,
    lead_id,
    outcome,
    notes,
    metadata
  )
  VALUES (
    p_workspace_id,
    p_from_number,
    p_to_number,
    p_direction,
    p_call_sid,
    p_duration_seconds,
    p_call_status,
    p_job_id,
    p_lead_id,
    p_outcome,
    p_notes,
    p_metadata
  )
  RETURNING id INTO v_call_id;

  -- Create timeline event if lead_id provided
  IF p_lead_id IS NOT NULL THEN
    INSERT INTO public.lead_timeline_events (
      lead_id,
      event_type,
      event_subtype,
      message,
      metadata
    )
    VALUES (
      p_lead_id,
      'call_logged',
      'phone_' || p_direction,
      CASE 
        WHEN p_direction = 'inbound' THEN 'Inbound call from ' || p_from_number
        ELSE 'Outbound call to ' || p_to_number
      END,
      jsonb_build_object(
        'call_id', v_call_id,
        'call_sid', p_call_sid,
        'duration_seconds', p_duration_seconds,
        'outcome', p_outcome
      )
    );
  END IF;

  RETURN v_call_id;
END;
$$;

-- Function: Create e-signature document
CREATE OR REPLACE FUNCTION public.create_esignature_document(
  p_workspace_id UUID,
  p_document_type TEXT,
  p_document_name TEXT,
  p_signer_email TEXT,
  p_signer_name TEXT DEFAULT NULL,
  p_job_id UUID DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_document_id UUID;
BEGIN
  INSERT INTO public.esignature_documents (
    workspace_id,
    document_type,
    document_name,
    signer_email,
    signer_name,
    job_id,
    lead_id,
    metadata
  )
  VALUES (
    p_workspace_id,
    p_document_type,
    p_document_name,
    p_signer_email,
    p_signer_name,
    p_job_id,
    p_lead_id,
    p_metadata
  )
  RETURNING id INTO v_document_id;

  -- Create timeline event if lead_id provided
  IF p_lead_id IS NOT NULL THEN
    INSERT INTO public.lead_timeline_events (
      lead_id,
      event_type,
      event_subtype,
      message,
      metadata
    )
    VALUES (
      p_lead_id,
      'document_sent',
      'esignature_' || p_document_type,
      p_document_name || ' sent for signature',
      jsonb_build_object(
        'document_id', v_document_id,
        'document_type', p_document_type
      )
    );
  END IF;

  RETURN v_document_id;
END;
$$;

-- Function: Create calendar event and sync
CREATE OR REPLACE FUNCTION public.create_calendar_event(
  p_workspace_id UUID,
  p_event_type TEXT,
  p_title TEXT,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ DEFAULT NULL,
  p_job_id UUID DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_attendee_emails TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.calendar_events (
    workspace_id,
    event_type,
    title,
    description,
    start_time,
    end_time,
    job_id,
    lead_id,
    attendee_emails,
    metadata
  )
  VALUES (
    p_workspace_id,
    p_event_type,
    p_title,
    p_description,
    p_start_time,
    p_end_time,
    p_job_id,
    p_lead_id,
    p_attendee_emails,
    p_metadata
  )
  RETURNING id INTO v_event_id;

  -- Create timeline event if lead_id provided
  IF p_lead_id IS NOT NULL THEN
    INSERT INTO public.lead_timeline_events (
      lead_id,
      event_type,
      event_subtype,
      message,
      metadata
    )
    VALUES (
      p_lead_id,
      'calendar_event_created',
      'calendar_' || p_event_type,
      p_title || ' scheduled',
      jsonb_build_object(
        'event_id', v_event_id,
        'start_time', p_start_time
      )
    );
  END IF;

  RETURN v_event_id;
END;
$$;

-- Function: Send push notification
CREATE OR REPLACE FUNCTION public.send_push_notification(
  p_workspace_id UUID,
  p_user_id UUID,
  p_notification_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_job_id UUID DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
  v_device RECORD;
BEGIN
  -- Find active devices for user
  FOR v_device IN
    SELECT id FROM public.push_notification_devices
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
      AND is_active = TRUE
      AND enabled = TRUE
      AND (
        'all' = ANY(notification_types)
        OR p_notification_type = ANY(notification_types)
      )
  LOOP
    -- Create notification for each device
    INSERT INTO public.push_notifications (
      workspace_id,
      device_id,
      user_id,
      notification_type,
      title,
      body,
      job_id,
      lead_id,
      metadata
    )
    VALUES (
      p_workspace_id,
      v_device.id,
      p_user_id,
      p_notification_type,
      p_title,
      p_body,
      p_job_id,
      p_lead_id,
      p_metadata
    )
    RETURNING id INTO v_notification_id;
  END LOOP;

  RETURN v_notification_id;
END;
$$;

-- Function: Verify address with Google Maps
CREATE OR REPLACE FUNCTION public.verify_address(
  p_workspace_id UUID,
  p_input_address TEXT,
  p_lead_id UUID DEFAULT NULL,
  p_job_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_verification_id UUID;
BEGIN
  -- Insert address verification record
  -- Actual Google Maps API call happens in application code
  INSERT INTO public.address_verifications (
    workspace_id,
    input_address,
    lead_id,
    job_id,
    verification_status
  )
  VALUES (
    p_workspace_id,
    p_input_address,
    p_lead_id,
    p_job_id,
    'pending'
  )
  RETURNING id INTO v_verification_id;

  RETURN v_verification_id;
END;
$$;

-- ============================================================================
-- PART 10: TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_integrations_hub_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_phone_calls_updated_at
  BEFORE UPDATE ON public.phone_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_integrations_hub_updated_at();

CREATE TRIGGER trg_esignature_documents_updated_at
  BEFORE UPDATE ON public.esignature_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_integrations_hub_updated_at();

CREATE TRIGGER trg_supplier_purchase_orders_updated_at
  BEFORE UPDATE ON public.supplier_purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_integrations_hub_updated_at();

CREATE TRIGGER trg_address_verifications_updated_at
  BEFORE UPDATE ON public.address_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_integrations_hub_updated_at();

CREATE TRIGGER trg_job_clusters_updated_at
  BEFORE UPDATE ON public.job_clusters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_integrations_hub_updated_at();

CREATE TRIGGER trg_push_notification_devices_updated_at
  BEFORE UPDATE ON public.push_notification_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_integrations_hub_updated_at();

CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_integrations_hub_updated_at();

-- ============================================================================
-- PART 11: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.phone_calls IS 'Phone call integration - virtual roofing phone system with call logging, recordings, and outcome tagging';
COMMENT ON TABLE public.esignature_documents IS 'E-signature integration - contracts, supplements, change orders, finance disclosures';
COMMENT ON TABLE public.supplier_purchase_orders IS 'Supplier API integration - PO sync, delivery confirmations, cost upload';
COMMENT ON TABLE public.supplier_delivery_updates IS 'Supplier delivery status updates from supplier APIs';
COMMENT ON TABLE public.address_verifications IS 'Google Maps integration - address verification, travel times, crew routing';
COMMENT ON TABLE public.job_clusters IS 'Job clusters for marketing - groups jobs by location for targeted outreach';
COMMENT ON TABLE public.push_notification_devices IS 'Push notification device registration for mobile and web';
COMMENT ON TABLE public.push_notifications IS 'Push notification history - lead alerts, scheduling updates, crew arrival, weather alerts';
COMMENT ON TABLE public.calendar_events IS 'Calendar event sync - inspections, quotes, deliveries, install dates, crew schedules';

COMMENT ON FUNCTION public.log_phone_call IS 'Logs phone call and creates timeline event';
COMMENT ON FUNCTION public.create_esignature_document IS 'Creates e-signature document and timeline event';
COMMENT ON FUNCTION public.create_calendar_event IS 'Creates calendar event and syncs to external calendars';
COMMENT ON FUNCTION public.send_push_notification IS 'Sends push notification to user devices';
COMMENT ON FUNCTION public.verify_address IS 'Verifies address with Google Maps API';




































