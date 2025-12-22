-- Block 235 — AI Multi-Step Follow-Up Flow v1
-- Creates followup_sequences table for storing AI-generated 5-step follow-up sequences

CREATE TABLE IF NOT EXISTS public.followup_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  steps jsonb NOT NULL,      -- array of emails: [{"subject": "...", "body": "..."}, ...]
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_followup_sequences_campaign 
  ON public.followup_sequences(campaign_id);
CREATE INDEX IF NOT EXISTS idx_followup_sequences_user 
  ON public.followup_sequences(user_id);
CREATE INDEX IF NOT EXISTS idx_followup_sequences_created 
  ON public.followup_sequences(created_at DESC);

-- Enable RLS
ALTER TABLE public.followup_sequences ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can access sequences for campaigns in their workspace
CREATE POLICY "followup_sequences_select"
ON public.followup_sequences
FOR SELECT
TO authenticated
USING (
  campaign_id IN (
    SELECT c.id FROM public.campaigns c
    INNER JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
    WHERE wm.user_id = auth.uid()
  )
);

CREATE POLICY "followup_sequences_insert"
ON public.followup_sequences
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND
  campaign_id IN (
    SELECT c.id FROM public.campaigns c
    INNER JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
    WHERE wm.user_id = auth.uid()
  )
);

CREATE POLICY "followup_sequences_update"
ON public.followup_sequences
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() AND
  campaign_id IN (
    SELECT c.id FROM public.campaigns c
    INNER JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
    WHERE wm.user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid() AND
  campaign_id IN (
    SELECT c.id FROM public.campaigns c
    INNER JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
    WHERE wm.user_id = auth.uid()
  )
);

CREATE POLICY "followup_sequences_delete"
ON public.followup_sequences
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid() AND
  campaign_id IN (
    SELECT c.id FROM public.campaigns c
    INNER JOIN public.workspace_members wm ON c.workspace_id = wm.workspace_id
    WHERE wm.user_id = auth.uid()
  )
);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_followup_sequences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_followup_sequences_updated_at
BEFORE UPDATE ON public.followup_sequences
FOR EACH ROW
EXECUTE FUNCTION update_followup_sequences_updated_at();










