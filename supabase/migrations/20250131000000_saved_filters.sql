-- Saved Filters v1
-- Block 220: Reusable Filters for Inbox, Leads, Pipeline, Campaigns
-- Allows users to save, load, and share custom filters

CREATE TABLE IF NOT EXISTS public.saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  context text NOT NULL CHECK (context IN ('inbox', 'leads', 'pipeline', 'campaigns')),
  filter jsonb NOT NULL,
  shared boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_filters_workspace 
ON public.saved_filters(workspace_id);

CREATE INDEX IF NOT EXISTS idx_saved_filters_context 
ON public.saved_filters(workspace_id, context);

CREATE INDEX IF NOT EXISTS idx_saved_filters_created_by 
ON public.saved_filters(created_by);

-- Enable RLS
ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view filters in their workspace (shared or their own)
CREATE POLICY saved_filters_select ON public.saved_filters
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
    AND (
      shared = true 
      OR created_by = auth.uid()
    )
  );

-- Policy: Users can create filters in their workspace
CREATE POLICY saved_filters_insert ON public.saved_filters
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- Policy: Users can update their own filters
CREATE POLICY saved_filters_update ON public.saved_filters
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Policy: Users can delete their own filters
CREATE POLICY saved_filters_delete ON public.saved_filters
  FOR DELETE
  USING (created_by = auth.uid());










