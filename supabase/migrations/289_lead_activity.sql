-- Block 270 — Lead Timeline v1
-- Unified Activity Feed: Sends, Opens, Clicks, Replies, Deals, Notes, Tasks

-- Create unified lead_activity table
CREATE TABLE IF NOT EXISTS public.lead_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type text NOT NULL,       -- 'email_sent','email_open','email_click','reply','note_added','task_created','task_completed','deal_created','deal_stage_changed','deal_won','deal_lost','enrichment_run','owner_changed','manual'
  title text,
  body text,
  metadata jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_lead_activity_lead ON public.lead_activity(lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activity_workspace ON public.lead_activity(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_activity_type ON public.lead_activity(type);
CREATE INDEX IF NOT EXISTS idx_lead_activity_occurred_at ON public.lead_activity(occurred_at DESC);

-- Enable RLS
ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Team members can view activities in their workspace
CREATE POLICY "lead_activity: select workspace members"
  ON public.lead_activity FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_activity.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Service role and workspace members can insert
CREATE POLICY "lead_activity: insert workspace members"
  ON public.lead_activity FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_activity.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Helper function to get workspace_id from lead_id
CREATE OR REPLACE FUNCTION public.get_lead_workspace_id(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = p_lead_id;
  
  RETURN v_workspace_id;
END;
$$;

-- Trigger function: Log email_sent when send_logs status changes to 'sent'
CREATE OR REPLACE FUNCTION public.log_email_sent_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
  v_campaign_name text;
BEGIN
  -- Only log when status changes to 'sent'
  IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent') THEN
    -- Get workspace_id from lead
    SELECT workspace_id INTO v_workspace_id
    FROM public.leads
    WHERE id = NEW.lead_id;
    
    -- Get campaign name if available
    SELECT name INTO v_campaign_name
    FROM public.campaigns
    WHERE id = NEW.campaign_id;
    
    -- Insert activity
    INSERT INTO public.lead_activity (
      workspace_id,
      lead_id,
      type,
      title,
      metadata,
      occurred_at
    ) VALUES (
      v_workspace_id,
      NEW.lead_id,
      'email_sent',
      COALESCE('Email sent via ' || v_campaign_name, 'Email sent'),
      jsonb_build_object(
        'campaign_id', NEW.campaign_id,
        'subject', NEW.subject,
        'variant_id', NEW.variant_id,
        'send_log_id', NEW.id
      ),
      COALESCE(NEW.sent_at, NEW.created_at, now())
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for send_logs
DROP TRIGGER IF EXISTS trg_log_email_sent ON public.send_logs;
CREATE TRIGGER trg_log_email_sent
  AFTER INSERT OR UPDATE ON public.send_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.log_email_sent_activity();

-- Trigger function: Log email_open and email_click from email_events
CREATE OR REPLACE FUNCTION public.log_email_event_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
  v_event_type text;
BEGIN
  -- Map event types
  IF NEW.event_type = 'open' THEN
    v_event_type := 'email_open';
  ELSIF NEW.event_type = 'click' THEN
    v_event_type := 'email_click';
  ELSE
    RETURN NEW; -- Skip other event types
  END IF;
  
  -- Get workspace_id from lead
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = NEW.lead_id;
  
  -- Insert activity
  INSERT INTO public.lead_activity (
    workspace_id,
    lead_id,
    type,
    title,
    metadata,
    occurred_at
  ) VALUES (
    v_workspace_id,
    NEW.lead_id,
    v_event_type,
    CASE 
      WHEN v_event_type = 'email_open' THEN 'Email opened'
      WHEN v_event_type = 'email_click' THEN 'Link clicked'
    END,
    jsonb_build_object(
      'campaign_id', NEW.campaign_id,
      'url', NEW.url,
      'event_id', NEW.id
    ),
    COALESCE(NEW.created_at, now())
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for email_events (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_events') THEN
    DROP TRIGGER IF EXISTS trg_log_email_event ON public.email_events;
    CREATE TRIGGER trg_log_email_event
      AFTER INSERT ON public.email_events
      FOR EACH ROW
      EXECUTE FUNCTION public.log_email_event_activity();
  END IF;
END $$;

-- Trigger function: Log reply from reply_threads
CREATE OR REPLACE FUNCTION public.log_reply_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
  v_snippet text;
BEGIN
  -- Only log when a new reply comes in (you may need to adjust this based on your reply detection logic)
  -- This assumes reply_threads has a last_message_at that gets updated
  IF NEW.last_message_at IS NOT NULL AND (OLD.last_message_at IS NULL OR NEW.last_message_at > OLD.last_message_at) THEN
    -- Get workspace_id from lead
    SELECT workspace_id INTO v_workspace_id
    FROM public.leads
    WHERE id = NEW.lead_id;
    
    -- Get snippet from last message or use intent
    v_snippet := COALESCE(
      NEW.last_message_snippet,
      NEW.intent_primary,
      'Lead replied'
    );
    
    -- Insert activity
    INSERT INTO public.lead_activity (
      workspace_id,
      lead_id,
      type,
      title,
      body,
      metadata,
      occurred_at
    ) VALUES (
      v_workspace_id,
      NEW.lead_id,
      'reply',
      'Lead replied',
      v_snippet,
      jsonb_build_object(
        'thread_id', NEW.id,
        'intent_primary', NEW.intent_primary,
        'labels', NEW.labels,
        'meeting_time', NULL -- Could extract from metadata if available
      ),
      COALESCE(NEW.last_message_at, NEW.updated_at, now())
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for reply_threads (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reply_threads') THEN
    DROP TRIGGER IF EXISTS trg_log_reply ON public.reply_threads;
    CREATE TRIGGER trg_log_reply
      AFTER INSERT OR UPDATE ON public.reply_threads
      FOR EACH ROW
      EXECUTE FUNCTION public.log_reply_activity();
  END IF;
END $$;

-- Trigger function: Log deal events
CREATE OR REPLACE FUNCTION public.log_deal_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
  v_activity_type text;
  v_title text;
BEGIN
  -- Determine activity type
  IF TG_OP = 'INSERT' THEN
    v_activity_type := 'deal_created';
    v_title := 'Deal created';
  ELSIF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    v_activity_type := 'deal_stage_changed';
    v_title := format('Deal stage changed: %s → %s', OLD.stage, NEW.stage);
    
    -- Check for won/lost
    IF NEW.stage = 'closed_won' THEN
      v_activity_type := 'deal_won';
      v_title := 'Deal won';
    ELSIF NEW.stage = 'closed_lost' THEN
      v_activity_type := 'deal_lost';
      v_title := 'Deal lost';
    END IF;
  ELSE
    RETURN NEW; -- Skip other updates
  END IF;
  
  -- Only log if lead_id exists
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get workspace_id
  v_workspace_id := NEW.workspace_id;
  
  -- Insert activity
  INSERT INTO public.lead_activity (
    workspace_id,
    lead_id,
    type,
    title,
    body,
    metadata,
    occurred_at
  ) VALUES (
    v_workspace_id,
    NEW.lead_id,
    v_activity_type,
    v_title,
    COALESCE(NEW.title, 'Deal'),
    jsonb_build_object(
      'deal_id', NEW.id,
      'stage', NEW.stage,
      'value', NEW.value,
      'probability', NEW.probability,
      'old_stage', CASE WHEN TG_OP = 'UPDATE' THEN OLD.stage ELSE NULL END
    ),
    COALESCE(NEW.updated_at, NEW.created_at, now())
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for deals
DROP TRIGGER IF EXISTS trg_log_deal ON public.deals;
CREATE TRIGGER trg_log_deal
  AFTER INSERT OR UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.log_deal_activity();

-- Trigger function: Log note_added
CREATE OR REPLACE FUNCTION public.log_note_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Only log on insert
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- Get workspace_id from lead
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = NEW.lead_id;
  
  -- Insert activity
  INSERT INTO public.lead_activity (
    workspace_id,
    lead_id,
    type,
    title,
    body,
    metadata,
    occurred_at
  ) VALUES (
    v_workspace_id,
    NEW.lead_id,
    'note_added',
    'Note added',
    NEW.body,
    jsonb_build_object(
      'note_id', NEW.id,
      'user_id', NEW.user_id
    ),
    COALESCE(NEW.created_at, now())
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for lead_notes (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_notes') THEN
    DROP TRIGGER IF EXISTS trg_log_note ON public.lead_notes;
    CREATE TRIGGER trg_log_note
      AFTER INSERT ON public.lead_notes
      FOR EACH ROW
      EXECUTE FUNCTION public.log_note_activity();
  END IF;
  
  -- Also check for notes table (workspace-scoped)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notes') THEN
    DROP TRIGGER IF EXISTS trg_log_note_workspace ON public.notes;
    CREATE TRIGGER trg_log_note_workspace
      AFTER INSERT ON public.notes
      FOR EACH ROW
      WHEN (NEW.lead_id IS NOT NULL)
      EXECUTE FUNCTION public.log_note_activity();
  END IF;
END $$;

-- Trigger function: Log task_created and task_completed
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
  v_activity_type text;
  v_title text;
BEGIN
  -- Only log if lead_id exists
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Determine activity type
  IF TG_OP = 'INSERT' THEN
    v_activity_type := 'task_created';
    v_title := 'Task created';
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'done' OR NEW.status = 'completed' THEN
      v_activity_type := 'task_completed';
      v_title := 'Task completed';
    ELSE
      RETURN NEW; -- Skip other status changes for now
    END IF;
  ELSE
    RETURN NEW;
  END IF;
  
  -- Get workspace_id
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = NEW.lead_id;
  
  -- If workspace_id not found, try to get from tasks table
  IF v_workspace_id IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'workspace_id'
  ) THEN
    v_workspace_id := NEW.workspace_id;
  END IF;
  
  -- Insert activity
  INSERT INTO public.lead_activity (
    workspace_id,
    lead_id,
    type,
    title,
    body,
    metadata,
    occurred_at
  ) VALUES (
    v_workspace_id,
    NEW.lead_id,
    v_activity_type,
    v_title,
    COALESCE(NEW.title, NEW.description, 'Task'),
    jsonb_build_object(
      'task_id', NEW.id,
      'status', NEW.status,
      'assigned_to', NEW.assigned_to
    ),
    COALESCE(NEW.updated_at, NEW.created_at, now())
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for tasks
DROP TRIGGER IF EXISTS trg_log_task ON public.tasks;
CREATE TRIGGER trg_log_task
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_task_activity();

-- Trigger function: Log owner_changed
CREATE OR REPLACE FUNCTION public.log_owner_change_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Only log when owner_id actually changes
  IF OLD.owner_id IS NOT DISTINCT FROM NEW.owner_id THEN
    RETURN NEW;
  END IF;
  
  -- Get workspace_id
  v_workspace_id := NEW.workspace_id;
  
  -- Insert activity
  INSERT INTO public.lead_activity (
    workspace_id,
    lead_id,
    type,
    title,
    metadata,
    occurred_at
  ) VALUES (
    v_workspace_id,
    NEW.id,
    'owner_changed',
    'Owner changed',
    jsonb_build_object(
      'from_user_id', OLD.owner_id,
      'to_user_id', NEW.owner_id
    ),
    COALESCE(NEW.assigned_at, NEW.updated_at, now())
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for leads owner changes
DROP TRIGGER IF EXISTS trg_log_owner_change ON public.leads;
CREATE TRIGGER trg_log_owner_change
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_owner_change_activity();

COMMENT ON TABLE public.lead_activity IS 'Unified activity feed for leads - tracks all interactions, events, and changes';
COMMENT ON COLUMN public.lead_activity.type IS 'Activity type: email_sent, email_open, email_click, reply, note_added, task_created, task_completed, deal_created, deal_stage_changed, deal_won, deal_lost, enrichment_run, owner_changed, manual';








