-- Block 16000 — Contact Timeline v3 Integration (Inbox → Contact → Full History)
-- Unified Activity Stream: Emails, Replies, AI Notes, Pipeline Changes, Tasks
-- This makes the Contact Page the heart of SmartSend

-- ============================================================================
-- 1. UPDATE contact_activity TABLE
-- ============================================================================

-- Add workspace_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contact_activity' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.contact_activity 
    ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
    
    -- Populate workspace_id from contacts
    UPDATE public.contact_activity ca
    SET workspace_id = c.workspace_id
    FROM public.contacts c
    WHERE ca.contact_id = c.id AND ca.workspace_id IS NULL;
    
    -- Make it NOT NULL after populating
    ALTER TABLE public.contact_activity 
    ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END $$;

-- Update activity_type check constraint to include all Block 16000 types
ALTER TABLE public.contact_activity 
DROP CONSTRAINT IF EXISTS contact_activity_activity_type_check;

ALTER TABLE public.contact_activity 
ADD CONSTRAINT contact_activity_activity_type_check 
CHECK (
  activity_type IN (
    'email_sent',
    'email_opened',
    'email_replied',
    'email_received', -- Legacy support
    'intent_detected',
    'task_created',
    'task_completed',
    'pipeline_stage_changed',
    'lead_status_changed',
    'note_added',
    'note', -- Legacy support
    'profile_updated',
    'list_imported',
    'campaign_assigned',
    'ai_opener_generated',
    'sms_sent', -- Legacy support
    'sms_received', -- Legacy support
    'call_log', -- Legacy support
    'file_upload', -- Legacy support
    'pipeline_update' -- Legacy support
  )
);

-- Add index on workspace_id for performance
CREATE INDEX IF NOT EXISTS idx_contact_activity_workspace_id 
ON public.contact_activity(workspace_id);

-- ============================================================================
-- 2. UPDATE HELPER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_contact_activity(
  p_contact_id uuid,
  p_activity_type text,
  p_title text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_created_by uuid DEFAULT auth.uid(),
  p_workspace_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id from contact if not provided
  IF p_workspace_id IS NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM public.contacts
    WHERE id = p_contact_id;
  ELSE
    v_workspace_id := p_workspace_id;
  END IF;
  
  -- Validate activity_type
  IF p_activity_type NOT IN (
    'email_sent', 'email_opened', 'email_replied', 'email_received',
    'intent_detected', 'task_created', 'task_completed',
    'pipeline_stage_changed', 'lead_status_changed', 'note_added', 'note',
    'profile_updated', 'list_imported', 'campaign_assigned', 'ai_opener_generated',
    'sms_sent', 'sms_received', 'call_log', 'file_upload', 'pipeline_update'
  ) THEN
    RAISE EXCEPTION 'Invalid activity_type: %', p_activity_type;
  END IF;
  
  -- Insert activity
  INSERT INTO public.contact_activity (
    contact_id,
    workspace_id,
    activity_type,
    title,
    body,
    meta,
    created_by
  ) VALUES (
    p_contact_id,
    v_workspace_id,
    p_activity_type,
    p_title,
    p_body,
    p_meta,
    p_created_by
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_contact_activity(uuid, text, text, text, jsonb, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.log_contact_activity IS 'Helper function to log contact activity events (Block 16000)';

-- ============================================================================
-- 3. UPDATE RLS POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "contact_activity_select" ON public.contact_activity;
DROP POLICY IF EXISTS "contact_activity_insert" ON public.contact_activity;

-- Policy: Users can read contact activity for contacts in their workspace
CREATE POLICY "contact_activity_select"
  ON public.contact_activity
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = contact_activity.contact_id
      AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can insert contact activity for contacts in their workspace
CREATE POLICY "contact_activity_insert"
  ON public.contact_activity
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contacts c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = contact_activity.contact_id
      AND wm.user_id = auth.uid()
    )
  );



























































