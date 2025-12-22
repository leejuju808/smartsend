-- Block 230 — Lead Enrichment v2
-- Website scraping, Industry classification, Employee count guessing, Tech stack detection

-- Ensure pg_net extension is available
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Add v2 enrichment columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS company_description text,
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS employee_count int,
  ADD COLUMN IF NOT EXISTS tech_stack text[],
  ADD COLUMN IF NOT EXISTS enrichment_v2 boolean DEFAULT false;

-- Add index for enrichment_v2 flag
CREATE INDEX IF NOT EXISTS idx_leads_enrichment_v2 ON public.leads(enrichment_v2);

-- Add index for employee_count filtering
CREATE INDEX IF NOT EXISTS idx_leads_employee_count ON public.leads(employee_count);

-- Add GIN index for tech_stack array searches
CREATE INDEX IF NOT EXISTS idx_leads_tech_stack_gin ON public.leads USING gin(tech_stack);

-- Add index for company_size filtering
CREATE INDEX IF NOT EXISTS idx_leads_company_size ON public.leads(company_size);

-- Comment on columns
COMMENT ON COLUMN public.leads.website IS 'Company website URL extracted from domain or scraped';
COMMENT ON COLUMN public.leads.company_description IS 'Company description extracted from website';
COMMENT ON COLUMN public.leads.company_size IS 'Company size category: micro|small|medium|enterprise';
COMMENT ON COLUMN public.leads.employee_count IS 'Estimated employee count';
COMMENT ON COLUMN public.leads.tech_stack IS 'Array of detected technologies (e.g., ["React", "Shopify", "HubSpot"])';
COMMENT ON COLUMN public.leads.enrichment_v2 IS 'Flag indicating v2 enrichment has been completed';

-- Modify apply_lead_enrichment to trigger v2 enrichment after v1 completes
CREATE OR REPLACE FUNCTION public.apply_lead_enrichment(p_lead uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e record;
  edge_base_url text;
  payload json;
BEGIN
  -- Apply v1 enrichment data
  SELECT * INTO e
  FROM public.lead_enrichment
  WHERE lead_id = p_lead;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.leads
  SET
    title        = coalesce(e.person->>'title', title),
    seniority    = coalesce(e.person->>'seniority', seniority),
    linkedin     = coalesce(e.person->>'linkedin', linkedin),
    company      = coalesce(e.company->>'name', company),
    website      = coalesce(e.company->>'website', website),
    domain       = coalesce(e.company->>'domain', domain),
    company_size = coalesce(e.company->>'size', company_size),
    industry     = coalesce(e.company->>'industry', industry),
    locality     = coalesce(e.company->>'locality', locality)
  WHERE id = p_lead;

  -- Trigger v2 enrichment (fire and forget)
  -- Only trigger if v2 hasn't been completed yet
  IF NOT EXISTS (
    SELECT 1 FROM public.leads WHERE id = p_lead AND enrichment_v2 = true
  ) THEN
    -- Get edge function base URL
    edge_base_url := COALESCE(
      current_setting('app.settings.edge_base_url', true),
      current_setting('app.supabase_url', true),
      'https://' || current_setting('app.project_ref', true) || '.supabase.co'
    ) || '/functions/v1/lead-enrich-v2';

    -- Build payload with lead data
    SELECT json_build_object('lead', to_jsonb(l.*))
    INTO payload
    FROM public.leads l
    WHERE l.id = p_lead;

    -- Call v2 enrichment edge function
    IF edge_base_url IS NOT NULL AND payload IS NOT NULL THEN
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
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the enrichment
    RAISE WARNING 'Failed to trigger v2 enrichment: %', SQLERRM;
END;
$$;

