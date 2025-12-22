-- =========================================================
-- Block 140000 — SmartSend Roofing Website Widget + Instant Lead Capture Chatbot v1
-- =========================================================
-- Every site visitor → chat
-- Every chat → captured lead
-- Every captured lead → SmartSend pipeline

-- 1) WEBSITE LEAD SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.webchat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  created_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  step int DEFAULT 1,  -- 1=name, 2=contact, 3=address, 4=problem, 99=done
  collected_data jsonb DEFAULT '{}'::jsonb,  -- Store name, contact, address, problem as we collect
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webchat_sessions_company ON public.webchat_sessions(roofing_company_id);
CREATE INDEX IF NOT EXISTS idx_webchat_sessions_token ON public.webchat_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_webchat_sessions_lead ON public.webchat_sessions(created_lead_id) WHERE created_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webchat_sessions_started ON public.webchat_sessions(started_at DESC);

-- 2) WEBSITE CHAT MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.webchat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.webchat_sessions(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('visitor', 'bot')),
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webchat_messages_session ON public.webchat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_webchat_messages_sender ON public.webchat_messages(sender);

-- 3) WIDGET SETTINGS TABLE (per roofing company)
CREATE TABLE IF NOT EXISTS public.widget_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE UNIQUE,
  primary_color text DEFAULT '#F97316',   -- orange / brand color
  welcome_message text DEFAULT 'Hey! Need help with your roof?',
  prompt_title text DEFAULT 'Tell us what''s going on with your roof:',
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_widget_settings_company ON public.widget_settings(roofing_company_id);

-- Updated_at trigger for widget_settings
CREATE OR REPLACE FUNCTION public.set_widget_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_widget_settings_updated_at ON public.widget_settings;
CREATE TRIGGER trg_widget_settings_updated_at
BEFORE UPDATE ON public.widget_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_widget_settings_updated_at();

-- 4) ENABLE RLS
ALTER TABLE public.webchat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_settings ENABLE ROW LEVEL SECURITY;

-- RLS: Widget settings - company owners can manage their own
CREATE POLICY "widget_settings: company owners can manage"
  ON public.widget_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = widget_settings.roofing_company_id
      AND rc.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = widget_settings.roofing_company_id
      AND rc.owner_id = auth.uid()
    )
  );

-- RLS: Webchat sessions - public read for widget, company owners can view
CREATE POLICY "webchat_sessions: public read by token"
  ON public.webchat_sessions
  FOR SELECT
  USING (true);  -- Public read via session_token (no auth required for widget)

CREATE POLICY "webchat_sessions: company owners can view"
  ON public.webchat_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = webchat_sessions.roofing_company_id
      AND rc.owner_id = auth.uid()
    )
  );

-- RLS: Webchat messages - public insert for widget, company owners can view
CREATE POLICY "webchat_messages: public insert"
  ON public.webchat_messages
  FOR INSERT
  WITH CHECK (true);  -- Public insert (no auth required for widget)

CREATE POLICY "webchat_messages: company owners can view"
  ON public.webchat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.webchat_sessions ws
      JOIN public.roofing_companies rc ON rc.id = ws.roofing_company_id
      WHERE ws.id = webchat_messages.session_id
      AND rc.owner_id = auth.uid()
    )
  );

-- 5) HELPER FUNCTION: Create lead from webchat session
CREATE OR REPLACE FUNCTION public.create_lead_from_webchat(
  p_session_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_record public.webchat_sessions%ROWTYPE;
  v_company_record public.roofing_companies%ROWTYPE;
  v_lead_id uuid;
  v_name text;
  v_contact text;
  v_address text;
  v_problem text;
  v_email text;
  v_phone text;
BEGIN
  -- Get session data
  SELECT * INTO v_session_record
  FROM public.webchat_sessions
  WHERE id = p_session_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  
  -- Get company data
  SELECT * INTO v_company_record
  FROM public.roofing_companies
  WHERE id = v_session_record.roofing_company_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;
  
  -- Extract collected data
  v_name := v_session_record.collected_data->>'name';
  v_contact := v_session_record.collected_data->>'contact';
  v_address := v_session_record.collected_data->>'address';
  v_problem := v_session_record.collected_data->>'problem';
  
  -- Parse contact (could be email or phone)
  IF v_contact ~ '@' THEN
    v_email := v_contact;
  ELSE
    v_phone := v_contact;
    -- If only phone provided, create a placeholder email to satisfy NOT NULL constraint
    -- Format: widget-{session_id}@smartsend-widget.local
    v_email := 'widget-' || p_session_id::text || '@smartsend-widget.local';
  END IF;
  
  -- Create lead
  INSERT INTO public.leads (
    workspace_id,
    roofing_company_id,
    name,
    email,
    phone,
    address,
    notes,
    source,
    status,
    heat_score
  )
  VALUES (
    v_company_record.workspace_id,
    v_company_record.id,
    v_name,
    v_email,
    v_phone,
    v_address,
    COALESCE(v_problem, '') || E'\n\n[Source: Website Widget Chat]',
    'website-widget',
    'new',
    50  -- Default warm heat score for widget leads
  )
  RETURNING id INTO v_lead_id;
  
  -- Update session
  UPDATE public.webchat_sessions
  SET created_lead_id = v_lead_id,
      ended_at = now(),
      step = 99
  WHERE id = p_session_id;
  
  RETURN v_lead_id;
END;
$$;

COMMENT ON FUNCTION public.create_lead_from_webchat IS 'Block 140000: Creates a lead from a completed webchat session and links it back to the session';

-- 6) COMMENTS
COMMENT ON TABLE public.webchat_sessions IS 'Block 140000: Website widget chat sessions - tracks visitor conversations';
COMMENT ON TABLE public.webchat_messages IS 'Block 140000: Individual messages within webchat sessions';
COMMENT ON TABLE public.widget_settings IS 'Block 140000: Per-company widget configuration (colors, messages, enabled/disabled)';


























