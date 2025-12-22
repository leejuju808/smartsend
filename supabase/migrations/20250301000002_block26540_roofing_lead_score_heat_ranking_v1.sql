-- =========================================================
-- Block 26540 — SmartSend Roofing Lead Score & Heat Ranking v1
-- (Real-time scoring of new leads • Urgency ranking • AI-backed intent signals • Sales priority engine)
-- =========================================================
-- 
-- This block gives SmartSend the "Hot Lead Radar" that roofers desperately need.
-- Right now, roofers waste time chasing the wrong leads.
-- SmartSend will tell them:
--   - Who is hot
--   - Who is warm
--   - Who is cold
--   - Who needs immediate follow-up
--   - Which leads have the highest chance of becoming profitable jobs
--
-- This makes SmartSend not just an outreach engine—but a sales brain.
-- =========================================================

-- ============================================================================
-- PART 1 — LEAD SCORING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_lead_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Raw score components
  reply_speed_score integer DEFAULT 0 CHECK (reply_speed_score >= 0 AND reply_speed_score <= 20),
  intent_keyword_score integer DEFAULT 0 CHECK (intent_keyword_score >= 0 AND intent_keyword_score <= 100),
  sentiment_score integer DEFAULT -10 CHECK (sentiment_score >= -10 AND sentiment_score <= 10),
  source_score integer DEFAULT 0 CHECK (source_score >= 0 AND source_score <= 20),
  location_score integer DEFAULT 0 CHECK (location_score >= 0 AND location_score <= 20),

  -- Final score
  total_score integer DEFAULT 0 CHECK (total_score >= 0 AND total_score <= 100),

  -- Heat level
  heat_level text CHECK (heat_level IN ('hot', 'warm', 'cold', 'noise')),

  -- Metadata
  last_message_text text,
  reply_time_minutes integer,
  lead_source text,
  address text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Ensure one score per lead
  UNIQUE(lead_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_roofing_lead_scores_lead_id 
  ON public.roofing_lead_scores(lead_id);

CREATE INDEX IF NOT EXISTS idx_roofing_lead_scores_workspace_id 
  ON public.roofing_lead_scores(workspace_id);

CREATE INDEX IF NOT EXISTS idx_roofing_lead_scores_total_score 
  ON public.roofing_lead_scores(total_score DESC);

CREATE INDEX IF NOT EXISTS idx_roofing_lead_scores_heat_level 
  ON public.roofing_lead_scores(heat_level);

CREATE INDEX IF NOT EXISTS idx_roofing_lead_scores_workspace_heat 
  ON public.roofing_lead_scores(workspace_id, heat_level, total_score DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_roofing_lead_scores_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_roofing_lead_scores_updated_at ON public.roofing_lead_scores;
CREATE TRIGGER trg_set_roofing_lead_scores_updated_at
BEFORE UPDATE ON public.roofing_lead_scores
FOR EACH ROW
EXECUTE FUNCTION public.set_roofing_lead_scores_updated_at();

-- RLS Policies
ALTER TABLE public.roofing_lead_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead scores for their workspace"
  ON public.roofing_lead_scores
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_lead_scores.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert/update lead scores"
  ON public.roofing_lead_scores
  FOR ALL
  WITH CHECK (true);

-- ============================================================================
-- PART 2 — SALES PRIORITY QUEUE VIEW
-- ============================================================================

CREATE OR REPLACE VIEW public.roofing_lead_priority_queue AS
SELECT
  l.id as lead_id,
  l.workspace_id,
  COALESCE(l.first_name || ' ' || l.last_name, l.name, 'Unknown') as name,
  l.email,
  l.phone,
  COALESCE(l.address, '') as address,
  l.city,
  l.state,
  l.zip_code,
  l.created_at,
  l.last_reply_at,
  l.source,
  l.status,
  l.roofing_pipeline_stage,
  l.lead_status,
  
  -- Score data
  COALESCE(s.total_score, 0) as total_score,
  COALESCE(s.heat_level, 'cold') as heat_level,
  s.reply_speed_score,
  s.intent_keyword_score,
  s.sentiment_score,
  s.source_score,
  s.location_score,
  
  -- Recommended next step
  CASE
    WHEN COALESCE(s.heat_level, 'cold') = 'hot' THEN 'Call Immediately'
    WHEN COALESCE(s.heat_level, 'cold') = 'warm' THEN 'Send Estimate Request'
    WHEN COALESCE(s.heat_level, 'cold') = 'cold' THEN 'Follow up in 2 days'
    ELSE 'No action'
  END as next_action,
  
  -- Additional context
  CASE
    WHEN s.reply_speed_score >= 15 THEN 'Fast Reply'
    WHEN s.intent_keyword_score >= 30 THEN 'High Intent'
    WHEN s.sentiment_score >= 5 THEN 'Positive Sentiment'
    ELSE NULL
  END as score_insight

FROM public.leads l
LEFT JOIN public.roofing_lead_scores s ON s.lead_id = l.id
WHERE l.workspace_id IS NOT NULL
ORDER BY 
  COALESCE(s.total_score, 0) DESC NULLS LAST,
  l.last_reply_at DESC NULLS LAST,
  l.created_at DESC;

-- Grant permissions
GRANT SELECT ON public.roofing_lead_priority_queue TO authenticated;

-- ============================================================================
-- PART 3 — HELPER FUNCTION: Compute Heat Level from Score
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_heat_level(p_score integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_score >= 80 THEN
    RETURN 'hot';
  ELSIF p_score >= 50 THEN
    RETURN 'warm';
  ELSIF p_score >= 20 THEN
    RETURN 'cold';
  ELSE
    RETURN 'noise';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.compute_heat_level IS 'Block 26540: Converts total score (0-100) to heat level: hot (80-100), warm (50-79), cold (20-49), noise (0-19)';

-- ============================================================================
-- PART 4 — FUNCTION: Upsert Lead Score
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_lead_score(
  p_lead_id uuid,
  p_reply_speed_score integer DEFAULT 0,
  p_intent_keyword_score integer DEFAULT 0,
  p_sentiment_score integer DEFAULT 0,
  p_source_score integer DEFAULT 0,
  p_location_score integer DEFAULT 0,
  p_last_message_text text DEFAULT NULL,
  p_reply_time_minutes integer DEFAULT NULL,
  p_lead_source text DEFAULT NULL,
  p_address text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_total_score integer;
  v_heat_level text;
  v_score_id uuid;
BEGIN
  -- Get workspace_id from lead
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = p_lead_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  -- Calculate total score (clamp to 0-100)
  -- Note: sentiment_score is -10 to +10, so we normalize it to 0-20 range
  v_total_score := GREATEST(0, LEAST(100, 
    p_reply_speed_score + 
    p_intent_keyword_score + 
    (p_sentiment_score + 10) +  -- Normalize sentiment from -10/+10 to 0-20
    p_source_score + 
    p_location_score
  ));

  -- Determine heat level
  v_heat_level := public.compute_heat_level(v_total_score);

  -- Upsert score
  INSERT INTO public.roofing_lead_scores (
    lead_id,
    workspace_id,
    reply_speed_score,
    intent_keyword_score,
    sentiment_score,
    source_score,
    location_score,
    total_score,
    heat_level,
    last_message_text,
    reply_time_minutes,
    lead_source,
    address
  )
  VALUES (
    p_lead_id,
    v_workspace_id,
    p_reply_speed_score,
    p_intent_keyword_score,
    p_sentiment_score,
    p_source_score,
    p_location_score,
    v_total_score,
    v_heat_level,
    p_last_message_text,
    p_reply_time_minutes,
    p_lead_source,
    p_address
  )
  ON CONFLICT (lead_id) 
  DO UPDATE SET
    reply_speed_score = EXCLUDED.reply_speed_score,
    intent_keyword_score = EXCLUDED.intent_keyword_score,
    sentiment_score = EXCLUDED.sentiment_score,
    source_score = EXCLUDED.source_score,
    location_score = EXCLUDED.location_score,
    total_score = EXCLUDED.total_score,
    heat_level = EXCLUDED.heat_level,
    last_message_text = EXCLUDED.last_message_text,
    reply_time_minutes = EXCLUDED.reply_time_minutes,
    lead_source = EXCLUDED.lead_source,
    address = EXCLUDED.address,
    updated_at = now()
  RETURNING id INTO v_score_id;

  RETURN v_score_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_lead_score IS 'Block 26540: Upserts a lead score with all components and computes heat level';

-- ============================================================================
-- PART 5 — TRIGGER: Auto-score lead on creation (if possible)
-- ============================================================================
-- Note: Full scoring requires message content, so this will be called
-- from the edge function when a lead is created or replies

-- ============================================================================
-- PART 6 — COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.roofing_lead_scores IS 'Block 26540: Stores detailed lead scoring components and heat levels for roofing leads';
COMMENT ON COLUMN public.roofing_lead_scores.reply_speed_score IS 'Score 0-20 based on how fast the lead replied';
COMMENT ON COLUMN public.roofing_lead_scores.intent_keyword_score IS 'Score 0-100 based on intent keywords found in messages';
COMMENT ON COLUMN public.roofing_lead_scores.sentiment_score IS 'Score -10 to +10 from AI sentiment analysis';
COMMENT ON COLUMN public.roofing_lead_scores.source_score IS 'Score 0-20 based on lead source quality';
COMMENT ON COLUMN public.roofing_lead_scores.location_score IS 'Score 0-20 based on location (storm areas, etc.)';
COMMENT ON COLUMN public.roofing_lead_scores.total_score IS 'Total score 0-100 (sum of all components, clamped)';
COMMENT ON COLUMN public.roofing_lead_scores.heat_level IS 'Heat level: hot (80-100), warm (50-79), cold (20-49), noise (0-19)';

COMMENT ON VIEW public.roofing_lead_priority_queue IS 'Block 26540: Sales priority queue showing leads ranked by closability with recommended next actions';

-- ============================================================================
-- PART 7 — TRIGGER FUNCTION: Auto-score lead on creation/reply
-- ============================================================================
-- This function calls the score_lead edge function when a lead is created or replies

CREATE OR REPLACE FUNCTION public.trigger_score_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_func_url text;
  v_payload jsonb;
  v_message_text text;
  v_reply_time_minutes integer;
BEGIN
  -- Build edge function URL
  v_func_url := current_setting('app.supabase_url', true) || '/functions/v1/score_lead';
  
  -- If supabase_url is not set, try to construct from environment
  IF v_func_url IS NULL OR v_func_url = '/functions/v1/score_lead' THEN
    -- Fallback: use default pattern (will need to be configured)
    v_func_url := 'https://' || current_setting('app.project_ref', true) || '.supabase.co/functions/v1/score_lead';
  END IF;

  -- Get message text from various sources
  v_message_text := COALESCE(
    NEW.reply_summary,
    NEW.notes,
    ''
  );

  -- Calculate reply time if last_reply_at exists
  IF NEW.last_reply_at IS NOT NULL AND NEW.created_at IS NOT NULL THEN
    v_reply_time_minutes := EXTRACT(EPOCH FROM (NEW.last_reply_at - NEW.created_at)) / 60;
  END IF;

  -- Build payload
  v_payload := jsonb_build_object(
    'lead_id', NEW.id,
    'message', v_message_text,
    'reply_time_minutes', v_reply_time_minutes,
    'lead_source', NEW.source,
    'address', COALESCE(NEW.address, '')
  );

  -- Call edge function via HTTP if pg_net is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    BEGIN
      PERFORM net.http_post(
        url := v_func_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := v_payload
      );
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but don't fail the transaction
        RAISE WARNING 'Failed to trigger score_lead for lead %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_score_lead IS 'Block 26540: Triggers lead scoring edge function when lead is created or updated with reply';

-- ============================================================================
-- PART 8 — CREATE TRIGGERS
-- ============================================================================

-- Trigger: Score lead on creation
DROP TRIGGER IF EXISTS trg_score_lead_on_create ON public.leads;
CREATE TRIGGER trg_score_lead_on_create
  AFTER INSERT ON public.leads
  FOR EACH ROW
  WHEN (NEW.workspace_id IS NOT NULL)
  EXECUTE FUNCTION public.trigger_score_lead();

-- Trigger: Re-score lead when reply is detected
DROP TRIGGER IF EXISTS trg_score_lead_on_reply ON public.leads;
CREATE TRIGGER trg_score_lead_on_reply
  AFTER UPDATE OF reply_detected, last_reply_at ON public.leads
  FOR EACH ROW
  WHEN (
    NEW.workspace_id IS NOT NULL
    AND (
      (OLD.reply_detected IS DISTINCT FROM NEW.reply_detected AND NEW.reply_detected = true)
      OR (OLD.last_reply_at IS DISTINCT FROM NEW.last_reply_at AND NEW.last_reply_at IS NOT NULL)
    )
  )
  EXECUTE FUNCTION public.trigger_score_lead();

-- Note: For production, you may also want to trigger scoring when:
-- - Inbound messages are received (via inbox_messages or email_replies tables)
-- - Lead source changes
-- - Address is updated
-- These can be added as additional triggers or handled via application code/webhooks
