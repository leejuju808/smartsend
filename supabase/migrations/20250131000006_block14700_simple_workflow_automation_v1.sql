-- Block 14700 — Simple Workflow Automation v1
-- Tasks: "Call This Lead" + Auto-Triggers from Replies
-- This is the "don't drop hot leads" block.

-- 1. Ensure tasks table has all required fields for Block 14700
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS type text CHECK (type IN ('call', 'email', 'todo')) DEFAULT 'call';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source text CHECK (source IN ('auto', 'manual')) DEFAULT 'auto';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS trigger_meta jsonb;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS email_message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL;

-- 2. Update status check constraint to include 'snoozed'
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('open', 'completed', 'snoozed'));

-- 3. Create index for tasks_workspace_status_due_idx
CREATE INDEX IF NOT EXISTS tasks_workspace_status_due_idx
  ON public.tasks (workspace_id, status, due_at);

-- 4. Create index for email_message_id lookups
CREATE INDEX IF NOT EXISTS idx_tasks_email_message ON public.tasks(email_message_id) WHERE email_message_id IS NOT NULL;

-- 5. Comments
COMMENT ON COLUMN public.tasks.type IS 'Task type: call, email, or todo';
COMMENT ON COLUMN public.tasks.snoozed_until IS 'When to unsnooze this task';
COMMENT ON COLUMN public.tasks.source IS 'Whether task was auto-created or manually added';
COMMENT ON COLUMN public.tasks.trigger_meta IS 'Metadata about what created this task (intent_label, etc.)';
COMMENT ON COLUMN public.tasks.email_message_id IS 'Reference to the email message that triggered this task';



























































