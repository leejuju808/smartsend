-- 1) Enum for suppression reasons (idempotent-safe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suppression_reason') THEN
    CREATE TYPE suppression_reason AS ENUM (
      'unsubscribed',
      'bounced',
      'complaint',
      'manual',
      'role_account',
      'invalid_format'
    );
  END IF;
END$$;

-- 2) contacts table (create if missing) — minimal columns used by app
CREATE TABLE IF NOT EXISTS public.contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,               -- tie rows to a workspace/account
  email         text NOT NULL,
  first_name    text,
  last_name     text,
  company       text,
  title         text,
  phone         text,
  custom        jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- unique per workspace; ignore case by normalizing with lower()
CREATE UNIQUE INDEX IF NOT EXISTS contacts_workspace_email_uidx
  ON public.contacts (workspace_id, lower(email));

-- 3) suppressions table (create if missing)
CREATE TABLE IF NOT EXISTS public.suppressions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  email         text NOT NULL,
  reason        suppression_reason NOT NULL,
  metadata      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS suppressions_workspace_email_uidx
  ON public.suppressions (workspace_id, lower(email));

-- 4) campaigns table (create if missing minimal)
CREATE TABLE IF NOT EXISTS public.campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 5) per-campaign suppressions (optional, often for "don't email this person for this specific offer")
CREATE TABLE IF NOT EXISTS public.campaign_suppressions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  email         text NOT NULL,
  reason        suppression_reason NOT NULL DEFAULT 'manual',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_suppressions_unique
  ON public.campaign_suppressions (campaign_id, lower(email));

-- 6) helper function to check if an email is suppressed for a workspace (global) or for a campaign (scoped)
CREATE OR REPLACE FUNCTION public.is_suppressed(p_workspace uuid, p_email text, p_campaign uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  WITH global AS (
    SELECT 1 FROM public.suppressions s
    WHERE s.workspace_id = p_workspace AND lower(s.email) = lower(p_email)
    LIMIT 1
  ),
  scoped AS (
    SELECT 1 FROM public.campaign_suppressions cs
    WHERE p_campaign IS NOT NULL
      AND cs.campaign_id = p_campaign
      AND lower(cs.email) = lower(p_email)
    LIMIT 1
  )
  SELECT EXISTS(SELECT 1 FROM global) OR EXISTS(SELECT 1 FROM scoped);
$$;

-- 7) RLS: assume public.profiles has id = auth.uid() and workspace_id; mirror common Supabase pattern.
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_suppressions ENABLE ROW LEVEL SECURITY;

-- basic policies: a user can access only rows in their workspace
CREATE POLICY IF NOT EXISTS contacts_rw_policy ON public.contacts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = contacts.workspace_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = contacts.workspace_id)
  );

CREATE POLICY IF NOT EXISTS suppressions_rw_policy ON public.suppressions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = suppressions.workspace_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = suppressions.workspace_id)
  );

CREATE POLICY IF NOT EXISTS campaigns_rw_policy ON public.campaigns
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = campaigns.workspace_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = campaigns.workspace_id)
  );

CREATE POLICY IF NOT EXISTS campaign_suppressions_rw_policy ON public.campaign_suppressions
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.profiles p ON p.workspace_id = c.workspace_id AND p.id = auth.uid()
      WHERE c.id = campaign_suppressions.campaign_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.profiles p ON p.workspace_id = c.workspace_id AND p.id = auth.uid()
      WHERE c.id = campaign_suppressions.campaign_id
    )
  );