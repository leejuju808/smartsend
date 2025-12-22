-- Block 261 — Lead Enrichment Engine v1
-- Company enrichment cache table

CREATE TABLE IF NOT EXISTS public.company_enrichment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain text UNIQUE NOT NULL,
  company_name text,
  size text,
  industry text,
  country text,
  state text,
  city text,
  logo_url text,
  enriched_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_enrichment_workspace ON public.company_enrichment(workspace_id);
CREATE INDEX IF NOT EXISTS idx_company_enrichment_domain ON public.company_enrichment(domain);
CREATE INDEX IF NOT EXISTS idx_company_enrichment_enriched_at ON public.company_enrichment(enriched_at);

-- Enable RLS
ALTER TABLE public.company_enrichment ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access company enrichment data for their workspace
CREATE POLICY "company_enrichment: workspace access"
  ON public.company_enrichment
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.team_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.team_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );









