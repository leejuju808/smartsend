-- =========================================================
-- Block 8820 — Campaign Queue Controls + Usage Bar
-- =========================================================
-- Adds status constraint, daily_send_limit, and last_queued_at columns

-- Ensure status column exists with correct constraint
DO $$
BEGIN
  -- Drop existing check constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name LIKE '%campaigns_status%' 
    AND table_name = 'campaigns'
  ) THEN
    ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
  END IF;
  
  -- Add new check constraint for status values
  ALTER TABLE public.campaigns 
    ADD CONSTRAINT campaigns_status_check 
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'scheduled', 'running', 'archived'));
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Ensure daily_send_limit exists (may already exist from previous migrations)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS daily_send_limit integer;

-- Add last_queued_at column if it doesn't exist
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS last_queued_at timestamptz;

-- Create index on status for faster lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_status_active 
  ON public.campaigns(status) 
  WHERE status = 'active';

-- Create index on last_queued_at for orchestrator queries
CREATE INDEX IF NOT EXISTS idx_campaigns_last_queued_at 
  ON public.campaigns(last_queued_at) 
  WHERE last_queued_at IS NOT NULL;

























































