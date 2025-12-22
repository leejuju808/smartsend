-- Block 200 — AI Auto-Tagging Rules v1
-- Trigger to call ai-intent-classifier on new incoming messages

-- Ensure pg_net extension is available
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to handle new incoming messages
CREATE OR REPLACE FUNCTION public.handle_new_incoming_message()
RETURNS trigger AS $$
DECLARE
  _payload JSON;
  _edge_base_url TEXT;
  _service_role_key TEXT;
BEGIN
  -- Only process incoming messages
  IF NEW.direction IN ('incoming', 'inbound') THEN
    -- Get edge function base URL from settings or construct it
    _edge_base_url := COALESCE(
      current_setting('app.settings.edge_base_url', true),
      current_setting('app.supabase_url', true),
      'https://' || current_setting('app.project_ref', true) || '.supabase.co'
    ) || '/functions/v1/ai-intent-classifier';

    -- Get service role key
    _service_role_key := COALESCE(
      current_setting('app.settings.service_role_key', true),
      current_setting('app.supabase_service_role_key', true)
    );

    -- Build payload - ensure thread_id is available
    -- thread_id might be in NEW.thread_id (uuid) or we need to look it up
    IF NEW.thread_id IS NULL THEN
      -- Try to find thread_id from reply_threads if we have lead/campaign info
      -- This is a fallback - ideally thread_id should be set on insert
      RETURN NEW;
    END IF;

    _payload := json_build_object(
      'thread_id', NEW.thread_id::text,
      'body', COALESCE(NEW.body_text, NEW.body_html, NEW.body, '')
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
    RAISE WARNING 'Failed to trigger ai-intent-classifier: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS tr_new_incoming_message ON public.messages;

-- Create trigger on messages table
CREATE TRIGGER tr_new_incoming_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_incoming_message();

COMMENT ON FUNCTION public.handle_new_incoming_message() IS 'Triggers AI intent classification when a new incoming message is inserted';

