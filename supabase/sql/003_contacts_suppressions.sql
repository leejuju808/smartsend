-- File: supabase/sql/003_contacts_suppressions.sql

-- CONTACTS: one row per (user_id, email). Upsert on (user_id, email).
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email citext NOT NULL,
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  notes text,
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_contacts_user_email
  ON public.contacts (user_id, email);

CREATE INDEX IF NOT EXISTS idx_contacts_user_company
  ON public.contacts (user_id, company);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='contacts_select_own'
  ) THEN
    CREATE POLICY contacts_select_own
      ON public.contacts FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='contacts_insert_own'
  ) THEN
    CREATE POLICY contacts_insert_own
      ON public.contacts FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='contacts_update_own'
  ) THEN
    CREATE POLICY contacts_update_own
      ON public.contacts FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contacts' AND policyname='contacts_delete_own'
  ) THEN
    CREATE POLICY contacts_delete_own
      ON public.contacts FOR DELETE
      USING (user_id = auth.uid());
  END IF;
END$$;

-- SUPPRESSIONS: flexible blocklist for emails/domains/reasons.
CREATE TYPE public.suppression_type AS ENUM ('email', 'domain', 'pattern');

CREATE TABLE IF NOT EXISTS public.suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,           -- workspace-scoped suppression
  s_type public.suppression_type NOT NULL DEFAULT 'email',
  value text NOT NULL,             -- 'bad@domain.com' or 'domain.com' or a LIKE pattern
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_suppressions_user_type_value
  ON public.suppressions (user_id, s_type, value);

ALTER TABLE public.suppressions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='suppressions' AND policyname='suppressions_select_own'
  ) THEN
    CREATE POLICY suppressions_select_own
      ON public.suppressions FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='suppressions' AND policyname='suppressions_insert_own'
  ) THEN
    CREATE POLICY suppressions_insert_own
      ON public.suppressions FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='suppressions' AND policyname='suppressions_update_own'
  ) THEN
    CREATE POLICY suppressions_update_own
      ON public.suppressions FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='suppressions' AND policyname='suppressions_delete_own'
  ) THEN
    CREATE POLICY suppressions_delete_own
      ON public.suppressions FOR DELETE
      USING (user_id = auth.uid());
  END IF;
END$$;
