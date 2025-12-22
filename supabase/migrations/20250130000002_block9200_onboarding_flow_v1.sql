-- =========================================================
-- Block 9200 — Onboarding Flow v1
-- Lightning-Fast Setup for Roofers – First Campaign Live in 10 Minutes
-- =========================================================

-- A) Account Profiles (roofing company basics)
CREATE TABLE IF NOT EXISTS public.account_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_name text,
  company_name text,
  service_area text, -- e.g., "Tacoma, WA"
  services text[], -- array of service keys: ['roof_replacement', 'roof_repair', 'storm_damage', 'gutter_tuneups', 'commercial_roofing']
  average_job_value numeric(12,2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_account_profiles_workspace ON public.account_profiles(workspace_id);

-- B) Sending Identities (from name + email + domain check)
CREATE TABLE IF NOT EXISTS public.sending_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  from_name text NOT NULL,
  from_email text NOT NULL,
  reply_to_email text,
  is_default boolean NOT NULL DEFAULT true,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sending_identities_workspace ON public.sending_identities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sending_identities_default ON public.sending_identities(workspace_id, is_default) WHERE is_default = true;

-- Unique constraint: one default sending identity per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_sending_identities_workspace_default 
  ON public.sending_identities(workspace_id) 
  WHERE is_default = true;

-- C) Contact Lists (for organizing contacts)
CREATE TABLE IF NOT EXISTS public.contact_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_lists_workspace ON public.contact_lists(workspace_id);

-- D) Contact List Members (join table)
CREATE TABLE IF NOT EXISTS public.contact_list_members (
  list_id uuid NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (list_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_list_members_list ON public.contact_list_members(list_id);
CREATE INDEX IF NOT EXISTS idx_contact_list_members_contact ON public.contact_list_members(contact_id);

-- E) Add onboarding columns to workspaces (or use a separate onboarding_states table)
-- For simplicity, we'll add columns directly to workspaces
-- Note: If workspaces table doesn't exist, this will fail gracefully
DO $$
BEGIN
  -- Add onboarding_step column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workspaces' 
    AND column_name = 'onboarding_step'
  ) THEN
    ALTER TABLE public.workspaces 
    ADD COLUMN onboarding_step text NOT NULL DEFAULT 'not_started';
  END IF;

  -- Add onboarding_completed column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'workspaces' 
    AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE public.workspaces 
    ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add check constraint for onboarding_step
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'workspaces_onboarding_step_check'
    AND table_name = 'workspaces'
  ) THEN
    ALTER TABLE public.workspaces
    ADD CONSTRAINT workspaces_onboarding_step_check
    CHECK (onboarding_step IN ('not_started', 'company_profile', 'sending_identity', 'import_leads', 'pick_campaign', 'review_launch', 'completed'));
  END IF;
END $$;

-- F) Updated_at triggers
CREATE OR REPLACE FUNCTION public.set_account_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_account_profiles_updated_at ON public.account_profiles;
CREATE TRIGGER trg_set_account_profiles_updated_at
BEFORE UPDATE ON public.account_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_account_profiles_updated_at();

CREATE OR REPLACE FUNCTION public.set_sending_identities_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sending_identities_updated_at ON public.sending_identities;
CREATE TRIGGER trg_set_sending_identities_updated_at
BEFORE UPDATE ON public.sending_identities
FOR EACH ROW
EXECUTE FUNCTION public.set_sending_identities_updated_at();

CREATE OR REPLACE FUNCTION public.set_contact_lists_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_contact_lists_updated_at ON public.contact_lists;
CREATE TRIGGER trg_set_contact_lists_updated_at
BEFORE UPDATE ON public.contact_lists
FOR EACH ROW
EXECUTE FUNCTION public.set_contact_lists_updated_at();

-- G) RLS Policies
ALTER TABLE public.account_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sending_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_list_members ENABLE ROW LEVEL SECURITY;

-- Account profiles: workspace members can read/write
CREATE POLICY IF NOT EXISTS "account_profiles_workspace_members"
ON public.account_profiles
FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
);

-- Sending identities: workspace members can read/write
CREATE POLICY IF NOT EXISTS "sending_identities_workspace_members"
ON public.sending_identities
FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
);

-- Contact lists: workspace members can read/write
CREATE POLICY IF NOT EXISTS "contact_lists_workspace_members"
ON public.contact_lists
FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
);

-- Contact list members: workspace members can read/write (via list)
CREATE POLICY IF NOT EXISTS "contact_list_members_workspace_members"
ON public.contact_list_members
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.contact_lists cl
    JOIN public.workspace_members wm ON wm.workspace_id = cl.workspace_id
    WHERE cl.id = list_id AND wm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.contact_lists cl
    JOIN public.workspace_members wm ON wm.workspace_id = cl.workspace_id
    WHERE cl.id = list_id AND wm.user_id = auth.uid()
  )
);

-- Comments
COMMENT ON TABLE public.account_profiles IS 'Roofing company profile information collected during onboarding';
COMMENT ON TABLE public.sending_identities IS 'Email sending identities (from name, from email) for campaigns';
COMMENT ON TABLE public.contact_lists IS 'Lists for organizing contacts (e.g., "Homeowners List")';
COMMENT ON TABLE public.contact_list_members IS 'Join table linking contacts to lists';
COMMENT ON COLUMN public.workspaces.onboarding_step IS 'Current step in onboarding flow: not_started | company_profile | sending_identity | import_leads | pick_campaign | review_launch | completed';
COMMENT ON COLUMN public.workspaces.onboarding_completed IS 'Whether onboarding has been completed';

