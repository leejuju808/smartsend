-- File: supabase/sql/002_inbound_routes_and_meetings.sql

-- 1) Inbound routes: map inbound "to_email" addresses to a specific user/workspace.
CREATE TABLE IF NOT EXISTS public.inbound_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  to_email citext UNIQUE NOT NULL,  -- use unique routing addresses like julian+in@smartsend.ai
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_inbound_routes_user ON public.inbound_routes(user_id);

-- RLS (users can read/create their own routes)
ALTER TABLE public.inbound_routes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='inbound_routes' AND policyname='Select own routes'
  ) THEN
    CREATE POLICY "Select own routes"
      ON public.inbound_routes
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='inbound_routes' AND policyname='Insert own routes'
  ) THEN
    CREATE POLICY "Insert own routes"
      ON public.inbound_routes
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='inbound_routes' AND policyname='Update own routes'
  ) THEN
    CREATE POLICY "Update own routes"
      ON public.inbound_routes
      FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='inbound_routes' AND policyname='Delete own routes'
  ) THEN
    CREATE POLICY "Delete own routes"
      ON public.inbound_routes
      FOR DELETE
      USING (user_id = auth.uid());
  END IF;
END$$;

-- 2) Meetings table: store booked meetings (from Calendly webhook or manual insert).
CREATE TABLE IF NOT EXISTS public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                -- which workspace the meeting belongs to
  source text NOT NULL DEFAULT 'calendly', -- calendly, manual, other
  external_event_id text,               -- calendly event uuid
  invitee_email citext,
  invitee_name text,
  status text DEFAULT 'active',         -- active, canceled
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb                             -- full webhook payload for audit
);

CREATE INDEX IF NOT EXISTS idx_meetings_user_id ON public.meetings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_time ON public.meetings(starts_at DESC);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='meetings' AND policyname='Select own meetings'
  ) THEN
    CREATE POLICY "Select own meetings"
      ON public.meetings
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='meetings' AND policyname='Insert own meetings'
  ) THEN
    CREATE POLICY "Insert own meetings"
      ON public.meetings
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='meetings' AND policyname='Update own meetings'
  ) THEN
    CREATE POLICY "Update own meetings"
      ON public.meetings
      FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END$$;

-- 3) Metrics (last 30d) per user
-- Replies = inbound messages
-- Interested = inbound messages where reply_intent ILIKE 'Interested'
-- Meetings = meetings rows for the user
CREATE OR REPLACE VIEW public.metrics_user_30d AS
SELECT
  u.id AS user_id,
  COALESCE(r.replies_30d, 0) AS replies_30d,
  COALESCE(r.interested_30d, 0) AS interested_30d,
  COALESCE(m.meetings_30d, 0) AS meetings_30d,
  CASE
    WHEN COALESCE(r.replies_30d, 0) = 0 THEN 0.0
    ELSE ROUND((COALESCE(m.meetings_30d, 0)::numeric / r.replies_30d::numeric) * 100.0, 2)
  END AS mb_per_100_30d
FROM (
  SELECT DISTINCT user_id AS id
  FROM public.messages
  WHERE user_id IS NOT NULL
  UNION
  SELECT DISTINCT user_id
  FROM public.meetings
) u
LEFT JOIN (
  SELECT
    user_id,
    COUNT(*) FILTER (WHERE direction = 'inbound'
                     AND created_at >= now() - interval '30 days') AS replies_30d,
    COUNT(*) FILTER (WHERE direction = 'inbound'
                     AND reply_intent ILIKE 'Interested'
                     AND created_at >= now() - interval '30 days') AS interested_30d
  FROM public.messages
  WHERE user_id IS NOT NULL
  GROUP BY user_id
) r ON r.user_id = u.id
LEFT JOIN (
  SELECT
    user_id,
    COUNT(*) FILTER (WHERE (status IS NULL OR status <> 'canceled')
                     AND created_at >= now() - interval '30 days') AS meetings_30d
  FROM public.meetings
  GROUP BY user_id
) m ON m.user_id = u.id;

-- RLS for the view via security invoker
ALTER VIEW public.metrics_user_30d SET (security_invoker = on);
