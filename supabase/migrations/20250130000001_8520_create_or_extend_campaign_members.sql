-- Block 8520 — Team Campaign Sharing v1 (Members + Roles UI + Enforcement) 👥📤
-- Ensure campaign_members table exists with role column

CREATE TABLE IF NOT EXISTS campaign_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor', -- 'owner' | 'editor' | 'viewer'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add role column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaign_members'
      AND column_name = 'role'
  ) THEN
    ALTER TABLE campaign_members
      ADD COLUMN role TEXT NOT NULL DEFAULT 'editor';
  END IF;
END $$;

-- Ensure foreign key constraints exist
DO $$
BEGIN
  -- Add campaign_id foreign key if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'campaign_members'
      AND constraint_name = 'campaign_members_campaign_id_fkey'
  ) THEN
    ALTER TABLE campaign_members
      ADD CONSTRAINT campaign_members_campaign_id_fkey
        FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE;
  END IF;

  -- Add user_id foreign key if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'campaign_members'
      AND constraint_name = 'campaign_members_user_id_fkey'
  ) THEN
    ALTER TABLE campaign_members
      ADD CONSTRAINT campaign_members_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create unique constraint for (campaign_id, user_id) if it doesn't exist
-- This is required for upsert onConflict to work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_members_campaign_user_unique'
      AND conrelid = 'campaign_members'::regclass
  ) THEN
    ALTER TABLE campaign_members
      ADD CONSTRAINT campaign_members_campaign_user_unique
      UNIQUE (campaign_id, user_id);
  END IF;
END $$;

-- Also create index for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_members_unique
  ON campaign_members (campaign_id, user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_members_campaign
  ON campaign_members (campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_members_user
  ON campaign_members (user_id);

-- Ensure role constraint
DO $$
BEGIN
  -- Drop existing check constraint if it exists and doesn't match
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'campaign_members'
      AND constraint_name = 'campaign_members_role_check'
  ) THEN
    ALTER TABLE campaign_members DROP CONSTRAINT campaign_members_role_check;
  END IF;

  -- Add check constraint for valid roles
  ALTER TABLE campaign_members
    ADD CONSTRAINT campaign_members_role_check
    CHECK (role IN ('owner', 'editor', 'viewer'));
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Ensure existing campaigns have owner rows
-- This handles both owner_id and owner_user_id columns
DO $$
DECLARE
  owner_col_name TEXT;
BEGIN
  -- Check which owner column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaigns'
      AND column_name = 'owner_user_id'
  ) THEN
    owner_col_name := 'owner_user_id';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaigns'
      AND column_name = 'owner_id'
  ) THEN
    owner_col_name := 'owner_id';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaigns'
      AND column_name = 'user_id'
  ) THEN
    owner_col_name := 'user_id';
  ELSE
    RETURN;
  END IF;

  -- Insert owner memberships for campaigns that don't have them
  EXECUTE format('
    INSERT INTO campaign_members (campaign_id, user_id, role)
    SELECT c.id, c.%I, ''owner''
    FROM campaigns c
    WHERE c.%I IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM campaign_members cm
        WHERE cm.campaign_id = c.id AND cm.user_id = c.%I
      )
    ON CONFLICT (campaign_id, user_id) DO NOTHING
  ', owner_col_name, owner_col_name, owner_col_name);
END $$;

