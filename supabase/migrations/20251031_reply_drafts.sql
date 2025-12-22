-- Reply Drafts Table
-- Stores AI-generated reply drafts for history and reference

CREATE TABLE IF NOT EXISTS public.reply_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id uuid NOT NULL REFERENCES public.email_replies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  draft_body text NOT NULL,
  tone text DEFAULT 'professional',
  cta text,
  product_context text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reply_drafts_reply_id_idx ON public.reply_drafts(reply_id);
CREATE INDEX IF NOT EXISTS reply_drafts_workspace_id_idx ON public.reply_drafts(workspace_id);
CREATE INDEX IF NOT EXISTS reply_drafts_lead_id_idx ON public.reply_drafts(lead_id);

-- Enable RLS
ALTER TABLE public.reply_drafts ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see drafts from their workspace
CREATE POLICY "reply_drafts_select_workspace"
ON public.reply_drafts
FOR SELECT
USING (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = reply_drafts.workspace_id 
    and wm.user_id = auth.uid()
  )
);

-- RLS: Service role can insert drafts
CREATE POLICY "reply_drafts_insert_service"
ON public.reply_drafts
FOR INSERT
TO service_role
WITH CHECK (true);

