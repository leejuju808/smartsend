-- =========================================================
-- Block 8620 — Template key on campaign_steps
-- =========================================================

ALTER TABLE public.campaign_steps
ADD COLUMN IF NOT EXISTS template_key text;















