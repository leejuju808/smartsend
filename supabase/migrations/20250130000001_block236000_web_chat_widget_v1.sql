-- =========================================================
-- Block 236000 — SmartSend Roofing "AI Website Chat Widget + 24/7 Lead Capture System" v1
-- =========================================================
-- This block turns every roofer's website into a LEAD-GENERATING MACHINE
-- AI-powered chat widget that captures leads 24/7 and syncs to SmartSend

-- 1) WEB_CHAT_SESSIONS
-- Tracks each visitor chat session on a roofing company's website
CREATE TABLE IF NOT EXISTS public.web_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  company_id UUID, -- Optional: link to roofing_companies if available
  
  -- Session tracking
  session_token TEXT NOT NULL UNIQUE, -- Unique token for anonymous visitors
  visitor_ip TEXT,
  visitor_user_agent TEXT,
  referrer_url TEXT,
  
  -- Lead association (set when lead is created)
  homeowner_id UUID REFERENCES public.homeowners(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Session state
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'converted', 'closed')),
  intent TEXT, -- AI-detected intent: 'estimate_request', 'emergency_leak', 'warranty_issue', 'general_question', 'shopping_estimates', 'high_urgency'
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent')),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_chat_sessions_workspace 
  ON public.web_chat_sessions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_chat_sessions_company 
  ON public.web_chat_sessions(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_chat_sessions_token 
  ON public.web_chat_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_web_chat_sessions_lead 
  ON public.web_chat_sessions(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_chat_sessions_status 
  ON public.web_chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_web_chat_sessions_intent 
  ON public.web_chat_sessions(intent);
CREATE INDEX IF NOT EXISTS idx_web_chat_sessions_urgency 
  ON public.web_chat_sessions(urgency) WHERE urgency = 'urgent';

-- 2) WEB_CHAT_MESSAGES
-- All messages in a chat session
CREATE TABLE IF NOT EXISTS public.web_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.web_chat_sessions(id) ON DELETE CASCADE,
  
  -- Message content
  sender TEXT NOT NULL CHECK (sender IN ('visitor', 'ai', 'agent')),
  message TEXT NOT NULL,
  
  -- AI metadata
  ai_intent TEXT, -- Intent detected from this message
  ai_confidence NUMERIC(3, 2), -- 0.00 to 1.00
  
  -- Agent info (if sent by agent)
  agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_chat_messages_session 
  ON public.web_chat_messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_web_chat_messages_sender 
  ON public.web_chat_messages(sender);
CREATE INDEX IF NOT EXISTS idx_web_chat_messages_intent 
  ON public.web_chat_messages(ai_intent) WHERE ai_intent IS NOT NULL;

-- 3) WEB_CHAT_LEAD_DATA
-- Collected lead information during chat
CREATE TABLE IF NOT EXISTS public.web_chat_lead_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.web_chat_sessions(id) ON DELETE CASCADE,
  
  -- Contact information
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  
  -- Roofing-specific fields
  property_type TEXT, -- 'residential', 'commercial'
  roof_type TEXT, -- 'asphalt', 'metal', 'tile', 'flat', etc.
  issue_type TEXT, -- 'repair', 'replacement', 'inspection', 'emergency'
  urgency_level TEXT, -- 'low', 'medium', 'high', 'emergency'
  preferred_contact_method TEXT, -- 'phone', 'email', 'text'
  preferred_time TEXT, -- 'morning', 'afternoon', 'evening', 'anytime'
  insurance_claim BOOLEAN DEFAULT FALSE,
  insurance_company TEXT,
  
  -- Additional notes
  notes TEXT,
  additional_info JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_chat_lead_data_session 
  ON public.web_chat_lead_data(session_id);
CREATE INDEX IF NOT EXISTS idx_web_chat_lead_data_email 
  ON public.web_chat_lead_data(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_chat_lead_data_phone 
  ON public.web_chat_lead_data(phone) WHERE phone IS NOT NULL;

-- 4) TRIGGERS
-- Auto-update session metadata when messages are added
CREATE OR REPLACE FUNCTION public.update_web_chat_session_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.web_chat_sessions
  SET 
    last_message_at = NOW(),
    updated_at = NOW(),
    intent = COALESCE(NEW.ai_intent, intent),
    urgency = CASE 
      WHEN NEW.ai_intent = 'emergency_leak' OR NEW.ai_intent = 'high_urgency' THEN 'urgent'
      ELSE urgency
    END
  WHERE id = NEW.session_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_web_chat_session_on_message ON public.web_chat_messages;
CREATE TRIGGER trg_update_web_chat_session_on_message
AFTER INSERT ON public.web_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_web_chat_session_on_message();

-- Auto-update updated_at on sessions
CREATE OR REPLACE FUNCTION public.update_web_chat_session_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_web_chat_sessions_updated_at ON public.web_chat_sessions;
CREATE TRIGGER trg_web_chat_sessions_updated_at
BEFORE UPDATE ON public.web_chat_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_web_chat_session_updated_at();

-- Auto-update updated_at on lead_data
CREATE OR REPLACE FUNCTION public.update_web_chat_lead_data_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_web_chat_lead_data_updated_at ON public.web_chat_lead_data;
CREATE TRIGGER trg_web_chat_lead_data_updated_at
BEFORE UPDATE ON public.web_chat_lead_data
FOR EACH ROW
EXECUTE FUNCTION public.update_web_chat_lead_data_updated_at();

-- 5) ROW LEVEL SECURITY
ALTER TABLE public.web_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_chat_lead_data ENABLE ROW LEVEL SECURITY;

-- RLS: Workspace members can view chat sessions in their workspace
CREATE POLICY "web_chat_sessions: select workspace members"
  ON public.web_chat_sessions FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "web_chat_sessions: insert workspace members"
  ON public.web_chat_sessions FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "web_chat_sessions: update workspace members"
  ON public.web_chat_sessions FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- RLS: Messages are accessible via session
CREATE POLICY "web_chat_messages: select via session"
  ON public.web_chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.web_chat_sessions wcs
      WHERE wcs.id = web_chat_messages.session_id
      AND wcs.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "web_chat_messages: insert via session"
  ON public.web_chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.web_chat_sessions wcs
      WHERE wcs.id = web_chat_messages.session_id
      AND wcs.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- RLS: Lead data is accessible via session
CREATE POLICY "web_chat_lead_data: select via session"
  ON public.web_chat_lead_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.web_chat_sessions wcs
      WHERE wcs.id = web_chat_lead_data.session_id
      AND wcs.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "web_chat_lead_data: insert via session"
  ON public.web_chat_lead_data FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.web_chat_sessions wcs
      WHERE wcs.id = web_chat_lead_data.session_id
      AND wcs.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "web_chat_lead_data: update via session"
  ON public.web_chat_lead_data FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.web_chat_sessions wcs
      WHERE wcs.id = web_chat_lead_data.session_id
      AND wcs.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- 6) HELPER FUNCTION: Generate session token
CREATE OR REPLACE FUNCTION public.generate_chat_session_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Generate a unique token: timestamp + random string
  v_token := 'chat_' || extract(epoch from now())::bigint::text || '_' || 
             encode(gen_random_bytes(16), 'hex');
  RETURN v_token;
END;
$$;

COMMENT ON TABLE public.web_chat_sessions IS 'Chat sessions from website widget visitors';
COMMENT ON TABLE public.web_chat_messages IS 'Messages within chat sessions';
COMMENT ON TABLE public.web_chat_lead_data IS 'Lead information collected during chat sessions';

























