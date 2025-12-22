-- Block 238 — Smart Intent Routing v1
-- Trigger to call intent-router edge function when intent_primary changes

-- Ensure pg_net extension is available
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to call intent-router edge function
CREATE OR REPLACE FUNCTION public.run_intent_router()
RETURNS trigger AS $$
DECLARE
  _payload JSON;
  _edge_base_url TEXT;
  _service_role_key TEXT;
  _last_message_body TEXT;
BEGIN
  -- Only process if intent_primary changed
  IF NEW.intent_primary IS NULL OR (OLD.intent_primary IS NOT DISTINCT FROM NEW.intent_primary) THEN
    RETURN NEW;
  END IF;

  -- Get edge function base URL
  _edge_base_url := COALESCE(
    current_setting('app.settings.edge_base_url', true),
    current_setting('app.supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/intent-router';

  -- Get service role key
  _service_role_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    current_setting('app.supabase_service_role_key', true)
  );

  -- Try to get last message body from inbound_messages or reply_messages
  SELECT COALESCE(
    (SELECT body_text FROM public.inbound_messages WHERE thread_id = NEW.id ORDER BY created_at DESC LIMIT 1),
    (SELECT body FROM public.reply_messages WHERE thread_id = NEW.id ORDER BY created_at DESC LIMIT 1),
    (SELECT body_text FROM public.messages WHERE thread_id = NEW.id ORDER BY created_at DESC LIMIT 1),
    ''
  ) INTO _last_message_body;

  -- Build payload
  _payload := json_build_object(
    'thread', json_build_object(
      'id', NEW.id::text,
      'intent_primary', NEW.intent_primary,
      'lead_id', NEW.lead_id::text,
      'campaign_id', COALESCE(NEW.campaign_id::text, NULL),
      'last_message_body', _last_message_body
    )
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

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert/update
    RAISE WARNING 'Failed to trigger intent-router: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS tr_intent_router ON public.reply_threads;

-- Create trigger on reply_threads for intent_primary changes
CREATE TRIGGER tr_intent_router
AFTER UPDATE OF intent_primary ON public.reply_threads
FOR EACH ROW
WHEN (NEW.intent_primary IS DISTINCT FROM OLD.intent_primary)
EXECUTE FUNCTION public.run_intent_router();

COMMENT ON FUNCTION public.run_intent_router() IS 'Triggers intent-router edge function when intent_primary changes on reply_threads';
COMMENT ON TRIGGER tr_intent_router ON public.reply_threads IS 'Calls intent-router edge function when intent_primary is updated';

-- Create RPC function to stop campaign for a lead (wrapper for cancel_future_queue_for_lead)
CREATE OR REPLACE FUNCTION public.stop_campaign_for_lead(
  lead_id uuid,
  campaign_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If campaign_id is provided, use campaign-specific cancellation
  IF campaign_id IS NOT NULL THEN
    PERFORM public.cancel_future_queue_for_lead(campaign_id, lead_id);
  ELSE
    -- Otherwise, cancel all future queue items for this lead across all campaigns
    UPDATE public.send_queue
    SET status = 'canceled',
        last_error = 'unsubscribed',
        updated_at = now()
    WHERE lead_id = stop_campaign_for_lead.lead_id
      AND status IN ('queued', 'sending', 'pending');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.stop_campaign_for_lead(uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.stop_campaign_for_lead(uuid, uuid) IS 'Stops campaign sends for a lead by canceling future queue items';

