-- =========================================================
-- Block 14200 — SmartSend Timeline v2
-- (The Redesigned Chronological Timeline That Shows Every Email, Reply, Task, Tag & Score Change in Perfect Order)
-- =========================================================

-- ============================================================================
-- 1. CREATE timeline_events TABLE (Unified Event Storage)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- null for system events
  
  -- Event type (all 13 types from requirements)
  event_type text NOT NULL CHECK (
    event_type IN (
      'email_sent',
      'reply_received',
      'task_created',
      'task_completed',
      'status_changed',
      'score_changed',
      'tag_added',
      'tag_removed',
      'pipeline_moved',
      'enrichment_added',
      'suppressed',
      'campaign_step',
      'note',
      'storm_event'
    )
  ),
  
  -- Flexible JSON storage for event-specific data
  event_data jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamp
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Optional references to related entities
  message_id uuid,
  task_id uuid,
  campaign_id uuid,
  thread_id uuid,
  note_id uuid
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_timeline_events_contact 
  ON public.timeline_events(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_events_workspace 
  ON public.timeline_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_events_type 
  ON public.timeline_events(event_type);
CREATE INDEX IF NOT EXISTS idx_timeline_events_created_at 
  ON public.timeline_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_events_user 
  ON public.timeline_events(user_id);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_timeline_events_contact_type_time 
  ON public.timeline_events(contact_id, event_type, created_at DESC);

-- ============================================================================
-- 2. RLS POLICIES
-- ============================================================================

ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view timeline events for contacts in their workspace
CREATE POLICY "timeline_events_select_workspace"
  ON public.timeline_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Policy: Users can insert timeline events for contacts in their workspace
CREATE POLICY "timeline_events_insert_workspace"
  ON public.timeline_events FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Grant access
GRANT SELECT, INSERT ON public.timeline_events TO authenticated;

-- ============================================================================
-- 3. HELPER FUNCTION TO LOG TIMELINE EVENTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_timeline_event(
  p_contact_id uuid,
  p_event_type text,
  p_event_data jsonb DEFAULT '{}'::jsonb,
  p_user_id uuid DEFAULT auth.uid(),
  p_message_id uuid DEFAULT NULL,
  p_task_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_note_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id from contact
  SELECT workspace_id INTO v_workspace_id
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Contact not found: %', p_contact_id;
  END IF;
  
  -- Validate event_type
  IF p_event_type NOT IN (
    'email_sent', 'reply_received', 'task_created', 'task_completed',
    'status_changed', 'score_changed', 'tag_added', 'tag_removed',
    'pipeline_moved', 'enrichment_added', 'suppressed', 'campaign_step',
    'note', 'storm_event'
  ) THEN
    RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
  END IF;
  
  -- Insert timeline event
  INSERT INTO public.timeline_events (
    contact_id,
    workspace_id,
    user_id,
    event_type,
    event_data,
    message_id,
    task_id,
    campaign_id,
    thread_id,
    note_id
  ) VALUES (
    p_contact_id,
    v_workspace_id,
    p_user_id,
    p_event_type,
    p_event_data,
    p_message_id,
    p_task_id,
    p_campaign_id,
    p_thread_id,
    p_note_id
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_timeline_event(uuid, text, jsonb, uuid, uuid, uuid, uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.log_timeline_event IS 'Helper function to log timeline events (Block 14200)';

-- ============================================================================
-- 4. TRIGGERS TO AUTO-LOG EVENTS FROM EXISTING TABLES
-- ============================================================================

-- Trigger: Log email sent events from send_logs
CREATE OR REPLACE FUNCTION public.trigger_log_email_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
BEGIN
  -- Find contact by email match
  SELECT id INTO v_contact_id
  FROM public.contacts
  WHERE lower(email) = lower(NEW.recipient_email)
  LIMIT 1;
  
  IF v_contact_id IS NOT NULL AND NEW.sent_at IS NOT NULL THEN
    PERFORM public.log_timeline_event(
      v_contact_id,
      'email_sent',
      jsonb_build_object(
        'subject', NEW.subject,
        'preview', LEFT(NEW.body_preview, 200),
        'campaign_name', (SELECT name FROM public.campaigns WHERE id = NEW.campaign_id),
        'send_log_id', NEW.id
      ),
      NULL, -- system event
      NULL, -- message_id
      NULL, -- task_id
      NEW.campaign_id, -- campaign_id
      NULL, -- thread_id
      NULL  -- note_id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_email_sent ON public.send_logs;
CREATE TRIGGER trg_log_email_sent
  AFTER INSERT OR UPDATE OF sent_at ON public.send_logs
  FOR EACH ROW
  WHEN (NEW.sent_at IS NOT NULL)
  EXECUTE FUNCTION public.trigger_log_email_sent();

-- Trigger: Log reply received events from inbox_messages
CREATE OR REPLACE FUNCTION public.trigger_log_reply_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
BEGIN
  -- Find contact by email match
  SELECT id INTO v_contact_id
  FROM public.contacts
  WHERE lower(email) = lower(NEW.from_email)
  LIMIT 1;
  
  IF v_contact_id IS NOT NULL AND NEW.direction IN ('in', 'inbound', 'incoming') THEN
    PERFORM public.log_timeline_event(
      v_contact_id,
      'reply_received',
      jsonb_build_object(
        'subject', NEW.subject,
        'snippet', LEFT(NEW.body_text, 200),
        'intent', NEW.intent,
        'intent_label', NEW.intent_label,
        'intent_confidence', NEW.intent_confidence,
        'message_id', NEW.id,
        'thread_id', NEW.thread_id
      ),
      NULL, -- system event
      NEW.id, -- message_id
      NULL, -- task_id
      NULL, -- campaign_id
      NEW.thread_id, -- thread_id
      NULL  -- note_id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_reply_received ON public.inbox_messages;
CREATE TRIGGER trg_log_reply_received
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.direction IN ('in', 'inbound', 'incoming'))
  EXECUTE FUNCTION public.trigger_log_reply_received();

-- Trigger: Log task created events
CREATE OR REPLACE FUNCTION public.trigger_log_task_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
BEGIN
  -- Find contact from task's lead_id or contact_id
  IF NEW.contact_id IS NOT NULL THEN
    v_contact_id := NEW.contact_id;
  ELSIF NEW.lead_id IS NOT NULL THEN
    SELECT c.id INTO v_contact_id
    FROM public.contacts c
    JOIN public.leads l ON lower(c.email) = lower(l.email) AND c.workspace_id = l.workspace_id
    WHERE l.id = NEW.lead_id
    LIMIT 1;
  END IF;
  
  IF v_contact_id IS NOT NULL THEN
    PERFORM public.log_timeline_event(
      v_contact_id,
      'task_created',
      jsonb_build_object(
        'task_type', NEW.type,
        'title', NEW.title,
        'due_date', NEW.due_at,
        'priority', NEW.priority,
        'source', NEW.source
      ),
      NEW.user_id,
      NULL, -- message_id
      NEW.id, -- task_id
      NULL, -- campaign_id
      NULL, -- thread_id
      NULL  -- note_id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_created ON public.tasks;
CREATE TRIGGER trg_log_task_created
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_log_task_created();

-- Trigger: Log task completed events
CREATE OR REPLACE FUNCTION public.trigger_log_task_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
BEGIN
  -- Only log if status changed to completed/done
  IF OLD.status != 'done' AND NEW.status = 'done' THEN
    -- Find contact from task
    IF NEW.contact_id IS NOT NULL THEN
      v_contact_id := NEW.contact_id;
    ELSIF NEW.lead_id IS NOT NULL THEN
      SELECT c.id INTO v_contact_id
      FROM public.contacts c
      JOIN public.leads l ON lower(c.email) = lower(l.email) AND c.workspace_id = l.workspace_id
      WHERE l.id = NEW.lead_id
      LIMIT 1;
    END IF;
    
    IF v_contact_id IS NOT NULL THEN
      PERFORM public.log_timeline_event(
        v_contact_id,
        'task_completed',
        jsonb_build_object(
          'task_type', NEW.type,
          'title', NEW.title,
          'completed_by', NEW.user_id
        ),
        NEW.user_id,
        NULL, -- message_id
        NEW.id, -- task_id
        NULL, -- campaign_id
        NULL, -- thread_id
        NULL  -- note_id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_completed ON public.tasks;
CREATE TRIGGER trg_log_task_completed
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW
  WHEN (OLD.status != 'done' AND NEW.status = 'done')
  EXECUTE FUNCTION public.trigger_log_task_completed();

-- Trigger: Log lead score changes
CREATE OR REPLACE FUNCTION public.trigger_log_score_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.lead_score IS DISTINCT FROM NEW.lead_score THEN
    PERFORM public.log_timeline_event(
      NEW.id,
      'score_changed',
      jsonb_build_object(
        'old_score', OLD.lead_score,
        'new_score', NEW.lead_score,
        'delta', NEW.lead_score - COALESCE(OLD.lead_score, 0),
        'reason', 'score_updated'
      ),
      NULL, -- system event
      NULL, NULL, NULL, NULL, NULL
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_score_changed ON public.contacts;
CREATE TRIGGER trg_log_score_changed
  AFTER UPDATE OF lead_score ON public.contacts
  FOR EACH ROW
  WHEN (OLD.lead_score IS DISTINCT FROM NEW.lead_score)
  EXECUTE FUNCTION public.trigger_log_score_changed();

-- Trigger: Log tag changes
CREATE OR REPLACE FUNCTION public.trigger_log_tag_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_tags text[];
  v_new_tags text[];
  v_tag text;
BEGIN
  v_old_tags := COALESCE(OLD.tags, ARRAY[]::text[]);
  v_new_tags := COALESCE(NEW.tags, ARRAY[]::text[]);
  
  -- Log tag additions
  FOREACH v_tag IN ARRAY v_new_tags
  LOOP
    IF NOT (v_tag = ANY(v_old_tags)) THEN
      PERFORM public.log_timeline_event(
        NEW.id,
        'tag_added',
        jsonb_build_object('tag', v_tag, 'source', 'manual'),
        auth.uid(),
        NULL, NULL, NULL, NULL, NULL
      );
    END IF;
  END LOOP;
  
  -- Log tag removals
  FOREACH v_tag IN ARRAY v_old_tags
  LOOP
    IF NOT (v_tag = ANY(v_new_tags)) THEN
      PERFORM public.log_timeline_event(
        NEW.id,
        'tag_removed',
        jsonb_build_object('tag', v_tag),
        auth.uid(),
        NULL, NULL, NULL, NULL, NULL
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_tag_changes ON public.contacts;
CREATE TRIGGER trg_log_tag_changes
  AFTER UPDATE OF tags ON public.contacts
  FOR EACH ROW
  WHEN (OLD.tags IS DISTINCT FROM NEW.tags)
  EXECUTE FUNCTION public.trigger_log_tag_changes();

-- Trigger: Log status/pipeline changes
CREATE OR REPLACE FUNCTION public.trigger_log_status_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.log_timeline_event(
      NEW.id,
      'status_changed',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'trigger_source', 'manual'
      ),
      auth.uid(),
      NULL, NULL, NULL, NULL, NULL
    );
  END IF;
  
  IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
    PERFORM public.log_timeline_event(
      NEW.id,
      'pipeline_moved',
      jsonb_build_object(
        'old_stage', OLD.pipeline_stage_id,
        'new_stage', NEW.pipeline_stage_id
      ),
      auth.uid(),
      NULL, NULL, NULL, NULL, NULL
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_status_changes ON public.contacts;
CREATE TRIGGER trg_log_status_changes
  AFTER UPDATE OF status, pipeline_stage_id ON public.contacts
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status 
    OR OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id
  )
  EXECUTE FUNCTION public.trigger_log_status_changes();

-- Trigger: Log notes
CREATE OR REPLACE FUNCTION public.trigger_log_note()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.log_timeline_event(
    NEW.contact_id,
    'note',
    jsonb_build_object(
      'body', LEFT(NEW.body, 200),
      'note_id', NEW.id
    ),
    NEW.user_id,
    NULL, NULL, NULL, NULL, NEW.id
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_note ON public.contact_notes;
CREATE TRIGGER trg_log_note
  AFTER INSERT ON public.contact_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_log_note();

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.timeline_events IS 'Unified timeline events table for Block 14200 - Timeline v2';
COMMENT ON COLUMN public.timeline_events.event_type IS 'Type of event: email_sent, reply_received, task_created, task_completed, status_changed, score_changed, tag_added, tag_removed, pipeline_moved, enrichment_added, suppressed, campaign_step, note, storm_event';
COMMENT ON COLUMN public.timeline_events.event_data IS 'JSON data specific to each event type';
COMMENT ON COLUMN public.timeline_events.user_id IS 'User who triggered the event (NULL for system events)';





















































