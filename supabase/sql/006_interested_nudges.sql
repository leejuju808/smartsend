-- File: supabase/sql/006_interested_nudges.sql

-- Extend sender_settings with scheduling/nudge knobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sender_settings' AND column_name='scheduling_url'
  ) THEN
    ALTER TABLE public.sender_settings
      ADD COLUMN scheduling_url text;         -- e.g., https://calendly.com/yourname/demo
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sender_settings' AND column_name='nudge_delay_hours'
  ) THEN
    ALTER TABLE public.sender_settings
      ADD COLUMN nudge_delay_hours integer NOT NULL DEFAULT 24; -- wait this long after "Interested"
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sender_settings' AND column_name='max_nudges_per_lead'
  ) THEN
    ALTER TABLE public.sender_settings
      ADD COLUMN max_nudges_per_lead integer NOT NULL DEFAULT 1; -- prevent nagging
  END IF;
END$$;

-- Track nudges to avoid duplicates
CREATE TABLE IF NOT EXISTS public.interested_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  prospect_email citext NOT NULL,
  source_message_id uuid NULL,              -- original inbound "Interested" message id
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent',      -- sent, failed
  last_error text,
  UNIQUE (user_id, prospect_email)          -- one nudge per lead by default
);

CREATE INDEX IF NOT EXISTS idx_nudges_user_email ON public.interested_nudges(user_id, prospect_email);

ALTER TABLE public.interested_nudges ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='interested_nudges' AND policyname='nudges_select_own'
  ) THEN
    CREATE POLICY nudges_select_own
      ON public.interested_nudges FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='interested_nudges' AND policyname='nudges_insert_admin'
  ) THEN
    -- inserts happen via service role worker
    CREATE POLICY nudges_insert_admin
      ON public.interested_nudges FOR INSERT
      TO anon, authenticated
      WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='interested_nudges' AND policyname='nudges_update_admin'
  ) THEN
    CREATE POLICY nudges_update_admin
      ON public.interested_nudges FOR UPDATE
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END$$;
