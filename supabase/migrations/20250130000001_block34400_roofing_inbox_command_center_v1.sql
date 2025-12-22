-- =========================================================
-- Block 34400 — SmartSend Roofing "AI Office Assistant + Inbox Command Center" v1
-- =========================================================
-- Unified inbox for all homeowner communications with AI classification,
-- auto-task creation, and reply suggestions

-- 1) INBOX_THREADS (one per lead)
-- Threads group messages by lead, showing latest activity and summary
CREATE TABLE IF NOT EXISTS public.inbox_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Thread metadata
  last_message TEXT,           -- Preview of last message
  summary TEXT,                -- AI-generated thread summary
  last_intent TEXT,            -- Latest intent classification
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent')),
  
  -- Status tracking
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed')),
  unread_count INT DEFAULT 0,
  
  -- Timestamps
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one thread per lead per workspace
  UNIQUE(workspace_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_threads_workspace_updated 
  ON public.inbox_threads(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_lead 
  ON public.inbox_threads(lead_id);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_urgency 
  ON public.inbox_threads(urgency) WHERE urgency = 'urgent';
CREATE INDEX IF NOT EXISTS idx_inbox_threads_intent 
  ON public.inbox_threads(last_intent);

-- 2) INBOX_MESSAGES
-- All messages (email, SMS, webform, voicemail transcription)
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  thread_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Message content
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'webform', 'voicemail', 'call')),
  
  -- AI classification
  intent TEXT,                 -- booking_request, price_question, warranty_claim, etc.
  ai_summary TEXT,             -- AI-generated message summary
  
  -- Raw payload (for debugging/processing)
  raw_payload JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  sender_email TEXT,
  sender_name TEXT,
  subject TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread 
  ON public.inbox_messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_lead 
  ON public.inbox_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_workspace 
  ON public.inbox_messages(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_intent 
  ON public.inbox_messages(intent);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_direction 
  ON public.inbox_messages(direction) WHERE direction = 'inbound';

-- 3) INBOX_TASKS
-- Auto-generated tasks from messages
CREATE TABLE IF NOT EXISTS public.inbox_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  thread_id UUID REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  
  -- Task details
  description TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE,
  task_type TEXT,              -- 'call', 'send_proposal', 'schedule', 'emergency', etc.
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inbox_tasks_workspace 
  ON public.inbox_tasks(workspace_id, completed, due_at);
CREATE INDEX IF NOT EXISTS idx_inbox_tasks_lead 
  ON public.inbox_tasks(lead_id, completed);
CREATE INDEX IF NOT EXISTS idx_inbox_tasks_thread 
  ON public.inbox_tasks(thread_id);

-- 4) TRIGGERS
-- Auto-update thread metadata when messages are added
CREATE OR REPLACE FUNCTION public.update_inbox_thread_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.inbox_threads
  SET 
    last_message = LEFT(NEW.content, 200),
    last_intent = NEW.intent,
    updated_at = NOW(),
    unread_count = CASE 
      WHEN NEW.direction = 'inbound' THEN unread_count + 1 
      ELSE unread_count 
    END
  WHERE id = NEW.thread_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_inbox_thread_on_message ON public.inbox_messages;
CREATE TRIGGER trg_update_inbox_thread_on_message
AFTER INSERT ON public.inbox_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_inbox_thread_on_message();

-- Auto-update updated_at on threads
CREATE OR REPLACE FUNCTION public.update_inbox_thread_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_threads_updated_at ON public.inbox_threads;
CREATE TRIGGER trg_inbox_threads_updated_at
BEFORE UPDATE ON public.inbox_threads
FOR EACH ROW
EXECUTE FUNCTION public.update_inbox_thread_updated_at();

-- 5) HELPER FUNCTIONS
-- Get or create thread for a lead
CREATE OR REPLACE FUNCTION public.get_or_create_inbox_thread(
  p_workspace_id UUID,
  p_lead_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_id UUID;
BEGIN
  SELECT id INTO v_thread_id
  FROM public.inbox_threads
  WHERE workspace_id = p_workspace_id
    AND lead_id = p_lead_id;
  
  IF v_thread_id IS NULL THEN
    INSERT INTO public.inbox_threads (workspace_id, lead_id)
    VALUES (p_workspace_id, p_lead_id)
    RETURNING id INTO v_thread_id;
  END IF;
  
  RETURN v_thread_id;
END;
$$;

-- Mark thread as read
CREATE OR REPLACE FUNCTION public.mark_inbox_thread_read(p_thread_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.inbox_threads
  SET unread_count = 0
  WHERE id = p_thread_id;
END;
$$;

-- 6) RLS POLICIES
ALTER TABLE public.inbox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_tasks ENABLE ROW LEVEL SECURITY;

-- Threads: workspace members can read/write
DROP POLICY IF EXISTS "inbox_threads_workspace_access" ON public.inbox_threads;
CREATE POLICY "inbox_threads_workspace_access"
ON public.inbox_threads
FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = auth.uid()
  )
);

-- Messages: workspace members can read/write
DROP POLICY IF EXISTS "inbox_messages_workspace_access" ON public.inbox_messages;
CREATE POLICY "inbox_messages_workspace_access"
ON public.inbox_messages
FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = auth.uid()
  )
);

-- Tasks: workspace members can read/write
DROP POLICY IF EXISTS "inbox_tasks_workspace_access" ON public.inbox_tasks;
CREATE POLICY "inbox_tasks_workspace_access"
ON public.inbox_tasks
FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = auth.uid()
  )
);

-- 7) REALTIME (enable for live updates)
-- Note: Realtime publication is managed by Supabase automatically for tables with RLS enabled
-- These commands may need to be run manually in Supabase Dashboard if needed
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_threads;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_tasks;
































