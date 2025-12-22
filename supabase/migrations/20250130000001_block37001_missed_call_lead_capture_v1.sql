-- Block 37001 — SmartSend Roofing "Missed Call → Instant Textback + Lead Capture Engine" v1
-- Turn every missed call into a booked estimate • Auto-text homeowners instantly • Capture name/address/problem • Push into SmartSend as a lead

-- =========================================================
-- PART 1: MISSED CALLS TABLE
-- =========================================================

CREATE TABLE IF NOT EXISTS public.missed_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  phone text NOT NULL,
  call_time timestamptz NOT NULL DEFAULT now(),
  call_duration_seconds integer,
  call_sid text, -- Twilio/Vonage call SID
  processed boolean DEFAULT false,
  created_lead_id uuid,
  emergency boolean DEFAULT false,
  after_hours boolean DEFAULT false,
  company_name text, -- Company name for personalized textback
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_missed_calls_workspace ON public.missed_calls(workspace_id);
CREATE INDEX IF NOT EXISTS idx_missed_calls_phone ON public.missed_calls(phone);
CREATE INDEX IF NOT EXISTS idx_missed_calls_call_time ON public.missed_calls(call_time);
CREATE INDEX IF NOT EXISTS idx_missed_calls_processed ON public.missed_calls(processed);
CREATE INDEX IF NOT EXISTS idx_missed_calls_emergency ON public.missed_calls(emergency);

-- =========================================================
-- PART 2: CALL LEAD CAPTURE CONVERSATION TABLE
-- =========================================================

CREATE TABLE IF NOT EXISTS public.call_lead_capture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  missed_call_id uuid REFERENCES public.missed_calls(id) ON DELETE CASCADE,
  lead_id uuid, -- References leads table (flexible - may not exist yet)
  workspace_id uuid,
  step text NOT NULL, -- 'name', 'address', 'problem', 'schedule', 'complete'
  value text,
  message_text text, -- Full message from homeowner
  ai_extracted_data jsonb DEFAULT '{}'::jsonb, -- Structured data extracted by AI
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_call_lead_capture_missed_call ON public.call_lead_capture(missed_call_id);
CREATE INDEX IF NOT EXISTS idx_call_lead_capture_lead ON public.call_lead_capture(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_lead_capture_workspace ON public.call_lead_capture(workspace_id);
CREATE INDEX IF NOT EXISTS idx_call_lead_capture_step ON public.call_lead_capture(step);

-- =========================================================
-- PART 3: UPDATE TRIGGERS
-- =========================================================

CREATE OR REPLACE FUNCTION public.set_missed_calls_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_missed_calls_updated_at ON public.missed_calls;
CREATE TRIGGER trg_missed_calls_updated_at
BEFORE UPDATE ON public.missed_calls
FOR EACH ROW
EXECUTE FUNCTION public.set_missed_calls_updated_at();

-- =========================================================
-- PART 4: HELPER FUNCTIONS
-- =========================================================

-- Function to check if time is after hours (6pm-8am)
CREATE OR REPLACE FUNCTION public.is_after_hours(check_time timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  hour_val integer;
BEGIN
  hour_val := EXTRACT(HOUR FROM check_time);
  RETURN hour_val >= 18 OR hour_val < 8;
END;
$$;

-- Function to detect emergency keywords in text
CREATE OR REPLACE FUNCTION public.detect_emergency_keywords(text_content text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  keywords text[] := ARRAY['leak', 'water', 'dripping', 'ceiling', 'emergency', 'storm damage', 'urgent', 'flooding', 'damage'];
  lower_text text;
  keyword text;
BEGIN
  lower_text := LOWER(text_content);
  FOREACH keyword IN ARRAY keywords
  LOOP
    IF lower_text LIKE '%' || keyword || '%' THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

-- =========================================================
-- PART 5: RLS POLICIES
-- =========================================================

ALTER TABLE public.missed_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_lead_capture ENABLE ROW LEVEL SECURITY;

-- RLS for missed_calls: workspace members can access their workspace's missed calls
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'missed_calls' 
    AND policyname = 'missed_calls_workspace_access'
  ) THEN
    CREATE POLICY "missed_calls_workspace_access"
    ON public.missed_calls
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- RLS for call_lead_capture: workspace members can access their workspace's captures
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'call_lead_capture' 
    AND policyname = 'call_lead_capture_workspace_access'
  ) THEN
    CREATE POLICY "call_lead_capture_workspace_access"
    ON public.call_lead_capture
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Allow service role full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'missed_calls' 
    AND policyname = 'missed_calls_service_role_all'
  ) THEN
    CREATE POLICY "missed_calls_service_role_all"
    ON public.missed_calls
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'call_lead_capture' 
    AND policyname = 'call_lead_capture_service_role_all'
  ) THEN
    CREATE POLICY "call_lead_capture_service_role_all"
    ON public.call_lead_capture
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- =========================================================
-- PART 6: VIEWS FOR DASHBOARD
-- =========================================================

-- View: Missed call recovery stats
CREATE OR REPLACE VIEW public.missed_call_recovery_stats AS
SELECT 
  workspace_id,
  COUNT(*) as total_missed_calls,
  COUNT(*) FILTER (WHERE processed = true) as processed_calls,
  COUNT(*) FILTER (WHERE created_lead_id IS NOT NULL) as leads_created,
  COUNT(*) FILTER (WHERE emergency = true) as emergency_calls,
  COUNT(*) FILTER (WHERE after_hours = true) as after_hours_calls,
  ROUND(
    (COUNT(*) FILTER (WHERE created_lead_id IS NOT NULL)::numeric / 
     NULLIF(COUNT(*), 0)) * 100, 
    2
  ) as recovery_rate_percent,
  DATE_TRUNC('day', call_time) as call_date
FROM public.missed_calls
GROUP BY workspace_id, DATE_TRUNC('day', call_time);

-- Grant access to authenticated users
GRANT SELECT ON public.missed_call_recovery_stats TO authenticated;
































