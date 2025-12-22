-- Block 21823 — SmartSend Roofing Homeowner Tone Intent Engine v1
-- AI-Powered Emotion + Intent Detection for Every Incoming Message
-- 
-- This feature automatically classifies homeowner messages with:
-- - Tone: positive, neutral, confused, impatient, angry, price-shopping, scheduling-focused, appreciation
-- - Intent: high intent, medium intent, low intent, not interested, needs clarification, ready to book, wants price, stalling

-- 1. Add tone and intent columns to lead_activities table
ALTER TABLE public.lead_activities 
  ADD COLUMN IF NOT EXISTS homeowner_tone text,
  ADD COLUMN IF NOT EXISTS homeowner_intent text;

-- Create indexes for filtering and queries
CREATE INDEX IF NOT EXISTS idx_lead_activities_homeowner_tone 
  ON public.lead_activities(homeowner_tone) 
  WHERE homeowner_tone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_activities_homeowner_intent 
  ON public.lead_activities(homeowner_intent) 
  WHERE homeowner_intent IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_activities_kind_tone_intent 
  ON public.lead_activities(kind, homeowner_tone, homeowner_intent) 
  WHERE kind = 'message_in' AND homeowner_tone IS NOT NULL;

-- 2. Create helper function to mark activities for classification
-- This can be called from application code or via webhook
CREATE OR REPLACE FUNCTION public.queue_homeowner_classification(
  p_activity_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_activity record;
BEGIN
  -- Get the activity details
  SELECT id, body INTO v_activity
  FROM public.lead_activities
  WHERE id = p_activity_id
    AND kind = 'message_in'
    AND body IS NOT NULL
    AND body != ''
    AND homeowner_tone IS NULL; -- Only classify if not already classified
  
  IF v_activity.id IS NULL THEN
    RETURN; -- Activity doesn't exist or already classified
  END IF;
  
  -- The actual classification will be done by calling the edge function
  -- from the application layer. This function is a placeholder for future
  -- database-level triggers if pg_net becomes available.
  
  -- For now, classification is triggered from application code
  -- See: src/lib/homeowner-classification.ts (to be created)
END;
$$;

-- 3. Create a webhook trigger function (optional - requires Supabase webhook setup)
-- This allows automatic classification via Supabase webhooks
-- The webhook should be configured to call the edge function
CREATE OR REPLACE FUNCTION public.notify_classification_needed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- This trigger can be used with Supabase webhooks
  -- Configure webhook in Supabase Dashboard to call classify-homeowner-message edge function
  IF NEW.kind = 'message_in' AND NEW.body IS NOT NULL AND NEW.body != '' AND NEW.homeowner_tone IS NULL THEN
    -- Webhook will be triggered automatically if configured
    -- Payload: { "activity_id": NEW.id, "message_body": NEW.body }
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for webhook notification (optional)
DROP TRIGGER IF EXISTS trg_notify_classification ON public.lead_activities;
CREATE TRIGGER trg_notify_classification
  AFTER INSERT ON public.lead_activities
  FOR EACH ROW
  WHEN (NEW.kind = 'message_in' AND NEW.body IS NOT NULL AND NEW.body != '')
  EXECUTE FUNCTION public.notify_classification_needed();

-- 4. Create view for easy querying of tone/intent data
CREATE OR REPLACE VIEW public.v_homeowner_tone_intent_summary AS
SELECT 
  lead_id,
  campaign_id,
  COUNT(*) FILTER (WHERE homeowner_tone IS NOT NULL) as classified_count,
  COUNT(*) FILTER (WHERE homeowner_tone = 'positive') as positive_count,
  COUNT(*) FILTER (WHERE homeowner_tone = 'angry') as angry_count,
  COUNT(*) FILTER (WHERE homeowner_tone = 'confused') as confused_count,
  COUNT(*) FILTER (WHERE homeowner_tone = 'price-shopping') as price_shopping_count,
  COUNT(*) FILTER (WHERE homeowner_intent = 'high intent') as high_intent_count,
  COUNT(*) FILTER (WHERE homeowner_intent = 'ready to book') as ready_to_book_count,
  MAX(created_at) FILTER (WHERE homeowner_tone IS NOT NULL) as last_classified_at
FROM public.lead_activities
WHERE kind = 'message_in'
GROUP BY lead_id, campaign_id;

-- Grant access
GRANT SELECT ON public.v_homeowner_tone_intent_summary TO authenticated;

-- 5. Add comment for documentation
COMMENT ON COLUMN public.lead_activities.homeowner_tone IS 
  'AI-classified emotional tone: positive, neutral, confused, impatient, angry, price-shopping, scheduling-focused, appreciation';

COMMENT ON COLUMN public.lead_activities.homeowner_intent IS 
  'AI-classified intent: high intent, medium intent, low intent, not interested, needs clarification, ready to book, wants price, stalling';

