-- =========================================================
-- Block 11900 — Campaign Results Breakdown v1
-- Campaign Results Page — Makes roofers realize SmartSend makes them money
-- =========================================================

-- 1. Create campaign_results table to cache calculated results
CREATE TABLE IF NOT EXISTS public.campaign_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  campaign_name text NOT NULL,
  
  -- Section 1: Campaign Summary
  total_recipients integer NOT NULL DEFAULT 0,
  days_running integer NOT NULL DEFAULT 0,
  performance_badge text NOT NULL CHECK (performance_badge IN ('strong', 'good', 'weak')),
  
  -- Section 2: Core Money Metrics (The Big 4)
  emails_sent integer NOT NULL DEFAULT 0,
  replies_received integer NOT NULL DEFAULT 0,
  hot_leads integer NOT NULL DEFAULT 0,
  estimated_job_value numeric(12,2) NOT NULL DEFAULT 0,
  
  -- Section 3: ROI Breakdown
  hot_value numeric(12,2) NOT NULL DEFAULT 0,
  warm_value numeric(12,2) NOT NULL DEFAULT 0,
  follow_up_value numeric(12,2) NOT NULL DEFAULT 0,
  new_value numeric(12,2) NOT NULL DEFAULT 0,
  total_estimated_value numeric(12,2) NOT NULL DEFAULT 0,
  warm_leads_count integer NOT NULL DEFAULT 0,
  follow_up_leads_count integer NOT NULL DEFAULT 0,
  new_leads_count integer NOT NULL DEFAULT 0,
  
  -- Performance metrics
  reply_rate numeric(5,2) NOT NULL DEFAULT 0, -- percentage
  
  -- Timestamps
  campaign_started_at timestamptz,
  campaign_finished_at timestamptz,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(campaign_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_results_campaign ON public.campaign_results(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_results_calculated_at ON public.campaign_results(calculated_at DESC);

-- Enable RLS
ALTER TABLE public.campaign_results ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view campaign_results for campaigns in their workspace
CREATE POLICY IF NOT EXISTS "campaign_results_select_workspace"
  ON public.campaign_results
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = campaign_results.campaign_id
        AND wm.user_id = auth.uid()
    )
  );

-- 2. Function to calculate campaign results
CREATE OR REPLACE FUNCTION public.calculate_campaign_results(p_campaign_id uuid)
RETURNS public.campaign_results
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.campaigns%ROWTYPE;
  v_result public.campaign_results%ROWTYPE;
  
  -- Metrics
  v_emails_sent integer := 0;
  v_replies_received integer := 0;
  v_hot_leads integer := 0;
  v_warm_leads integer := 0;
  v_follow_up_leads integer := 0;
  v_new_leads integer := 0;
  v_reply_rate numeric(5,2) := 0;
  
  -- Values (using standard roofing estimates)
  v_hot_value numeric(12,2) := 0;
  v_warm_value numeric(12,2) := 0;
  v_follow_up_value numeric(12,2) := 0;
  v_new_value numeric(12,2) := 0;
  v_total_estimated_value numeric(12,2) := 0;
  v_estimated_job_value numeric(12,2) := 0;
  
  -- Performance badge
  v_performance_badge text := 'weak';
  
  -- Time calculations
  v_days_running integer := 0;
  v_started_at timestamptz;
  v_finished_at timestamptz;
BEGIN
  -- Get campaign info
  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE id = p_campaign_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found: %', p_campaign_id;
  END IF;
  
  -- Get campaign start/finish times
  v_started_at := COALESCE(v_campaign.started_at, v_campaign.created_at);
  v_finished_at := v_campaign.finished_at;
  
  -- Calculate days running
  IF v_finished_at IS NOT NULL THEN
    v_days_running := GREATEST(1, EXTRACT(EPOCH FROM (v_finished_at - v_started_at)) / 86400)::integer;
  ELSE
    v_days_running := GREATEST(1, EXTRACT(EPOCH FROM (NOW() - v_started_at)) / 86400)::integer;
  END IF;
  
  -- Count emails sent (from send_logs, email_logs, or outbound_emails)
  SELECT COUNT(*) INTO v_emails_sent
  FROM (
    SELECT id FROM public.send_logs WHERE campaign_id = p_campaign_id AND status = 'sent'
    UNION ALL
    SELECT id FROM public.email_logs WHERE campaign_id = p_campaign_id AND event_type = 'sent'
    UNION ALL
    SELECT id FROM public.outbound_emails WHERE campaign_id = p_campaign_id AND status = 'sent'
  ) combined_sends;
  
  -- Count total recipients (unique leads in campaign)
  SELECT COUNT(DISTINCT lead_id) INTO v_result.total_recipients
  FROM (
    SELECT lead_id FROM public.campaign_leads WHERE campaign_id = p_campaign_id
    UNION
    SELECT lead_id FROM public.send_logs WHERE campaign_id = p_campaign_id
    UNION
    SELECT lead_id FROM public.email_logs WHERE campaign_id = p_campaign_id
    UNION
    SELECT lead_id FROM public.outbound_emails WHERE campaign_id = p_campaign_id
  ) all_leads;
  
  -- Count replies received (from inbound_messages, email_replies, or reply_threads)
  SELECT COUNT(DISTINCT from_email) INTO v_replies_received
  FROM (
    SELECT LOWER(from_email) as from_email FROM public.inbound_messages WHERE campaign_id = p_campaign_id
    UNION
    SELECT LOWER(from_email) as from_email FROM public.email_replies WHERE campaign_id = p_campaign_id
    UNION
    SELECT LOWER(from_email) as from_email FROM public.reply_threads WHERE campaign_id = p_campaign_id
  ) all_replies;
  
  -- Count leads by status (from lead_auto_follow_up_stats, contacts, or leads)
  SELECT COUNT(*) INTO v_hot_leads
  FROM (
    SELECT DISTINCT lead_id FROM public.lead_auto_follow_up_stats 
    WHERE campaign_id = p_campaign_id AND lead_status = 'hot'
    UNION
    SELECT DISTINCT id FROM public.contacts c
    JOIN public.campaign_contacts cc ON cc.contact_id = c.id
    WHERE cc.campaign_id = p_campaign_id AND c.lead_status = 'hot'
    UNION
    SELECT DISTINCT id FROM public.leads
    WHERE campaign_id = p_campaign_id AND lead_status = 'hot'
  ) hot;
  
  SELECT COUNT(*) INTO v_warm_leads
  FROM (
    SELECT DISTINCT lead_id FROM public.lead_auto_follow_up_stats 
    WHERE campaign_id = p_campaign_id AND lead_status = 'warm'
    UNION
    SELECT DISTINCT id FROM public.contacts c
    JOIN public.campaign_contacts cc ON cc.contact_id = c.id
    WHERE cc.campaign_id = p_campaign_id AND c.lead_status = 'warm'
    UNION
    SELECT DISTINCT id FROM public.leads
    WHERE campaign_id = p_campaign_id AND lead_status = 'warm'
  ) warm;
  
  SELECT COUNT(*) INTO v_follow_up_leads
  FROM (
    SELECT DISTINCT lead_id FROM public.lead_auto_follow_up_stats 
    WHERE campaign_id = p_campaign_id AND lead_status IN ('follow_up', 'neutral')
    UNION
    SELECT DISTINCT id FROM public.contacts c
    JOIN public.campaign_contacts cc ON cc.contact_id = c.id
    WHERE cc.campaign_id = p_campaign_id AND c.lead_status IN ('follow_up', 'neutral')
    UNION
    SELECT DISTINCT id FROM public.leads
    WHERE campaign_id = p_campaign_id AND lead_status IN ('follow_up', 'neutral')
  ) follow_up;
  
  -- New leads = total recipients - (hot + warm + follow_up)
  v_new_leads := GREATEST(0, v_result.total_recipients - v_hot_leads - v_warm_leads - v_follow_up_leads);
  
  -- Calculate reply rate
  IF v_emails_sent > 0 THEN
    v_reply_rate := ROUND((v_replies_received::numeric / v_emails_sent::numeric) * 100, 2);
  END IF;
  
  -- Calculate estimated values (standard roofing estimates)
  -- HOT = $7,000 per lead
  v_hot_value := v_hot_leads * 7000;
  -- WARM = $2,500 per lead
  v_warm_value := v_warm_leads * 2500;
  -- FOLLOW_UP = $1,000 per lead
  v_follow_up_value := v_follow_up_leads * 1000;
  -- NEW = $300 per lead
  v_new_value := v_new_leads * 300;
  
  v_total_estimated_value := v_hot_value + v_warm_value + v_follow_up_value + v_new_value;
  
  -- Estimated job value = hot value (most likely to convert)
  v_estimated_job_value := v_hot_value;
  
  -- Calculate performance badge
  -- Strong: 10%+ reply rate, at least 1 hot lead, est value > $5k
  IF v_reply_rate >= 10 AND v_hot_leads >= 1 AND v_total_estimated_value >= 5000 THEN
    v_performance_badge := 'strong';
  -- Good: 5%+ reply rate, warm leads present
  ELSIF v_reply_rate >= 5 AND v_warm_leads > 0 THEN
    v_performance_badge := 'good';
  -- Weak: reply rate < 3% or no hot leads
  ELSE
    v_performance_badge := 'weak';
  END IF;
  
  -- Upsert campaign_results
  INSERT INTO public.campaign_results (
    campaign_id,
    campaign_name,
    total_recipients,
    days_running,
    performance_badge,
    emails_sent,
    replies_received,
    hot_leads,
    estimated_job_value,
    hot_value,
    warm_value,
    follow_up_value,
    new_value,
    total_estimated_value,
    warm_leads_count,
    follow_up_leads_count,
    new_leads_count,
    reply_rate,
    campaign_started_at,
    campaign_finished_at,
    calculated_at
  ) VALUES (
    p_campaign_id,
    COALESCE(v_campaign.name, v_campaign.title, 'Untitled Campaign'),
    v_result.total_recipients,
    v_days_running,
    v_performance_badge,
    v_emails_sent,
    v_replies_received,
    v_hot_leads,
    v_estimated_job_value,
    v_hot_value,
    v_warm_value,
    v_follow_up_value,
    v_new_value,
    v_total_estimated_value,
    v_warm_leads,
    v_follow_up_leads,
    v_new_leads,
    v_reply_rate,
    v_started_at,
    v_finished_at,
    NOW()
  )
  ON CONFLICT (campaign_id) DO UPDATE SET
    campaign_name = EXCLUDED.campaign_name,
    total_recipients = EXCLUDED.total_recipients,
    days_running = EXCLUDED.days_running,
    performance_badge = EXCLUDED.performance_badge,
    emails_sent = EXCLUDED.emails_sent,
    replies_received = EXCLUDED.replies_received,
    hot_leads = EXCLUDED.hot_leads,
    estimated_job_value = EXCLUDED.estimated_job_value,
    hot_value = EXCLUDED.hot_value,
    warm_value = EXCLUDED.warm_value,
    follow_up_value = EXCLUDED.follow_up_value,
    new_value = EXCLUDED.new_value,
    total_estimated_value = EXCLUDED.total_estimated_value,
    warm_leads_count = EXCLUDED.warm_leads_count,
    follow_up_leads_count = EXCLUDED.follow_up_leads_count,
    new_leads_count = EXCLUDED.new_leads_count,
    reply_rate = EXCLUDED.reply_rate,
    campaign_started_at = EXCLUDED.campaign_started_at,
    campaign_finished_at = EXCLUDED.campaign_finished_at,
    calculated_at = NOW();
  
  -- Return the result
  SELECT * INTO v_result
  FROM public.campaign_results
  WHERE campaign_id = p_campaign_id;
  
  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.calculate_campaign_results(uuid) TO authenticated;

-- Comments
COMMENT ON TABLE public.campaign_results IS 'Cached campaign results for the Campaign Results Page (Block 11900)';
COMMENT ON FUNCTION public.calculate_campaign_results(uuid) IS 'Calculates and caches campaign results including metrics, ROI breakdown, and performance badge';





















































