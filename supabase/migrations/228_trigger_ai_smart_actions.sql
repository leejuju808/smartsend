-- Block 216 — Reply Inbox Smart Actions v1
-- Trigger to run AI smart actions on new incoming messages

-- Ensure pg_net extension is available
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to trigger AI smart actions
CREATE OR REPLACE FUNCTION run_ai_smart_actions()
RETURNS trigger AS $$
DECLARE
  _payload json;
  _edge_base_url TEXT;
  _service_role_key TEXT;
  _lead_id uuid;
BEGIN
  -- Only process incoming messages
  IF NEW.direction IN ('incoming', 'inbound') THEN
    -- Get lead_id from thread if not directly on message
    IF NEW.lead_id IS NULL AND NEW.thread_id IS NOT NULL THEN
      SELECT lead_id INTO _lead_id
      FROM public.reply_threads
      WHERE id = NEW.thread_id;
    ELSE
      _lead_id := NEW.lead_id;
    END IF;

    -- Skip if no thread_id or lead_id
    IF NEW.thread_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Get edge function base URL from settings or construct it
    _edge_base_url := COALESCE(
      current_setting('app.settings.edge_base_url', true),
      current_setting('app.supabase_url', true),
      'https://' || current_setting('app.project_ref', true) || '.supabase.co'
    ) || '/functions/v1/ai-smart-actions';

    -- Get service role key
    _service_role_key := COALESCE(
      current_setting('app.settings.service_role_key', true),
      current_setting('app.supabase_service_role_key', true),
      current_setting('app.service_role_key', true)
    );

    -- Build payload
    _payload := json_build_object(
      'thread_id', NEW.thread_id::text,
      'lead_id', COALESCE(_lead_id::text, NULL),
      'text', COALESCE(NEW.body_text, NEW.body_html, NEW.body, '')
    );

    -- Call edge function (fire and forget)
    IF _edge_base_url IS NOT NULL AND _service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := _edge_base_url,
        body := _payload::text,
        headers := json_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || _service_role_key
        )::text
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to trigger ai-smart-actions: %', sqlerrm;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS tr_ai_smart_actions ON public.messages;

-- Create trigger that calls the function after insert
CREATE TRIGGER tr_ai_smart_actions
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION run_ai_smart_actions();

COMMENT ON FUNCTION run_ai_smart_actions() IS 'Triggers AI smart actions extraction on new incoming messages';










