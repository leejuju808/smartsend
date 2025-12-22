-- Block 271 — Company 360 v1
-- Companies Table, Company Resolution, Company-Level Activity View

-- Create companies table
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text,
  domain text NOT NULL,
  website text,
  industry text,
  size text,
  country text,
  state text,
  city text,
  logo_url text,
  enrichment_data jsonb DEFAULT '{}'::jsonb,
  enrichment_score int DEFAULT 0 CHECK (enrichment_score >= 0 AND enrichment_score <= 100),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, domain)
);

-- Add company_id foreign key to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_companies_workspace ON public.companies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON public.companies(domain);
CREATE INDEX IF NOT EXISTS idx_companies_workspace_domain ON public.companies(workspace_id, domain);
CREATE INDEX IF NOT EXISTS idx_leads_company ON public.leads(company_id) WHERE company_id IS NOT NULL;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.set_companies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;
CREATE TRIGGER trg_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_companies_updated_at();

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Team members can view companies in their workspace
CREATE POLICY "companies: select workspace members"
  ON public.companies FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = companies.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Team members can insert companies in their workspace
CREATE POLICY "companies: insert workspace members"
  ON public.companies FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = companies.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Team members can update companies in their workspace
CREATE POLICY "companies: update workspace members"
  ON public.companies FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = companies.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Helper function: Extract domain from email or website
CREATE OR REPLACE FUNCTION public.extract_domain(input_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_domain text;
BEGIN
  IF input_text IS NULL OR input_text = '' THEN
    RETURN NULL;
  END IF;

  -- If it's an email, extract domain
  IF position('@' in input_text) > 0 THEN
    v_domain := lower(split_part(input_text, '@', 2));
  -- If it's a URL, extract domain
  ELSIF input_text ~* '^https?://' THEN
    v_domain := lower(regexp_replace(input_text, '^https?://(www\.)?([^/]+).*', '\2'));
  -- If it's already a domain
  ELSE
    v_domain := lower(regexp_replace(input_text, '^www\.', ''));
  END IF;

  -- Clean up: remove trailing slashes and common prefixes
  v_domain := regexp_replace(v_domain, '/.*$', '');
  v_domain := regexp_replace(v_domain, '^www\.', '');

  RETURN v_domain;
END;
$$;

-- Company resolution function
CREATE OR REPLACE FUNCTION public.resolve_company(
  p_workspace_id uuid,
  p_email text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_company_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_domain text;
  v_company_id uuid;
  v_existing_company_id uuid;
BEGIN
  -- Extract domain from email or website
  v_domain := NULL;
  
  IF p_email IS NOT NULL AND p_email != '' THEN
    v_domain := public.extract_domain(p_email);
  END IF;
  
  IF v_domain IS NULL AND p_website IS NOT NULL AND p_website != '' THEN
    v_domain := public.extract_domain(p_website);
  END IF;
  
  -- If no domain found, return NULL
  IF v_domain IS NULL OR v_domain = '' THEN
    RETURN NULL;
  END IF;

  -- Check if company already exists
  SELECT id INTO v_existing_company_id
  FROM public.companies
  WHERE workspace_id = p_workspace_id
    AND domain = v_domain
  LIMIT 1;

  IF v_existing_company_id IS NOT NULL THEN
    RETURN v_existing_company_id;
  END IF;

  -- Create new company
  INSERT INTO public.companies (
    workspace_id,
    domain,
    name,
    website
  )
  VALUES (
    p_workspace_id,
    v_domain,
    p_company_name,
    CASE 
      WHEN p_website IS NOT NULL AND p_website != '' THEN p_website
      WHEN p_email IS NOT NULL THEN 'https://' || v_domain
      ELSE NULL
    END
  )
  RETURNING id INTO v_company_id;

  RETURN v_company_id;
END;
$$;

COMMENT ON FUNCTION public.resolve_company IS 'Finds or creates a company for the given workspace, email, and/or website. Returns company_id or NULL if no domain can be extracted.';

-- Trigger function: Auto-resolve company when lead is created/updated
CREATE OR REPLACE FUNCTION public.auto_resolve_company_for_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Only resolve if company_id is not already set
  IF NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve company from email or website
  v_company_id := public.resolve_company(
    NEW.workspace_id,
    NEW.email,
    NEW.website,
    NEW.company
  );

  -- Set company_id if resolved
  IF v_company_id IS NOT NULL THEN
    NEW.company_id := v_company_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for leads
DROP TRIGGER IF EXISTS trg_auto_resolve_company ON public.leads;
CREATE TRIGGER trg_auto_resolve_company
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  WHEN (NEW.email IS NOT NULL OR NEW.website IS NOT NULL)
  EXECUTE FUNCTION public.auto_resolve_company_for_lead();

COMMENT ON TABLE public.companies IS 'Companies table for account-based outbound. Automatically resolved from lead email domains or websites.';








