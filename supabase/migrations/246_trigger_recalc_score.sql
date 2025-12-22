-- Block 231 — Lead Scoring v1
-- Trigger to recalculate lead score when key data changes

-- Ensure pg_net extension is available
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to call lead-score edge function
CREATE OR REPLACE FUNCTION recalc_lead_score()
RETURNS trigger AS $$
DECLARE
  payload jsonb;
  edge_base_url text;
  service_role_key text;
BEGIN
  -- Get edge function base URL from environment or use default
  edge_base_url := COALESCE(
    current_setting('app.settings.edge_base_url', true),
    current_setting('app.supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/lead-score';

  -- Get service role key
  service_role_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    current_setting('app.supabase_service_role_key', true)
  );

  -- Build payload with lead data
  payload := jsonb_build_object(
    'lead', jsonb_build_object(
      'id', NEW.id,
      'guessed_industry', NEW.guessed_industry,
      'icp_industry', NEW.icp_industry,
      'icp_related', NEW.icp_related,
      'employee_count', NEW.employee_count,
      'open_count', NEW.open_count,
      'click_count', NEW.click_count,
      'intent_primary', NEW.intent_primary
    )
  );

  -- Call edge function asynchronously (fire and forget)
  IF edge_base_url IS NOT NULL AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM net.http_post(
      url := edge_base_url,
      body := payload::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      )::text
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to trigger lead score recalculation: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS tr_lead_score ON public.leads;

-- Create trigger that fires when scoring-related columns change
CREATE TRIGGER tr_lead_score
AFTER UPDATE OF
  guessed_industry,
  employee_count,
  open_count,
  click_count,
  intent_primary,
  icp_industry,
  icp_related
ON public.leads
FOR EACH ROW
WHEN (
  OLD.guessed_industry IS DISTINCT FROM NEW.guessed_industry OR
  OLD.employee_count IS DISTINCT FROM NEW.employee_count OR
  OLD.open_count IS DISTINCT FROM NEW.open_count OR
  OLD.click_count IS DISTINCT FROM NEW.click_count OR
  OLD.intent_primary IS DISTINCT FROM NEW.intent_primary OR
  OLD.icp_industry IS DISTINCT FROM NEW.icp_industry OR
  OLD.icp_related IS DISTINCT FROM NEW.icp_related
)
EXECUTE FUNCTION recalc_lead_score();

COMMENT ON FUNCTION recalc_lead_score() IS 'Triggers lead-score edge function to recalculate score when enrichment, engagement, or intent data changes';
COMMENT ON TRIGGER tr_lead_score ON public.leads IS 'Automatically recalculates lead score when key scoring factors change';

