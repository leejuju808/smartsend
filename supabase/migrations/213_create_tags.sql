-- Block 207 — Lead Tagging System v1
-- Creates tags table and lead_tag_links join table for CRM-grade tagging

CREATE TABLE IF NOT EXISTS public.lead_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_tags_workspace ON public.lead_tags(workspace_id);

-- Pivot table (many-to-many)
CREATE TABLE IF NOT EXISTS public.lead_tag_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id uuid REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(lead_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_tag_links_lead ON public.lead_tag_links(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tag_links_tag ON public.lead_tag_links(tag_id);










