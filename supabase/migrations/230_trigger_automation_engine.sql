-- Block 217 — Automations v1
-- Trigger to call automation-engine when intent_primary is updated on reply_threads

-- Ensure pg_net extension is available
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to trigger automation engine
CREATE OR REPLACE FUNCTION run_automation_engine()
RETURNS trigger AS $$
DECLARE
  _payload json;
  _workspace_id uuid;
  _edge_base_url TEXT;
BEGIN
  -- Only process if intent_primary was actually changed
  IF NEW.intent_primary IS NULL OR NEW.intent_primary = OLD.intent_primary THEN
    RETURN NEW;
  END IF;

  -- Get workspace_id from lead
  SELECT workspace_id INTO _workspace_id
  FROM public.leads
  WHERE id = NEW.lead_id;

  -- Skip if no workspace_id found
  IF _workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build payload
  _payload := json_build_object(
    'workspace_id', _workspace_id,
    'thread_id', NEW.id,
    'lead_id', NEW.lead_id,
    'intent', NEW.intent_primary
  );

  -- Get edge function base URL
  _edge_base_url := COALESCE(
    current_setting('app.settings.edge_base_url', true),
    current_setting('app.supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/automation-engine';

  -- Call edge function (fire and forget)
  IF _edge_base_url IS NOT NULL THEN
    PERFORM net.http_post(
      url := _edge_base_url,
      body := _payload::text,
      headers := json_build_object(
        'Content-Type', 'application/json'
      )::text
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the update
    RAISE WARNING 'Failed to trigger automation-engine: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS tr_automation_engine ON public.reply_threads;

-- Create trigger on reply_threads table
CREATE TRIGGER tr_automation_engine
AFTER UPDATE OF intent_primary ON public.reply_threads
FOR EACH ROW
WHEN (NEW.intent_primary IS NOT NULL AND NEW.intent_primary IS DISTINCT FROM OLD.intent_primary)
EXECUTE FUNCTION run_automation_engine();

COMMENT ON FUNCTION run_automation_engine() IS 'Triggers automation engine when reply intent is updated';
COMMENT ON TRIGGER tr_automation_engine ON public.reply_threads IS 'Calls automation-engine edge function when intent_primary changes';










