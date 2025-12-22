-- Create trigger function to call reply_detection_edge when new emails are inserted
-- This enables automatic reply detection without user intervention

-- Ensure pg_net extension is available for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to trigger reply detection
CREATE OR REPLACE FUNCTION handle_email_reply_detection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  func_url text;
  payload jsonb;
  edge_func_result jsonb;
BEGIN
  -- Build the edge function URL
  func_url := coalesce(
    current_setting('app.supabase_url', true),
    current_setting('app.public_supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/reply_detection_edge';

  -- Build payload with the new record
  payload := jsonb_build_object('record', to_jsonb(NEW));

  -- Call Edge Function via HTTP if pg_net is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    -- Fire and forget - don't wait for response
    PERFORM net.http_post(
      url := func_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          current_setting('app.supabase_service_role_key', true),
          current_setting('app.service_role_key', true)
        )
      ),
      body := payload
    );
  ELSE
    -- Log warning if pg_net is not available
    RAISE WARNING 'pg_net extension not available, cannot call reply_detection_edge function';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to trigger reply_detection_edge: %', sqlerrm;
    RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS handle_email_reply_detection ON public.emails;

-- Create trigger that calls the function after insert
CREATE TRIGGER handle_email_reply_detection
AFTER INSERT ON public.emails
FOR EACH ROW
EXECUTE FUNCTION handle_email_reply_detection();

