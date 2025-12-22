-- Block 207 — Lead Tagging System v1 RLS
-- RLS policies for lead_tags and lead_tag_links tables

ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tag_links ENABLE ROW LEVEL SECURITY;

-- Read/create tags for workspace
CREATE POLICY "workspace_tag_read"
ON public.lead_tags FOR SELECT
USING (workspace_id = current_setting('app.current_workspace')::uuid);

CREATE POLICY "workspace_tag_insert"
ON public.lead_tags FOR INSERT
WITH CHECK (workspace_id = current_setting('app.current_workspace')::uuid);

-- Link read/create for leads in workspace
CREATE POLICY "workspace_tag_link_read"
ON public.lead_tag_links FOR SELECT
USING (
  lead_id IN (
    SELECT id FROM public.leads 
    WHERE workspace_id = current_setting('app.current_workspace')::uuid
  )
);

CREATE POLICY "workspace_tag_link_insert"
ON public.lead_tag_links FOR INSERT
WITH CHECK (
  lead_id IN (
    SELECT id FROM public.leads 
    WHERE workspace_id = current_setting('app.current_workspace')::uuid
  )
);

CREATE POLICY "workspace_tag_link_delete"
ON public.lead_tag_links FOR DELETE
USING (
  lead_id IN (
    SELECT id FROM public.leads 
    WHERE workspace_id = current_setting('app.current_workspace')::uuid
  )
);










