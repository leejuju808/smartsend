-- Block 247 — Lead Page v1
-- Add extra fields to leads table for CRM-grade lead profile

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS linkedin text,
ADD COLUMN IF NOT EXISTS website text,
ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for owner lookups
CREATE INDEX IF NOT EXISTS idx_leads_owner ON public.leads(owner_id) WHERE owner_id IS NOT NULL;

-- Index for phone lookups
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone) WHERE phone IS NOT NULL;










