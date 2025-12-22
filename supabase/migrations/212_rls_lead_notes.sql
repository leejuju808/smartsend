-- Block 206 — Lead Notes v1 RLS
-- RLS policies for lead_notes table - workspace-scoped access

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

-- Workspace members can read notes for leads in their workspace
CREATE POLICY "workspace read"
ON public.lead_notes
FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id 
    FROM public.workspace_members 
    WHERE workspace_id = (
      SELECT workspace_id 
      FROM public.leads 
      WHERE id = lead_notes.lead_id
    )
  )
);

-- Workspace members can insert notes for leads in their workspace
CREATE POLICY "workspace insert"
ON public.lead_notes
FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT user_id 
    FROM public.workspace_members 
    WHERE workspace_id = (
      SELECT workspace_id 
      FROM public.leads 
      WHERE id = lead_notes.lead_id
    )
  )
);

-- Users can update their own notes
CREATE POLICY "workspace update"
ON public.lead_notes
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own notes
CREATE POLICY "workspace delete"
ON public.lead_notes
FOR DELETE
USING (auth.uid() = user_id);










