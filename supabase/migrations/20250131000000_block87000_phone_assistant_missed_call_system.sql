-- =========================================================
-- Block 87000 — SmartSend Phone Assistant + Missed Call Text-Back System v1
-- =========================================================
-- This block transforms SmartSend into a 24/7 phone receptionist
-- that NEVER misses a lead for roofing companies.

-- ============================================================================
-- PART 1 — PHONE NUMBERS TABLE
-- ============================================================================
-- Phone numbers assigned to companies for call handling

CREATE TABLE IF NOT EXISTS public.phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  number text NOT NULL,                    -- E.164 format phone number
  call_forwarding_number text,             -- Number to forward calls to (if not AI)
  ai_assistant_enabled boolean DEFAULT false,
  text_back_enabled boolean DEFAULT true,  -- Auto text-back on missed calls
  twilio_phone_sid text,                   -- Twilio phone number SID
  is_active boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique phone numbers
  CONSTRAINT unique_phone_number UNIQUE (number)
);

CREATE INDEX IF NOT EXISTS idx_phone_numbers_company ON public.phone_numbers(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phone_numbers_org ON public.phone_numbers(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phone_numbers_workspace ON public.phone_numbers(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phone_numbers_active ON public.phone_numbers(is_active) WHERE is_active = true;

-- ============================================================================
-- PART 2 — CALL LOGS TABLE
-- ============================================================================
-- Logs all incoming/outgoing calls with status, transcription, and AI summary

CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  
  from_number text NOT NULL,                -- Caller's phone number
  to_number text NOT NULL,                  -- Company's phone number
  call_status text NOT NULL CHECK (call_status IN ('answered', 'missed', 'voicemail', 'ai_answered', 'busy', 'failed', 'no_answer')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_seconds integer,
  
  -- Twilio metadata
  twilio_call_sid text UNIQUE,              -- Twilio call SID
  twilio_recording_url text,                -- URL to call recording
  twilio_recording_sid text,
  
  -- AI processing
  transcript text,                          -- Full call transcript
  ai_summary text,                          -- AI-generated summary
  ai_intent text,                           -- Detected intent (high, medium, low)
  ai_urgency text,                          -- urgent, normal, low
  captured_name text,                       -- Homeowner name captured
  captured_address text,                    -- Address captured
  captured_issue text,                     -- Issue description captured
  inspection_booked boolean DEFAULT false,
  inspection_date timestamptz,
  
  -- Lead linkage
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_company ON public.call_logs(company_id, started_at DESC) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_logs_org ON public.call_logs(org_id, started_at DESC) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_logs_workspace ON public.call_logs(workspace_id, started_at DESC) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_logs_status ON public.call_logs(call_status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_from_number ON public.call_logs(from_number);
CREATE INDEX IF NOT EXISTS idx_call_logs_to_number ON public.call_logs(to_number);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON public.call_logs(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_logs_twilio_sid ON public.call_logs(twilio_call_sid) WHERE twilio_call_sid IS NOT NULL;

-- ============================================================================
-- PART 3 — MISSED CALL TEXTS TABLE
-- ============================================================================
-- Tracks text-back messages sent after missed calls

CREATE TABLE IF NOT EXISTS public.missed_call_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  
  call_id uuid REFERENCES public.call_logs(id) ON DELETE CASCADE,
  homeowner_number text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'read')),
  twilio_message_sid text,
  
  -- Response tracking
  homeowner_responded boolean DEFAULT false,
  response_received_at timestamptz,
  conversation_created boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missed_call_texts_company ON public.missed_call_texts(company_id, created_at DESC) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_missed_call_texts_call ON public.missed_call_texts(call_id);
CREATE INDEX IF NOT EXISTS idx_missed_call_texts_status ON public.missed_call_texts(status);
CREATE INDEX IF NOT EXISTS idx_missed_call_texts_homeowner ON public.missed_call_texts(homeowner_number);

-- ============================================================================
-- PART 4 — AI PHONE SETTINGS TABLE
-- ============================================================================
-- Configuration for AI phone assistant behavior

CREATE TABLE IF NOT EXISTS public.ai_phone_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- AI Assistant Configuration
  greeting text DEFAULT 'Hi, thanks for calling [Company Name]. How can we help with your roof today?',
  script text,                              -- Full AI conversation script (JSONB)
  fallback_number text,                     -- Number to forward to if AI can't handle
  
  -- Data Capture Settings
  capture_name boolean DEFAULT true,
  capture_address boolean DEFAULT true,
  capture_issue boolean DEFAULT true,
  capture_phone boolean DEFAULT true,
  capture_email boolean DEFAULT false,
  
  -- Business Hours
  business_hours_start time DEFAULT '08:00:00',
  business_hours_end time DEFAULT '18:00:00',
  business_days integer[] DEFAULT ARRAY[1,2,3,4,5], -- 1=Monday, 7=Sunday
  timezone text DEFAULT 'America/Chicago',
  
  -- After-Hours Behavior
  after_hours_enabled boolean DEFAULT true,
  after_hours_message text DEFAULT 'We''re closed right now, but I can still get you scheduled for an inspection. What happened to your roof?',
  
  -- Storm Mode
  storm_mode_enabled boolean DEFAULT true,
  storm_mode_active boolean DEFAULT false,
  storm_mode_message text DEFAULT 'We''re currently helping many homeowners after last night''s storm. We can get you scheduled for an inspection today or tomorrow — what works best?',
  
  -- Auto-Lead Creation
  auto_create_lead boolean DEFAULT true,
  auto_create_lead_on_missed boolean DEFAULT true,
  auto_create_lead_on_ai_answered boolean DEFAULT true,
  auto_create_lead_on_voicemail boolean DEFAULT true,
  
  -- Intent Classification
  high_intent_keywords text[] DEFAULT ARRAY['leak', 'emergency', 'urgent', 'storm', 'damage', 'water', 'now', 'today'],
  medium_intent_keywords text[] DEFAULT ARRAY['estimate', 'quote', 'inspection', 'repair', 'replace'],
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- One settings record per company/org/workspace
  CONSTRAINT unique_ai_phone_settings_company UNIQUE (company_id) WHERE company_id IS NOT NULL,
  CONSTRAINT unique_ai_phone_settings_org UNIQUE (org_id) WHERE org_id IS NOT NULL,
  CONSTRAINT unique_ai_phone_settings_workspace UNIQUE (workspace_id) WHERE workspace_id IS NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_phone_settings_company ON public.ai_phone_settings(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_phone_settings_org ON public.ai_phone_settings(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_phone_settings_workspace ON public.ai_phone_settings(workspace_id) WHERE workspace_id IS NOT NULL;

-- ============================================================================
-- PART 5 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_phone_numbers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_call_logs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_missed_call_texts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ai_phone_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_phone_numbers_updated_at ON public.phone_numbers;
CREATE TRIGGER trg_phone_numbers_updated_at
BEFORE UPDATE ON public.phone_numbers
FOR EACH ROW
EXECUTE FUNCTION public.set_phone_numbers_updated_at();

DROP TRIGGER IF EXISTS trg_call_logs_updated_at ON public.call_logs;
CREATE TRIGGER trg_call_logs_updated_at
BEFORE UPDATE ON public.call_logs
FOR EACH ROW
EXECUTE FUNCTION public.set_call_logs_updated_at();

DROP TRIGGER IF EXISTS trg_missed_call_texts_updated_at ON public.missed_call_texts;
CREATE TRIGGER trg_missed_call_texts_updated_at
BEFORE UPDATE ON public.missed_call_texts
FOR EACH ROW
EXECUTE FUNCTION public.set_missed_call_texts_updated_at();

DROP TRIGGER IF EXISTS trg_ai_phone_settings_updated_at ON public.ai_phone_settings;
CREATE TRIGGER trg_ai_phone_settings_updated_at
BEFORE UPDATE ON public.ai_phone_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_ai_phone_settings_updated_at();

-- ============================================================================
-- PART 6 — HELPER FUNCTIONS
-- ============================================================================

-- Function to check if current time is after hours
CREATE OR REPLACE FUNCTION public.is_after_hours(
  p_company_id uuid DEFAULT NULL,
  p_org_id uuid DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_settings public.ai_phone_settings;
  v_current_time time;
  v_current_day integer;
  v_timezone text;
BEGIN
  -- Get settings
  SELECT * INTO v_settings
  FROM public.ai_phone_settings
  WHERE (p_company_id IS NOT NULL AND company_id = p_company_id)
     OR (p_org_id IS NOT NULL AND org_id = p_org_id)
     OR (p_workspace_id IS NOT NULL AND workspace_id = p_workspace_id)
  LIMIT 1;
  
  IF v_settings IS NULL THEN
    -- Default: after hours if outside 8am-6pm
    v_current_time := (now() AT TIME ZONE COALESCE(v_timezone, 'America/Chicago'))::time;
    RETURN v_current_time < '08:00:00' OR v_current_time > '18:00:00';
  END IF;
  
  v_timezone := COALESCE(v_settings.timezone, 'America/Chicago');
  v_current_time := (now() AT TIME ZONE v_timezone)::time;
  v_current_day := EXTRACT(DOW FROM now() AT TIME ZONE v_timezone)::integer;
  
  -- Check if current day is a business day
  IF NOT (v_current_day = ANY(v_settings.business_days)) THEN
    RETURN true; -- Weekend/holiday = after hours
  END IF;
  
  -- Check if current time is outside business hours
  RETURN v_current_time < v_settings.business_hours_start 
      OR v_current_time > v_settings.business_hours_end;
END;
$$;

-- Function to detect storm mode (placeholder - can be enhanced with weather API)
CREATE OR REPLACE FUNCTION public.check_storm_mode(
  p_company_id uuid DEFAULT NULL,
  p_org_id uuid DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_settings public.ai_phone_settings;
BEGIN
  SELECT * INTO v_settings
  FROM public.ai_phone_settings
  WHERE (p_company_id IS NOT NULL AND company_id = p_company_id)
     OR (p_org_id IS NOT NULL AND org_id = p_org_id)
     OR (p_workspace_id IS NOT NULL AND workspace_id = p_workspace_id)
  LIMIT 1;
  
  IF v_settings IS NULL THEN
    RETURN false;
  END IF;
  
  -- Return manual storm mode flag
  -- TODO: Integrate with weather API for automatic detection
  RETURN v_settings.storm_mode_active AND v_settings.storm_mode_enabled;
END;
$$;

-- Function to classify call intent
CREATE OR REPLACE FUNCTION public.classify_call_intent(
  p_transcript text,
  p_high_intent_keywords text[] DEFAULT ARRAY['leak', 'emergency', 'urgent', 'storm', 'damage', 'water', 'now', 'today'],
  p_medium_intent_keywords text[] DEFAULT ARRAY['estimate', 'quote', 'inspection', 'repair', 'replace']
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_lower_transcript text;
BEGIN
  IF p_transcript IS NULL OR length(trim(p_transcript)) = 0 THEN
    RETURN 'low';
  END IF;
  
  v_lower_transcript := lower(p_transcript);
  
  -- Check for high intent keywords
  IF EXISTS (
    SELECT 1 FROM unnest(p_high_intent_keywords) AS keyword
    WHERE v_lower_transcript LIKE '%' || keyword || '%'
  ) THEN
    RETURN 'high';
  END IF;
  
  -- Check for medium intent keywords
  IF EXISTS (
    SELECT 1 FROM unnest(p_medium_intent_keywords) AS keyword
    WHERE v_lower_transcript LIKE '%' || keyword || '%'
  ) THEN
    RETURN 'medium';
  END IF;
  
  RETURN 'low';
END;
$$;

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missed_call_texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_phone_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to check company access
CREATE OR REPLACE FUNCTION public.has_phone_access(
  p_company_id uuid DEFAULT NULL,
  p_org_id uuid DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- Check company access
  IF p_company_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = p_company_id
        AND (rc.owner_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.org_memberships om
          WHERE om.org_id = rc.org_id AND om.user_id = auth.uid() AND om.status = 'active'
        ))
    );
  END IF;
  
  -- Check org access
  IF p_org_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.org_id = p_org_id AND om.user_id = auth.uid() AND om.status = 'active'
    );
  END IF;
  
  -- Check workspace access
  IF p_workspace_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = p_workspace_id AND wm.user_id = auth.uid()
    );
  END IF;
  
  RETURN false;
END;
$$;

-- RLS Policies for phone_numbers
DROP POLICY IF EXISTS "phone_numbers_select" ON public.phone_numbers;
CREATE POLICY "phone_numbers_select" ON public.phone_numbers
  FOR SELECT
  USING (
    has_phone_access(company_id, org_id, workspace_id)
  );

DROP POLICY IF EXISTS "phone_numbers_modify" ON public.phone_numbers;
CREATE POLICY "phone_numbers_modify" ON public.phone_numbers
  FOR ALL
  USING (
    has_phone_access(company_id, org_id, workspace_id)
  )
  WITH CHECK (
    has_phone_access(company_id, org_id, workspace_id)
  );

-- RLS Policies for call_logs
DROP POLICY IF EXISTS "call_logs_select" ON public.call_logs;
CREATE POLICY "call_logs_select" ON public.call_logs
  FOR SELECT
  USING (
    has_phone_access(company_id, org_id, workspace_id)
  );

DROP POLICY IF EXISTS "call_logs_insert" ON public.call_logs;
CREATE POLICY "call_logs_insert" ON public.call_logs
  FOR INSERT
  WITH CHECK (
    has_phone_access(company_id, org_id, workspace_id)
  );

DROP POLICY IF EXISTS "call_logs_update" ON public.call_logs;
CREATE POLICY "call_logs_update" ON public.call_logs
  FOR UPDATE
  USING (
    has_phone_access(company_id, org_id, workspace_id)
  )
  WITH CHECK (
    has_phone_access(company_id, org_id, workspace_id)
  );

-- RLS Policies for missed_call_texts
DROP POLICY IF EXISTS "missed_call_texts_select" ON public.missed_call_texts;
CREATE POLICY "missed_call_texts_select" ON public.missed_call_texts
  FOR SELECT
  USING (
    has_phone_access(company_id, org_id, workspace_id)
  );

DROP POLICY IF EXISTS "missed_call_texts_modify" ON public.missed_call_texts;
CREATE POLICY "missed_call_texts_modify" ON public.missed_call_texts
  FOR ALL
  USING (
    has_phone_access(company_id, org_id, workspace_id)
  )
  WITH CHECK (
    has_phone_access(company_id, org_id, workspace_id)
  );

-- RLS Policies for ai_phone_settings
DROP POLICY IF EXISTS "ai_phone_settings_select" ON public.ai_phone_settings;
CREATE POLICY "ai_phone_settings_select" ON public.ai_phone_settings
  FOR SELECT
  USING (
    has_phone_access(company_id, org_id, workspace_id)
  );

DROP POLICY IF EXISTS "ai_phone_settings_modify" ON public.ai_phone_settings;
CREATE POLICY "ai_phone_settings_modify" ON public.ai_phone_settings
  FOR ALL
  USING (
    has_phone_access(company_id, org_id, workspace_id)
  )
  WITH CHECK (
    has_phone_access(company_id, org_id, workspace_id)
  );

-- ============================================================================
-- PART 8 — GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.phone_numbers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missed_call_texts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_phone_settings TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_after_hours(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_storm_mode(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classify_call_intent(text, text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_phone_access(uuid, uuid, uuid) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.phone_numbers IS 'Phone numbers assigned to companies for call handling (Block 87000)';
COMMENT ON TABLE public.call_logs IS 'Logs all incoming/outgoing calls with transcription and AI summary (Block 87000)';
COMMENT ON TABLE public.missed_call_texts IS 'Text-back messages sent after missed calls (Block 87000)';
COMMENT ON TABLE public.ai_phone_settings IS 'AI phone assistant configuration and settings (Block 87000)';



























