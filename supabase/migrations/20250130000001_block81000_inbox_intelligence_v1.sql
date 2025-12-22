-- =========================================================
-- Block 81000 — SmartSend Roofing
-- "Homeowner Inbox Intelligence + Reply Understanding Engine" v1
-- =========================================================
-- 
-- This is the most important "AI power-up" yet.
-- Roofers don't know what to do with homeowner replies.
-- SmartSend reads every homeowner reply, understands EXACTLY what it means,
-- classifies the intent, recommends action, and pre-writes the perfect response.
-- 
-- No other roofing CRM can do this.

-- ============================================================================
-- 1. INBOX_MESSAGES TABLE (Enhanced with Intelligence Fields)
-- ============================================================================
-- Extends existing inbox_messages with intelligence fields if they don't exist

DO $$
BEGIN
  -- Add intelligence fields to inbox_messages if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'inbox_messages' 
    AND column_name = 'interpreted_intent'
  ) THEN
    ALTER TABLE public.inbox_messages 
    ADD COLUMN interpreted_intent text,
    ADD COLUMN urgency text CHECK (urgency IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
    ADD COLUMN recommended_action text,
    ADD COLUMN ai_summary text,
    ADD COLUMN confidence numeric(3,2) CHECK (confidence >= 0 AND confidence <= 1),
    ADD COLUMN raw_body text; -- Store original message body
  END IF;
END $$;

-- ============================================================================
-- 2. INTENT_CATEGORIES TABLE
-- ============================================================================
-- Predefined intent categories for classification

CREATE TABLE IF NOT EXISTS public.intent_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE, -- "Hot Lead", "Warm Lead", "Not Interested", etc.
  description text,
  priority integer DEFAULT 0, -- Higher priority = more important
  created_at timestamptz DEFAULT now()
);

-- Insert default intent categories
INSERT INTO public.intent_categories (name, description, priority) VALUES
  ('Hot Lead', 'Strong buying signals - ready to move forward', 100),
  ('Warm Lead', 'Some interest - needs nurturing', 75),
  ('Cold Lead', 'Low interest or not engaged', 25),
  ('Not Interested', 'Explicitly not interested', 0),
  ('Price Question', 'Asking about pricing or costs', 60),
  ('Schedule Request', 'Wants to schedule an appointment', 90),
  ('Insurance Inquiry', 'Questions about insurance claims', 70),
  ('Storm Damage', 'Mentioning storm damage or urgent roof issues', 95),
  ('Objection', 'Has concerns or objections', 40),
  ('Referral', 'Referring someone else', 50),
  ('General Question', 'General inquiry or question', 30)
ON CONFLICT (name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_intent_categories_name ON public.intent_categories(name);
CREATE INDEX IF NOT EXISTS idx_intent_categories_priority ON public.intent_categories(priority DESC);

-- ============================================================================
-- 3. AI_RESPONSE_SUGGESTIONS TABLE
-- ============================================================================
-- Stores AI-generated response suggestions for each message

CREATE TABLE IF NOT EXISTS public.ai_response_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL, -- References inbox_messages(id)
  thread_id uuid, -- For grouping suggestions
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  suggestion text NOT NULL, -- The suggested reply text
  tone text NOT NULL CHECK (tone IN ('friendly', 'professional', 'contractor')) DEFAULT 'friendly',
  variant integer DEFAULT 1 CHECK (variant IN (1, 2, 3)), -- 3 variants per tone
  confidence numeric(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  persona_id uuid, -- Optional: link to user's persona/template preferences
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_response_suggestions_message ON public.ai_response_suggestions(message_id);
CREATE INDEX IF NOT EXISTS idx_ai_response_suggestions_thread ON public.ai_response_suggestions(thread_id);
CREATE INDEX IF NOT EXISTS idx_ai_response_suggestions_lead ON public.ai_response_suggestions(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_response_suggestions_tone ON public.ai_response_suggestions(tone);

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

-- Intent categories are readable by all authenticated users
ALTER TABLE public.intent_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Intent categories are readable by authenticated users" ON public.intent_categories;
CREATE POLICY "Intent categories are readable by authenticated users"
  ON public.intent_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- AI response suggestions are scoped to workspace
ALTER TABLE public.ai_response_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AI response suggestions are scoped to workspace" ON public.ai_response_suggestions;
CREATE POLICY "AI response suggestions are scoped to workspace"
  ON public.ai_response_suggestions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = ai_response_suggestions.lead_id
        AND wm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.inbox_messages im
      JOIN public.leads l ON l.id = im.lead_id
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE im.id = ai_response_suggestions.message_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 5. HELPER FUNCTION: Classify Message Intent
-- ============================================================================
-- This function will be called by the AI engine to classify messages

CREATE OR REPLACE FUNCTION public.classify_message_intent(
  p_message_body text,
  p_subject text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- This is a placeholder - actual classification happens in the AI engine
  -- Returns a JSON object with intent classification
  v_result := jsonb_build_object(
    'intent', 'unknown',
    'confidence', 0.0,
    'urgency', 'medium',
    'category', 'General Question'
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- 6. HELPER FUNCTION: Get Recommended Pipeline Stage
-- ============================================================================
-- Maps intent to recommended pipeline stage

CREATE OR REPLACE FUNCTION public.get_recommended_pipeline_stage(
  p_intent text
)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN CASE
    WHEN p_intent IN ('Hot Lead', 'Storm Damage', 'Schedule Request') THEN 'estimate_scheduled'
    WHEN p_intent = 'Warm Lead' THEN 'interested'
    WHEN p_intent = 'Price Question' THEN 'estimate_completed'
    WHEN p_intent = 'Insurance Inquiry' THEN 'interested'
    WHEN p_intent = 'Not Interested' THEN 'lost'
    WHEN p_intent = 'Cold Lead' THEN 'contacted'
    ELSE 'replied'
  END;
END;
$$;

-- ============================================================================
-- 7. TRIGGER: Auto-update lead pipeline on intent classification
-- ============================================================================
-- When a message is classified with high confidence, auto-update the lead's pipeline stage

CREATE OR REPLACE FUNCTION public.auto_update_lead_pipeline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_lead_id uuid;
  v_pipeline_stage text;
BEGIN
  -- Only process if intent is classified and confidence is high
  IF NEW.interpreted_intent IS NOT NULL 
     AND NEW.confidence >= 0.7 
     AND NEW.direction = 'inbound' THEN
    
    -- Get lead_id from the message
    v_lead_id := NEW.lead_id;
    
    IF v_lead_id IS NOT NULL THEN
      -- Get recommended pipeline stage
      v_pipeline_stage := public.get_recommended_pipeline_stage(NEW.interpreted_intent);
      
      -- Update lead's pipeline stage
      UPDATE public.leads
      SET 
        pipeline_stage = v_pipeline_stage,
        last_reply_at = NEW.created_at,
        last_intent = NEW.interpreted_intent,
        last_message = NEW.body,
        updated_at = now()
      WHERE id = v_lead_id
        AND (pipeline_stage IS NULL OR pipeline_stage != v_pipeline_stage);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS trg_auto_update_lead_pipeline ON public.inbox_messages;
CREATE TRIGGER trg_auto_update_lead_pipeline
  AFTER INSERT OR UPDATE OF interpreted_intent, confidence
  ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_update_lead_pipeline();

-- ============================================================================
-- 8. INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inbox_messages_interpreted_intent 
  ON public.inbox_messages(interpreted_intent) 
  WHERE interpreted_intent IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_urgency 
  ON public.inbox_messages(urgency) 
  WHERE urgency IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_recommended_action 
  ON public.inbox_messages(recommended_action) 
  WHERE recommended_action IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_confidence 
  ON public.inbox_messages(confidence DESC) 
  WHERE confidence IS NOT NULL;

-- ============================================================================
-- 9. VIEW: Inbox Intelligence Summary
-- ============================================================================
-- Quick view of inbox intelligence stats

CREATE OR REPLACE VIEW public.inbox_intelligence_summary AS
SELECT 
  im.workspace_id,
  im.interpreted_intent,
  COUNT(*) as message_count,
  AVG(im.confidence) as avg_confidence,
  COUNT(CASE WHEN im.urgency = 'critical' THEN 1 END) as critical_count,
  COUNT(CASE WHEN im.urgency = 'high' THEN 1 END) as high_urgency_count,
  MAX(im.created_at) as latest_message_at
FROM public.inbox_messages im
WHERE im.direction = 'inbound'
  AND im.interpreted_intent IS NOT NULL
GROUP BY im.workspace_id, im.interpreted_intent;



























