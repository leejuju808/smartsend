-- BLOCK 274000 — Kill-Churn Lock Fields
-- Adds lightweight, factual history fields used for billing/cancellation UX:
-- - has_canceled_before: "user has experienced cancellation once"
-- - first_canceled_at / last_canceled_at: audit timestamps

ALTER TABLE IF EXISTS public.workspaces
  ADD COLUMN IF NOT EXISTS has_canceled_before boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS public.workspaces
  ADD COLUMN IF NOT EXISTS first_canceled_at timestamptz;

ALTER TABLE IF EXISTS public.workspaces
  ADD COLUMN IF NOT EXISTS last_canceled_at timestamptz;

COMMENT ON COLUMN public.workspaces.has_canceled_before IS 'True after the workspace has ever been canceled (billing canceled). Used to show return warm-up/ramp messaging.';
COMMENT ON COLUMN public.workspaces.first_canceled_at IS 'Timestamp of the first known cancellation for this workspace.';
COMMENT ON COLUMN public.workspaces.last_canceled_at IS 'Timestamp of the most recent cancellation for this workspace.';



