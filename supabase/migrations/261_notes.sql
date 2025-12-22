-- Block 246 — Inbox Notes v1
-- Internal Notes, Mentions @teammates, Timeline Feed, Auto-Logged Events

-- 1. Notes table
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.reply_threads(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  mentions uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for notes
CREATE INDEX IF NOT EXISTS idx_notes_workspace ON public.notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notes_thread ON public.notes(thread_id);
CREATE INDEX IF NOT EXISTS idx_notes_lead ON public.notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_notes_user ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON public.notes(created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notes_updated_at ON public.notes;
CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_notes_updated_at();

-- Enable RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notes
-- Users can see notes if they are workspace members
CREATE POLICY "notes_select_workspace_member"
  ON public.notes
  FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Users can insert notes if they are workspace members
CREATE POLICY "notes_insert_workspace_member"
  ON public.notes
  FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id)
    AND user_id = auth.uid()
  );

-- Users can update notes if:
-- 1. They created the note
-- 2. They are workspace admins
CREATE POLICY "notes_update_creator_or_admin"
  ON public.notes
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR is_workspace_admin(workspace_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR is_workspace_admin(workspace_id)
  );

-- Users can delete notes if:
-- 1. They created the note
-- 2. They are workspace admins
CREATE POLICY "notes_delete_creator_or_admin"
  ON public.notes
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_workspace_admin(workspace_id)
  );

-- 2. System events table for auto-logged events
CREATE TABLE IF NOT EXISTS public.system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.reply_threads(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  type text NOT NULL,   -- 'assigned', 'intent_changed', 'snoozed', 'reactivated', 'bounced', 'variant_winner', 'auto_followup_added'
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes for system_events
CREATE INDEX IF NOT EXISTS idx_system_events_workspace ON public.system_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_system_events_thread ON public.system_events(thread_id);
CREATE INDEX IF NOT EXISTS idx_system_events_lead ON public.system_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_system_events_type ON public.system_events(type);
CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON public.system_events(created_at DESC);

-- Enable RLS
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for system_events
-- Users can see system events if they are workspace members
CREATE POLICY "system_events_select_workspace_member"
  ON public.system_events
  FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Service role can insert system events (for triggers)
CREATE POLICY "system_events_insert_service_role"
  ON public.system_events
  FOR INSERT
  WITH CHECK (true);

-- 3. System Event Logging Triggers
-- Function to log system events
CREATE OR REPLACE FUNCTION public.log_system_event()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
  v_lead_id uuid;
BEGIN
  -- Get workspace_id and lead_id from thread
  SELECT workspace_id, lead_id INTO v_workspace_id, v_lead_id
  FROM public.reply_threads
  WHERE id = NEW.id;

  -- Log event based on what changed
  IF TG_OP = 'UPDATE' THEN
    -- Intent changed
    IF OLD.ai_label IS DISTINCT FROM NEW.ai_label THEN
      INSERT INTO public.system_events (workspace_id, thread_id, lead_id, type, metadata)
      VALUES (
        v_workspace_id,
        NEW.id,
        v_lead_id,
        'intent_changed',
        jsonb_build_object('old_label', OLD.ai_label, 'new_label', NEW.ai_label)
      );
    END IF;

    -- Assigned
    IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
      INSERT INTO public.system_events (workspace_id, thread_id, lead_id, type, metadata)
      VALUES (
        v_workspace_id,
        NEW.id,
        v_lead_id,
        'assigned',
        jsonb_build_object('assigned_to', NEW.owner_id, 'assigned_from', OLD.owner_id)
      );
    END IF;

    -- Snoozed
    IF OLD.status = 'open' AND NEW.status = 'snoozed' THEN
      INSERT INTO public.system_events (workspace_id, thread_id, lead_id, type, metadata)
      VALUES (
        v_workspace_id,
        NEW.id,
        v_lead_id,
        'snoozed',
        '{}'::jsonb
      );
    END IF;

    -- Reactivated
    IF OLD.status = 'snoozed' AND NEW.status = 'open' THEN
      INSERT INTO public.system_events (workspace_id, thread_id, lead_id, type, metadata)
      VALUES (
        v_workspace_id,
        NEW.id,
        v_lead_id,
        'reactivated',
        '{}'::jsonb
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on reply_threads to log system events
DROP TRIGGER IF EXISTS trg_log_thread_events ON public.reply_threads;
CREATE TRIGGER trg_log_thread_events
  AFTER UPDATE ON public.reply_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_system_event();

-- Function to log variant winner events (if variant_winner column exists)
CREATE OR REPLACE FUNCTION public.log_variant_winner_event()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
  v_lead_id uuid;
BEGIN
  -- Check if variant_winner changed and is not null
  IF OLD.variant_winner IS DISTINCT FROM NEW.variant_winner AND NEW.variant_winner IS NOT NULL THEN
    -- Get workspace_id and lead_id from thread
    SELECT workspace_id, lead_id INTO v_workspace_id, v_lead_id
    FROM public.reply_threads
    WHERE id = NEW.id;

    IF v_workspace_id IS NOT NULL THEN
      INSERT INTO public.system_events (workspace_id, thread_id, lead_id, type, metadata)
      VALUES (
        v_workspace_id,
        NEW.id,
        v_lead_id,
        'variant_winner',
        jsonb_build_object('variant_id', NEW.variant_winner)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for variant winner (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reply_threads' 
    AND column_name = 'variant_winner'
  ) THEN
    DROP TRIGGER IF EXISTS trg_log_variant_winner ON public.reply_threads;
    CREATE TRIGGER trg_log_variant_winner
      AFTER UPDATE OF variant_winner ON public.reply_threads
      FOR EACH ROW
      WHEN (NEW.variant_winner IS NOT NULL)
      EXECUTE FUNCTION public.log_variant_winner_event();
  END IF;
END $$;

-- Function to log auto-followup added events (if followup_tasks table exists)
CREATE OR REPLACE FUNCTION public.log_auto_followup_event()
RETURNS TRIGGER AS $$
DECLARE
  v_workspace_id uuid;
  v_lead_id uuid;
BEGIN
  -- Check if this is an auto-created followup (created_by is NULL)
  IF NEW.created_by IS NULL AND NEW.thread_id IS NOT NULL THEN
    -- Get workspace_id and lead_id from thread
    SELECT workspace_id, lead_id INTO v_workspace_id, v_lead_id
    FROM public.reply_threads
    WHERE id = NEW.thread_id;

    IF v_workspace_id IS NOT NULL THEN
      INSERT INTO public.system_events (workspace_id, thread_id, lead_id, type, metadata)
      VALUES (
        v_workspace_id,
        NEW.thread_id,
        v_lead_id,
        'auto_followup_added',
        jsonb_build_object('task_id', NEW.id, 'title', NEW.title)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto-followup (if tasks table exists with thread_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'tasks'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'tasks' 
    AND column_name = 'thread_id'
  ) THEN
    DROP TRIGGER IF EXISTS trg_log_auto_followup ON public.tasks;
    CREATE TRIGGER trg_log_auto_followup
      AFTER INSERT ON public.tasks
      FOR EACH ROW
      WHEN (NEW.created_by IS NULL AND NEW.thread_id IS NOT NULL)
      EXECUTE FUNCTION public.log_auto_followup_event();
  END IF;
END $$;

