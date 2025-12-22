-- =========================================================
-- Block 25860 — SmartSend Roofing API v1 (Developer Mode)
-- (Read/Write API • Webhooks • Integrations for Large Roofing Organizations • Custom Automations • External Data Sync)
-- =========================================================

-- ============================================================================
-- PART 1: EXTEND API KEYS WITH SCOPES AND IP WHITELISTING
-- ============================================================================

-- Add scopes to API keys (comma-separated list of permissions)
ALTER TABLE IF EXISTS public.api_keys
  ADD COLUMN IF NOT EXISTS scopes text[] DEFAULT ARRAY['read', 'write']::text[],
  ADD COLUMN IF NOT EXISTS ip_whitelist text[], -- Array of allowed IP addresses/CIDR blocks
  ADD COLUMN IF NOT EXISTS is_sandbox boolean DEFAULT false, -- Sandbox/test mode
  ADD COLUMN IF NOT EXISTS environment text DEFAULT 'live' CHECK (environment IN ('live', 'test', 'sandbox'));

-- Index for sandbox keys
CREATE INDEX IF NOT EXISTS idx_api_keys_environment ON public.api_keys(environment) WHERE revoked_at IS NULL;

-- ============================================================================
-- PART 2: EXTEND WEBHOOKS WITH ROOFING EVENTS
-- ============================================================================

-- Drop existing check constraint and recreate with roofing events
ALTER TABLE IF EXISTS public.webhooks
  DROP CONSTRAINT IF EXISTS webhooks_event_check;

ALTER TABLE IF EXISTS public.webhooks
  ADD CONSTRAINT webhooks_event_check CHECK (event IN (
    -- Lead events
    'lead.created',
    'lead.updated',
    'lead.replied',
    'lead.intent.changed',
    -- Quote/Proposal events
    'quote.sent',
    'quote.viewed',
    'quote.approved',
    'quote.declined',
    'proposal.sent',
    'proposal.viewed',
    'proposal.approved',
    -- Job events
    'job.created',
    'job.updated',
    'job.stage.changed',
    'job.completed',
    'job.cancelled',
    -- Material events
    'material.scheduled',
    'material.delivered',
    'material.shortage',
    -- Crew events
    'crew.assigned',
    'crew.check_in',
    'crew.check_out',
    'crew.completed',
    -- Weather events
    'weather.alert',
    'weather.risk',
    -- Payment events
    'payment.received',
    'payment.failed',
    'invoice.sent',
    'invoice.paid',
    -- Warranty events
    'warranty.generated',
    'warranty.sent',
    -- Review events
    'review.received',
    'review.published',
    -- Email events
    'email.sent',
    'email.open',
    'email.click',
    'email.reply',
    'email.bounce',
    'email.spam',
    -- Campaign events
    'broadcast.completed',
    'campaign.completed'
  ));

-- ============================================================================
-- PART 3: API SANDBOX TEST DATA TABLES
-- ============================================================================

-- Sandbox workspaces (for testing)
CREATE TABLE IF NOT EXISTS public.api_sandbox_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(api_key_id)
);

-- Sandbox test data tracking
CREATE TABLE IF NOT EXISTS public.api_sandbox_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  entity_type text NOT NULL, -- 'lead', 'job', 'quote', etc.
  entity_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sandbox_data_api_key ON public.api_sandbox_data(api_key_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_sandbox_data_entity ON public.api_sandbox_data(entity_type, entity_id);

-- ============================================================================
-- PART 4: WEBHOOK DELIVERY LOGGING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  response_code int,
  response_body text,
  attempt_count int DEFAULT 1,
  last_attempt_at timestamptz DEFAULT now(),
  next_retry_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON public.webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON public.webhook_deliveries(status) WHERE status IN ('pending', 'retrying');

-- ============================================================================
-- PART 5: HELPER FUNCTIONS
-- ============================================================================

-- Function to check if API key has required scope
CREATE OR REPLACE FUNCTION public.api_key_has_scope(
  p_api_key_id uuid,
  p_required_scope text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.api_keys
    WHERE id = p_api_key_id
      AND revoked_at IS NULL
      AND (scopes IS NULL OR p_required_scope = ANY(scopes))
  );
$$;

-- Function to check IP whitelist
CREATE OR REPLACE FUNCTION public.api_key_allows_ip(
  p_api_key_id uuid,
  p_client_ip text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.api_keys
    WHERE id = p_api_key_id
      AND revoked_at IS NULL
      AND (ip_whitelist IS NULL OR array_length(ip_whitelist, 1) IS NULL OR p_client_ip = ANY(ip_whitelist))
  );
$$;

-- Function to generate API key
CREATE OR REPLACE FUNCTION public.generate_api_key(
  p_workspace_id uuid,
  p_name text DEFAULT NULL,
  p_environment text DEFAULT 'live',
  p_scopes text[] DEFAULT ARRAY['read', 'write']::text[]
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_key_prefix text;
  v_key_suffix text;
  v_key text;
BEGIN
  -- Determine prefix based on environment
  IF p_environment = 'sandbox' OR p_environment = 'test' THEN
    v_key_prefix := 'ss_test_';
  ELSE
    v_key_prefix := 'ss_live_';
  END IF;
  
  -- Generate random suffix (32 characters)
  v_key_suffix := encode(gen_random_bytes(24), 'base64');
  v_key_suffix := translate(v_key_suffix, '+/', '-_');
  v_key_suffix := substring(v_key_suffix FROM 1 FOR 32);
  
  v_key := v_key_prefix || v_key_suffix;
  
  -- Insert API key
  INSERT INTO public.api_keys (workspace_id, key, name, environment, scopes, is_sandbox)
  VALUES (
    p_workspace_id,
    v_key,
    p_name,
    p_environment,
    p_scopes,
    (p_environment = 'sandbox' OR p_environment = 'test')
  );
  
  RETURN v_key;
END;
$$;

-- ============================================================================
-- PART 6: RLS POLICIES FOR NEW TABLES
-- ============================================================================

ALTER TABLE IF EXISTS public.api_sandbox_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.api_sandbox_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Sandbox tables: accessible by workspace members
CREATE POLICY "api_sandbox_workspaces_select" ON public.api_sandbox_workspaces
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = api_sandbox_workspaces.workspace_id
        AND workspace_members.user_id = auth.uid()
    )
  );

CREATE POLICY "api_sandbox_data_select" ON public.api_sandbox_data
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.api_keys ak
      JOIN public.workspace_members wm ON wm.workspace_id = ak.workspace_id
      WHERE ak.id = api_sandbox_data.api_key_id
        AND wm.user_id = auth.uid()
    )
  );

-- Webhook deliveries: accessible by workspace members
CREATE POLICY "webhook_deliveries_select" ON public.webhook_deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.webhooks w
      JOIN public.workspace_members wm ON wm.workspace_id = w.workspace_id
      WHERE w.id = webhook_deliveries.webhook_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 7: TRIGGERS FOR WEBHOOK DELIVERY
-- ============================================================================

-- Function to queue webhook delivery
CREATE OR REPLACE FUNCTION public.queue_webhook_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- This will be called from application code when events occur
  -- The trigger will insert into webhook_deliveries table
  RETURN NEW;
END;
$$;

-- ============================================================================
-- PART 8: API RATE LIMITS BY ENVIRONMENT
-- ============================================================================

-- Update rate limit function to respect environment
CREATE OR REPLACE FUNCTION public.check_rate_limit_v2(
  p_api_key_id uuid,
  p_limit_per_minute int DEFAULT 60,
  p_limit_per_day int DEFAULT 5000,
  p_environment text DEFAULT 'live'
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_minute_window timestamptz := date_trunc('minute', now());
  v_day_window timestamptz := date_trunc('day', now());
  v_minute_count int;
  v_day_count int;
  v_key_environment text;
BEGIN
  -- Get key environment
  SELECT environment INTO v_key_environment
  FROM public.api_keys
  WHERE id = p_api_key_id;
  
  -- Sandbox/test keys have higher limits
  IF v_key_environment IN ('sandbox', 'test') THEN
    p_limit_per_minute := p_limit_per_minute * 10;
    p_limit_per_day := p_limit_per_day * 10;
  END IF;
  
  -- Get current counts
  SELECT coalesce(sum(request_count), 0) INTO v_minute_count
  FROM public.api_rate_limits
  WHERE api_key_id = p_api_key_id
    AND window_start >= v_minute_window - interval '1 minute';
  
  SELECT coalesce(sum(request_count), 0) INTO v_day_count
  FROM public.api_rate_limits
  WHERE api_key_id = p_api_key_id
    AND window_start >= v_day_window;
  
  -- Check limits
  IF v_minute_count >= p_limit_per_minute OR v_day_count >= p_limit_per_day THEN
    RETURN false;
  END IF;
  
  -- Increment counter
  INSERT INTO public.api_rate_limits (api_key_id, window_start, request_count)
  VALUES (p_api_key_id, v_minute_window, 1)
  ON CONFLICT (api_key_id, window_start)
  DO UPDATE SET request_count = api_rate_limits.request_count + 1;
  
  RETURN true;
END;
$$;




































