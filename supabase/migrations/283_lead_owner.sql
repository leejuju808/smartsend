-- Block 267 — Lead & Deal Ownership v1
-- Migration 283: Add owner_id and assigned_at columns to leads table

-- Add owner_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add assigned_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'assigned_at'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN assigned_at timestamptz;
  END IF;
END $$;

-- Create index for owner_id lookups
CREATE INDEX IF NOT EXISTS idx_leads_owner ON public.leads(owner_id) WHERE owner_id IS NOT NULL;

-- Create index for assigned_at queries
CREATE INDEX IF NOT EXISTS idx_leads_assigned_at ON public.leads(assigned_at) WHERE assigned_at IS NOT NULL;








