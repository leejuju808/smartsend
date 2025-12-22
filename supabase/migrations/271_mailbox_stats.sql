-- Block 255 — Daily Send Planner v1
-- Mailbox Stats Table for tracking daily metrics per mailbox

CREATE TABLE IF NOT EXISTS public.mailbox_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  date date NOT NULL,
  sent int DEFAULT 0,
  opens int DEFAULT 0,
  clicks int DEFAULT 0,
  bounces int DEFAULT 0,
  spam_reports int DEFAULT 0,
  replies int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(mailbox_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mailbox_stats_mailbox ON public.mailbox_stats(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_mailbox_stats_date ON public.mailbox_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_mailbox_stats_mailbox_date ON public.mailbox_stats(mailbox_id, date DESC);

-- Enable RLS
ALTER TABLE public.mailbox_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view stats for mailboxes in their workspace
CREATE POLICY "mailbox_stats_select_workspace" ON public.mailbox_stats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.mailboxes m
      WHERE m.id = mailbox_stats.mailbox_id
        AND (
          m.workspace_id IN (
            SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
          )
          OR m.workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
          )
        )
    )
  );

-- RLS Policy: Service role can insert/update stats
CREATE POLICY "mailbox_stats_insert_service" ON public.mailbox_stats
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "mailbox_stats_update_service" ON public.mailbox_stats
  FOR UPDATE
  USING (true)
  WITH CHECK (true);









