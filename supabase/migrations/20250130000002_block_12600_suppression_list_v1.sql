-- =========================================================
-- Block 12600 — SmartSend Contact Suppression List v1
-- (The Do-Not-Contact System That Protects Deliverability & Keeps Roofers Safe)
-- =========================================================

-- Create suppression_list table (workspace-scoped)
CREATE TABLE IF NOT EXISTS public.suppression_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  email text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('manual', 'unsubscribed', 'bounce', 'complaint', 'out_of_scope')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system' CHECK (created_by IN ('system', 'user')),
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  
  -- Ensure unique email per workspace
  UNIQUE(workspace_id, lower(email))
);

-- Add foreign key to workspaces if workspaces table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'suppression_list_workspace_fk'
      AND table_name = 'suppression_list'
    ) THEN
      ALTER TABLE public.suppression_list
        ADD CONSTRAINT suppression_list_workspace_fk
        FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_suppression_list_workspace_email 
  ON public.suppression_list(workspace_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_suppression_list_reason 
  ON public.suppression_list(reason);

CREATE INDEX IF NOT EXISTS idx_suppression_list_created_at 
  ON public.suppression_list(created_at DESC);

-- Enable RLS
ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see suppressions for their workspaces
DROP POLICY IF EXISTS suppression_list_select ON public.suppression_list;
CREATE POLICY suppression_list_select ON public.suppression_list
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert suppressions for their workspaces
DROP POLICY IF EXISTS suppression_list_insert ON public.suppression_list;
CREATE POLICY suppression_list_insert ON public.suppression_list
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can delete manual suppressions only
DROP POLICY IF EXISTS suppression_list_delete ON public.suppression_list;
CREATE POLICY suppression_list_delete ON public.suppression_list
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    AND reason = 'manual'  -- Only manual suppressions can be removed
  );

-- Helper function: Suppress a contact
CREATE OR REPLACE FUNCTION public.suppress_contact(
  p_workspace_id uuid,
  p_email text,
  p_reason text DEFAULT 'manual',
  p_created_by text DEFAULT 'system',
  p_created_by_user_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_suppression_id uuid;
BEGIN
  -- Normalize email to lowercase
  p_email := lower(trim(p_email));
  
  -- Insert or update suppression (upsert)
  INSERT INTO public.suppression_list (
    workspace_id,
    email,
    reason,
    created_by,
    created_by_user_id,
    notes
  )
  VALUES (
    p_workspace_id,
    p_email,
    p_reason,
    p_created_by,
    p_created_by_user_id,
    p_notes
  )
  ON CONFLICT (workspace_id, lower(email))
  DO UPDATE SET
    reason = EXCLUDED.reason,
    notes = COALESCE(EXCLUDED.notes, suppression_list.notes),
    created_at = CASE 
      WHEN suppression_list.created_at > EXCLUDED.created_at 
      THEN EXCLUDED.created_at 
      ELSE suppression_list.created_at 
    END
  RETURNING id INTO v_suppression_id;
  
  RETURN v_suppression_id;
END;
$$;

-- Helper function: Check if email is suppressed
CREATE OR REPLACE FUNCTION public.is_suppressed(
  p_workspace_id uuid,
  p_email text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.suppression_list
    WHERE workspace_id = p_workspace_id
    AND lower(email) = lower(trim(p_email))
  );
$$;

-- Helper function: Get suppression reason if suppressed
CREATE OR REPLACE FUNCTION public.get_suppression_reason(
  p_workspace_id uuid,
  p_email text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT reason FROM public.suppression_list
  WHERE workspace_id = p_workspace_id
  AND lower(email) = lower(trim(p_email))
  LIMIT 1;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.suppress_contact(uuid, text, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_suppressed(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_suppression_reason(uuid, text) TO authenticated;

-- Comments
COMMENT ON TABLE public.suppression_list IS 'Do-not-contact list that protects deliverability and keeps roofers safe';
COMMENT ON COLUMN public.suppression_list.reason IS 'Type of suppression: manual, unsubscribed, bounce, complaint, out_of_scope';
COMMENT ON COLUMN public.suppression_list.created_by IS 'Who created this suppression: system (automatic) or user (manual)';
COMMENT ON FUNCTION public.suppress_contact IS 'Add or update a suppression entry (upsert)';
COMMENT ON FUNCTION public.is_suppressed IS 'Check if an email is suppressed for a workspace';
COMMENT ON FUNCTION public.get_suppression_reason IS 'Get the suppression reason for an email if suppressed';





















































