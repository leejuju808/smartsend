-- =========================================================
-- Block 12200 — SmartSend Roofing Notes System v1
-- (The Simple Notes Layer That Keeps Every Lead's Story in One Place)
-- =========================================================

-- 1. Add next_step and follow_up_at columns to lead_notes table
DO $$
BEGIN
  -- Add next_step column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'next_step'
  ) THEN
    ALTER TABLE public.lead_notes
    ADD COLUMN next_step TEXT NULL;
  END IF;

  -- Add follow_up_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'follow_up_at'
  ) THEN
    ALTER TABLE public.lead_notes
    ADD COLUMN follow_up_at TIMESTAMPTZ NULL;
  END IF;

  -- Ensure workspace_id exists (for RLS)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.lead_notes
    ADD COLUMN workspace_id UUID NULL REFERENCES public.workspaces(id) ON DELETE CASCADE;
    
    -- Backfill workspace_id from leads
    UPDATE public.lead_notes ln
    SET workspace_id = l.workspace_id
    FROM public.leads l
    WHERE ln.lead_id = l.id AND ln.workspace_id IS NULL;
  END IF;

  -- Ensure user_id exists (for permission checks)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'user_id'
  ) THEN
    -- Check if author_id exists and use it
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'lead_notes'
      AND column_name = 'author_id'
    ) THEN
      ALTER TABLE public.lead_notes
      ADD COLUMN user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
      UPDATE public.lead_notes
      SET user_id = author_id
      WHERE author_id IS NOT NULL AND user_id IS NULL;
    ELSE
      ALTER TABLE public.lead_notes
      ADD COLUMN user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- 2. Create index for follow-up queries
CREATE INDEX IF NOT EXISTS idx_lead_notes_follow_up_at
  ON public.lead_notes (follow_up_at)
  WHERE follow_up_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_notes_workspace_lead
  ON public.lead_notes (workspace_id, lead_id, created_at DESC);

-- 3. Update RLS policies for role-based permissions
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "lead_notes_select_workspace" ON public.lead_notes;
DROP POLICY IF EXISTS "lead_notes_insert_workspace" ON public.lead_notes;
DROP POLICY IF EXISTS "lead_notes_update_workspace" ON public.lead_notes;
DROP POLICY IF EXISTS "lead_notes_delete_workspace" ON public.lead_notes;

-- Enable RLS
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read notes for leads in their workspace
CREATE POLICY "lead_notes_select_workspace"
ON public.lead_notes
FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id
    FROM public.workspace_members
    WHERE user_id = auth.uid()
  )
  OR workspace_id IN (
    SELECT id
    FROM public.workspaces
    WHERE owner_id = auth.uid()
  )
);

-- Policy: Users can insert notes if they are workspace members
CREATE POLICY "lead_notes_insert_workspace"
ON public.lead_notes
FOR INSERT
WITH CHECK (
  (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id
      FROM public.workspaces
      WHERE owner_id = auth.uid()
    )
  )
  AND user_id = auth.uid()
);

-- Policy: Update permissions based on role
-- Owner: can edit any note
-- Manager: can edit any note
-- Staff: can only edit their own notes
CREATE POLICY "lead_notes_update_workspace"
ON public.lead_notes
FOR UPDATE
USING (
  workspace_id IN (
    SELECT workspace_id
    FROM public.workspace_members
    WHERE user_id = auth.uid()
  )
  OR workspace_id IN (
    SELECT id
    FROM public.workspaces
    WHERE owner_id = auth.uid()
  )
)
WITH CHECK (
  -- Owner or Manager can edit any note
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = lead_notes.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role IN ('owner', 'admin', 'manager')
  )
  OR workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
  )
  -- OR Staff can only edit their own notes
  OR (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_notes.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = 'member'
    )
    AND user_id = auth.uid()
  )
);

-- Policy: Delete permissions based on role
-- Owner: can delete any note
-- Manager: can delete any note
-- Staff: cannot delete notes (not even their own)
CREATE POLICY "lead_notes_delete_workspace"
ON public.lead_notes
FOR DELETE
USING (
  -- Owner or Manager can delete any note
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = lead_notes.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role IN ('owner', 'admin', 'manager')
  )
  OR workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
  )
);

-- 4. Helper function to get user's role in workspace
CREATE OR REPLACE FUNCTION public.get_user_workspace_role(
  p_workspace_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
  LIMIT 1;
$$;

-- 5. Update log_lead_event function to include note metadata
-- This ensures notes appear in timeline with next_step and follow_up_at
CREATE OR REPLACE FUNCTION public.log_lead_note_event(
  p_lead_id uuid,
  p_note_id uuid,
  p_body text,
  p_next_step text DEFAULT NULL,
  p_follow_up_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_event_id uuid;
  v_content text;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Get workspace_id from lead
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = p_lead_id;
  
  -- Build content string
  v_content := 'Note added: ' || left(p_body, 100);
  IF length(p_body) > 100 THEN
    v_content := v_content || '...';
  END IF;
  
  -- Insert event
  INSERT INTO public.lead_events (
    lead_id,
    user_id,
    workspace_id,
    type,
    content,
    metadata
  ) VALUES (
    p_lead_id,
    v_user_id,
    v_workspace_id,
    'note_added',
    v_content,
    jsonb_build_object(
      'note_id', p_note_id,
      'note_text', p_body,
      'next_step', p_next_step,
      'follow_up_at', p_follow_up_at
    )
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- 6. Comments
COMMENT ON COLUMN public.lead_notes.next_step IS 'Optional next step action (e.g., "Call Monday", "Send quote", "Visit site")';
COMMENT ON COLUMN public.lead_notes.follow_up_at IS 'Optional follow-up date/time for this note';
COMMENT ON TABLE public.lead_notes IS 'Internal notes system for roofing companies - tracks key details, calls, site visits, and quotes for each homeowner';

