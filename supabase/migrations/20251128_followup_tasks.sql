-- =========================================================
-- Block 8660 — Intent-Driven Reply Actions
-- Step 2: Create followup_tasks table for warm leads
-- =========================================================

-- Table to store follow-up tasks
CREATE TABLE IF NOT EXISTS public.followup_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  campaign_id   uuid NOT NULL,
  contact_id    uuid NOT NULL,
  reply_id      uuid NOT NULL,
  task_type     text NOT NULL DEFAULT 'follow_up', -- follow_up
  due_at        timestamptz NOT NULL,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Foreign key constraints
ALTER TABLE public.followup_tasks
ADD CONSTRAINT IF NOT EXISTS followup_tasks_campaign_fk
FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id)
ON DELETE CASCADE;

ALTER TABLE public.followup_tasks
ADD CONSTRAINT IF NOT EXISTS followup_tasks_contact_fk
FOREIGN KEY (contact_id) REFERENCES public.contacts(id)
ON DELETE CASCADE;

ALTER TABLE public.followup_tasks
ADD CONSTRAINT IF NOT EXISTS followup_tasks_reply_fk
FOREIGN KEY (reply_id) REFERENCES public.email_replies(id)
ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_followup_tasks_workspace
ON public.followup_tasks (workspace_id);

CREATE INDEX IF NOT EXISTS idx_followup_tasks_due_at
ON public.followup_tasks (due_at)
WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_followup_tasks_contact
ON public.followup_tasks (contact_id);

CREATE INDEX IF NOT EXISTS idx_followup_tasks_campaign
ON public.followup_tasks (campaign_id);

-- Enable RLS
ALTER TABLE public.followup_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can access tasks for workspaces they belong to
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'followup_tasks'
      AND policyname = 'Followup tasks RLS'
  ) THEN
    CREATE POLICY "Followup tasks RLS"
    ON public.followup_tasks FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END $$;


























































