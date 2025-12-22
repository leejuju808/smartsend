-- =========================================================
-- Block 8740 — Workspace Trial Fields
-- =========================================================

ALTER TABLE public.workspaces
ADD COLUMN IF NOT EXISTS trial_start timestamptz,
ADD COLUMN IF NOT EXISTS trial_end   timestamptz;

-- When a workspace is created, default trial = 7 days
CREATE OR REPLACE FUNCTION public.set_default_trial_dates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.trial_start IS NULL THEN
    NEW.trial_start := now();
  END IF;

  IF NEW.trial_end IS NULL THEN
    NEW.trial_end := now() + interval '7 days';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_default_trial_dates ON public.workspaces;

CREATE TRIGGER trg_set_default_trial_dates
BEFORE INSERT ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.set_default_trial_dates();


























































