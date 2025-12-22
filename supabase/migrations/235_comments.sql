-- Block 222 — Team Collaboration v1
-- Comments table for leads, threads, and campaigns

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.reply_threads(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  body text NOT NULL,
  mentions uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_lead ON public.comments(lead_id);
CREATE INDEX IF NOT EXISTS idx_comments_thread ON public.comments(thread_id);
CREATE INDEX IF NOT EXISTS idx_comments_campaign ON public.comments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_comments_workspace ON public.comments(workspace_id);

-- Add owner_id columns to leads and reply_threads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);
ALTER TABLE public.reply_threads ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_leads_owner ON public.leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_reply_threads_owner ON public.reply_threads(owner_id);

-- RLS Policies
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select"
ON public.comments
FOR SELECT
TO authenticated
USING (workspace_id = (auth.jwt()->>'workspace_id')::uuid);

CREATE POLICY "comments_insert"
ON public.comments
FOR INSERT
TO authenticated
WITH CHECK (workspace_id = (auth.jwt()->>'workspace_id')::uuid);

CREATE POLICY "comments_update"
ON public.comments
FOR UPDATE
TO authenticated
USING (workspace_id = (auth.jwt()->>'workspace_id')::uuid)
WITH CHECK (workspace_id = (auth.jwt()->>'workspace_id')::uuid);

CREATE POLICY "comments_delete"
ON public.comments
FOR DELETE
TO authenticated
USING (workspace_id = (auth.jwt()->>'workspace_id')::uuid);










