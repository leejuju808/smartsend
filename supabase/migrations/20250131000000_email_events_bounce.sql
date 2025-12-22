-- Block 214: Bounce Detection Engine v1
-- Add bounce_type column to email_events table and update event_type constraint

-- Add bounce_type column if it doesn't exist
ALTER TABLE public.email_events
ADD COLUMN IF NOT EXISTS bounce_type TEXT CHECK (
  bounce_type IN ('hard', 'soft', 'block')
);

-- Update event_type constraint to include 'bounce' if not already included
DO $$
DECLARE
  constraint_name text;
  constraint_def text;
BEGIN
  -- Find the event_type check constraint
  SELECT conname, pg_get_constraintdef(oid)
  INTO constraint_name, constraint_def
  FROM pg_constraint
  WHERE conrelid = 'public.email_events'::regclass
    AND contype = 'c'
    AND (conname LIKE '%event_type%' OR pg_get_constraintdef(oid) LIKE '%event_type%')
  LIMIT 1;

  -- If constraint exists and doesn't include 'bounce', update it
  IF constraint_name IS NOT NULL AND constraint_def NOT LIKE '%bounce%' THEN
    -- Drop existing constraint
    EXECUTE format('ALTER TABLE public.email_events DROP CONSTRAINT IF EXISTS %I', constraint_name);
    
    -- Add new constraint with bounce included (include common event types)
    ALTER TABLE public.email_events 
    ADD CONSTRAINT email_events_event_type_check 
    CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'replied', 'open', 'click', 'bounce'));
  ELSIF constraint_name IS NULL THEN
    -- No constraint exists, add one
    ALTER TABLE public.email_events 
    ADD CONSTRAINT email_events_event_type_check 
    CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'replied', 'open', 'click', 'bounce'));
  END IF;
END $$;

-- Create index for bounce_type queries
CREATE INDEX IF NOT EXISTS idx_email_events_bounce 
ON public.email_events(bounce_type);

-- Create composite index for bounce queries by campaign
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_bounce 
ON public.email_events(campaign_id, event_type, bounce_type) 
WHERE event_type = 'bounce';

-- Ensure leads table has email_valid and email_status columns for bounce tracking
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS email_valid BOOLEAN DEFAULT true;

-- Update email_status constraint to include bounce types if it exists
DO $$
BEGIN
  -- Check if email_status column exists and update its constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'email_status'
  ) THEN
    -- Drop existing constraint if it exists and doesn't include our bounce types
    ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_email_status_check;
    
    -- Add constraint that includes bounce types
    -- Note: This may conflict with existing constraints, so we use IF NOT EXISTS pattern
    BEGIN
      ALTER TABLE public.leads 
      ADD CONSTRAINT leads_email_status_check 
      CHECK (email_status IN ('valid', 'invalid', 'unknown', 'risky', 'hard', 'soft', 'block', 'active', 'replied', 'unsubscribed', 'bounced'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  ELSE
    -- Add email_status column if it doesn't exist
    ALTER TABLE public.leads
    ADD COLUMN email_status TEXT CHECK (
      email_status IN ('valid', 'invalid', 'unknown', 'risky', 'hard', 'soft', 'block', 'active', 'replied', 'unsubscribed', 'bounced')
    ) DEFAULT 'unknown';
  END IF;
END $$;

