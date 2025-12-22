-- Block 8480 — Speed-to-Lead Mode v1 (Auto-Follow-Up on Hot Replies)
-- Part 2: Create speed_to_lead_jobs table

CREATE TABLE IF NOT EXISTS public.speed_to_lead_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  campaign_lead_id UUID NOT NULL,
  lead_id UUID NOT NULL,
  reply_id UUID NOT NULL, -- campaign_replies.id that triggered this
  -- snapshot of intent & summary at time of creation
  reply_intent TEXT NOT NULL,
  reply_sentiment TEXT,
  thread_summary TEXT,
  -- when we *should* send (now + delay)
  scheduled_at TIMESTAMPTZ NOT NULL,
  -- when we actually processed
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'sent' | 'skipped' | 'failed'
  -- we'll store the send_id once we create the follow-up
  campaign_send_id UUID,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT speed_to_lead_jobs_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES public.campaigns (id) ON DELETE CASCADE,
  CONSTRAINT speed_to_lead_jobs_campaign_lead_id_fkey
    FOREIGN KEY (campaign_lead_id) REFERENCES public.campaign_leads (id) ON DELETE CASCADE,
  CONSTRAINT speed_to_lead_jobs_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES public.leads (id) ON DELETE CASCADE,
  CONSTRAINT speed_to_lead_jobs_reply_id_fkey
    FOREIGN KEY (reply_id) REFERENCES public.campaign_replies (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_speed_to_lead_jobs_status_scheduled
  ON public.speed_to_lead_jobs (status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_speed_to_lead_jobs_campaign
  ON public.speed_to_lead_jobs (campaign_id);

CREATE INDEX IF NOT EXISTS idx_speed_to_lead_jobs_reply
  ON public.speed_to_lead_jobs (reply_id);

-- Enable RLS
ALTER TABLE public.speed_to_lead_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can view jobs for their campaigns
CREATE POLICY "Users can view speed-to-lead jobs for their campaigns"
  ON public.speed_to_lead_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = speed_to_lead_jobs.campaign_id
      AND (
        c.owner_id = auth.uid()
        OR c.owner_user_id = auth.uid()
        OR c.user_id = auth.uid()
      )
    )
  );

-- Service role can manage all jobs
CREATE POLICY "Service role can manage speed-to-lead jobs"
  ON public.speed_to_lead_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);































































