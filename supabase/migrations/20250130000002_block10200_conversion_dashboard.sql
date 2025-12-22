-- =========================================================
-- Block 10200 — SmartSend Conversion Dashboard Slice v1
-- (The Mini-Money Screen That Makes Roofers Instantly Pay)
-- =========================================================

-- Create dashboard_metrics table
CREATE TABLE IF NOT EXISTS public.dashboard_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Quick Value Panel metrics
  emails_sent int NOT NULL DEFAULT 0,
  replies_received int NOT NULL DEFAULT 0,
  leads_identified int NOT NULL DEFAULT 0,
  hot_leads int NOT NULL DEFAULT 0,
  warm_leads int NOT NULL DEFAULT 0,
  cold_leads int NOT NULL DEFAULT 0,
  
  -- Estimated Job Value
  est_job_value numeric(12, 2) NOT NULL DEFAULT 0,
  
  -- Timestamp tracking
  last_updated timestamptz NOT NULL DEFAULT now(),
  
  -- Unique constraint: one row per workspace/user
  UNIQUE(workspace_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_workspace 
  ON public.dashboard_metrics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_user 
  ON public.dashboard_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_updated 
  ON public.dashboard_metrics(last_updated DESC);

-- Enable RLS
ALTER TABLE public.dashboard_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own workspace metrics
CREATE POLICY "Users can view their workspace metrics"
  ON public.dashboard_metrics
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can update their workspace metrics
CREATE POLICY "Users can update their workspace metrics"
  ON public.dashboard_metrics
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Service role can insert/update (for edge functions)
CREATE POLICY "Service role can manage metrics"
  ON public.dashboard_metrics
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Function to calculate and update dashboard metrics for a workspace
CREATE OR REPLACE FUNCTION public.calculate_dashboard_metrics(
  p_workspace_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_emails_sent int;
  v_replies_received int;
  v_leads_identified int;
  v_hot_leads int;
  v_warm_leads int;
  v_cold_leads int;
  v_est_job_value numeric(12, 2);
BEGIN
  -- Count emails sent (from send_logs via campaigns)
  SELECT COALESCE(COUNT(*), 0) INTO v_emails_sent
  FROM public.send_logs sl
  JOIN public.campaigns c ON sl.campaign_id = c.id
  WHERE c.workspace_id = p_workspace_id
    AND sl.status = 'sent';
  
  -- Fallback: try campaign_logs if send_logs count is 0
  IF v_emails_sent = 0 THEN
    SELECT COALESCE(COUNT(*), 0) INTO v_emails_sent
    FROM public.campaign_logs cl
    JOIN public.campaigns c ON cl.campaign_id = c.id
    WHERE c.workspace_id = p_workspace_id
      AND cl.event = 'sent';
  END IF;
  
  -- Count replies received (from inbound_emails)
  SELECT COALESCE(COUNT(DISTINCT id), 0) INTO v_replies_received
  FROM public.inbound_emails
  WHERE workspace_id = p_workspace_id;
  
  -- Fallback: try email_replies via send_logs -> campaigns
  IF v_replies_received = 0 THEN
    SELECT COALESCE(COUNT(DISTINCT er.id), 0) INTO v_replies_received
    FROM public.email_replies er
    JOIN public.send_logs sl ON er.send_log_id = sl.id
    JOIN public.campaigns c ON sl.campaign_id = c.id
    WHERE c.workspace_id = p_workspace_id;
  END IF;
  
  -- Count leads identified (total leads in workspace)
  SELECT COALESCE(COUNT(*), 0) INTO v_leads_identified
  FROM public.leads
  WHERE workspace_id = p_workspace_id;
  
  -- Count hot leads (classification = 'hot' or lead_status = 'hot')
  SELECT COALESCE(COUNT(*), 0) INTO v_hot_leads
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND (classification = 'hot' OR lead_status = 'hot');
  
  -- Count warm leads
  SELECT COALESCE(COUNT(*), 0) INTO v_warm_leads
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND (classification = 'warm' OR lead_status = 'warm');
  
  -- Count cold leads
  SELECT COALESCE(COUNT(*), 0) INTO v_cold_leads
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND (classification = 'cold' OR lead_status = 'cold');
  
  -- Calculate estimated job value
  -- Hot Lead = $7,000 average
  -- Warm Lead = $2,500 average
  -- Cold Lead = $500 average
  v_est_job_value := (v_hot_leads * 7000.00) + (v_warm_leads * 2500.00) + (v_cold_leads * 500.00);
  
  -- Upsert metrics
  INSERT INTO public.dashboard_metrics (
    workspace_id,
    user_id,
    emails_sent,
    replies_received,
    leads_identified,
    hot_leads,
    warm_leads,
    cold_leads,
    est_job_value,
    last_updated
  ) VALUES (
    p_workspace_id,
    p_user_id,
    v_emails_sent,
    v_replies_received,
    v_leads_identified,
    v_hot_leads,
    v_warm_leads,
    v_cold_leads,
    v_est_job_value,
    now()
  )
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET
    emails_sent = EXCLUDED.emails_sent,
    replies_received = EXCLUDED.replies_received,
    leads_identified = EXCLUDED.leads_identified,
    hot_leads = EXCLUDED.hot_leads,
    warm_leads = EXCLUDED.warm_leads,
    cold_leads = EXCLUDED.cold_leads,
    est_job_value = EXCLUDED.est_job_value,
    last_updated = EXCLUDED.last_updated;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.calculate_dashboard_metrics(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_dashboard_metrics(uuid, uuid) TO service_role;

-- Comments
COMMENT ON TABLE public.dashboard_metrics IS 'Conversion dashboard metrics for SmartSend - shows roofers the value they are getting';
COMMENT ON COLUMN public.dashboard_metrics.emails_sent IS 'Total number of emails sent';
COMMENT ON COLUMN public.dashboard_metrics.replies_received IS 'Total number of replies received';
COMMENT ON COLUMN public.dashboard_metrics.leads_identified IS 'Total number of leads identified';
COMMENT ON COLUMN public.dashboard_metrics.hot_leads IS 'Number of hot leads';
COMMENT ON COLUMN public.dashboard_metrics.warm_leads IS 'Number of warm leads';
COMMENT ON COLUMN public.dashboard_metrics.cold_leads IS 'Number of cold leads';
COMMENT ON COLUMN public.dashboard_metrics.est_job_value IS 'Estimated job value: Hot=$7K, Warm=$2.5K, Cold=$500';

