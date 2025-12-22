-- Comprehensive unsubscribe and suppression system
-- Updates existing tables and adds helper functions

-- 1. Update suppression_list to match required schema
-- Add id column if missing, update email to text, ensure all required columns exist
DO $$ 
BEGIN
  -- Add id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'suppression_list' 
    AND column_name = 'id'
  ) THEN
    ALTER TABLE public.suppression_list 
    ADD COLUMN id uuid PRIMARY KEY DEFAULT uuid_generate_v4();
  END IF;

  -- Change email from citext to text if needed (keep citext for case-insensitive matching)
  -- But ensure we have the unique constraint on (email, org_id)
  
  -- Add created_at if missing (use first_seen_at if it exists)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'suppression_list' 
    AND column_name = 'created_at'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'suppression_list' 
      AND column_name = 'first_seen_at'
    ) THEN
      ALTER TABLE public.suppression_list 
      ADD COLUMN created_at timestamptz;
      UPDATE public.suppression_list SET created_at = first_seen_at WHERE created_at IS NULL;
      ALTER TABLE public.suppression_list ALTER COLUMN created_at SET DEFAULT now();
      ALTER TABLE public.suppression_list ALTER COLUMN created_at SET NOT NULL;
    ELSE
      ALTER TABLE public.suppression_list 
      ADD COLUMN created_at timestamptz DEFAULT now() NOT NULL;
    END IF;
  END IF;

  -- Ensure reason column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'suppression_list' 
    AND column_name = 'reason'
  ) THEN
    ALTER TABLE public.suppression_list 
    ADD COLUMN reason text;
  END IF;

  -- Ensure source column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'suppression_list' 
    AND column_name = 'source'
  ) THEN
    ALTER TABLE public.suppression_list 
    ADD COLUMN source text;
  END IF;

  -- Ensure unique constraint on (email, org_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'suppression_list_email_org_id_key'
  ) THEN
    -- Drop old primary key if it's on (org_id, email)
    IF EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'suppression_list_pkey' 
      AND array_length(conkey, 1) = 2
    ) THEN
      ALTER TABLE public.suppression_list DROP CONSTRAINT suppression_list_pkey;
    END IF;
    
    -- Add unique constraint
    CREATE UNIQUE INDEX IF NOT EXISTS suppression_list_email_org_id_unique 
    ON public.suppression_list(email, org_id);
  END IF;
END $$;

-- Make org_id nullable (for solo users)
ALTER TABLE public.suppression_list ALTER COLUMN org_id DROP NOT NULL;

-- 2. Update/create unsubscribe_tokens table
CREATE TABLE IF NOT EXISTS public.unsubscribe_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid,                    -- or owner_user_id if you're solo
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

-- Add index on email for fast lookups
CREATE INDEX IF NOT EXISTS unsubscribe_email_idx ON public.unsubscribe_tokens(email);
CREATE INDEX IF NOT EXISTS unsubscribe_token_idx ON public.unsubscribe_tokens(token);

-- Enable RLS
ALTER TABLE public.unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

-- Public read access for unsubscribe tokens (needed for unsubscribe page)
DROP POLICY IF EXISTS unsubscribe_tokens_public_read ON public.unsubscribe_tokens;
CREATE POLICY unsubscribe_tokens_public_read ON public.unsubscribe_tokens
  FOR SELECT USING (true);

-- 3. Create helper function: fast suppression check
CREATE OR REPLACE FUNCTION public.is_suppressed(p_email text, p_org uuid)
RETURNS boolean 
LANGUAGE sql 
STABLE 
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.suppression_list
    WHERE email = p_email 
    AND (org_id IS NULL OR org_id = p_org)
  )
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_suppressed(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_suppressed(text, uuid) TO anon;

-- Add index on email for fast lookups (if not exists)
CREATE INDEX IF NOT EXISTS suppression_email_idx ON public.suppression_list(email);

