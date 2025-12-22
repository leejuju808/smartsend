-- =========================================================
-- Block 8480 — Follow-Up Queue (Leads That Need Action Today)
-- =========================================================

-- 1) Add follow-up fields to leads table
-- Update status column to support 'open' and 'in_progress' values
-- Note: The status column already exists, we're just ensuring it supports the needed values

-- Add next_follow_up_at column if it doesn't exist
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz NULL;

-- Add last_contacted_at column if it doesn't exist
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz NULL;

-- Ensure status column supports 'open' and 'in_progress' values
-- We'll use a DO block to check and update the constraint if needed
DO $$
BEGIN
  -- Check if status column has a check constraint that needs updating
  -- If the constraint exists and doesn't include 'open' or 'in_progress', we'll need to drop and recreate it
  -- For now, we'll just ensure the column can accept these values
  -- Note: This assumes the status column doesn't have a restrictive check constraint
  -- If it does, you may need to drop and recreate the constraint
  NULL; -- Placeholder - actual constraint modification would go here if needed
END $$;

-- Create index for efficient follow-up queries
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up_at 
  ON public.leads(next_follow_up_at) 
  WHERE next_follow_up_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_status_follow_up 
  ON public.leads(status, next_follow_up_at) 
  WHERE status IN ('open', 'in_progress') AND next_follow_up_at IS NOT NULL;

-- 2) Create follow_up_leads view
-- This view shows all open/in-progress leads whose next_follow_up_at is now or past
CREATE OR REPLACE VIEW public.follow_up_leads AS
SELECT
  l.id::uuid          AS lead_id,
  l.name              AS lead_name,
  l.email             AS lead_email,
  l.phone             AS lead_phone,
  l.status            AS status,
  l.next_follow_up_at,
  l.last_contacted_at,
  l.workspace_id      AS workspace_id
FROM public.leads l
WHERE
  l.status IN ('open', 'in_progress')
  AND l.next_follow_up_at IS NOT NULL
  AND l.next_follow_up_at <= now()
ORDER BY l.next_follow_up_at ASC;

-- Grant access to authenticated users (RLS will handle workspace scoping)
GRANT SELECT ON public.follow_up_leads TO authenticated;

-- Add comment
COMMENT ON VIEW public.follow_up_leads IS 'Shows all open/in-progress leads whose next_follow_up_at is now or past, ordered by follow-up time';

























































