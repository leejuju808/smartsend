-- Block 224 — Team Analytics v1
-- Triggers to update user metrics when events occur

-- Ensure pg_net extension is available for HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper function to get edge function URL
CREATE OR REPLACE FUNCTION public.get_edge_base_url()
RETURNS text AS $$
BEGIN
  RETURN COALESCE(
    current_setting('app.settings.edge_base_url', true),
    current_setting('app.supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Trigger function: Update metrics when send_queue status changes to 'sent' or 'done'
CREATE OR REPLACE FUNCTION public.tg_update_metrics_on_send()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_edge_url text;
BEGIN
  -- Only process when status changes to 'sent' or 'done'
  IF NEW.status NOT IN ('sent', 'done') OR (OLD.status = NEW.status) THEN
    RETURN NEW;
  END IF;

  -- Get user_id and workspace_id from campaign
  SELECT c.user_id, c.workspace_id, c.owner_id
  INTO v_user_id, v_workspace_id
  FROM public.campaigns c
  WHERE c.id = NEW.campaign_id;

  -- Fallback: try to get user_id from send_queue if it exists
  IF v_user_id IS NULL THEN
    -- Check if send_queue has user_id column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'user_id'
    ) THEN
      SELECT user_id INTO v_user_id FROM public.send_queue WHERE id = NEW.id;
    END IF;
  END IF;

  -- Fallback: use owner_id from campaigns if available
  IF v_user_id IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'owner_id'
  ) THEN
    SELECT owner_id INTO v_user_id FROM public.campaigns WHERE id = NEW.campaign_id;
  END IF;

  -- Skip if we don't have required fields
  IF v_user_id IS NULL OR v_workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Call metrics-update edge function (fire and forget)
  v_edge_url := public.get_edge_base_url() || '/functions/v1/metrics-update';
  
  PERFORM net.http_post(
    url := v_edge_url,
    body := json_build_object(
      'user_id', v_user_id,
      'workspace_id', v_workspace_id,
      'type', 'email_sent'
    )::text,
    headers := json_build_object(
      'Content-Type', 'application/json'
    )::text
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Error updating metrics for send: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on send_queue
DROP TRIGGER IF EXISTS trg_update_metrics_on_send ON public.send_queue;
CREATE TRIGGER trg_update_metrics_on_send
  AFTER UPDATE OF status ON public.send_queue
  FOR EACH ROW
  WHEN (NEW.status IN ('sent', 'done') AND (OLD.status IS DISTINCT FROM NEW.status))
  EXECUTE FUNCTION public.tg_update_metrics_on_send();

-- Trigger function: Update metrics for email events (open, click, reply)
CREATE OR REPLACE FUNCTION public.tg_update_metrics_on_email_event()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_edge_url text;
  v_event_type text;
BEGIN
  -- Map event types
  v_event_type := CASE
    WHEN NEW.event_type IN ('open', 'opened') THEN 'open'
    WHEN NEW.event_type IN ('click', 'clicked') THEN 'click'
    WHEN NEW.event_type IN ('reply', 'replied', 'reply_received') THEN 'reply_received'
    ELSE NULL
  END;

  -- Skip if not a tracked event type
  IF v_event_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get user_id and workspace_id from campaign
  IF NEW.campaign_id IS NOT NULL THEN
    SELECT c.user_id, c.workspace_id, c.owner_id
    INTO v_user_id, v_workspace_id
    FROM public.campaigns c
    WHERE c.id = NEW.campaign_id;
  END IF;

  -- Fallback: try to get from lead's campaign
  IF v_user_id IS NULL AND NEW.lead_id IS NOT NULL THEN
    SELECT c.user_id, c.workspace_id, c.owner_id
    INTO v_user_id, v_workspace_id
    FROM public.leads l
    JOIN public.campaign_leads cl ON cl.lead_id = l.id
    JOIN public.campaigns c ON c.id = cl.campaign_id
    WHERE l.id = NEW.lead_id
    LIMIT 1;
  END IF;

  -- Fallback: use owner_id from campaigns if available
  IF v_user_id IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'owner_id'
  ) AND NEW.campaign_id IS NOT NULL THEN
    SELECT owner_id INTO v_user_id FROM public.campaigns WHERE id = NEW.campaign_id;
  END IF;

  -- Skip if we don't have required fields
  IF v_user_id IS NULL OR v_workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Call metrics-update edge function (fire and forget)
  v_edge_url := public.get_edge_base_url() || '/functions/v1/metrics-update';
  
  PERFORM net.http_post(
    url := v_edge_url,
    body := json_build_object(
      'user_id', v_user_id,
      'workspace_id', v_workspace_id,
      'type', v_event_type
    )::text,
    headers := json_build_object(
      'Content-Type', 'application/json'
    )::text
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Error updating metrics for email event: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on email_events (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_events'
  ) THEN
    DROP TRIGGER IF EXISTS trg_update_metrics_on_email_event ON public.email_events;
    CREATE TRIGGER trg_update_metrics_on_email_event
      AFTER INSERT ON public.email_events
      FOR EACH ROW
      EXECUTE FUNCTION public.tg_update_metrics_on_email_event();
  END IF;
END $$;

-- Trigger function: Update metrics when meeting intent is detected
CREATE OR REPLACE FUNCTION public.tg_update_metrics_on_meeting_intent()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_edge_url text;
BEGIN
  -- Only process when intent_primary is set to 'meeting_intent' or similar
  IF NEW.intent_primary NOT IN ('meeting_intent', 'meeting', 'book_meeting') THEN
    RETURN NEW;
  END IF;

  -- Get user_id and workspace_id from thread's campaign
  SELECT c.user_id, c.workspace_id, c.owner_id
  INTO v_user_id, v_workspace_id
  FROM public.inbox_threads t
  JOIN public.campaigns c ON c.id = t.campaign_id
  WHERE t.id = NEW.id;

  -- Fallback: use owner_id from campaigns if available
  IF v_user_id IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'owner_id'
  ) THEN
    SELECT c.owner_id INTO v_user_id
    FROM public.inbox_threads t
    JOIN public.campaigns c ON c.id = t.campaign_id
    WHERE t.id = NEW.id;
  END IF;

  -- Fallback: try owner_id from threads if it exists
  IF v_user_id IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inbox_threads' AND column_name = 'owner_id'
  ) THEN
    SELECT owner_id INTO v_user_id FROM public.inbox_threads WHERE id = NEW.id;
  END IF;

  -- Skip if we don't have required fields
  IF v_user_id IS NULL OR v_workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Call metrics-update edge function (fire and forget)
  v_edge_url := public.get_edge_base_url() || '/functions/v1/metrics-update';
  
  PERFORM net.http_post(
    url := v_edge_url,
    body := json_build_object(
      'user_id', v_user_id,
      'workspace_id', v_workspace_id,
      'type', 'meeting_booked'
    )::text,
    headers := json_build_object(
      'Content-Type', 'application/json'
    )::text
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Error updating metrics for meeting intent: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on inbox_threads for meeting intent (if intent_primary column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inbox_threads' AND column_name = 'intent_primary'
  ) THEN
    DROP TRIGGER IF EXISTS trg_update_metrics_on_meeting_intent ON public.inbox_threads;
    CREATE TRIGGER trg_update_metrics_on_meeting_intent
      AFTER UPDATE OF intent_primary ON public.inbox_threads
      FOR EACH ROW
      WHEN (NEW.intent_primary = 'meeting_intent' AND (OLD.intent_primary IS DISTINCT FROM NEW.intent_primary))
      EXECUTE FUNCTION public.tg_update_metrics_on_meeting_intent();
  END IF;
END $$;

-- Also check for meeting_intents table (alternative schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meeting_intents'
  ) THEN
    -- Create trigger on meeting_intents insert
    DROP TRIGGER IF EXISTS trg_update_metrics_on_meeting_intent_insert ON public.meeting_intents;
    CREATE TRIGGER trg_update_metrics_on_meeting_intent_insert
      AFTER INSERT ON public.meeting_intents
      FOR EACH ROW
      EXECUTE FUNCTION public.tg_update_metrics_on_meeting_intent();
  END IF;
END $$;










