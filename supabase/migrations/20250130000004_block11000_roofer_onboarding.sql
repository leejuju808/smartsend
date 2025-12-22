-- =========================================================
-- Block 11000 — SmartSend 15-Minute Roofer Onboarding v1
-- (From Signup to Live Campaign in One Sitting)
-- =========================================================

-- Create onboarding_status table to track 4-step onboarding progress
CREATE TABLE IF NOT EXISTS public.onboarding_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  step_1_done boolean NOT NULL DEFAULT false, -- Company Basics
  step_2_done boolean NOT NULL DEFAULT false, -- Connect Sending Email
  step_3_done boolean NOT NULL DEFAULT false, -- Import Starter List
  step_4_done boolean NOT NULL DEFAULT false, -- Launch Campaign
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_onboarding_status_user ON public.onboarding_status(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_status_workspace ON public.onboarding_status(workspace_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_status_completed ON public.onboarding_status(completed_at) WHERE completed_at IS NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_onboarding_status_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  -- Auto-set completed_at when all steps are done
  IF NEW.step_1_done AND NEW.step_2_done AND NEW.step_3_done AND NEW.step_4_done AND NEW.completed_at IS NULL THEN
    NEW.completed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_status_updated_at ON public.onboarding_status;
CREATE TRIGGER trg_onboarding_status_updated_at
BEFORE UPDATE ON public.onboarding_status
FOR EACH ROW
EXECUTE FUNCTION public.set_onboarding_status_updated_at();

-- Enable RLS
ALTER TABLE public.onboarding_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own onboarding status
CREATE POLICY "onboarding_status_select_own"
  ON public.onboarding_status
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "onboarding_status_insert_own"
  ON public.onboarding_status
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "onboarding_status_update_own"
  ON public.onboarding_status
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Helper function: Get or create onboarding status
CREATE OR REPLACE FUNCTION public.get_or_create_onboarding_status(p_user_id uuid)
RETURNS public.onboarding_status
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status public.onboarding_status;
BEGIN
  SELECT * INTO v_status
  FROM public.onboarding_status
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.onboarding_status (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_status;
  END IF;

  RETURN v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_onboarding_status(uuid) TO authenticated;

-- Comments
COMMENT ON TABLE public.onboarding_status IS 'Tracks 4-step roofer onboarding progress: Company Basics → Email → Contacts → Launch';
COMMENT ON COLUMN public.onboarding_status.step_1_done IS 'Company name, owner name, city/state, service focus completed';
COMMENT ON COLUMN public.onboarding_status.step_2_done IS 'Sending email connected and tested';
COMMENT ON COLUMN public.onboarding_status.step_3_done IS 'Starter contact list imported (Old Quotes or similar)';
COMMENT ON COLUMN public.onboarding_status.step_4_done IS 'First campaign launched and scheduled';























































