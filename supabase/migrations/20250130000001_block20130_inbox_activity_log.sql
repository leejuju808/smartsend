-- =========================================================
-- Block 20130 — SmartSend Inbox Internal Notes & Activity Log v1
-- (So the whole roofing team knows "what actually happened with this homeowner.")
-- =========================================================

-- ============================================================================
-- PART 1 — Add internal_notes field to inbox_threads
-- ============================================================================
-- Lightweight notes field on the conversation for latest summary / key notes

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

COMMENT ON COLUMN public.inbox_threads.internal_notes IS 'Latest summary / key notes for internal team use only';

-- ============================================================================
-- PART 2 — CREATE inbox_activity_log TABLE
-- ============================================================================
-- Full activity log table to track all events for a conversation

CREATE TABLE IF NOT EXISTS public.inbox_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- who did it (nullable for system events)
  type TEXT NOT NULL CHECK (type IN ('note', 'status_change', 'value_change', 'follow_up', 'system')),
  title TEXT,               -- short label e.g. "Status set to Scheduled"
  body TEXT,                -- optional detail
  meta JSONB DEFAULT '{}'::jsonb, -- small extra info (old/new values etc)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_activity_thread 
  ON public.inbox_activity_log (thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_activity_campaign 
  ON public.inbox_activity_log (campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_activity_type 
  ON public.inbox_activity_log (type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_activity_user 
  ON public.inbox_activity_log (user_id) WHERE user_id IS NOT NULL;

-- ============================================================================
-- PART 3 — ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.inbox_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: inbox_activity_log SELECT
-- Users can only see activity logs for campaigns they can view
DROP POLICY IF EXISTS "inbox_activity_log_select" ON public.inbox_activity_log;
CREATE POLICY "inbox_activity_log_select"
  ON public.inbox_activity_log
  FOR SELECT
  USING (public.can_view_campaign(campaign_id));

-- RLS Policy: inbox_activity_log INSERT
-- Users can only insert activity logs for campaigns they can edit
DROP POLICY IF EXISTS "inbox_activity_log_insert" ON public.inbox_activity_log;
CREATE POLICY "inbox_activity_log_insert"
  ON public.inbox_activity_log
  FOR INSERT
  WITH CHECK (
    public.can_edit_campaign(campaign_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- ============================================================================
-- PART 4 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.inbox_activity_log IS 'Activity log for inbox conversations. Tracks notes, status changes, value changes, follow-ups, and system events.';
COMMENT ON COLUMN public.inbox_activity_log.type IS 'Activity type: note, status_change, value_change, follow_up, system';
COMMENT ON COLUMN public.inbox_activity_log.title IS 'Short label for the activity (e.g., "Status set to Scheduled")';
COMMENT ON COLUMN public.inbox_activity_log.body IS 'Optional detailed description of the activity';
COMMENT ON COLUMN public.inbox_activity_log.meta IS 'JSONB metadata for additional context (old/new values, etc.)';

















































