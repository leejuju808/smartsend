-- Block 244 — Team Task Board v1
-- Tasks table for thread-based task management

-- Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.reply_threads(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL for system-created tasks
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  due_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON public.tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_thread ON public.tasks(thread_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON public.tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tasks_updated_at();

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Helper function to check workspace membership
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = p_user_id
  );
$$;

-- Helper function to check if user is workspace admin
CREATE OR REPLACE FUNCTION public.is_workspace_admin(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = p_user_id
      AND wm.role IN ('owner', 'admin')
  );
$$;

-- RLS Policies
-- Users can see tasks if:
-- 1. They created the task
-- 2. They are assigned to the task
-- 3. They are a member of the workspace (team-wide visibility)
-- 4. They are a workspace admin

CREATE POLICY "tasks_select_creator_assigned_or_workspace_member"
  ON public.tasks
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR is_workspace_member(workspace_id)
    OR is_workspace_admin(workspace_id)
  );

-- Users can insert tasks if they are workspace members
CREATE POLICY "tasks_insert_workspace_member"
  ON public.tasks
  FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id)
  );

-- Users can update tasks if:
-- 1. They created the task
-- 2. They are assigned to the task
-- 3. They are workspace admins
CREATE POLICY "tasks_update_creator_assigned_or_admin"
  ON public.tasks
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR is_workspace_admin(workspace_id)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR is_workspace_admin(workspace_id)
  );

-- Users can delete tasks if:
-- 1. They created the task
-- 2. They are workspace admins
CREATE POLICY "tasks_delete_creator_or_admin"
  ON public.tasks
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR is_workspace_admin(workspace_id)
  );

