-- Block 232 — Lead Scoring v2
-- Deep AI Scoring: Website Intelligence, Personalization Score, Reply Likelihood Model, LLM-Based Fit Analysis

-- Add v2 scoring columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS scoring_v2 jsonb,
  ADD COLUMN IF NOT EXISTS score_v2 int DEFAULT 0;

-- Add index for score_v2 filtering and sorting
CREATE INDEX IF NOT EXISTS idx_leads_score_v2 ON public.leads(score_v2 DESC);

-- Add index for scoring_v2 jsonb queries
CREATE INDEX IF NOT EXISTS idx_leads_scoring_v2_gin ON public.leads USING gin(scoring_v2);

-- Comment on columns
COMMENT ON COLUMN public.leads.scoring_v2 IS 'Detailed v2 scoring breakdown: industry_fit, company_fit, engagement_score, intent_score, website_intelligence_score, personalization_score, reply_likelihood';
COMMENT ON COLUMN public.leads.score_v2 IS 'AI-powered lead score (0-100) combining multiple factors for reply likelihood prediction';

-- Ensure required columns exist for scoring (from enrichment v2)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS company_description text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS employee_count int,
  ADD COLUMN IF NOT EXISTS tech_stack text[],
  ADD COLUMN IF NOT EXISTS open_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intent_primary text;

-- Add indexes for scoring-related columns
CREATE INDEX IF NOT EXISTS idx_leads_open_count ON public.leads(open_count DESC);
CREATE INDEX IF NOT EXISTS idx_leads_click_count ON public.leads(click_count DESC);
CREATE INDEX IF NOT EXISTS idx_leads_intent_primary ON public.leads(intent_primary);

-- Ensure pg_net extension is available for HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Trigger function to call lead-score-v2 when relevant fields change
CREATE OR REPLACE FUNCTION public.trigger_lead_score_v2()
RETURNS trigger AS $$
DECLARE
  _payload json;
  _edge_base_url TEXT;
  _should_trigger boolean := false;
BEGIN
  -- Check if any scoring-relevant fields changed
  _should_trigger := (
    (NEW.company_description IS DISTINCT FROM OLD.company_description) OR
    (NEW.industry IS DISTINCT FROM OLD.industry) OR
    (NEW.company_size IS DISTINCT FROM OLD.company_size) OR
    (NEW.employee_count IS DISTINCT FROM OLD.employee_count) OR
    (NEW.tech_stack IS DISTINCT FROM OLD.tech_stack) OR
    (NEW.website IS DISTINCT FROM OLD.website) OR
    (NEW.open_count IS DISTINCT FROM OLD.open_count) OR
    (NEW.click_count IS DISTINCT FROM OLD.click_count) OR
    (NEW.intent_primary IS DISTINCT FROM OLD.intent_primary)
  );

  -- Only trigger if relevant fields changed
  IF NOT _should_trigger THEN
    RETURN NEW;
  END IF;

  -- Build payload with lead data
  SELECT json_build_object('lead', to_jsonb(NEW.*))
  INTO _payload;

  -- Get edge function base URL
  _edge_base_url := COALESCE(
    current_setting('app.settings.edge_base_url', true),
    current_setting('app.supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/lead-score-v2';

  -- Call v2 scoring edge function (fire and forget)
  IF _edge_base_url IS NOT NULL AND _payload IS NOT NULL THEN
    PERFORM net.http_post(
      url := _edge_base_url,
      body := _payload::text,
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
    -- Log error but don't fail the update
    RAISE WARNING 'Failed to trigger lead-score-v2: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS tr_lead_score_v2 ON public.leads;

-- Create trigger on leads table
CREATE TRIGGER tr_lead_score_v2
AFTER UPDATE OF
  company_description,
  industry,
  company_size,
  employee_count,
  tech_stack,
  website,
  open_count,
  click_count,
  intent_primary
ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trigger_lead_score_v2();

