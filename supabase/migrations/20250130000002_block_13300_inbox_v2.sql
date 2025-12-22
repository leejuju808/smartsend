-- =========================================================
-- Block 13300 — SmartSend Inbox v2
-- (Threaded Conversations, Clean Reply Rendering & The Roofing-Optimized Message View)
-- =========================================================

-- 1. Add pinning support to reply_threads
-- Handle both account_id and workspace_id schemas
DO $$
BEGIN
  -- Add columns if they don't exist
  ALTER TABLE IF EXISTS public.reply_threads
    ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
    ADD COLUMN IF NOT EXISTS latest_intent text CHECK (latest_intent IN ('HOT', 'WARM', 'FOLLOW_UP', 'NOT_INTERESTED', 'NEW_REPLY', 'UNCLASSIFIED')),
    ADD COLUMN IF NOT EXISTS snippet text,
    ADD COLUMN IF NOT EXISTS has_notes boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS suppressed boolean NOT NULL DEFAULT false;

  -- Add workspace_id if it doesn't exist and table has account_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reply_threads' 
    AND column_name = 'account_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reply_threads' 
    AND column_name = 'workspace_id'
  ) THEN
    -- Try to derive workspace_id from account_id via workspace_members
    ALTER TABLE public.reply_threads
      ADD COLUMN IF NOT EXISTS workspace_id uuid;
    
    -- Update workspace_id from workspace_members where possible
    UPDATE public.reply_threads rt
    SET workspace_id = (
      SELECT wm.workspace_id 
      FROM public.workspace_members wm 
      WHERE wm.user_id = rt.account_id 
      LIMIT 1
    )
    WHERE rt.workspace_id IS NULL;
  END IF;

  -- If workspace_id column exists, add foreign key constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reply_threads' 
    AND column_name = 'workspace_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'workspaces'
  ) THEN
    -- Add foreign key constraint if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_schema = 'public' 
      AND table_name = 'reply_threads' 
      AND constraint_name = 'reply_threads_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.reply_threads
        ADD CONSTRAINT reply_threads_workspace_id_fkey 
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Create indexes for pinned threads and filtering
CREATE INDEX IF NOT EXISTS idx_reply_threads_pinned 
  ON public.reply_threads(pinned DESC, last_message_at DESC NULLS LAST) 
  WHERE pinned = true;

CREATE INDEX IF NOT EXISTS idx_reply_threads_latest_intent 
  ON public.reply_threads(workspace_id, latest_intent, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_reply_threads_unread 
  ON public.reply_threads(workspace_id, unread_count) 
  WHERE unread_count > 0;

CREATE INDEX IF NOT EXISTS idx_reply_threads_workspace_status 
  ON public.reply_threads(workspace_id, status, last_message_at DESC NULLS LAST);

-- 2. Ensure messages table has proper columns for HTML rendering
-- Check if inbox_messages or reply_messages exists and add columns
DO $$
BEGIN
  -- For inbox_messages table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inbox_messages') THEN
    ALTER TABLE public.inbox_messages
      ADD COLUMN IF NOT EXISTS body_html_cleaned text,
      ADD COLUMN IF NOT EXISTS has_quoted_text boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS signature_removed boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
      ADD COLUMN IF NOT EXISTS read_at timestamptz;
  END IF;

  -- For reply_messages table (if it exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reply_messages') THEN
    ALTER TABLE public.reply_messages
      ADD COLUMN IF NOT EXISTS body_html_cleaned text,
      ADD COLUMN IF NOT EXISTS has_quoted_text boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS signature_removed boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
      ADD COLUMN IF NOT EXISTS read_at timestamptz;
  END IF;
END $$;

-- 3. Function to update thread's has_notes flag
CREATE OR REPLACE FUNCTION public.update_thread_has_notes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.reply_threads
    SET has_notes = EXISTS (
      SELECT 1 FROM public.lead_notes 
      WHERE lead_id = NEW.lead_id
    )
    WHERE id = NEW.thread_id OR lead_id = NEW.lead_id;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    UPDATE public.reply_threads
    SET has_notes = EXISTS (
      SELECT 1 FROM public.lead_notes 
      WHERE lead_id = OLD.lead_id
    )
    WHERE id = OLD.thread_id OR lead_id = OLD.lead_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger for lead_notes to update thread has_notes
DROP TRIGGER IF EXISTS trg_update_thread_has_notes ON public.lead_notes;
CREATE TRIGGER trg_update_thread_has_notes
  AFTER INSERT OR UPDATE OR DELETE ON public.lead_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_thread_has_notes();

-- 4. Function to pin/unpin threads
CREATE OR REPLACE FUNCTION public.pin_thread(p_thread_id uuid, p_pinned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.reply_threads
  SET 
    pinned = p_pinned,
    pinned_at = CASE WHEN p_pinned THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_thread_id;
END;
$$;

-- 5. Function to mark thread as read
CREATE OR REPLACE FUNCTION public.mark_thread_read(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.reply_threads
  SET 
    unread_count = 0,
    updated_at = now()
  WHERE id = p_thread_id;
END;
$$;

-- 6. Function to update thread latest_intent
CREATE OR REPLACE FUNCTION public.update_thread_intent(p_thread_id uuid, p_intent text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.reply_threads
  SET 
    latest_intent = p_intent,
    updated_at = now()
  WHERE id = p_thread_id
  AND p_intent IN ('HOT', 'WARM', 'FOLLOW_UP', 'NOT_INTERESTED', 'NEW_REPLY', 'UNCLASSIFIED');
END;
$$;

-- 7. View for inbox v2 thread list (optimized query)
-- Handle both account_id and workspace_id schemas
CREATE OR REPLACE VIEW public.v_inbox_v2_threads AS
SELECT 
  rt.id,
  COALESCE(rt.workspace_id, 
    (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = rt.account_id LIMIT 1)
  ) as workspace_id,
  rt.lead_id,
  rt.campaign_id,
  rt.pinned,
  rt.pinned_at,
  rt.latest_intent,
  rt.status,
  rt.unread_count,
  rt.last_message_at,
  rt.snippet,
  rt.has_notes,
  rt.suppressed,
  rt.created_at,
  rt.updated_at,
  l.email as lead_email,
  l.first_name,
  l.last_name,
  COALESCE(l.name, CONCAT(l.first_name, ' ', l.last_name), l.email) as lead_name,
  l.city,
  l.state,
  c.name as campaign_name,
  -- Get lead status from lead_status table if exists, or from leads.status
  COALESCE(
    (SELECT status::text FROM public.lead_status WHERE lead_id = rt.lead_id ORDER BY updated_at DESC LIMIT 1),
    l.status::text,
    'NEW'
  ) as lead_status,
  -- Check if there are tasks (try multiple task table names)
  (
    EXISTS (
      SELECT 1 FROM public.tasks 
      WHERE lead_id = rt.lead_id AND (status IS NULL OR status != 'completed')
    ) OR
    EXISTS (
      SELECT 1 FROM public.follow_up_tasks 
      WHERE lead_id = rt.lead_id AND status != 'done'
    ) OR
    EXISTS (
      SELECT 1 FROM public.crm_tasks 
      WHERE lead_id = rt.lead_id AND status != 'done'
    )
  ) as has_tasks,
  -- Get estimated value if available (try multiple sources)
  COALESCE(
    (SELECT potential_job_value FROM public.lead_auto_follow_up_stats 
     WHERE lead_id = rt.lead_id ORDER BY updated_at DESC LIMIT 1),
    (SELECT estimated_job_value FROM public.contacts 
     WHERE id = l.id OR email = l.email LIMIT 1),
    NULL
  ) as estimated_value
FROM public.reply_threads rt
LEFT JOIN public.leads l ON l.id = rt.lead_id
LEFT JOIN public.campaigns c ON c.id = rt.campaign_id
WHERE rt.status IN ('open', 'snoozed');

-- Grant access to view
GRANT SELECT ON public.v_inbox_v2_threads TO authenticated;

-- Comments
COMMENT ON COLUMN public.reply_threads.pinned IS 'Whether this thread is pinned to the top of the inbox';
COMMENT ON COLUMN public.reply_threads.latest_intent IS 'Latest AI classification: HOT, WARM, FOLLOW_UP, NOT_INTERESTED, NEW_REPLY, UNCLASSIFIED';
COMMENT ON COLUMN public.reply_threads.snippet IS 'Last message snippet for preview in thread list';
COMMENT ON COLUMN public.reply_threads.has_notes IS 'Whether this lead has notes (auto-updated by trigger)';
COMMENT ON COLUMN public.reply_threads.suppressed IS 'Whether this thread is suppressed from follow-ups';

