-- Block 20180 — SmartSend Inbox Manual Lead Capture (Phone & Walk-In) v1
-- Add fields to support manual/phone lead capture in inbox_threads

-- ============================================================================
-- Add Manual / Phone Lead Fields to inbox_threads
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS lead_source TEXT,            -- 'email', 'phone', 'walk_in', 'website', etc
  ADD COLUMN IF NOT EXISTS homeowner_phone TEXT,       -- phone number for call/text follow up
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,    -- staff member who created the conversation
  ADD COLUMN IF NOT EXISTS created_channel TEXT;       -- 'manual', 'import', 'automation', etc

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_threads_lead_source ON public.inbox_threads(lead_source);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_created_by_user_id ON public.inbox_threads(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_created_channel ON public.inbox_threads(created_channel);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_homeowner_phone ON public.inbox_threads(homeowner_phone) WHERE homeowner_phone IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN public.inbox_threads.lead_source IS 'Source of the lead: email, phone, walk_in, website, etc';
COMMENT ON COLUMN public.inbox_threads.homeowner_phone IS 'Phone number for call/text follow up';
COMMENT ON COLUMN public.inbox_threads.created_by_user_id IS 'Staff member who created the conversation (for manual leads)';
COMMENT ON COLUMN public.inbox_threads.created_channel IS 'Channel through which conversation was created: manual, import, automation, etc';

















































