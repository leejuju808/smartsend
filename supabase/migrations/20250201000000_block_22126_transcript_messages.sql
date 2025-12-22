-- ============================================================================
-- Block 22126 — SmartSend Roofing "Homeowner Transcript v1 (AI Conversation Intelligence)"
-- ============================================================================
-- The complete, AI-organized, sentiment-tracked transcript of EVERY message 
-- between estimator & homeowner — the missing intelligence layer all roofers desperately need.
--
-- This block turns SmartSend into an intelligence system, not a CRM.
-- ============================================================================

-- ============================================================================
-- 1. CREATE transcript_messages TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.transcript_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Message sender information
  sender_type TEXT NOT NULL CHECK (sender_type IN ('homeowner', 'estimator', 'system', 'ai')),
  sender_name TEXT,              -- e.g., "John Smith" or "AI Assistant"
  message_text TEXT NOT NULL,

  -- AI Intelligence fields (from Tone Engine, Intent Engine, Experience Engine, Momentum Engine)
  tone TEXT,                     -- e.g., 'positive', 'neutral', 'confused', 'impatient', 'angry', 'price-shopping', 'scheduling-focused', 'appreciation'
  intent TEXT,                   -- e.g., 'high intent', 'medium intent', 'low intent', 'not interested', 'needs clarification', 'ready to book', 'wants price', 'stalling'
  sentiment_score INTEGER CHECK (sentiment_score >= 0 AND sentiment_score <= 100),  -- 0-100 sentiment score
  experience_impact INTEGER,     -- + or - change to experience score

  -- Metadata
  source_type TEXT,              -- 'email', 'sms', 'phone_call_summary', 'ai_reply', 'manual', 'timeline_note'
  source_id UUID,                -- Reference to email_id, sms_id, etc.
  thread_id UUID,                -- For grouping related messages

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. INDEXES for performance
-- ============================================================================

-- Primary query: Get all messages for a lead, chronological order
CREATE INDEX IF NOT EXISTS idx_transcript_messages_lead_created
  ON public.transcript_messages (lead_id, created_at DESC);

-- Filter by sender type
CREATE INDEX IF NOT EXISTS idx_transcript_messages_sender_type
  ON public.transcript_messages (sender_type);

-- Filter by tone
CREATE INDEX IF NOT EXISTS idx_transcript_messages_tone
  ON public.transcript_messages (tone) WHERE tone IS NOT NULL;

-- Filter by intent
CREATE INDEX IF NOT EXISTS idx_transcript_messages_intent
  ON public.transcript_messages (intent) WHERE intent IS NOT NULL;

-- Workspace filtering
CREATE INDEX IF NOT EXISTS idx_transcript_messages_workspace
  ON public.transcript_messages (workspace_id);

-- Full-text search on message text
CREATE INDEX IF NOT EXISTS idx_transcript_messages_text_search
  ON public.transcript_messages USING gin(to_tsvector('english', message_text));

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

ALTER TABLE public.transcript_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view transcript messages for leads in their workspace
CREATE POLICY "Users can view transcript messages"
  ON public.transcript_messages
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Service role can insert transcript messages (for ingestion pipeline)
CREATE POLICY "Service role can insert transcript messages"
  ON public.transcript_messages
  FOR INSERT
  WITH CHECK (true);

-- Policy: Authenticated users can insert transcript messages (for manual messages)
CREATE POLICY "Users can insert transcript messages"
  ON public.transcript_messages
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. HELPER FUNCTION: Insert transcript message with timeline event
-- ============================================================================

CREATE OR REPLACE FUNCTION public.insert_transcript_message_with_timeline(
  p_lead_id UUID,
  p_workspace_id UUID,
  p_sender_type TEXT,
  p_sender_name TEXT,
  p_message_text TEXT,
  p_tone TEXT DEFAULT NULL,
  p_intent TEXT DEFAULT NULL,
  p_sentiment_score INTEGER DEFAULT NULL,
  p_experience_impact INTEGER DEFAULT NULL,
  p_source_type TEXT DEFAULT NULL,
  p_source_id UUID DEFAULT NULL,
  p_thread_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transcript_id UUID;
BEGIN
  -- Insert transcript message
  INSERT INTO public.transcript_messages (
    lead_id,
    workspace_id,
    sender_type,
    sender_name,
    message_text,
    tone,
    intent,
    sentiment_score,
    experience_impact,
    source_type,
    source_id,
    thread_id
  ) VALUES (
    p_lead_id,
    p_workspace_id,
    p_sender_type,
    p_sender_name,
    p_message_text,
    p_tone,
    p_intent,
    p_sentiment_score,
    p_experience_impact,
    p_source_type,
    p_source_id,
    p_thread_id
  )
  RETURNING id INTO v_transcript_id;

  -- Add timeline entry
  INSERT INTO public.job_timelines (
    lead_id,
    event_type,
    event_category,
    event_summary,
    event_data
  ) VALUES (
    p_lead_id,
    'message_logged',
    'communication',
    p_sender_type || ' messaged',
    jsonb_build_object(
      'sender_type', p_sender_type,
      'sender_name', p_sender_name,
      'message_text', LEFT(p_message_text, 200),
      'tone', p_tone,
      'intent', p_intent,
      'transcript_id', v_transcript_id
    )
  );

  RETURN v_transcript_id;
END;
$$;

-- ============================================================================
-- 5. VIEW: Transcript with intelligence summary
-- ============================================================================

CREATE OR REPLACE VIEW public.transcript_messages_with_intelligence AS
SELECT 
  tm.*,
  l.name as lead_name,
  l.email as lead_email,
  -- Calculate sentiment trend (comparing to previous message)
  LAG(tm.sentiment_score) OVER (
    PARTITION BY tm.lead_id 
    ORDER BY tm.created_at
  ) as previous_sentiment_score,
  -- Calculate message count per sender
  COUNT(*) OVER (
    PARTITION BY tm.lead_id, tm.sender_type
  ) as sender_message_count,
  -- Calculate total messages in conversation
  COUNT(*) OVER (
    PARTITION BY tm.lead_id
  ) as total_messages
FROM public.transcript_messages tm
JOIN public.leads l ON l.id = tm.lead_id;

-- Grant access to view
GRANT SELECT ON public.transcript_messages_with_intelligence TO authenticated;









































