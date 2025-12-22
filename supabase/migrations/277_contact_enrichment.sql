-- Block 261 — Lead Enrichment Engine v1
-- Contact enrichment cache table (for future use)

CREATE TABLE IF NOT EXISTS public.contact_enrichment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  title text,
  linkedin_url text,
  enriched_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contact_enrichment_workspace ON public.contact_enrichment(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contact_enrichment_email ON public.contact_enrichment(email);
CREATE INDEX IF NOT EXISTS idx_contact_enrichment_enriched_at ON public.contact_enrichment(enriched_at);

-- Enable RLS
ALTER TABLE public.contact_enrichment ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access contact enrichment data for their workspace
CREATE POLICY "contact_enrichment: workspace access"
  ON public.contact_enrichment
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









