-- =========================================================
-- Block 19610 — Inbox Data Model & Supabase Schema v1
-- (Foundation Tables, Status Columns, Classification Fields, Lead Score Storage)
-- =========================================================
--
-- This block creates the actual database foundation the Owner Inbox will run on.
-- No Inbox UI, no AI classification, no filters can work until this block is done.
-- This is the heartbeat schema for the entire SmartSend reply system.
-- =========================================================

-- ============================================================================
-- 1. CREATE ENUM TYPES
-- ============================================================================

-- Message status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_message_status') THEN
    CREATE TYPE inbox_message_status AS ENUM ('unread', 'read', 'archived');
  END IF;
END$$;

-- AI intent enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_ai_intent') THEN
    CREATE TYPE inbox_ai_intent AS ENUM ('hot', 'warm', 'cold', 'dead', 'follow_up');
  END IF;
END$$;

-- Thread status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_thread_status') THEN
    CREATE TYPE inbox_thread_status AS ENUM ('open', 'closed');
  END IF;
END$$;

-- Action type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_action_type') THEN
    CREATE TYPE inbox_action_type AS ENUM ('call_now', 'send_estimate', 'mark_booked', 'add_task', 'add_to_crm');
  END IF;
END$$;

-- ============================================================================
-- 2. CREATE inbox_messages TABLE
-- ============================================================================
-- Stores every reply coming in

CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  from_email text NOT NULL,
  to_email text NOT NULL,
  subject text,
  body_raw text NOT NULL, -- Original raw email body
  body_clean text, -- Cleaned/formatted body
  received_at timestamptz NOT NULL DEFAULT now(),
  status inbox_message_status NOT NULL DEFAULT 'unread',
  ai_intent inbox_ai_intent, -- AI classification: hot, warm, cold, dead, follow_up
  lead_score integer CHECK (lead_score >= 0 AND lead_score <= 100), -- 0-100 lead score
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_messages_campaign_id ON public.inbox_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_contact_id ON public.inbox_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread_id ON public.inbox_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_status ON public.inbox_messages(status);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_ai_intent ON public.inbox_messages(ai_intent);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_lead_score ON public.inbox_messages(lead_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_received_at ON public.inbox_messages(received_at DESC);

-- ============================================================================
-- 3. CREATE inbox_threads TABLE
-- ============================================================================
-- Groups multiple replies into a single conversation

CREATE TABLE IF NOT EXISTS public.inbox_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  ai_overall_intent inbox_ai_intent, -- Overall intent for the thread
  highest_lead_score integer CHECK (highest_lead_score >= 0 AND highest_lead_score <= 100), -- Highest lead score in thread
  status inbox_thread_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_threads_campaign_id ON public.inbox_threads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_contact_id ON public.inbox_threads(contact_id);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_status ON public.inbox_threads(status);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_ai_intent ON public.inbox_threads(ai_overall_intent);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_lead_score ON public.inbox_threads(highest_lead_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_last_message_at ON public.inbox_threads(last_message_at DESC);

-- Now add foreign key constraint from inbox_messages to inbox_threads
-- (We need to do this after threads table exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inbox_messages_thread_id_fkey'
    AND table_name = 'inbox_messages'
  ) THEN
    ALTER TABLE public.inbox_messages
      ADD CONSTRAINT inbox_messages_thread_id_fkey
      FOREIGN KEY (thread_id)
      REFERENCES public.inbox_threads(id)
      ON DELETE CASCADE;
  END IF;
END$$;

-- ============================================================================
-- 4. CREATE inbox_actions TABLE
-- ============================================================================
-- Logs actions roofing owners take from the inbox

CREATE TABLE IF NOT EXISTS public.inbox_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  action_type inbox_action_type NOT NULL,
  performed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metadata jsonb DEFAULT '{}'::jsonb, -- Flexible JSON for action-specific data
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_actions_thread_id ON public.inbox_actions(thread_id);
CREATE INDEX IF NOT EXISTS idx_inbox_actions_performed_by ON public.inbox_actions(performed_by);
CREATE INDEX IF NOT EXISTS idx_inbox_actions_action_type ON public.inbox_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_inbox_actions_created_at ON public.inbox_actions(created_at DESC);

-- ============================================================================
-- 5. TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger for inbox_messages
DROP TRIGGER IF EXISTS trg_inbox_messages_updated_at ON public.inbox_messages;
CREATE TRIGGER trg_inbox_messages_updated_at
  BEFORE UPDATE ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for inbox_threads
DROP TRIGGER IF EXISTS trg_inbox_threads_updated_at ON public.inbox_threads;
CREATE TRIGGER trg_inbox_threads_updated_at
  BEFORE UPDATE ON public.inbox_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6. TRIGGER TO UPDATE THREAD METADATA ON MESSAGE INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_thread_on_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update thread's last_message_at
  UPDATE public.inbox_threads
  SET 
    last_message_at = NEW.received_at,
    updated_at = now(),
    -- Update highest lead score if this message has a higher score
    highest_lead_score = GREATEST(
      COALESCE(highest_lead_score, 0),
      COALESCE(NEW.lead_score, 0)
    ),
    -- Update overall intent if this message has intent
    ai_overall_intent = CASE
      WHEN NEW.ai_intent IS NOT NULL THEN NEW.ai_intent
      ELSE ai_overall_intent
    END
  WHERE id = NEW.thread_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_thread_on_message_insert ON public.inbox_messages;
CREATE TRIGGER trg_update_thread_on_message_insert
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_thread_on_message_insert();

-- ============================================================================
-- 7. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_actions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================
-- Users can only see inbox messages for campaigns they own
-- Threads only visible to workspace members
-- Actions only logged for valid owners

-- Helper function to check if user can view a campaign
-- (Assuming campaigns have workspace_id and we check workspace_members)
CREATE OR REPLACE FUNCTION public.can_view_campaign(p_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id from campaign
  SELECT workspace_id INTO v_workspace_id
  FROM public.campaigns
  WHERE id = p_campaign_id;
  
  -- Check if user is a member of that workspace
  IF v_workspace_id IS NULL THEN
    -- Fallback: check if campaign has user_id (legacy support)
    RETURN EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = p_campaign_id
      AND user_id = auth.uid()
    );
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_workspace_id
    AND user_id = auth.uid()
  );
END;
$$;

-- Helper function to check if user can edit a campaign
CREATE OR REPLACE FUNCTION public.can_edit_campaign(p_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id from campaign
  SELECT workspace_id INTO v_workspace_id
  FROM public.campaigns
  WHERE id = p_campaign_id;
  
  -- Check if user is a member of that workspace with edit permissions
  IF v_workspace_id IS NULL THEN
    -- Fallback: check if campaign has user_id (legacy support)
    RETURN EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = p_campaign_id
      AND user_id = auth.uid()
    );
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_workspace_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin', 'member') -- Exclude 'readonly'
  );
END;
$$;

-- RLS Policy: inbox_messages SELECT
-- Users can only see inbox messages for campaigns they own
DROP POLICY IF EXISTS "inbox_messages_select" ON public.inbox_messages;
CREATE POLICY "inbox_messages_select"
  ON public.inbox_messages
  FOR SELECT
  USING (public.can_view_campaign(campaign_id));

-- RLS Policy: inbox_messages INSERT/UPDATE/DELETE
-- Only users who can edit campaigns can modify messages
DROP POLICY IF EXISTS "inbox_messages_modify" ON public.inbox_messages;
CREATE POLICY "inbox_messages_modify"
  ON public.inbox_messages
  FOR ALL
  USING (public.can_edit_campaign(campaign_id))
  WITH CHECK (public.can_edit_campaign(campaign_id));

-- RLS Policy: inbox_threads SELECT
-- Threads only visible to workspace members
DROP POLICY IF EXISTS "inbox_threads_select" ON public.inbox_threads;
CREATE POLICY "inbox_threads_select"
  ON public.inbox_threads
  FOR SELECT
  USING (public.can_view_campaign(campaign_id));

-- RLS Policy: inbox_threads INSERT/UPDATE/DELETE
-- Only users who can edit campaigns can modify threads
DROP POLICY IF EXISTS "inbox_threads_modify" ON public.inbox_threads;
CREATE POLICY "inbox_threads_modify"
  ON public.inbox_threads
  FOR ALL
  USING (public.can_edit_campaign(campaign_id))
  WITH CHECK (public.can_edit_campaign(campaign_id));

-- RLS Policy: inbox_actions SELECT
-- Actions visible to users who can view the thread's campaign
DROP POLICY IF EXISTS "inbox_actions_select" ON public.inbox_actions;
CREATE POLICY "inbox_actions_select"
  ON public.inbox_actions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inbox_threads it
      WHERE it.id = inbox_actions.thread_id
      AND public.can_view_campaign(it.campaign_id)
    )
  );

-- RLS Policy: inbox_actions INSERT
-- Actions only logged for valid owners (users who can edit campaigns)
DROP POLICY IF EXISTS "inbox_actions_insert" ON public.inbox_actions;
CREATE POLICY "inbox_actions_insert"
  ON public.inbox_actions
  FOR INSERT
  WITH CHECK (
    performed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.inbox_threads it
      WHERE it.id = inbox_actions.thread_id
      AND public.can_edit_campaign(it.campaign_id)
    )
  );

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.inbox_messages IS 'Stores every reply coming in. Foundation table for SmartSend inbox system.';
COMMENT ON TABLE public.inbox_threads IS 'Groups multiple replies into a single conversation. Enables conversation threading.';
COMMENT ON TABLE public.inbox_actions IS 'Logs actions roofing owners take from the inbox (call_now, send_estimate, mark_booked, etc).';

COMMENT ON COLUMN public.inbox_messages.status IS 'Message status: unread, read, or archived';
COMMENT ON COLUMN public.inbox_messages.ai_intent IS 'AI classification: hot (ready for estimate), warm (interested), cold (not interested), dead (not interested), follow_up (needs response)';
COMMENT ON COLUMN public.inbox_messages.lead_score IS 'Lead score 0-100 based on AI analysis of message content';
COMMENT ON COLUMN public.inbox_messages.body_raw IS 'Original raw email body as received';
COMMENT ON COLUMN public.inbox_messages.body_clean IS 'Cleaned/formatted body for display';

COMMENT ON COLUMN public.inbox_threads.status IS 'Thread status: open (active conversation) or closed (archived/resolved)';
COMMENT ON COLUMN public.inbox_threads.ai_overall_intent IS 'Overall AI intent for the entire thread (highest priority intent)';
COMMENT ON COLUMN public.inbox_threads.highest_lead_score IS 'Highest lead score from any message in this thread';

COMMENT ON COLUMN public.inbox_actions.action_type IS 'Type of action: call_now, send_estimate, mark_booked, add_task, add_to_crm';
COMMENT ON COLUMN public.inbox_actions.metadata IS 'Flexible JSON for action-specific data (e.g. task details, CRM ID, etc)';



















































