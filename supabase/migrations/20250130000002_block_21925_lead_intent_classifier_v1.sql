-- Block 21925 — SmartSend Roofing Lead Intent Classifier v1
-- Understand EXACTLY What the Homeowner Wants — and Route + Respond Automatically
--
-- This migration adds the roofing-specific intent classification system
-- that allows SmartSend to automatically route, respond, and prioritize leads
-- based on what the homeowner is actually trying to do.

-- 1. Add last_intent column to leads table
-- This stores the most recent intent classification for quick access
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS last_intent text;

-- Create index for filtering by intent
CREATE INDEX IF NOT EXISTS idx_leads_last_intent 
  ON public.leads(last_intent) 
  WHERE last_intent IS NOT NULL;

-- Create index for workspace + intent queries
CREATE INDEX IF NOT EXISTS idx_leads_workspace_last_intent 
  ON public.leads(workspace_id, last_intent) 
  WHERE workspace_id IS NOT NULL AND last_intent IS NOT NULL;

-- 2. Update homeowner_intent column comment to reflect new roofing-specific intents
COMMENT ON COLUMN public.lead_activities.homeowner_intent IS 
  'AI-classified roofing-specific intent: intent_book_estimate, intent_schedule_inspection, intent_needs_asap_service, intent_request_price, intent_price_shopping, intent_provide_insurance_info, intent_ask_insurance_process, intent_ready_for_proposal, intent_still_deciding, intent_question_about_scope, intent_not_interested, intent_cancel_or_stop';

-- 3. Add comment for leads.last_intent
COMMENT ON COLUMN public.leads.last_intent IS 
  'Most recent homeowner intent classification from lead_activities. Used for routing, prioritization, and automation triggers.';

-- 4. Create function to update last_intent on leads when activity intent changes
CREATE OR REPLACE FUNCTION public.update_lead_last_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update the lead's last_intent when a new intent is classified
  IF NEW.homeowner_intent IS NOT NULL AND NEW.kind = 'message_in' THEN
    UPDATE public.leads
    SET last_intent = NEW.homeowner_intent
    WHERE id = NEW.lead_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically update last_intent
DROP TRIGGER IF EXISTS trg_update_lead_last_intent ON public.lead_activities;
CREATE TRIGGER trg_update_lead_last_intent
  AFTER INSERT OR UPDATE ON public.lead_activities
  FOR EACH ROW
  WHEN (NEW.homeowner_intent IS NOT NULL AND NEW.kind = 'message_in')
  EXECUTE FUNCTION public.update_lead_last_intent();

-- 5. Create view for intent-based analytics
CREATE OR REPLACE VIEW public.v_lead_intent_summary AS
SELECT 
  lead_id,
  campaign_id,
  COUNT(*) FILTER (WHERE homeowner_intent IS NOT NULL) as classified_count,
  COUNT(*) FILTER (WHERE homeowner_intent = 'intent_book_estimate') as book_estimate_count,
  COUNT(*) FILTER (WHERE homeowner_intent = 'intent_schedule_inspection') as schedule_inspection_count,
  COUNT(*) FILTER (WHERE homeowner_intent = 'intent_needs_asap_service') as asap_service_count,
  COUNT(*) FILTER (WHERE homeowner_intent = 'intent_request_price') as request_price_count,
  COUNT(*) FILTER (WHERE homeowner_intent = 'intent_price_shopping') as price_shopping_count,
  COUNT(*) FILTER (WHERE homeowner_intent = 'intent_provide_insurance_info') as provide_insurance_count,
  COUNT(*) FILTER (WHERE homeowner_intent = 'intent_ready_for_proposal') as ready_for_proposal_count,
  COUNT(*) FILTER (WHERE homeowner_intent = 'intent_not_interested') as not_interested_count,
  MAX(created_at) FILTER (WHERE homeowner_intent IS NOT NULL) as last_intent_at,
  (array_agg(homeowner_intent ORDER BY created_at DESC))[1] as latest_intent
FROM public.lead_activities
WHERE kind = 'message_in'
GROUP BY lead_id, campaign_id;

-- Grant access
GRANT SELECT ON public.v_lead_intent_summary TO authenticated;









































