-- Block 229 — Lead Enrichment Mini v1
-- Trigger to automatically run enrichment on new lead creation

-- Ensure pg_net extension is available
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to trigger lead enrichment
CREATE OR REPLACE FUNCTION run_lead_enrich()
RETURNS trigger AS $$
DECLARE
  payload json;
  edge_base_url text;
BEGIN
  -- Build payload with lead data
  payload := json_build_object('lead', to_jsonb(NEW));

  -- Get edge function base URL
  edge_base_url := COALESCE(
    current_setting('app.settings.edge_base_url', true),
    current_setting('app.supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/lead-enrich-mini';

  -- Call edge function (fire and forget)
  IF edge_base_url IS NOT NULL THEN
    PERFORM net.http_post(
      url := edge_base_url,
      body := payload::text,
      headers := json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(
          current_setting('app.settings.service_role_key', true),
          current_setting('app.supabase_service_role_key', true),
          current_setting('app.service_role_key', true)
        )
      )::text
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to trigger lead enrichment: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS tr_lead_enrich ON public.leads;

-- Create trigger that runs after insert
CREATE TRIGGER tr_lead_enrich
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION run_lead_enrich();










