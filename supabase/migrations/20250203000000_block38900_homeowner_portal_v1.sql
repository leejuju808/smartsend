-- ============================================================
-- Block 38900 — SmartSend Roofing "Customer Portal + Live Job Tracker" v1
-- Give homeowners a live portal to track their roofing project
-- Reduce calls • Build trust • Show timeline, photos, invoices, financing, and updates in one place
-- ============================================================

-- ============================================================
-- 1. HOMEOWNER PORTAL SESSIONS TABLE
-- ============================================================
-- Magic link authentication for homeowners (no passwords)
CREATE TABLE IF NOT EXISTS public.homeowner_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz,
  access_count integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_homeowner_portal_sessions_token ON public.homeowner_portal_sessions(token);
CREATE INDEX IF NOT EXISTS idx_homeowner_portal_sessions_job ON public.homeowner_portal_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_portal_sessions_lead ON public.homeowner_portal_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_portal_sessions_expires ON public.homeowner_portal_sessions(expires_at);

-- ============================================================
-- 2. HOMEOWNER PORTAL ACTIVITY TABLE
-- ============================================================
-- Track homeowner activity in the portal
CREATE TABLE IF NOT EXISTS public.homeowner_portal_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  event text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_portal_activity_job ON public.homeowner_portal_activity(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_portal_activity_lead ON public.homeowner_portal_activity(lead_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_portal_activity_event ON public.homeowner_portal_activity(event);
CREATE INDEX IF NOT EXISTS idx_homeowner_portal_activity_created ON public.homeowner_portal_activity(created_at DESC);

-- ============================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.homeowner_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_portal_activity ENABLE ROW LEVEL SECURITY;

-- Sessions: Team members can create/view sessions for jobs in their team
-- Public read access for token validation (via service role in edge functions)
CREATE POLICY "homeowner_portal_sessions_team_member"
  ON public.homeowner_portal_sessions
  FOR ALL
  USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = homeowner_portal_sessions.job_id 
      AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = homeowner_portal_sessions.job_id 
      AND tm.user_id = auth.uid()
    )
  );

-- Activity: Team members can view activity for jobs in their team
CREATE POLICY "homeowner_portal_activity_team_member"
  ON public.homeowner_portal_activity
  FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = homeowner_portal_activity.job_id 
      AND tm.user_id = auth.uid()
    )
  );

-- Activity: System can insert activity (via service role)
CREATE POLICY "homeowner_portal_activity_insert"
  ON public.homeowner_portal_activity
  FOR INSERT
  WITH CHECK (true); -- Service role will handle inserts

-- ============================================================
-- 4. HELPER FUNCTION: CREATE PORTAL SESSION
-- ============================================================
CREATE OR REPLACE FUNCTION create_portal_session(
  p_lead_id uuid,
  p_job_id uuid,
  p_expires_in_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token text;
  v_expires_at timestamptz;
  v_session_id uuid;
BEGIN
  -- Generate secure token
  v_token := encode(gen_random_bytes(32), 'base64url');
  v_expires_at := now() + (p_expires_in_days || ' days')::interval;
  
  -- Insert session
  INSERT INTO public.homeowner_portal_sessions (
    lead_id,
    job_id,
    token,
    expires_at
  )
  VALUES (
    p_lead_id,
    p_job_id,
    v_token,
    v_expires_at
  )
  RETURNING id INTO v_session_id;
  
  -- Return session info
  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'token', v_token,
    'expires_at', v_expires_at
  );
END;
$$;

-- ============================================================
-- 5. HELPER FUNCTION: VALIDATE PORTAL TOKEN
-- ============================================================
CREATE OR REPLACE FUNCTION validate_portal_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session record;
BEGIN
  -- Find session
  SELECT * INTO v_session
  FROM public.homeowner_portal_sessions
  WHERE token = p_token
  AND expires_at > now();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'invalid_or_expired');
  END IF;
  
  -- Update access tracking
  UPDATE public.homeowner_portal_sessions
  SET 
    last_accessed_at = now(),
    access_count = access_count + 1
  WHERE id = v_session.id;
  
  -- Log activity
  INSERT INTO public.homeowner_portal_activity (
    lead_id,
    job_id,
    event,
    metadata
  )
  VALUES (
    v_session.lead_id,
    v_session.job_id,
    'portal_accessed',
    jsonb_build_object('session_id', v_session.id)
  );
  
  RETURN jsonb_build_object(
    'valid', true,
    'session_id', v_session.id,
    'lead_id', v_session.lead_id,
    'job_id', v_session.job_id
  );
END;
$$;

-- ============================================================
-- 6. COMMENTS
-- ============================================================

COMMENT ON TABLE public.homeowner_portal_sessions IS 'Block 38900: Magic link sessions for homeowner portal access';
COMMENT ON TABLE public.homeowner_portal_activity IS 'Block 38900: Activity tracking for homeowner portal interactions';
COMMENT ON FUNCTION create_portal_session IS 'Block 38900: Creates a new portal session and returns token';
COMMENT ON FUNCTION validate_portal_token IS 'Block 38900: Validates portal token and returns session info';
































