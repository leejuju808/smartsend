-- =========================================================
-- Block 8600 — Campaign Basic Fields
-- =========================================================

-- Base table was already created earlier, now we extend it
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS from_name text,
ADD COLUMN IF NOT EXISTS from_email text,
ADD COLUMN IF NOT EXISTS daily_send_limit integer DEFAULT 50,
ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Los_Angeles',
ADD COLUMN IF NOT EXISTS starts_at timestamptz,
ADD COLUMN IF NOT EXISTS ends_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_campaigns_status
  ON public.campaigns (status);


























































