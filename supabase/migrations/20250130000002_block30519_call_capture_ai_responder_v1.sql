-- ============================================================================
-- Block 30519 — SmartSend Roofing "Smart Phone Call Capture + Missed Call AI Responder" v1
-- (Every missed call becomes a lead • Auto-text back in 3 seconds • Log calls • Classify call intent • Book estimates instantly)
-- ============================================================================

-- ============================================================================
-- TABLE: call_logs
-- ============================================================================
-- Stores every incoming call event (incoming, missed, voicemail, completed)
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id UUID, -- Also track workspace for easier querying
  phone TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('incoming', 'missed', 'voicemail', 'completed', 'answered')),
  call_sid TEXT, -- Twilio/Vonage call identifier
  duration INTEGER, -- Call duration in seconds
  voicemail_url TEXT, -- URL to voicemail audio if available
  answered_at TIMESTAMPTZ, -- When call was answered (if answered)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_logs_contractor_id ON public.call_logs(contractor_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_workspace_id ON public.call_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_phone ON public.call_logs(phone);
CREATE INDEX IF NOT EXISTS idx_call_logs_event ON public.call_logs(event);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON public.call_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON public.call_logs(call_sid) WHERE call_sid IS NOT NULL;

-- ============================================================================
-- TABLE: call_intents
-- ============================================================================
-- Stores AI-classified intent from customer SMS replies
CREATE TABLE IF NOT EXISTS public.call_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  predicted_intent TEXT NOT NULL CHECK (predicted_intent IN (
    'emergency_leak',
    'repair_request',
    'full_replacement',
    'storm_damage',
    'general_question'
  )),
  confidence NUMERIC(3,2) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  reply_text TEXT, -- The SMS reply that was classified
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_call_intents_call_id ON public.call_intents(call_id);
CREATE INDEX IF NOT EXISTS idx_call_intents_intent ON public.call_intents(predicted_intent);

-- ============================================================================
-- TABLE: call_to_lead_map
-- ============================================================================
-- Maps calls to leads (one call can create one lead, but one lead can have multiple calls)
CREATE TABLE IF NOT EXISTS public.call_to_lead_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(call_id, lead_id) -- Prevent duplicate mappings
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_call_to_lead_map_call_id ON public.call_to_lead_map(call_id);
CREATE INDEX IF NOT EXISTS idx_call_to_lead_map_lead_id ON public.call_to_lead_map(lead_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_to_lead_map ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view call logs for their workspace
CREATE POLICY "Users can view call logs for their workspace"
  ON public.call_logs
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    OR contractor_id = auth.uid()
  );

-- Policy: Service role can insert call logs (for webhooks)
CREATE POLICY "Service role can insert call logs"
  ON public.call_logs
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can view call intents for their workspace
CREATE POLICY "Users can view call intents for their workspace"
  ON public.call_intents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.call_logs cl
      WHERE cl.id = call_intents.call_id
        AND (
          cl.workspace_id IN (
            SELECT workspace_id
            FROM public.workspace_members
            WHERE user_id = auth.uid()
          )
          OR cl.contractor_id = auth.uid()
        )
    )
  );

-- Policy: Service role can insert call intents
CREATE POLICY "Service role can insert call intents"
  ON public.call_intents
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can view call-to-lead mappings for their workspace
CREATE POLICY "Users can view call-to-lead mappings for their workspace"
  ON public.call_to_lead_map
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.call_logs cl
      JOIN public.leads l ON l.id = call_to_lead_map.lead_id
      WHERE cl.id = call_to_lead_map.call_id
        AND (
          cl.workspace_id IN (
            SELECT workspace_id
            FROM public.workspace_members
            WHERE user_id = auth.uid()
          )
          OR l.workspace_id IN (
            SELECT workspace_id
            FROM public.workspace_members
            WHERE user_id = auth.uid()
          )
        )
    )
  );

-- Policy: Service role can insert call-to-lead mappings
CREATE POLICY "Service role can insert call-to-lead mappings"
  ON public.call_to_lead_map
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTION: Update lead score with call-related boosts
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_lead_score_from_call(
  p_lead_id UUID,
  p_event_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_score_boost INTEGER := 0;
  v_current_score INTEGER;
  v_new_score INTEGER;
  v_workspace_id UUID;
  v_owner_id UUID;
BEGIN
  -- Get current lead info
  SELECT score, workspace_id, owner_id
  INTO v_current_score, v_workspace_id, v_owner_id
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculate score boost based on event type
  CASE p_event_type
    WHEN 'missed_call' THEN
      -- Check for repeat missed calls
      IF EXISTS (
        SELECT 1
        FROM public.call_logs cl
        JOIN public.call_to_lead_map ctm ON ctm.call_id = cl.id
        WHERE ctm.lead_id = p_lead_id
          AND cl.event = 'missed'
          AND cl.created_at > now() - INTERVAL '7 days'
        HAVING COUNT(*) > 1
      ) THEN
        v_score_boost := 40; -- Repeat missed calls
      ELSE
        v_score_boost := 20; -- Single missed call
      END IF;
    
    WHEN 'emergency_keywords' THEN
      v_score_boost := 50;
    
    WHEN 'storm_during_call' THEN
      v_score_boost := 60;
    
    ELSE
      v_score_boost := 0;
  END CASE;

  -- Update lead score
  v_new_score := LEAST(100, GREATEST(0, COALESCE(v_current_score, 0) + v_score_boost));

  UPDATE public.leads
  SET score = v_new_score
  WHERE id = p_lead_id;

  -- Log score event if lead_score_events table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_score_events') THEN
    INSERT INTO public.lead_score_events (
      lead_id,
      owner_id,
      event_type,
      delta,
      new_score,
      metadata
    ) VALUES (
      p_lead_id,
      COALESCE(v_owner_id, (SELECT user_id FROM public.workspace_members WHERE workspace_id = v_workspace_id LIMIT 1)),
      p_event_type,
      v_score_boost,
      v_new_score,
      jsonb_build_object('source', 'call_capture')
    );
  END IF;

  -- Auto-convert to hot if score >= 80
  IF v_new_score >= 80 THEN
    UPDATE public.leads
    SET classification = 'hot'
    WHERE id = p_lead_id AND (classification IS NULL OR classification != 'hot');
  END IF;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE public.call_logs IS 'Stores all incoming call events (incoming, missed, voicemail, completed)';
COMMENT ON TABLE public.call_intents IS 'AI-classified intent from customer SMS replies after missed calls';
COMMENT ON TABLE public.call_to_lead_map IS 'Maps calls to leads created from those calls';
COMMENT ON FUNCTION public.update_lead_score_from_call IS 'Updates lead score with call-related boosts (missed call, emergency, storm, etc.)';


































