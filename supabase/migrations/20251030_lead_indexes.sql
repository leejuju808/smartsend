-- Unique per workspace, case-insensitive email
CREATE UNIQUE INDEX IF NOT EXISTS uniq_lead_email_ws ON public.leads (workspace_id, lower(email));

-- Useful filters
CREATE INDEX IF NOT EXISTS idx_leads_ws_status ON public.leads (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_ws_created ON public.leads (workspace_id, created_at DESC);

-- campaign_logs table (flexible log)
CREATE TABLE IF NOT EXISTS public.campaign_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  campaign_id uuid,
  lead_id uuid,
  type text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_ws ON public.campaign_logs(workspace_id, created_at DESC);

-- send_queue status helper index
CREATE INDEX IF NOT EXISTS idx_send_queue_lead_status ON public.send_queue(lead_id, status);


