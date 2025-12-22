-- =========================================================
-- Block 20050 — SmartSend Inbox Lead Status & Action Bar v1
-- (Turn replies into clear pipeline steps with one click)
-- =========================================================

-- ============================================================================
-- Add Lead Status & Action Fields to inbox_threads
-- ============================================================================
-- Simple text-based stages for v1
-- We can always convert lead_stage to enum later

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'new',
  -- new, working, scheduled, won, lost
  
  ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_contact_method TEXT, -- email, phone, sms
  ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_threads_lead_stage ON public.inbox_threads(lead_stage);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_next_action_at ON public.inbox_threads(next_action_at);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_assigned_to_user_id ON public.inbox_threads(assigned_to_user_id);

-- Comments for documentation
COMMENT ON COLUMN public.inbox_threads.lead_stage IS 'Lead pipeline stage: new, working, scheduled, won, lost';
COMMENT ON COLUMN public.inbox_threads.next_action_at IS 'When to follow up with this lead next';
COMMENT ON COLUMN public.inbox_threads.last_contact_method IS 'Last contact method used: email, phone, sms';
COMMENT ON COLUMN public.inbox_threads.last_contact_at IS 'When we last contacted this lead';
COMMENT ON COLUMN public.inbox_threads.assigned_to_user_id IS 'User assigned to handle this lead';

















































