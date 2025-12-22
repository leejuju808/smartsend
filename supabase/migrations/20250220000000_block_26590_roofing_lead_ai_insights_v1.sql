-- ============================================================================
-- Block 26590 — SmartSend Roofing Lead Timeline AI Insights v1
-- ============================================================================
-- AI summaries of lead interactions • Key buying signals • Objection detection 
-- "What this lead really wants" • Suggested sales angle
--
-- This block upgrades SmartSend from a "lead tracker" into a sales intelligence engine.
-- ============================================================================

-- ============================================================================
-- 1. CREATE roofing_lead_ai_insights TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_lead_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- AI-generated insights
  summary TEXT,                    -- 2-4 sentence summary of the lead so far
  buying_intent TEXT,              -- "High", "Medium", "Low" + reason
  intent_score INTEGER CHECK (intent_score >= 0 AND intent_score <= 100),
  objections TEXT,                 -- Price resistance, timeline issues, insurance confusion, etc.
  recommended_angle TEXT,          -- Best sales angle (speed, warranty, insurance expertise, price, trust, etc.)
  next_action TEXT,                -- Recommended next action (call, send estimate, follow-up, nurture, etc.)
  
  -- Metadata
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure one insight record per lead
  CONSTRAINT roofing_lead_ai_insights_lead_id_unique UNIQUE (lead_id)
);

-- ============================================================================
-- 2. INDEXES for performance
-- ============================================================================

-- Primary query: Get insights for a lead
CREATE INDEX IF NOT EXISTS idx_roofing_lead_ai_insights_lead_id
  ON public.roofing_lead_ai_insights(lead_id);

-- Query by intent score (for filtering high-intent leads)
CREATE INDEX IF NOT EXISTS idx_roofing_lead_ai_insights_intent_score
  ON public.roofing_lead_ai_insights(intent_score DESC NULLS LAST);

-- Query by updated_at (for finding stale insights that need refresh)
CREATE INDEX IF NOT EXISTS idx_roofing_lead_ai_insights_updated_at
  ON public.roofing_lead_ai_insights(updated_at DESC);

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

ALTER TABLE public.roofing_lead_ai_insights ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view insights for leads in their workspace
CREATE POLICY "Users can view lead AI insights"
  ON public.roofing_lead_ai_insights
  FOR SELECT
  USING (
    lead_id IN (
      SELECT l.id
      FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- Policy: Service role can insert/update insights (for edge function)
CREATE POLICY "Service role can manage lead AI insights"
  ON public.roofing_lead_ai_insights
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can insert/update insights
CREATE POLICY "Users can manage lead AI insights"
  ON public.roofing_lead_ai_insights
  FOR ALL
  USING (
    lead_id IN (
      SELECT l.id
      FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    lead_id IN (
      SELECT l.id
      FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. TRIGGER: Update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_roofing_lead_ai_insights_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_roofing_lead_ai_insights_updated_at 
  ON public.roofing_lead_ai_insights;
CREATE TRIGGER trg_set_roofing_lead_ai_insights_updated_at
  BEFORE UPDATE ON public.roofing_lead_ai_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.set_roofing_lead_ai_insights_updated_at();

-- ============================================================================
-- 5. AUTO-TRIGGER: Generate insights when new messages arrive or lead updates
-- ============================================================================

-- Ensure pg_net extension is available for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to trigger AI insights generation via edge function
CREATE OR REPLACE FUNCTION public.trigger_lead_ai_insights_generation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  func_url TEXT;
  payload JSONB;
  v_lead_id UUID;
BEGIN
  -- Determine lead_id based on trigger context
  IF TG_TABLE_NAME = 'transcript_messages' THEN
    v_lead_id := NEW.lead_id;
  ELSIF TG_TABLE_NAME = 'unified_messages' THEN
    v_lead_id := NEW.lead_id;
  ELSIF TG_TABLE_NAME = 'leads' THEN
    v_lead_id := NEW.id;
  ELSE
    RETURN NEW;
  END IF;

  -- Skip if no lead_id
  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build the edge function URL
  func_url := COALESCE(
    current_setting('app.supabase_url', true),
    current_setting('app.public_supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/lead_ai_insights';

  -- Build payload
  payload := jsonb_build_object('lead_id', v_lead_id);

  -- Call Edge Function via HTTP if pg_net is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    -- Fire and forget - don't wait for response
    PERFORM net.http_post(
      url := func_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(
          current_setting('app.supabase_service_role_key', true),
          current_setting('app.service_role_key', true)
        )
      ),
      body := payload
    );
  ELSE
    -- Log warning if pg_net is not available
    RAISE WARNING 'pg_net extension not available, cannot call lead_ai_insights function';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert/update
    RAISE WARNING 'Failed to trigger lead_ai_insights generation: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_lead_ai_insights_generation() IS 
  'Block 26590: Trigger function that calls AI insights edge function when new messages arrive or lead data changes';

-- Trigger on transcript_messages (new messages from homeowners/estimators)
DROP TRIGGER IF EXISTS trg_generate_ai_insights_on_transcript_message 
  ON public.transcript_messages;
CREATE TRIGGER trg_generate_ai_insights_on_transcript_message
  AFTER INSERT ON public.transcript_messages
  FOR EACH ROW
  WHEN (NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION public.trigger_lead_ai_insights_generation();

-- Trigger on unified_messages (new inbound messages)
DROP TRIGGER IF EXISTS trg_generate_ai_insights_on_unified_message 
  ON public.unified_messages;
CREATE TRIGGER trg_generate_ai_insights_on_unified_message
  AFTER INSERT ON public.unified_messages
  FOR EACH ROW
  WHEN (NEW.lead_id IS NOT NULL AND NEW.direction = 'inbound')
  EXECUTE FUNCTION public.trigger_lead_ai_insights_generation();

-- Trigger on leads table (when lead source assigned or score updated)
DROP TRIGGER IF EXISTS trg_generate_ai_insights_on_lead_update 
  ON public.leads;
CREATE TRIGGER trg_generate_ai_insights_on_lead_update
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  WHEN (
    -- Trigger when lead source changes
    (OLD.source IS DISTINCT FROM NEW.source) OR
    -- Trigger when lead score changes significantly (e.g., hot_lead_score)
    (OLD.hot_lead_score IS DISTINCT FROM NEW.hot_lead_score) OR
    -- Trigger when status changes
    (OLD.status IS DISTINCT FROM NEW.status)
  )
  EXECUTE FUNCTION public.trigger_lead_ai_insights_generation();
