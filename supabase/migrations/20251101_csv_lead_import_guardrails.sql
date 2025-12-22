-- DB Guardrails for CSV Lead Import
-- Unique index + sensible defaults

-- Ensure workspace_id and campaign_id exist on leads table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'workspace_id') THEN
    ALTER TABLE public.leads ADD COLUMN workspace_id uuid;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'campaign_id') THEN
    ALTER TABLE public.leads ADD COLUMN campaign_id uuid;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'status') THEN
    ALTER TABLE public.leads ADD COLUMN status text DEFAULT 'new';
  END IF;
END $$;

-- Unique index per workspace (case-insensitive email)
-- This prevents duplicate emails within the same workspace
CREATE UNIQUE INDEX IF NOT EXISTS leads_workspace_email_unique 
ON public.leads (workspace_id, lower(email))
WHERE workspace_id IS NOT NULL;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_leads_workspace 
ON public.leads (workspace_id);

CREATE INDEX IF NOT EXISTS idx_leads_campaign 
ON public.leads (campaign_id) 
WHERE campaign_id IS NOT NULL;

-- Sensible defaults
ALTER TABLE public.leads 
  ALTER COLUMN status SET DEFAULT 'new';

-- RLS policies (if RLS is enabled)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "leads_select_own_workspace" ON public.leads;

-- Create policy for workspace members to read/write their leads
CREATE POLICY "leads_select_own_workspace" ON public.leads
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "leads_insert_own_workspace" ON public.leads;

CREATE POLICY "leads_insert_own_workspace" ON public.leads
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id 
      FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

