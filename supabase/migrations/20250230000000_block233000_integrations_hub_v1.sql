-- =========================================================
-- Block 233000 — SmartSend Roofing Integrations Hub v1
-- "Integrations Hub — Email, Calendar, Suppliers, Accounting + Webhooks Layer"
-- =========================================================
-- 
-- This block connects SmartSend to the outside world:
-- - Email (Gmail, Outlook, SMTP)
-- - Calendars (Google Calendar, Outlook Calendar, Apple Calendar ICS)
-- - SMS/Voice (Twilio)
-- - Accounting (QuickBooks Online)
-- - Suppliers (ABC Supply, Beacon, SRS Distribution)
-- - Webhooks (Zapier-style outbound webhooks)
-- 
-- This makes SmartSend enterprise-ready and removes all friction for roofing companies.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE integration_accounts TABLE
-- ============================================================================
-- Stores OAuth tokens and credentials for all third-party integrations

CREATE TABLE IF NOT EXISTS public.integration_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Integration Type
  integration_type text NOT NULL CHECK (integration_type IN (
    'gmail',
    'outlook',
    'google_calendar',
    'outlook_calendar',
    'apple_calendar',
    'quickbooks',
    'twilio',
    'abc_supply',
    'beacon',
    'srs_distribution',
    'smtp'
  )),
  
  -- OAuth Tokens (for OAuth-based integrations)
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  
  -- API Credentials (for API key-based integrations like Twilio)
  api_key text,
  api_secret text,
  account_sid text, -- For Twilio
  
  -- Configuration (JSONB for flexible settings)
  config jsonb DEFAULT '{}'::jsonb, -- e.g., { "messaging_service_sid": "...", "sender_id": "..." }
  
  -- Status
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false, -- For email: which account to use by default
  
  -- Metadata
  connected_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz DEFAULT now(),
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure one active integration per type per company (unless explicitly allowing multiple)
  UNIQUE(roofing_company_id, integration_type, is_default) WHERE is_default = true
);

CREATE INDEX IF NOT EXISTS idx_integration_accounts_company ON public.integration_accounts(roofing_company_id);
CREATE INDEX IF NOT EXISTS idx_integration_accounts_type ON public.integration_accounts(roofing_company_id, integration_type, is_active);
CREATE INDEX IF NOT EXISTS idx_integration_accounts_default ON public.integration_accounts(roofing_company_id, integration_type, is_default) WHERE is_default = true;

COMMENT ON TABLE public.integration_accounts IS 'OAuth tokens and credentials for third-party integrations (Block 233000)';

-- ============================================================================
-- PART 2 — CREATE webhooks_outgoing TABLE
-- ============================================================================
-- Stores outbound webhook configurations (Zapier-style)

CREATE TABLE IF NOT EXISTS public.webhooks_outgoing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Webhook Configuration
  name text NOT NULL, -- "Invoice Created Webhook", "Job Status Changed", etc.
  url text NOT NULL,
  secret text, -- HMAC secret for webhook signature verification
  method text DEFAULT 'POST' CHECK (method IN ('POST', 'PUT', 'PATCH')),
  
  -- Event Triggers (JSONB array of event types)
  event_types text[] NOT NULL, -- e.g., ['invoice.created', 'job.status_changed', 'lead.hot']
  
  -- Payload Configuration
  payload_template jsonb DEFAULT '{}'::jsonb, -- Custom payload structure
  
  -- Status
  is_active boolean DEFAULT true,
  
  -- Metadata
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_outgoing_company ON public.webhooks_outgoing(roofing_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_webhooks_outgoing_events ON public.webhooks_outgoing USING GIN(event_types);

COMMENT ON TABLE public.webhooks_outgoing IS 'Outbound webhook configurations for Zapier-style integrations (Block 233000)';

-- ============================================================================
-- PART 3 — CREATE webhook_event_logs TABLE
-- ============================================================================
-- Logs all webhook execution attempts for debugging and monitoring

CREATE TABLE IF NOT EXISTS public.webhook_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES public.webhooks_outgoing(id) ON DELETE CASCADE,
  
  -- Event Details
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb, -- The event payload that triggered the webhook
  
  -- Execution Details
  payload_sent jsonb DEFAULT '{}'::jsonb, -- What was actually sent to the webhook URL
  status text NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  response_code int,
  response_body text,
  error_message text,
  
  -- Retry Information
  retry_count int DEFAULT 0,
  max_retries int DEFAULT 3,
  
  -- Timing
  executed_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  duration_ms int
);

CREATE INDEX IF NOT EXISTS idx_webhook_event_logs_webhook ON public.webhook_event_logs(webhook_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_event_logs_status ON public.webhook_event_logs(status, executed_at DESC) WHERE status IN ('failed', 'retrying');
CREATE INDEX IF NOT EXISTS idx_webhook_event_logs_event_type ON public.webhook_event_logs(event_type, executed_at DESC);

COMMENT ON TABLE public.webhook_event_logs IS 'Execution logs for outbound webhooks (Block 233000)';

-- ============================================================================
-- PART 4 — CREATE supplier_orders TABLE (for supplier integrations)
-- ============================================================================
-- Tracks material orders submitted to suppliers

CREATE TABLE IF NOT EXISTS public.supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  job_id uuid, -- References jobs table (if exists)
  
  -- Supplier Information
  supplier_type text NOT NULL CHECK (supplier_type IN ('abc_supply', 'beacon', 'srs_distribution', 'custom')),
  supplier_name text NOT NULL,
  supplier_order_id text, -- External order ID from supplier system
  
  -- Order Details
  order_data jsonb NOT NULL DEFAULT '{}'::jsonb, -- Full order details (materials, quantities, etc.)
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  
  -- Delivery Information
  estimated_delivery_date date,
  actual_delivery_date date,
  delivery_address text,
  
  -- Webhook Tracking
  webhook_url text, -- Supplier webhook URL for status updates (future)
  last_webhook_received_at timestamptz,
  
  -- Metadata
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_orders_company ON public.supplier_orders(roofing_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_status ON public.supplier_orders(roofing_company_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_supplier ON public.supplier_orders(supplier_type, supplier_order_id) WHERE supplier_order_id IS NOT NULL;

COMMENT ON TABLE public.supplier_orders IS 'Material orders submitted to suppliers (Block 233000)';

-- ============================================================================
-- PART 5 — CREATE calendar_events TABLE (for calendar sync)
-- ============================================================================
-- Tracks calendar events synced to external calendars

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Event Source
  source_type text NOT NULL CHECK (source_type IN ('job', 'appointment', 'crew_assignment', 'inspection', 'custom')),
  source_id uuid, -- References the source entity (job_id, appointment_id, etc.)
  
  -- Event Details
  title text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  location text,
  attendees jsonb DEFAULT '[]'::jsonb, -- Array of { email, name }
  
  -- External Calendar Sync
  external_calendar_id text, -- Google Calendar event ID, Outlook event ID, etc.
  external_calendar_type text CHECK (external_calendar_type IN ('google', 'outlook', 'apple')),
  integration_account_id uuid REFERENCES public.integration_accounts(id) ON DELETE SET NULL,
  
  -- ICS Feed (for crew calendars)
  crew_id uuid, -- References crews table (if exists)
  ics_feed_token text, -- Secret token for ICS feed URL
  
  -- Status
  is_synced boolean DEFAULT false,
  last_synced_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_company ON public.calendar_events(roofing_company_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_events_source ON public.calendar_events(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_crew ON public.calendar_events(crew_id, start_time DESC) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_ics_token ON public.calendar_events(ics_feed_token) WHERE ics_feed_token IS NOT NULL;

COMMENT ON TABLE public.calendar_events IS 'Calendar events synced to external calendars (Block 233000)';

-- ============================================================================
-- PART 6 — ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.integration_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks_outgoing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is a member of the roofing company
CREATE OR REPLACE FUNCTION public.is_roofing_company_member(_roofing_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.roofing_company_members
    WHERE roofing_company_id = _roofing_company_id
    AND user_id = auth.uid()
    AND status = 'active'
  );
$$;

-- RLS Policies for integration_accounts
CREATE POLICY "integration_accounts_select" ON public.integration_accounts
  FOR SELECT USING (is_roofing_company_member(roofing_company_id));

CREATE POLICY "integration_accounts_insert" ON public.integration_accounts
  FOR INSERT WITH CHECK (is_roofing_company_member(roofing_company_id));

CREATE POLICY "integration_accounts_update" ON public.integration_accounts
  FOR UPDATE USING (is_roofing_company_member(roofing_company_id));

CREATE POLICY "integration_accounts_delete" ON public.integration_accounts
  FOR DELETE USING (is_roofing_company_member(roofing_company_id));

-- RLS Policies for webhooks_outgoing
CREATE POLICY "webhooks_outgoing_select" ON public.webhooks_outgoing
  FOR SELECT USING (is_roofing_company_member(roofing_company_id));

CREATE POLICY "webhooks_outgoing_insert" ON public.webhooks_outgoing
  FOR INSERT WITH CHECK (is_roofing_company_member(roofing_company_id));

CREATE POLICY "webhooks_outgoing_update" ON public.webhooks_outgoing
  FOR UPDATE USING (is_roofing_company_member(roofing_company_id));

CREATE POLICY "webhooks_outgoing_delete" ON public.webhooks_outgoing
  FOR DELETE USING (is_roofing_company_member(roofing_company_id));

-- RLS Policies for webhook_event_logs (users can view logs for webhooks they have access to)
CREATE POLICY "webhook_event_logs_select" ON public.webhook_event_logs
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM public.webhooks_outgoing w
      WHERE w.id = webhook_event_logs.webhook_id
      AND is_roofing_company_member(w.roofing_company_id)
    )
  );

-- RLS Policies for supplier_orders
CREATE POLICY "supplier_orders_select" ON public.supplier_orders
  FOR SELECT USING (is_roofing_company_member(roofing_company_id));

CREATE POLICY "supplier_orders_insert" ON public.supplier_orders
  FOR INSERT WITH CHECK (is_roofing_company_member(roofing_company_id));

CREATE POLICY "supplier_orders_update" ON public.supplier_orders
  FOR UPDATE USING (is_roofing_company_member(roofing_company_id));

CREATE POLICY "supplier_orders_delete" ON public.supplier_orders
  FOR DELETE USING (is_roofing_company_member(roofing_company_id));

-- RLS Policies for calendar_events
CREATE POLICY "calendar_events_select" ON public.calendar_events
  FOR SELECT USING (is_roofing_company_member(roofing_company_id));

CREATE POLICY "calendar_events_insert" ON public.calendar_events
  FOR INSERT WITH CHECK (is_roofing_company_member(roofing_company_id));

CREATE POLICY "calendar_events_update" ON public.calendar_events
  FOR UPDATE USING (is_roofing_company_member(roofing_company_id));

CREATE POLICY "calendar_events_delete" ON public.calendar_events
  FOR DELETE USING (is_roofing_company_member(roofing_company_id));

-- ============================================================================
-- PART 7 — TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_integration_accounts_updated_at
  BEFORE UPDATE ON public.integration_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_webhooks_outgoing_updated_at
  BEFORE UPDATE ON public.webhooks_outgoing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_supplier_orders_updated_at
  BEFORE UPDATE ON public.supplier_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

























