-- Block 16300 — Lead Ownership v1
-- Assign Each Homeowner to a Sales Owner + Filter Everything by Owner
-- Makes SmartSend usable for a small roofing team, not just a solo owner

-- 1. Add owner_user_id to contacts table
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_contacts_owner_user_id ON public.contacts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_owner ON public.contacts(workspace_id, owner_user_id) WHERE owner_user_id IS NOT NULL;

-- 2. Add owner_user_id to tasks table
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_tasks_owner_user_id ON public.tasks(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_owner ON public.tasks(workspace_id, owner_user_id) WHERE owner_user_id IS NOT NULL;

-- If tasks table uses org_id instead of workspace_id, also add index for that
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'tasks' 
    AND column_name = 'org_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_tasks_org_owner ON public.tasks(org_id, owner_user_id) WHERE owner_user_id IS NOT NULL;
  END IF;
END $$;

-- 3. Comments
COMMENT ON COLUMN public.contacts.owner_user_id IS 'The user responsible for this lead/contact. NULL = unassigned.';
COMMENT ON COLUMN public.tasks.owner_user_id IS 'The user responsible for this task. Inherits from contact owner when auto-created.';



























































