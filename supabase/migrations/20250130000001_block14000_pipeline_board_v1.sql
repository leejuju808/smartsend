-- =========================================================
-- Block 14000 — SmartSend Pipeline Board v1
-- The Visual Kanban Board That Shows Roofers EXACTLY Where Every Lead Is
-- =========================================================

-- 1. Add pipeline_stage column to contacts table if it doesn't exist
-- This will store the current pipeline stage for each contact
DO $$
BEGIN
  -- Check if pipeline_stage column exists on contacts
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'contacts' 
    AND column_name = 'pipeline_stage'
  ) THEN
    -- Create pipeline_stage enum if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pipeline_stage_contact') THEN
      CREATE TYPE pipeline_stage_contact AS ENUM (
        'HOT',
        'WARM',
        'FOLLOW_UP',
        'COLD',
        'NOT_INTERESTED'
      );
    END IF;
    
    -- Add column to contacts
    ALTER TABLE public.contacts
      ADD COLUMN pipeline_stage pipeline_stage_contact DEFAULT 'COLD';
    
    -- Create index for fast filtering
    CREATE INDEX IF NOT EXISTS idx_contacts_pipeline_stage 
      ON public.contacts(workspace_id, pipeline_stage) 
      WHERE pipeline_stage IS NOT NULL;
  END IF;
END$$;

-- 2. Create pipeline_history table to track all pipeline movements
CREATE TABLE IF NOT EXISTS public.pipeline_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  from_stage pipeline_stage_contact,
  to_stage pipeline_stage_contact NOT NULL,
  moved_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  moved_by_system boolean NOT NULL DEFAULT false,
  reason text, -- e.g., 'lead_score_change', 'intent_classification', 'manual_drag'
  metadata jsonb DEFAULT '{}'::jsonb, -- Store additional context like lead_score, intent, etc.
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_history_contact 
  ON public.pipeline_history(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_history_workspace 
  ON public.pipeline_history(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_history_campaign 
  ON public.pipeline_history(campaign_id, created_at DESC);

-- 3. Create function to automatically move leads based on lead_score
-- HOT: score >= 70
-- WARM: score 30-69
-- COLD: score < 30
CREATE OR REPLACE FUNCTION public.auto_move_lead_by_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_stage pipeline_stage_contact;
  v_old_stage pipeline_stage_contact;
  v_workspace_id uuid;
BEGIN
  -- Get current pipeline stage and workspace_id
  SELECT pipeline_stage, workspace_id INTO v_old_stage, v_workspace_id
  FROM public.contacts
  WHERE id = NEW.contact_id;
  
  -- Determine new stage based on lead_score from lead_auto_follow_up_stats
  IF NEW.current_lead_score >= 70 THEN
    v_new_stage := 'HOT'::pipeline_stage_contact;
  ELSIF NEW.current_lead_score >= 30 THEN
    v_new_stage := 'WARM'::pipeline_stage_contact;
  ELSE
    v_new_stage := 'COLD'::pipeline_stage_contact;
  END IF;
  
  -- Only update if stage changed and not manually set
  IF v_old_stage IS NULL OR v_old_stage != v_new_stage THEN
    -- Update contact pipeline_stage
    UPDATE public.contacts
    SET pipeline_stage = v_new_stage
    WHERE id = NEW.contact_id;
    
    -- Log movement in history
    INSERT INTO public.pipeline_history (
      contact_id,
      workspace_id,
      campaign_id,
      from_stage,
      to_stage,
      moved_by_system,
      reason,
      metadata
    )
    VALUES (
      NEW.contact_id,
      v_workspace_id,
      NEW.campaign_id,
      v_old_stage,
      v_new_stage,
      true,
      'lead_score_change',
      jsonb_build_object('lead_score', NEW.current_lead_score)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- 4. Create function to move lead manually (for drag & drop)
CREATE OR REPLACE FUNCTION public.move_lead_to_stage(
  p_contact_id uuid,
  p_workspace_id uuid,
  p_to_stage pipeline_stage_contact,
  p_campaign_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'manual_drag'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_from_stage pipeline_stage_contact;
BEGIN
  -- Get current stage
  SELECT pipeline_stage INTO v_from_stage
  FROM public.contacts
  WHERE id = p_contact_id AND workspace_id = p_workspace_id;
  
  -- Update contact
  UPDATE public.contacts
  SET pipeline_stage = p_to_stage,
      updated_at = now()
  WHERE id = p_contact_id AND workspace_id = p_workspace_id;
  
  -- Log movement
  INSERT INTO public.pipeline_history (
    contact_id,
    workspace_id,
    campaign_id,
    from_stage,
    to_stage,
    moved_by_user_id,
    moved_by_system,
    reason,
    metadata
  )
  VALUES (
    p_contact_id,
    p_workspace_id,
    p_campaign_id,
    v_from_stage,
    p_to_stage,
    p_user_id,
    false,
    p_reason,
    jsonb_build_object('manual_move', true)
  );
  
  -- If moving to NOT_INTERESTED, suppress future emails
  IF p_to_stage = 'NOT_INTERESTED'::pipeline_stage_contact THEN
    -- Add to suppression list if not already there
    INSERT INTO public.suppression_list (user_id, email, reason)
    SELECT 
      (SELECT user_id FROM public.workspace_members WHERE workspace_id = p_workspace_id LIMIT 1),
      c.email,
      'not_interested'
    FROM public.contacts c
    WHERE c.id = p_contact_id
    ON CONFLICT (user_id, email) DO NOTHING;
  END IF;
END;
$$;

-- 5. Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.pipeline_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_lead_to_stage(uuid, uuid, pipeline_stage_contact, uuid, uuid, text) TO authenticated;

-- 6. RLS Policies for pipeline_history
ALTER TABLE public.pipeline_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_history_select_workspace"
  ON public.pipeline_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = pipeline_history.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "pipeline_history_insert_workspace"
  ON public.pipeline_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = pipeline_history.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Comments
COMMENT ON TABLE public.pipeline_history IS 'Tracks all pipeline stage movements for leads';
COMMENT ON COLUMN public.pipeline_history.moved_by_system IS 'True if moved automatically by SmartSend, false if moved manually by user';
COMMENT ON COLUMN public.pipeline_history.reason IS 'Reason for movement: lead_score_change, intent_classification, manual_drag, etc.';
COMMENT ON FUNCTION public.move_lead_to_stage IS 'Moves a lead to a new pipeline stage and logs the movement';

