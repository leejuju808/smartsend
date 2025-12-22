-- =========================================================
-- Block 8710 — Lead Outcome & Job Logging
-- =========================================================
-- Make a clean way for roofers to log jobs and revenue
-- This turns SmartSend from "emails + replies" into "This campaign brought you $XX,XXX in roof jobs."

-- 1) Update outcome constraint to include 'open'
-- Drop any existing check constraints on outcome column
DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Find and drop any check constraint that references the outcome column
  -- This handles both named and auto-named constraints
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'public.leads'::regclass
      AND c.contype = 'c'
      AND a.attname = 'outcome'
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

-- Add new constraint with 'open', 'won', 'lost'
ALTER TABLE public.leads
  ADD CONSTRAINT leads_outcome_check 
  CHECK (outcome IS NULL OR outcome IN ('open', 'won', 'lost'));

-- 2) Add notes column if it doesn't exist
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS notes text;

-- 3) Update comments for documentation
COMMENT ON COLUMN public.leads.outcome IS 'Lead outcome: ''open'' | ''won'' | ''lost'' | null (default: ''open'')';
COMMENT ON COLUMN public.leads.notes IS 'Optional internal notes about the lead (e.g., "insurance claim, full tear-off", etc.)';

-- 4) Set default outcome to 'open' for existing null values (optional - can be done in app layer)
-- We'll let the app handle defaults, but ensure the constraint allows 'open'

