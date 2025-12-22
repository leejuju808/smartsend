-- File: supabase/sql/004_send_safety.sql

-- 1) Per-user sender settings (daily cap + warmup stage)
CREATE TABLE IF NOT EXISTS public.sender_settings (
  user_id uuid PRIMARY KEY,
  warmup_enabled boolean NOT NULL DEFAULT true,
  -- Current daily cap for outbound emails
  daily_cap integer NOT NULL DEFAULT 50,
  -- Warmup stage index (0..N) used for suggested ramp
  ramp_stage integer NOT NULL DEFAULT 0,
  -- Bounce-rate threshold (%) to pause sending
  hard_bounce_threshold numeric NOT NULL DEFAULT 5.0,
  -- If true, block sending when threshold exceeded
  block_on_threshold boolean NOT NULL DEFAULT true,
  -- Optional: last time we accepted a ramp up
  last_ramp_at timestamptz,
  -- Optional: notes
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sender_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sender_settings' AND policyname='sender_settings_select_own'
  ) THEN
    CREATE POLICY sender_settings_select_own
      ON public.sender_settings FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sender_settings' AND policyname='sender_settings_upsert_own'
  ) THEN
    CREATE POLICY sender_settings_upsert_own
      ON public.sender_settings FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sender_settings' AND policyname='sender_settings_update_own'
  ) THEN
    CREATE POLICY sender_settings_update_own
      ON public.sender_settings FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END$$;

-- 2) Bounces table (hard/soft)
CREATE TYPE public.bounce_type AS ENUM ('hard', 'soft');

CREATE TABLE IF NOT EXISTS public.bounces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email citext NOT NULL,
  btype public.bounce_type NOT NULL DEFAULT 'hard',
  provider text,                 -- resend, mailgun, sendgrid, etc.
  reason text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bounces_user_time ON public.bounces(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounces_user_email ON public.bounces(user_id, email);

ALTER TABLE public.bounces ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bounces' AND policyname='bounces_select_own'
  ) THEN
    CREATE POLICY bounces_select_own
      ON public.bounces FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bounces' AND policyname='bounces_insert_admin'
  ) THEN
    -- Service role inserts from webhooks; regular users shouldn't insert
    CREATE POLICY bounces_insert_admin
      ON public.bounces FOR INSERT
      TO anon, authenticated
      WITH CHECK (false);
  END IF;
END$$;

-- 3) Health view (last 7d): outbound count, bounce count, rate, suggested cap
-- Assumes public.messages table exists with direction = 'outbound' and created_at timestamps
CREATE OR REPLACE VIEW public.sender_health_7d AS
SELECT
  u.user_id,
  COALESCE(m.outbound_7d, 0) AS outbound_7d,
  COALESCE(b.bounces_7d, 0)  AS bounces_7d,
  CASE
    WHEN COALESCE(m.outbound_7d,0) = 0 THEN 0.0
    ELSE ROUND((COALESCE(b.bounces_7d,0)::numeric / m.outbound_7d::numeric) * 100.0, 2)
  END AS bounce_rate_7d,
  s.daily_cap,
  s.warmup_enabled,
  s.ramp_stage,
  s.hard_bounce_threshold,
  -- Suggested ramp ladder
  CASE
    WHEN COALESCE(m.outbound_7d,0) < 50 THEN 50
    WHEN COALESCE(m.outbound_7d,0) < 100 THEN 100
    WHEN COALESCE(m.outbound_7d,0) < 200 THEN 200
    WHEN COALESCE(m.outbound_7d,0) < 400 THEN 400
    WHEN COALESCE(m.outbound_7d,0) < 800 THEN 800
    ELSE 800
  END AS suggested_cap
FROM (
  SELECT DISTINCT user_id FROM public.messages WHERE user_id IS NOT NULL
  UNION SELECT DISTINCT user_id FROM public.bounces
  UNION SELECT user_id FROM public.sender_settings
) u
LEFT JOIN (
  SELECT user_id,
         COUNT(*) FILTER (WHERE direction = 'outbound'
                          AND created_at >= (date_trunc('day', now()) - interval '7 days')) AS outbound_7d
  FROM public.messages
  GROUP BY user_id
) m ON m.user_id = u.user_id
LEFT JOIN (
  SELECT user_id,
         COUNT(*) FILTER (WHERE created_at >= (date_trunc('day', now()) - interval '7 days')) AS bounces_7d
  FROM public.bounces
  GROUP BY user_id
) b ON b.user_id = u.user_id
LEFT JOIN public.sender_settings s ON s.user_id = u.user_id;

ALTER VIEW public.sender_health_7d SET (security_invoker = on);

-- 4) Helper: today outbound count per user
CREATE OR REPLACE VIEW public.outbound_today AS
SELECT user_id,
       COUNT(*) FILTER (WHERE direction='outbound'
                        AND created_at >= date_trunc('day', now())) AS sent_today
FROM public.messages
GROUP BY user_id;

ALTER VIEW public.outbound_today SET (security_invoker = on);
