-- Block 276 — Team Activity Feed v1
-- Workspace-Wide Feed: Sends, Replies, Deals, Notes, Campaign Events, Enrichment, Tasks, Ownership

-- Create unified team_activity table (workspace-scoped)
CREATE TABLE IF NOT EXISTS public.team_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  type text NOT NULL, -- 'email_sent','email_open','email_click','reply','meeting_intent','deal_created','deal_stage_changed','deal_won','note_added','task_created','task_completed','campaign_launched','campaign_paused','campaign_review_blocked','enrichment_run','ownership_changed','manual'
  title text,
  body text,
  metadata jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS team_activity_workspace_idx ON public.team_activity(workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_activity_type ON public.team_activity(type);
CREATE INDEX IF NOT EXISTS idx_team_activity_user ON public.team_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_lead ON public.team_activity(lead_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_campaign ON public.team_activity(campaign_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_deal ON public.team_activity(deal_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_occurred_at ON public.team_activity(occurred_at DESC);

-- Enable RLS
ALTER TABLE public.team_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Team members can view activities in their workspace
CREATE POLICY "team_activity: select workspace members"
  ON public.team_activity FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = team_activity.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Service role and workspace members can insert
CREATE POLICY "team_activity: insert workspace members"
  ON public.team_activity FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = team_activity.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Helper function to log team activity (can be called from triggers or application code)
CREATE OR REPLACE FUNCTION public.log_team_activity(
  p_workspace_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_deal_id uuid DEFAULT NULL,
  p_type text,
  p_title text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_occurred_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.team_activity (
    workspace_id,
    user_id,
    lead_id,
    company_id,
    campaign_id,
    deal_id,
    type,
    title,
    body,
    metadata,
    occurred_at
  ) VALUES (
    p_workspace_id,
    p_user_id,
    p_lead_id,
    p_company_id,
    p_campaign_id,
    p_deal_id,
    p_type,
    p_title,
    p_body,
    p_metadata,
    p_occurred_at
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Trigger function: Mirror lead_activity events to team_activity
CREATE OR REPLACE FUNCTION public.mirror_lead_activity_to_team()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_campaign_id uuid;
  v_deal_id uuid;
BEGIN
  -- Extract user_id from metadata if available (for manual entries)
  v_user_id := (NEW.metadata->>'user_id')::uuid;
  
  -- Extract related IDs from metadata
  v_campaign_id := COALESCE((NEW.metadata->>'campaign_id')::uuid, NULL);
  v_deal_id := COALESCE((NEW.metadata->>'deal_id')::uuid, NULL);
  
  -- Try to get company_id from lead if available
  IF NEW.lead_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id
    FROM public.leads
    WHERE id = NEW.lead_id;
  END IF;
  
  -- Insert into team_activity
  INSERT INTO public.team_activity (
    workspace_id,
    user_id,
    lead_id,
    company_id,
    campaign_id,
    deal_id,
    type,
    title,
    body,
    metadata,
    occurred_at
  ) VALUES (
    NEW.workspace_id,
    v_user_id,
    NEW.lead_id,
    v_company_id,
    v_campaign_id,
    v_deal_id,
    NEW.type,
    NEW.title,
    NEW.body,
    NEW.metadata,
    NEW.occurred_at
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger to mirror lead_activity to team_activity
DROP TRIGGER IF EXISTS trg_mirror_lead_to_team_activity ON public.lead_activity;
CREATE TRIGGER trg_mirror_lead_to_team_activity
  AFTER INSERT ON public.lead_activity
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_lead_activity_to_team();

-- Trigger function: Log email_sent to team_activity with user context
CREATE OR REPLACE FUNCTION public.log_team_email_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
  v_campaign_name text;
  v_user_id uuid;
  v_company_id uuid;
BEGIN
  -- Only log when status changes to 'sent'
  IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent') THEN
    -- Get workspace_id and company_id from lead
    SELECT workspace_id, company_id INTO v_workspace_id, v_company_id
    FROM public.leads
    WHERE id = NEW.lead_id;
    
    -- Get campaign name if available
    SELECT name INTO v_campaign_name
    FROM public.campaigns
    WHERE id = NEW.campaign_id;
    
    -- Try to get user_id from campaign owner or send_log metadata
    SELECT owner_id INTO v_user_id
    FROM public.campaigns
    WHERE id = NEW.campaign_id;
    
    -- Insert into team_activity
    INSERT INTO public.team_activity (
      workspace_id,
      user_id,
      lead_id,
      company_id,
      campaign_id,
      type,
      title,
      metadata,
      occurred_at
    ) VALUES (
      v_workspace_id,
      v_user_id,
      NEW.lead_id,
      v_company_id,
      NEW.campaign_id,
      'email_sent',
      COALESCE('Email sent to ' || (SELECT email FROM public.leads WHERE id = NEW.lead_id) || ' (Campaign: ' || v_campaign_name || ')', 'Email sent'),
      jsonb_build_object(
        'campaign_id', NEW.campaign_id,
        'campaign_name', v_campaign_name,
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

-- Create trigger for send_logs (in addition to lead_activity trigger)
DROP TRIGGER IF EXISTS trg_log_team_email_sent ON public.send_logs;
CREATE TRIGGER trg_log_team_email_sent
  AFTER INSERT OR UPDATE ON public.send_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.log_team_email_sent();

-- Trigger function: Log email_open and email_click to team_activity
CREATE OR REPLACE FUNCTION public.log_team_email_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
  v_event_type text;
  v_company_id uuid;
BEGIN
  -- Map event types
  IF NEW.event_type = 'open' THEN
    v_event_type := 'email_open';
  ELSIF NEW.event_type = 'click' THEN
    v_event_type := 'email_click';
  ELSE
    RETURN NEW; -- Skip other event types
  END IF;
  
  -- Get workspace_id and company_id from lead
  SELECT workspace_id, company_id INTO v_workspace_id, v_company_id
  FROM public.leads
  WHERE id = NEW.lead_id;
  
  -- Insert into team_activity
  INSERT INTO public.team_activity (
    workspace_id,
    lead_id,
    company_id,
    campaign_id,
    type,
    title,
    metadata,
    occurred_at
  ) VALUES (
    v_workspace_id,
    NEW.lead_id,
    v_company_id,
    NEW.campaign_id,
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
    DROP TRIGGER IF EXISTS trg_log_team_email_event ON public.email_events;
    CREATE TRIGGER trg_log_team_email_event
      AFTER INSERT ON public.email_events
      FOR EACH ROW
      EXECUTE FUNCTION public.log_team_email_event();
  END IF;
END $$;

-- Trigger function: Log reply to team_activity
CREATE OR REPLACE FUNCTION public.log_team_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
  v_snippet text;
  v_company_id uuid;
  v_is_meeting_intent boolean;
BEGIN
  -- Only log when a new reply comes in
  IF NEW.last_message_at IS NOT NULL AND (OLD.last_message_at IS NULL OR NEW.last_message_at > OLD.last_message_at) THEN
    -- Get workspace_id and company_id from lead
    SELECT workspace_id, company_id INTO v_workspace_id, v_company_id
    FROM public.leads
    WHERE id = NEW.lead_id;
    
    -- Get snippet from last message or use intent
    v_snippet := COALESCE(
      NEW.last_message_snippet,
      NEW.intent_primary,
      'Lead replied'
    );
    
    -- Check if meeting intent
    v_is_meeting_intent := COALESCE(NEW.intent_primary = 'meeting_intent', false);
    
    -- Insert reply activity
    INSERT INTO public.team_activity (
      workspace_id,
      lead_id,
      company_id,
      campaign_id,
      type,
      title,
      body,
      metadata,
      occurred_at
    ) VALUES (
      v_workspace_id,
      NEW.lead_id,
      v_company_id,
      NEW.campaign_id,
      'reply',
      'Reply from ' || COALESCE((SELECT first_name || ' ' || last_name FROM public.leads WHERE id = NEW.lead_id), (SELECT email FROM public.leads WHERE id = NEW.lead_id), 'Lead'),
      v_snippet,
      jsonb_build_object(
        'thread_id', NEW.id,
        'intent_primary', NEW.intent_primary,
        'labels', NEW.labels,
        'meeting_time', NULL
      ),
      COALESCE(NEW.last_message_at, NEW.updated_at, now())
    );
    
    -- If meeting intent, also log meeting_intent event
    IF v_is_meeting_intent THEN
      INSERT INTO public.team_activity (
        workspace_id,
        lead_id,
        company_id,
        campaign_id,
        type,
        title,
        body,
        metadata,
        occurred_at
      ) VALUES (
        v_workspace_id,
        NEW.lead_id,
        v_company_id,
        NEW.campaign_id,
        'meeting_intent',
        'Meeting Intent Detected',
        v_snippet,
        jsonb_build_object(
          'thread_id', NEW.id,
          'intent_primary', NEW.intent_primary
        ),
        COALESCE(NEW.last_message_at, NEW.updated_at, now())
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for reply_threads (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reply_threads') THEN
    DROP TRIGGER IF EXISTS trg_log_team_reply ON public.reply_threads;
    CREATE TRIGGER trg_log_team_reply
      AFTER INSERT OR UPDATE ON public.reply_threads
      FOR EACH ROW
      EXECUTE FUNCTION public.log_team_reply();
  END IF;
END $$;

-- Trigger function: Log deal events to team_activity
CREATE OR REPLACE FUNCTION public.log_team_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_activity_type text;
  v_title text;
  v_company_id uuid;
BEGIN
  -- Determine activity type
  IF TG_OP = 'INSERT' THEN
    v_activity_type := 'deal_created';
    v_title := 'Deal created — ' || COALESCE(NEW.title, 'Deal');
  ELSIF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    v_activity_type := 'deal_stage_changed';
    v_title := format('Deal stage changed: %s → %s', OLD.stage, NEW.stage);
    
    -- Check for won/lost
    IF NEW.stage = 'closed_won' THEN
      v_activity_type := 'deal_won';
      v_title := 'Deal won — ' || COALESCE(NEW.title, 'Deal');
    ELSIF NEW.stage = 'closed_lost' THEN
      v_activity_type := 'deal_lost';
      v_title := 'Deal lost — ' || COALESCE(NEW.title, 'Deal');
    END IF;
  ELSE
    RETURN NEW; -- Skip other updates
  END IF;
  
  -- Get company_id from lead if available
  IF NEW.lead_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id
    FROM public.leads
    WHERE id = NEW.lead_id;
  END IF;
  
  -- Insert into team_activity
  INSERT INTO public.team_activity (
    workspace_id,
    user_id,
    lead_id,
    company_id,
    deal_id,
    type,
    title,
    body,
    metadata,
    occurred_at
  ) VALUES (
    NEW.workspace_id,
    NEW.owner_id,
    NEW.lead_id,
    v_company_id,
    NEW.id,
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
DROP TRIGGER IF EXISTS trg_log_team_deal ON public.deals;
CREATE TRIGGER trg_log_team_deal
  AFTER INSERT OR UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.log_team_deal();

-- Trigger function: Log note_added to team_activity
CREATE OR REPLACE FUNCTION public.log_team_note()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
  v_company_id uuid;
  v_campaign_id uuid;
BEGIN
  -- Only log on insert
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- Get workspace_id, company_id, campaign_id from lead
  SELECT workspace_id, company_id, campaign_id INTO v_workspace_id, v_company_id, v_campaign_id
  FROM public.leads
  WHERE id = NEW.lead_id;
  
  -- Insert into team_activity
  INSERT INTO public.team_activity (
    workspace_id,
    user_id,
    lead_id,
    company_id,
    campaign_id,
    type,
    title,
    body,
    metadata,
    occurred_at
  ) VALUES (
    v_workspace_id,
    NEW.user_id,
    NEW.lead_id,
    v_company_id,
    v_campaign_id,
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
    DROP TRIGGER IF EXISTS trg_log_team_note ON public.lead_notes;
    CREATE TRIGGER trg_log_team_note
      AFTER INSERT ON public.lead_notes
      FOR EACH ROW
      EXECUTE FUNCTION public.log_team_note();
  END IF;
  
  -- Also check for notes table (workspace-scoped)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notes') THEN
    DROP TRIGGER IF EXISTS trg_log_team_note_workspace ON public.notes;
    CREATE TRIGGER trg_log_team_note_workspace
      AFTER INSERT ON public.notes
      FOR EACH ROW
      WHEN (NEW.lead_id IS NOT NULL)
      EXECUTE FUNCTION public.log_team_note();
  END IF;
END $$;

-- Trigger function: Log task_created and task_completed to team_activity
CREATE OR REPLACE FUNCTION public.log_team_task()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_workspace_id uuid;
  v_activity_type text;
  v_title text;
  v_company_id uuid;
  v_campaign_id uuid;
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
  
  -- Get workspace_id, company_id, campaign_id
  SELECT workspace_id, company_id, campaign_id INTO v_workspace_id, v_company_id, v_campaign_id
  FROM public.leads
  WHERE id = NEW.lead_id;
  
  -- If workspace_id not found, try to get from tasks table
  IF v_workspace_id IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'workspace_id'
  ) THEN
    v_workspace_id := NEW.workspace_id;
  END IF;
  
  -- Insert into team_activity
  INSERT INTO public.team_activity (
    workspace_id,
    user_id,
    lead_id,
    company_id,
    campaign_id,
    type,
    title,
    body,
    metadata,
    occurred_at
  ) VALUES (
    v_workspace_id,
    COALESCE(NEW.assigned_to, NEW.created_by),
    NEW.lead_id,
    v_company_id,
    v_campaign_id,
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
DROP TRIGGER IF EXISTS trg_log_team_task ON public.tasks;
CREATE TRIGGER trg_log_team_task
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_team_task();

-- Trigger function: Log ownership_changed to team_activity
CREATE OR REPLACE FUNCTION public.log_team_ownership_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Only log when owner_id actually changes
  IF OLD.owner_id IS NOT DISTINCT FROM NEW.owner_id THEN
    RETURN NEW;
  END IF;
  
  -- Get company_id from lead if available
  IF NEW.id IS NOT NULL THEN
    SELECT company_id INTO v_company_id
    FROM public.leads
    WHERE id = NEW.id;
  END IF;
  
  -- Insert into team_activity
  INSERT INTO public.team_activity (
    workspace_id,
    user_id,
    lead_id,
    company_id,
    type,
    title,
    metadata,
    occurred_at
  ) VALUES (
    NEW.workspace_id,
    NEW.owner_id, -- New owner
    NEW.id,
    v_company_id,
    'ownership_changed',
    'Ownership changed',
    jsonb_build_object(
      'from_user_id', OLD.owner_id,
      'to_user_id', NEW.owner_id,
      'entity_type', 'lead'
    ),
    COALESCE(NEW.assigned_at, NEW.updated_at, now())
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for leads owner changes
DROP TRIGGER IF EXISTS trg_log_team_ownership_change ON public.leads;
CREATE TRIGGER trg_log_team_ownership_change
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  WHEN (OLD.owner_id IS DISTINCT FROM NEW.owner_id)
  EXECUTE FUNCTION public.log_team_ownership_change();

COMMENT ON TABLE public.team_activity IS 'Unified workspace-wide activity feed - tracks all interactions, events, and changes across SmartSend';
COMMENT ON COLUMN public.team_activity.type IS 'Activity type: email_sent, email_open, email_click, reply, meeting_intent, deal_created, deal_stage_changed, deal_won, note_added, task_created, task_completed, campaign_launched, campaign_paused, campaign_review_blocked, enrichment_run, ownership_changed, manual';








