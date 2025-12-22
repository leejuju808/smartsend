-- Block 10700 — Shared Team Inbox v1
-- Assignment + Internal Notes + Status Controls
-- Extends reply_threads with team collaboration features

-- 1. Extend reply_threads table
-- Add last_read_by column for read tracking per user
ALTER TABLE public.reply_threads
  ADD COLUMN IF NOT EXISTS last_read_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Ensure status includes 'closed' (update check constraint if needed)
DO $$
BEGIN
  -- Check if status constraint exists and includes 'closed'
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name LIKE '%reply_threads_status%' 
    AND table_name = 'reply_threads'
  ) THEN
    -- Drop existing constraint
    ALTER TABLE public.reply_threads DROP CONSTRAINT IF EXISTS reply_threads_status_check;
  END IF;
  
  -- Add new constraint with 'closed' status
  ALTER TABLE public.reply_threads
    ADD CONSTRAINT reply_threads_status_check 
    CHECK (status IN ('open', 'snoozed', 'closed', 'archived'));
END $$;

-- Ensure assigned_to column exists (should already exist from Block 9200)
ALTER TABLE public.reply_threads
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for assigned_to filtering
CREATE INDEX IF NOT EXISTS idx_reply_threads_assigned_to 
  ON public.reply_threads(workspace_id, assigned_to) 
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reply_threads_unassigned 
  ON public.reply_threads(workspace_id) 
  WHERE assigned_to IS NULL;

-- 2. Create reply_thread_notes table for internal notes
CREATE TABLE IF NOT EXISTS public.reply_thread_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.reply_threads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for notes
CREATE INDEX IF NOT EXISTS idx_reply_thread_notes_thread 
  ON public.reply_thread_notes(thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reply_thread_notes_workspace 
  ON public.reply_thread_notes(workspace_id);

CREATE INDEX IF NOT EXISTS idx_reply_thread_notes_author 
  ON public.reply_thread_notes(author_id);

-- 3. RLS Policies for reply_threads
-- Ensure RLS is enabled
ALTER TABLE public.reply_threads ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all threads in their workspace
DROP POLICY IF EXISTS "reply_threads_select_workspace" ON public.reply_threads;
CREATE POLICY "reply_threads_select_workspace"
  ON public.reply_threads
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update threads based on role
-- Owners/admins can update any thread
-- Members/viewers can only update threads assigned to them or unassigned
DROP POLICY IF EXISTS "reply_threads_update_workspace" ON public.reply_threads;
CREATE POLICY "reply_threads_update_workspace"
  ON public.reply_threads
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    AND (
      -- Owners/admins can update any thread
      EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = reply_threads.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
      )
      OR
      -- Members/viewers can only update threads assigned to them or unassigned
      (
        EXISTS (
          SELECT 1
          FROM public.workspace_members wm
          WHERE wm.workspace_id = reply_threads.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role IN ('member', 'viewer')
        )
        AND (
          assigned_to = auth.uid()
          OR assigned_to IS NULL
        )
      )
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    AND (
      -- Owners/admins can assign to anyone in workspace
      EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = reply_threads.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
      )
      OR
      -- Members/viewers can only assign to themselves or unassign
      (
        EXISTS (
          SELECT 1
          FROM public.workspace_members wm
          WHERE wm.workspace_id = reply_threads.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role IN ('member', 'viewer')
        )
        AND (
          assigned_to = auth.uid()
          OR assigned_to IS NULL
        )
      )
    )
  );

-- 4. RLS Policies for reply_thread_notes
ALTER TABLE public.reply_thread_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view notes for threads in their workspace
CREATE POLICY "reply_thread_notes_select_workspace"
  ON public.reply_thread_notes
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create notes for threads in their workspace
CREATE POLICY "reply_thread_notes_insert_workspace"
  ON public.reply_thread_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    AND author_id = auth.uid()
  );

-- Policy: Users can update/delete their own notes
CREATE POLICY "reply_thread_notes_update_own"
  ON public.reply_thread_notes
  FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "reply_thread_notes_delete_own"
  ON public.reply_thread_notes
  FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

-- 5. Update reply_inbox_summary view to include assigned_to information
-- First, check if profiles table exists for user names
DO $$
BEGIN
  -- Drop and recreate view with assigned_to info
  DROP VIEW IF EXISTS public.reply_inbox_summary CASCADE;
  
  CREATE VIEW public.reply_inbox_summary AS
  SELECT
    rt.id,
    rt.workspace_id,
    rt.contact_id,
    rt.lead_id,
    rt.campaign_id,
    rt.thread_key,
    rt.latest_intent,
    rt.status,
    rt.assigned_to,
    rt.unread,
    rt.last_activity_at,
    rt.subject,
    rt.last_read_by,
    c.email AS contact_email,
    CASE 
      WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL THEN c.first_name || ' ' || c.last_name
      WHEN c.first_name IS NOT NULL THEN c.first_name
      WHEN c.last_name IS NOT NULL THEN c.last_name
      ELSE NULL
    END AS contact_name,
    COALESCE(
      CASE 
        WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL THEN c.first_name || ' ' || c.last_name
        WHEN c.first_name IS NOT NULL THEN c.first_name
        WHEN c.last_name IS NOT NULL THEN c.last_name
        ELSE NULL
      END,
      c.email,
      l.email
    ) AS display_name,
    COALESCE(c.email, l.email) AS display_email,
    camp.name AS campaign_name,
    -- Assigned user info (from profiles or auth.users)
    assigned_user.email AS assigned_to_email,
    COALESCE(
      assigned_profile.full_name,
      assigned_user.raw_user_meta_data->>'full_name',
      assigned_user.email
    ) AS assigned_to_name,
    assigned_profile.avatar_url AS assigned_to_avatar
  FROM public.reply_threads rt
  LEFT JOIN public.contacts c ON c.id = rt.contact_id
  LEFT JOIN public.leads l ON l.id = rt.lead_id
  LEFT JOIN public.campaigns camp ON camp.id = rt.campaign_id
  LEFT JOIN auth.users assigned_user ON assigned_user.id = rt.assigned_to
  LEFT JOIN public.profiles assigned_profile ON assigned_profile.id = rt.assigned_to;
  
  -- Grant access to view
  GRANT SELECT ON public.reply_inbox_summary TO authenticated;
END $$;

-- 6. Comments for documentation
COMMENT ON COLUMN public.reply_threads.assigned_to IS 'User assigned to handle this thread. NULL means unassigned.';
COMMENT ON COLUMN public.reply_threads.status IS 'Thread status: open, snoozed, closed, or archived';
COMMENT ON COLUMN public.reply_threads.last_read_by IS 'Last user who read this thread (for read tracking)';
COMMENT ON TABLE public.reply_thread_notes IS 'Internal notes on reply threads. Not visible to customers.';





























































