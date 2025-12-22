-- =========================================================
-- Block 11900 — SmartSend Campaign Results Breakdown v1
-- (The ROI Screen That Makes Roofers Say "This Paid For Itself")
-- =========================================================

-- 1. Create campaign_results table to cache calculated results
CREATE TABLE IF NOT EXISTS public.campaign_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  
  -- Campaign Summary
  campaign_name text NOT NULL,
  total_recipients int NOT NULL DEFAULT 0,
  days_running int NOT NULL DEFAULT 0,
  performance_badge text NOT NULL DEFAULT 'weak' CHECK (performance_badge IN ('strong', 'good', 'weak')),
  
  -- Core Money Metrics (The Big 4)
  emails_sent int NOT NULL DEFAULT 0,
  replies_received int NOT NULL DEFAULT 0,
  hot_leads int NOT NULL DEFAULT 0,
  estimated_job_value numeric(12, 2) NOT NULL DEFAULT 0,
  
  -- ROI Breakdown
  hot_value numeric(12, 2) NOT NULL DEFAULT 0,
  warm_value numeric(12, 2) NOT NULL DEFAULT 0,
  follow_up_value numeric(12, 2) NOT NULL DEFAULT 0,
  new_value numeric(12, 2) NOT NULL DEFAULT 0,
  total_estimated_value numeric(12, 2) NOT NULL DEFAULT 0,
  
  -- Counts by status
  warm_leads_count int NOT NULL DEFAULT 0,
  follow_up_leads_count int NOT NULL DEFAULT 0,
  new_leads_count int NOT NULL DEFAULT 0,
  
  -- Calculated metrics
  reply_rate numeric(5, 2) NOT NULL DEFAULT 0, -- percentage
  
  -- Timestamps
  calculated_at timestamptz NOT NULL DEFAULT now(),
  campaign_started_at timestamptz,
  campaign_finished_at timestamptz,
  
  -- Unique constraint: one result per campaign
  UNIQUE(campaign_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_results_workspace ON public.campaign_results(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaign_results_calculated ON public.campaign_results(calculated_at DESC);

-- RLS
ALTER TABLE public.campaign_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view campaign results in their workspace"
  ON public.campaign_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = campaign_results.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- 2. Function to calculate campaign results
CREATE OR REPLACE FUNCTION public.calculate_campaign_results(
  p_campaign_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign RECORD;
  v_workspace_id uuid;
  v_emails_sent int := 0;
  v_replies_received int := 0;
  v_hot_leads int := 0;
  v_warm_leads int := 0;
  v_follow_up_leads int := 0;
  v_new_leads int := 0;
  v_hot_value numeric(12, 2) := 0;
  v_warm_value numeric(12, 2) := 0;
  v_follow_up_value numeric(12, 2) := 0;
  v_new_value numeric(12, 2) := 0;
  v_total_estimated_value numeric(12, 2) := 0;
  v_reply_rate numeric(5, 2) := 0;
  v_performance_badge text := 'weak';
  v_days_running int := 0;
  v_started_at timestamptz;
  v_finished_at timestamptz;
BEGIN
  -- Get campaign info
  SELECT 
    c.id,
    c.name,
    c.workspace_id,
    c.status,
    c.created_at,
    c.started_at,
    c.finished_at
  INTO v_campaign
  FROM public.campaigns c
  WHERE c.id = p_campaign_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found: %', p_campaign_id;
  END IF;
  
  v_workspace_id := v_campaign.workspace_id;
  v_started_at := COALESCE(v_campaign.started_at, v_campaign.created_at);
  v_finished_at := v_campaign.finished_at;
  
  -- Calculate days running
  IF v_finished_at IS NOT NULL THEN
    v_days_running := GREATEST(1, EXTRACT(EPOCH FROM (v_finished_at - v_started_at)) / 86400)::int;
  ELSIF v_started_at IS NOT NULL THEN
    v_days_running := GREATEST(1, EXTRACT(EPOCH FROM (now() - v_started_at)) / 86400)::int;
  ELSE
    v_days_running := 0;
  END IF;
  
  -- Count emails sent (from send_queue or campaign_recipients)
  SELECT COUNT(*) INTO v_emails_sent
  FROM public.send_queue sq
  WHERE sq.campaign_id = p_campaign_id
  AND sq.status = 'sent';
  
  -- If no send_queue data, try campaign_recipients
  IF v_emails_sent = 0 THEN
    SELECT COUNT(*) INTO v_emails_sent
    FROM public.campaign_recipients cr
    WHERE cr.campaign_id = p_campaign_id
    AND cr.status = 'sent';
  END IF;
  
  -- Count replies received (from replies or reply_threads)
  SELECT COUNT(DISTINCT rt.id) INTO v_replies_received
  FROM public.reply_threads rt
  WHERE rt.campaign_id = p_campaign_id;
  
  -- If no reply_threads, try replies table
  IF v_replies_received = 0 THEN
    SELECT COUNT(DISTINCT r.id) INTO v_replies_received
    FROM public.replies r
    WHERE r.campaign_id = p_campaign_id;
  END IF;
  
  -- Count leads by status (using lead_status table or lead_auto_follow_up_stats)
  -- HOT leads
  SELECT COUNT(*) INTO v_hot_leads
  FROM public.lead_status ls
  JOIN public.leads l ON l.id = ls.lead_id
  WHERE ls.status = 'HOT'
  AND EXISTS (
    SELECT 1 FROM public.send_queue sq
    WHERE sq.campaign_id = p_campaign_id
    AND sq.lead_id = l.id
  );
  
  -- If no lead_status, try lead_auto_follow_up_stats
  IF v_hot_leads = 0 THEN
    SELECT COUNT(*) INTO v_hot_leads
    FROM public.lead_auto_follow_up_stats lafs
    WHERE lafs.campaign_id = p_campaign_id
    AND lafs.lead_status = 'hot';
  END IF;
  
  -- WARM leads
  SELECT COUNT(*) INTO v_warm_leads
  FROM public.lead_status ls
  JOIN public.leads l ON l.id = ls.lead_id
  WHERE ls.status = 'WARM'
  AND EXISTS (
    SELECT 1 FROM public.send_queue sq
    WHERE sq.campaign_id = p_campaign_id
    AND sq.lead_id = l.id
  );
  
  IF v_warm_leads = 0 THEN
    SELECT COUNT(*) INTO v_warm_leads
    FROM public.lead_auto_follow_up_stats lafs
    WHERE lafs.campaign_id = p_campaign_id
    AND lafs.lead_status = 'warm';
  END IF;
  
  -- FOLLOW_UP leads
  SELECT COUNT(*) INTO v_follow_up_leads
  FROM public.lead_status ls
  JOIN public.leads l ON l.id = ls.lead_id
  WHERE ls.status = 'FOLLOW_UP'
  AND EXISTS (
    SELECT 1 FROM public.send_queue sq
    WHERE sq.campaign_id = p_campaign_id
    AND sq.lead_id = l.id
  );
  
  IF v_follow_up_leads = 0 THEN
    SELECT COUNT(*) INTO v_follow_up_leads
    FROM public.lead_auto_follow_up_stats lafs
    WHERE lafs.campaign_id = p_campaign_id
    AND lafs.lead_status = 'follow_up';
  END IF;
  
  -- NEW leads (leads that received emails but haven't replied)
  SELECT COUNT(*) INTO v_new_leads
  FROM public.send_queue sq
  WHERE sq.campaign_id = p_campaign_id
  AND sq.status = 'sent'
  AND NOT EXISTS (
    SELECT 1 FROM public.reply_threads rt
    WHERE rt.campaign_id = p_campaign_id
    AND rt.lead_id = sq.lead_id
  );
  
  -- Calculate revenue breakdown using Block 11500 formula:
  -- HOT Lead = $7,000 average
  -- WARM Lead = $2,500 average
  -- FOLLOW UP = $1,000 average
  -- NEW Lead = $300 average
  v_hot_value := v_hot_leads * 7000.00;
  v_warm_value := v_warm_leads * 2500.00;
  v_follow_up_value := v_follow_up_leads * 1000.00;
  v_new_value := v_new_leads * 300.00;
  v_total_estimated_value := v_hot_value + v_warm_value + v_follow_up_value + v_new_value;
  
  -- Calculate reply rate
  IF v_emails_sent > 0 THEN
    v_reply_rate := (v_replies_received::numeric / v_emails_sent::numeric) * 100;
  END IF;
  
  -- Calculate performance badge
  -- Strong (Green): 10% reply rate, at least 1 hot lead, est value > $5k
  IF v_reply_rate >= 10 AND v_hot_leads >= 1 AND v_total_estimated_value >= 5000 THEN
    v_performance_badge := 'strong';
  -- Good (Yellow): 5% reply rate, warm leads present
  ELSIF v_reply_rate >= 5 AND v_warm_leads > 0 THEN
    v_performance_badge := 'good';
  -- Weak (Red): reply rate < 3%, no hot leads
  ELSE
    v_performance_badge := 'weak';
  END IF;
  
  -- Upsert campaign results
  INSERT INTO public.campaign_results (
    campaign_id,
    workspace_id,
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
    calculated_at,
    campaign_started_at,
    campaign_finished_at
  ) VALUES (
    p_campaign_id,
    v_workspace_id,
    v_campaign.name,
    v_emails_sent, -- total_recipients = emails_sent for now
    v_days_running,
    v_performance_badge,
    v_emails_sent,
    v_replies_received,
    v_hot_leads,
    v_total_estimated_value,
    v_hot_value,
    v_warm_value,
    v_follow_up_value,
    v_new_value,
    v_total_estimated_value,
    v_warm_leads,
    v_follow_up_leads,
    v_new_leads,
    v_reply_rate,
    now(),
    v_started_at,
    v_finished_at
  )
  ON CONFLICT (campaign_id)
  DO UPDATE SET
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
    calculated_at = EXCLUDED.calculated_at,
    campaign_started_at = EXCLUDED.campaign_started_at,
    campaign_finished_at = EXCLUDED.campaign_finished_at;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.calculate_campaign_results(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_campaign_results(uuid) TO service_role;

-- Comments
COMMENT ON TABLE public.campaign_results IS 'Cached campaign results for the ROI breakdown page (Block 11900)';
COMMENT ON FUNCTION public.calculate_campaign_results IS 'Calculates and caches campaign results including ROI breakdown and performance badge';





















































