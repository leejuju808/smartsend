-- Block 8420 — Team Campaign Sharing v1 (Multi-User Access & Roles) 👥
-- Goal: Let you share a campaign with teammates with simple roles: owner, editor, viewer.
-- RLS respects membership so only members can see / edit a campaign.

-- 1️⃣ DB Migration — campaign_member_role + campaign_members

-- 1. Role enum for campaign membership
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'campaign_member_role'
  ) THEN
    CREATE TYPE campaign_member_role AS ENUM (
      'owner',   -- full control
      'editor',  -- can edit campaign & leads
      'viewer'   -- read-only
    );
  END IF;
END
$$;

-- 2. Campaign members table (idempotent - only create if doesn't exist)
CREATE TABLE IF NOT EXISTS public.campaign_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  user_id UUID NOT NULL, -- references auth.users.id (or profiles.id)
  role campaign_member_role NOT NULL DEFAULT 'editor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT campaign_members_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES public.campaigns (id) ON DELETE CASCADE
);

-- 3. Uniqueness: a user can only have one role per campaign
-- Create unique constraint (required for upsert onConflict)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'campaign_members_campaign_user_unique'
  ) THEN
    ALTER TABLE public.campaign_members
      ADD CONSTRAINT campaign_members_campaign_user_unique
      UNIQUE (campaign_id, user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_campaign_members_user
  ON public.campaign_members (user_id);

CREATE INDEX IF NOT EXISTS idx_campaign_members_campaign
  ON public.campaign_members (campaign_id);

-- Ensure existing campaigns have owner rows
INSERT INTO public.campaign_members (campaign_id, user_id, role)
SELECT c.id, c.user_id, 'owner'::campaign_member_role
FROM public.campaigns c
WHERE NOT EXISTS (
  SELECT 1 FROM public.campaign_members cm
  WHERE cm.campaign_id = c.id AND cm.user_id = c.user_id
)
ON CONFLICT (campaign_id, user_id) DO NOTHING;

-- 2️⃣ RLS Pattern — "User is Member of Campaign"

-- Helper: function to check if current_user is member of a campaign
CREATE OR REPLACE FUNCTION public.is_campaign_member(campaign uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaign_members cm
    WHERE cm.campaign_id = campaign
      AND cm.user_id = auth.uid()
  );
$$;

-- Example: RLS on campaigns
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Drop existing policies that might conflict (idempotent)
DROP POLICY IF EXISTS "Campaigns are visible to members" ON public.campaigns;
DROP POLICY IF EXISTS "Campaigns editable by editors and owners" ON public.campaigns;
DROP POLICY IF EXISTS "Campaigns deletable by owners" ON public.campaigns;
DROP POLICY IF EXISTS "Campaigns insert by authenticated" ON public.campaigns;

-- Allow members to SELECT campaigns they belong to
CREATE POLICY "Campaigns are visible to members"
ON public.campaigns
FOR SELECT
USING (
  is_campaign_member(id)
);

-- Allow owners & editors to UPDATE
CREATE POLICY "Campaigns editable by editors and owners"
ON public.campaigns
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.campaign_members cm
    WHERE cm.campaign_id = campaigns.id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'editor')
  )
);

-- Only owners can DELETE
CREATE POLICY "Campaigns deletable by owners"
ON public.campaigns
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.campaign_members cm
    WHERE cm.campaign_id = campaigns.id
      AND cm.user_id = auth.uid()
      AND cm.role = 'owner'
  )
);

-- Insert logic: typically only owners create campaigns
CREATE POLICY "Campaigns insert by authenticated"
ON public.campaigns
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
);

-- Example: RLS on campaign_leads (and related tables)
ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Campaign leads visible to campaign members" ON public.campaign_leads;
DROP POLICY IF EXISTS "Campaign leads editable by editors and owners" ON public.campaign_leads;

CREATE POLICY "Campaign leads visible to campaign members"
ON public.campaign_leads
FOR SELECT
USING (
  is_campaign_member(campaign_id)
);

CREATE POLICY "Campaign leads editable by editors and owners"
ON public.campaign_leads
FOR INSERT, UPDATE, DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.campaign_members cm
    WHERE cm.campaign_id = campaign_leads.campaign_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'editor')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.campaign_members cm
    WHERE cm.campaign_id = campaign_leads.campaign_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'editor')
  )
);

-- RLS on campaign_members table
ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Campaign members visible to campaign members" ON public.campaign_members;
DROP POLICY IF EXISTS "Campaign members manageable by owners" ON public.campaign_members;

CREATE POLICY "Campaign members visible to campaign members"
ON public.campaign_members
FOR SELECT
USING (
  is_campaign_member(campaign_id)
);

CREATE POLICY "Campaign members manageable by owners"
ON public.campaign_members
FOR INSERT, UPDATE, DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.campaign_members cm
    WHERE cm.campaign_id = campaign_members.campaign_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'owner'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.campaign_members cm
    WHERE cm.campaign_id = campaign_members.campaign_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'owner'
  )
);

