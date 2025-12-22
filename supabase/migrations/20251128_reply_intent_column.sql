-- =========================================================
-- Block 8660 — Intent-Driven Reply Actions
-- Step 1: Add intent column to email_replies
-- =========================================================

-- Add intent column to email_replies table
ALTER TABLE public.email_replies
ADD COLUMN IF NOT EXISTS intent text;  -- hot / warm / not_interested / none

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_email_replies_intent
ON public.email_replies (intent)
WHERE intent IS NOT NULL;

-- Ensure email_replies has required columns for the function
-- Add workspace_id if it doesn't exist (needed for process_reply_intent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_replies'
      AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.email_replies
    ADD COLUMN workspace_id uuid;
    
    -- Try to populate from campaign if campaign_id exists
    UPDATE public.email_replies er
    SET workspace_id = c.workspace_id
    FROM public.campaigns c
    WHERE er.campaign_id = c.id
      AND er.workspace_id IS NULL;
  END IF;
END $$;

-- Add campaign_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_replies'
      AND column_name = 'campaign_id'
  ) THEN
    ALTER TABLE public.email_replies
    ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_email_replies_campaign_id
    ON public.email_replies (campaign_id)
    WHERE campaign_id IS NOT NULL;
  END IF;
END $$;

-- Add from_name if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_replies'
      AND column_name = 'from_name'
  ) THEN
    ALTER TABLE public.email_replies
    ADD COLUMN from_name text;
  END IF;
END $$;

-- Ensure from_email exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_replies'
      AND column_name = 'from_email'
  ) THEN
    ALTER TABLE public.email_replies
    ADD COLUMN from_email text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Create index on workspace_id if it exists
CREATE INDEX IF NOT EXISTS idx_email_replies_workspace_id
ON public.email_replies (workspace_id)
WHERE workspace_id IS NOT NULL;


























































