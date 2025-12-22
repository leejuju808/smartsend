-- =========================================================
-- Block 8610 — Campaign Sequence Steps
-- =========================================================

CREATE TABLE IF NOT EXISTS public.campaign_steps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL,
  step_order   integer NOT NULL,
  delay_days   integer NOT NULL DEFAULT 0, -- days after previous step
  subject      text NOT NULL,
  body         text NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_steps
  ADD CONSTRAINT campaign_steps_campaign_fk
  FOREIGN KEY (campaign_id)
  REFERENCES public.campaigns(id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_campaign_steps_campaign
  ON public.campaign_steps (campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_steps_order
  ON public.campaign_steps (campaign_id, step_order);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_campaign_steps_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_campaign_steps_updated_at ON public.campaign_steps;

CREATE TRIGGER trg_set_campaign_steps_updated_at
BEFORE UPDATE ON public.campaign_steps
FOR EACH ROW
EXECUTE FUNCTION public.set_campaign_steps_updated_at();

-- RLS: scope by workspace via campaigns + workspace_members
ALTER TABLE public.campaign_steps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campaign_steps'
      AND policyname = 'Campaign steps scoped to workspace'
  ) THEN
    CREATE POLICY "Campaign steps scoped to workspace"
    ON public.campaign_steps
    FOR ALL
    USING (
      EXISTS (
        SELECT 1
        FROM public.campaigns c
        JOIN public.workspace_members wm
          ON wm.workspace_id = c.workspace_id
        WHERE c.id = campaign_id
          AND wm.user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.campaigns c
        JOIN public.workspace_members wm
          ON wm.workspace_id = c.workspace_id
        WHERE c.id = campaign_id
          AND wm.user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- Helper: get next step_order for a campaign
CREATE OR REPLACE FUNCTION public.next_campaign_step_order(p_campaign_id uuid)
RETURNS integer
LANGUAGE sql
AS $$
  SELECT COALESCE(MAX(step_order), 0) + 1
  FROM public.campaign_steps
  WHERE campaign_id = p_campaign_id;
$$;


























































