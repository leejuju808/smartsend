-- =========================================================
-- Block 8630 — Contacts + Campaign Enrollment
-- =========================================================

-- 1) Contacts (workspace-scoped)
CREATE TABLE IF NOT EXISTS public.contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  email         text NOT NULL,
  first_name    text,
  last_name     text,
  company       text,
  city          text,
  state         text,
  postal_code   text,
  phone         text,
  tags          text[] DEFAULT '{}',
  source        text,             -- e.g. "import_csv", "manual", "reply_capture"
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_workspace_email
  ON public.contacts (workspace_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_contacts_workspace
  ON public.contacts (workspace_id);

-- Add foreign key constraint to workspaces if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'contacts_workspace_fk'
      AND table_name = 'contacts'
  ) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_workspace_fk
      FOREIGN KEY (workspace_id)
      REFERENCES public.workspaces(id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_contacts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_contacts_updated_at ON public.contacts;

CREATE TRIGGER trg_set_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.set_contacts_updated_at();

-- 2) Join table: campaign_contacts
CREATE TABLE IF NOT EXISTS public.campaign_contacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      uuid NOT NULL,
  contact_id       uuid NOT NULL,
  status           text NOT NULL DEFAULT 'not_started', -- not_started / scheduled / completed / unsubscribed / bounced
  last_step_sent   integer,
  last_sent_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_contacts
  ADD CONSTRAINT campaign_contacts_campaign_fk
  FOREIGN KEY (campaign_id)
  REFERENCES public.campaigns(id)
  ON DELETE CASCADE;

ALTER TABLE public.campaign_contacts
  ADD CONSTRAINT campaign_contacts_contact_fk
  FOREIGN KEY (contact_id)
  REFERENCES public.contacts(id)
  ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_contacts_unique
  ON public.campaign_contacts (campaign_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign
  ON public.campaign_contacts (campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status
  ON public.campaign_contacts (campaign_id, status);

-- 3) RLS for contacts
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contacts'
      AND policyname = 'Contacts scoped to workspace'
  ) THEN
    CREATE POLICY "Contacts scoped to workspace"
    ON public.contacts
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- 4) RLS for campaign_contacts (through campaigns + contacts)
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campaign_contacts'
      AND policyname = 'Campaign contacts scoped to workspace'
  ) THEN
    CREATE POLICY "Campaign contacts scoped to workspace"
    ON public.campaign_contacts
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

-- 5) Helper: get or create contact within workspace
CREATE OR REPLACE FUNCTION public.get_or_create_contact(
  p_workspace_id uuid,
  p_email text,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id
  INTO v_id
  FROM public.contacts
  WHERE workspace_id = p_workspace_id
    AND lower(email) = lower(p_email)
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.contacts (
    workspace_id,
    email,
    first_name,
    last_name,
    source
  )
  VALUES (
    p_workspace_id,
    lower(p_email),
    p_first_name,
    p_last_name,
    'manual_enroll'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 6) Helper: enroll contact into campaign
CREATE OR REPLACE FUNCTION public.enroll_contact_in_campaign(
  p_campaign_id uuid,
  p_email text,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_contact_id   uuid;
  v_link_id      uuid;
BEGIN
  -- Find campaign + workspace
  SELECT workspace_id INTO v_workspace_id
  FROM public.campaigns
  WHERE id = p_campaign_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  -- Ensure caller belongs to workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = auth.uid()
      AND workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Get or create contact
  v_contact_id := public.get_or_create_contact(
    v_workspace_id,
    p_email,
    p_first_name,
    p_last_name
  );

  -- Upsert into campaign_contacts
  INSERT INTO public.campaign_contacts (
    campaign_id,
    contact_id,
    status
  )
  VALUES (
    p_campaign_id,
    v_contact_id,
    'not_started'
  )
  ON CONFLICT (campaign_id, contact_id)
  DO UPDATE SET
    status = EXCLUDED.status
  RETURNING id INTO v_link_id;

  RETURN v_link_id;
END;
$$;

