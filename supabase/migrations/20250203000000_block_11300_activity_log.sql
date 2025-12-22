-- =========================================================
-- Block 11300 — SmartSend Activity Log v1
-- (The Real-Time Feed That Shows Roofers "SmartSend Is Working For Me")
-- =========================================================

-- Activity Logs Table
-- Tracks all SmartSend activity to show roofers proof that the system is working
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Activity type
  type text NOT NULL CHECK (type IN (
    'email_sent',
    'followup_triggered',
    'reply_received',
    'classified',
    'sequence_paused',
    'import',
    'campaign_launched'
  )),
  
  -- Flexible metadata JSON for event-specific details
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_workspace_created 
  ON public.activity_logs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_workspace_type_created 
  ON public.activity_logs(workspace_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_campaign 
  ON public.activity_logs(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_lead 
  ON public.activity_logs(lead_id) WHERE lead_id IS NOT NULL;

-- RLS Policies
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Users can view activity logs for their workspaces
CREATE POLICY "Users can view activity logs for their workspaces"
  ON public.activity_logs
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Service role can insert (for edge functions)
CREATE POLICY "Service role can insert activity logs"
  ON public.activity_logs
  FOR INSERT
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE public.activity_logs IS 'Real-time activity feed showing roofers that SmartSend is working (emails sent, follow-ups triggered, replies detected, etc.)';
COMMENT ON COLUMN public.activity_logs.type IS 'Type of activity: email_sent, followup_triggered, reply_received, classified, sequence_paused, import, campaign_launched';
COMMENT ON COLUMN public.activity_logs.metadata IS 'JSON metadata with event-specific details (homeowner name, template used, reply text, etc.)';























































