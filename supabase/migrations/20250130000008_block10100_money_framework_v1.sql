-- =========================================================
-- Block 10100 — SmartSend Money Framework v1
-- (Turning Beta Roofers Into Paid Clients Fast)
-- =========================================================

-- Add workspace_id to beta_testers for easier querying
ALTER TABLE IF EXISTS public.beta_testers
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_beta_testers_workspace ON public.beta_testers(workspace_id);

-- Add conversion tracking fields to beta_testers
ALTER TABLE IF EXISTS public.beta_testers
  ADD COLUMN IF NOT EXISTS first_homeowner_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS conversion_offer_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS conversion_offer_plan_selected text CHECK (conversion_offer_plan_selected IN ('starter', 'growth', 'domination')),
  ADD COLUMN IF NOT EXISTS front_loaded_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS front_loaded_campaign_launched_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_job_value_from_campaign numeric(12,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_beta_testers_first_reply ON public.beta_testers(first_homeowner_reply_at);
CREATE INDEX IF NOT EXISTS idx_beta_testers_conversion_offer ON public.beta_testers(conversion_offer_sent_at);

-- Conversion offers table (tracks founders deal offers sent to beta testers)
CREATE TABLE IF NOT EXISTS public.conversion_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beta_tester_id uuid NOT NULL REFERENCES public.beta_testers(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  
  -- Offer details
  offer_type text NOT NULL DEFAULT 'founders_deal' CHECK (offer_type IN ('founders_deal', 'early_adopter', 'custom')),
  plan_options jsonb NOT NULL DEFAULT '{
    "starter": {"price": 99, "campaigns": 1, "emails_per_month": 500},
    "growth": {"price": 199, "campaigns": 3, "emails_per_month": 2000},
    "domination": {"price": 399, "campaigns": null, "emails_per_month": null}
  }'::jsonb,
  
  -- Status tracking
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_via text CHECK (sent_via IN ('email', 'in_app', 'dashboard')),
  viewed_at timestamptz,
  responded_at timestamptz,
  plan_selected text CHECK (plan_selected IN ('starter', 'growth', 'domination')),
  
  -- Conversion metrics at time of offer
  emails_sent_at_offer int DEFAULT 0,
  replies_received_at_offer int DEFAULT 0,
  hot_leads_at_offer int DEFAULT 0,
  estimated_job_value_at_offer numeric(12,2) DEFAULT 0,
  
  -- Message content (stored for reference)
  message_subject text,
  message_body text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversion_offers_beta_tester ON public.conversion_offers(beta_tester_id);
CREATE INDEX IF NOT EXISTS idx_conversion_offers_workspace ON public.conversion_offers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversion_offers_sent_at ON public.conversion_offers(sent_at);
CREATE INDEX IF NOT EXISTS idx_conversion_offers_responded_at ON public.conversion_offers(responded_at);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_conversion_offer_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conversion_offers_updated_at
  BEFORE UPDATE ON public.conversion_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversion_offer_updated_at();

-- Function to track first homeowner reply and trigger conversion offer eligibility
CREATE OR REPLACE FUNCTION public.track_beta_tester_first_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_beta_tester_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Check if this reply is from a homeowner (not auto-reply, not bounce)
  -- This assumes replies table has fields like: workspace_id, contact_id, is_auto_reply, etc.
  -- Adjust based on your actual replies schema
  
  -- Find beta tester by workspace_id
  SELECT id, workspace_id INTO v_beta_tester_id, v_workspace_id
  FROM public.beta_testers
  WHERE workspace_id = NEW.workspace_id
    AND first_homeowner_reply_at IS NULL
  LIMIT 1;
  
  -- If beta tester found and this is their first reply
  IF v_beta_tester_id IS NOT NULL THEN
    UPDATE public.beta_testers
    SET first_homeowner_reply_at = now(),
        updated_at = now()
    WHERE id = v_beta_tester_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Note: Actual trigger creation depends on your replies table schema
-- Instead of a database trigger, we use an API endpoint approach:
-- Call POST /api/beta/check-first-reply when a reply is detected
-- This gives more control and easier debugging
-- 
-- Integration example (in your inbound reply handler):
-- if (workspace_id && !isAutoReply) {
--   await fetch('/api/beta/check-first-reply', {
--     method: 'POST',
--     body: JSON.stringify({ workspace_id, reply_id, is_auto_reply: false })
--   });
-- }

-- View: Beta tester conversion dashboard (the "Holy Shit" moment)
CREATE OR REPLACE VIEW public.beta_conversion_dashboard AS
SELECT 
  bt.id as beta_tester_id,
  bt.company_name,
  bt.workspace_id,
  bt.beta_status,
  bt.first_campaign_launched_at,
  bt.first_homeowner_reply_at,
  bt.conversion_offer_sent_at,
  bt.converted_to_paid_at,
  
  -- Campaign metrics (from lead_auto_follow_up_stats or similar)
  COALESCE(SUM(CASE WHEN lafs.campaign_id IS NOT NULL THEN 1 ELSE 0 END), 0) as emails_sent,
  COALESCE(COUNT(DISTINCT CASE WHEN lafs.lead_status = 'replied' THEN lafs.lead_id END), 0) as replies_received,
  COALESCE(COUNT(DISTINCT CASE WHEN lafs.lead_status = 'hot' THEN lafs.lead_id END), 0) as hot_leads,
  COALESCE(COUNT(DISTINCT CASE WHEN lafs.pipeline_stage IN ('estimate_booked', 'won') THEN lafs.lead_id END), 0) as leads_with_estimates,
  
  -- Estimated job value (sum of potential_job_value from hot/warm leads)
  COALESCE(SUM(CASE 
    WHEN lafs.lead_status IN ('hot', 'warm') AND lafs.potential_job_value IS NOT NULL 
    THEN lafs.potential_job_value 
    ELSE 0 
  END), 0) as estimated_job_value,
  
  -- Time to first reply (in hours)
  CASE 
    WHEN bt.first_homeowner_reply_at IS NOT NULL AND bt.first_campaign_launched_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (bt.first_homeowner_reply_at - bt.first_campaign_launched_at)) / 3600
    ELSE NULL
  END as hours_to_first_reply,
  
  -- Conversion status
  CASE 
    WHEN bt.converted_to_paid_at IS NOT NULL THEN 'converted'
    WHEN bt.conversion_offer_sent_at IS NOT NULL THEN 'offer_sent'
    WHEN bt.first_homeowner_reply_at IS NOT NULL THEN 'ready_for_conversion'
    WHEN bt.first_campaign_launched_at IS NOT NULL THEN 'campaign_running'
    ELSE 'not_started'
  END as conversion_stage
  
FROM public.beta_testers bt
LEFT JOIN public.campaigns c ON c.workspace_id = bt.workspace_id
LEFT JOIN public.lead_auto_follow_up_stats lafs ON lafs.campaign_id = c.id
GROUP BY bt.id, bt.company_name, bt.workspace_id, bt.beta_status, 
         bt.first_campaign_launched_at, bt.first_homeowner_reply_at, 
         bt.conversion_offer_sent_at, bt.converted_to_paid_at;

-- RLS Policies
ALTER TABLE public.conversion_offers ENABLE ROW LEVEL SECURITY;

-- Policy: Beta testers can view their own conversion offers
CREATE POLICY "Beta testers can view own conversion offers"
  ON public.conversion_offers
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
    OR
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Policy: Service role can manage all conversion offers
CREATE POLICY "Service role can manage conversion offers"
  ON public.conversion_offers
  FOR ALL
  USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE public.conversion_offers IS 'Tracks founders deal conversion offers sent to beta testers';
COMMENT ON COLUMN public.beta_testers.first_homeowner_reply_at IS 'Timestamp of first homeowner reply (triggers conversion offer eligibility)';
COMMENT ON COLUMN public.beta_testers.conversion_offer_sent_at IS 'When the founders deal conversion offer was sent';
COMMENT ON COLUMN public.beta_testers.front_loaded_campaign_id IS 'The initial 72-hour campaign created for front-loaded wins';
COMMENT ON COLUMN public.beta_testers.estimated_job_value_from_campaign IS 'Total estimated job value from all leads in the front-loaded campaign';
COMMENT ON VIEW public.beta_conversion_dashboard IS 'Dashboard view showing conversion metrics for beta testers (the "Holy Shit" moment)';

