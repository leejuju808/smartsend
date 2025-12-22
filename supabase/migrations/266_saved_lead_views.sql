-- Block 250: Lead List v3 - Saved Lead Views
-- Stores user-specific column configurations, filters, sorting, and saved views

CREATE TABLE IF NOT EXISTS public.saved_lead_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_saved_lead_views_workspace_user ON public.saved_lead_views(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_saved_lead_views_user ON public.saved_lead_views(user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_saved_lead_views_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saved_lead_views_updated_at ON public.saved_lead_views;
CREATE TRIGGER trg_saved_lead_views_updated_at
  BEFORE UPDATE ON public.saved_lead_views
  FOR EACH ROW
  EXECUTE FUNCTION public.set_saved_lead_views_updated_at();

-- RLS Policies
ALTER TABLE public.saved_lead_views ENABLE ROW LEVEL SECURITY;

-- Users can only see their own views or views in workspaces they belong to
CREATE POLICY "Users can view their own saved views"
  ON public.saved_lead_views
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Users can insert their own views
CREATE POLICY "Users can create their own saved views"
  ON public.saved_lead_views
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    (workspace_id IS NULL OR workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    ))
  );

-- Users can update their own views
CREATE POLICY "Users can update their own saved views"
  ON public.saved_lead_views
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own views
CREATE POLICY "Users can delete their own saved views"
  ON public.saved_lead_views
  FOR DELETE
  USING (user_id = auth.uid());









