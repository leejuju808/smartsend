-- Block 252 — SmartSend Onboarding Tours v1
-- Creates onboarding_status table to track user onboarding progress with steps

CREATE TABLE IF NOT EXISTS public.onboarding_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, workspace_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_onboarding_status_user ON public.onboarding_status(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_status_workspace ON public.onboarding_status(workspace_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_status_completed ON public.onboarding_status(completed);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.set_onboarding_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_onboarding_status_updated_at ON public.onboarding_status;
CREATE TRIGGER trg_onboarding_status_updated_at
BEFORE UPDATE ON public.onboarding_status
FOR EACH ROW
EXECUTE FUNCTION public.set_onboarding_status_updated_at();

-- Enable RLS
ALTER TABLE public.onboarding_status ENABLE ROW LEVEL SECURITY;

-- RLS policies: Users can only access their own onboarding status
CREATE POLICY "Users can read their own onboarding status"
  ON public.onboarding_status
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own onboarding status"
  ON public.onboarding_status
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RPC function: Mark onboarding step as done
CREATE OR REPLACE FUNCTION public.mark_onboarding_step_done(
  p_user_id uuid,
  p_workspace_id uuid,
  p_step_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_id uuid;
  v_steps jsonb;
  v_step_idx int;
  v_step jsonb;
BEGIN
  -- Get or create onboarding_status record
  SELECT id, steps INTO v_status_id, v_steps
  FROM public.onboarding_status
  WHERE user_id = p_user_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_status_id IS NULL THEN
    -- Create new record
    INSERT INTO public.onboarding_status (user_id, workspace_id, steps)
    VALUES (p_user_id, p_workspace_id, '[]'::jsonb)
    RETURNING id, steps INTO v_status_id, v_steps;
  END IF;

  -- Find step index
  v_step_idx := -1;
  FOR i IN 0..jsonb_array_length(v_steps) - 1 LOOP
    IF (v_steps->i->>'id') = p_step_id THEN
      v_step_idx := i;
      EXIT;
    END IF;
  END LOOP;

  -- Update or add step
  IF v_step_idx >= 0 THEN
    -- Update existing step
    v_steps := jsonb_set(
      v_steps,
      ARRAY[v_step_idx::text, 'done'],
      'true'::jsonb
    );
  ELSE
    -- Add new step
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object('id', p_step_id, 'done', true)
    );
  END IF;

  -- Check if all steps are completed
  DECLARE
    all_done boolean := true;
    step_record jsonb;
  BEGIN
    FOR step_record IN SELECT * FROM jsonb_array_elements(v_steps) LOOP
      IF (step_record->>'done')::boolean = false THEN
        all_done := false;
        EXIT;
      END IF;
    END LOOP;

    -- Update record
    UPDATE public.onboarding_status
    SET steps = v_steps,
        completed = all_done,
        updated_at = now()
    WHERE id = v_status_id;
  END;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.mark_onboarding_step_done(uuid, uuid, text) TO authenticated;

-- RPC function: Get onboarding status
CREATE OR REPLACE FUNCTION public.get_onboarding_status(
  p_user_id uuid,
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_build_object(
      'id', id,
      'user_id', user_id,
      'workspace_id', workspace_id,
      'steps', steps,
      'completed', completed,
      'created_at', created_at,
      'updated_at', updated_at
    ),
    jsonb_build_object(
      'user_id', p_user_id,
      'workspace_id', p_workspace_id,
      'steps', '[]'::jsonb,
      'completed', false
    )
  )
  FROM public.onboarding_status
  WHERE user_id = p_user_id AND workspace_id = p_workspace_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_onboarding_status(uuid, uuid) TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE public.onboarding_status IS 'Tracks user onboarding progress through guided product tours and checklists';
COMMENT ON COLUMN public.onboarding_status.steps IS 'JSON array of step objects: [{id: string, done: boolean}]';
COMMENT ON COLUMN public.onboarding_status.completed IS 'True when all steps are marked as done';









