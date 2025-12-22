-- Block 264 — SmartSend Insights v1
-- Executive Dashboard: Replies, Meetings, Deals, Health, Send Performance
-- Insights Cache Table for Fast Dashboard Loading

-- Create insights_cache table
CREATE TABLE IF NOT EXISTS public.insights_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  date timestamptz NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_insights_cache_workspace ON public.insights_cache(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insights_cache_date ON public.insights_cache(date DESC);
CREATE INDEX IF NOT EXISTS idx_insights_cache_workspace_date ON public.insights_cache(workspace_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_insights_cache_created ON public.insights_cache(created_at DESC);

-- Enable RLS
ALTER TABLE public.insights_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view insights for their workspace
DROP POLICY IF EXISTS "insights_cache_select_workspace" ON public.insights_cache;
CREATE POLICY "insights_cache_select_workspace" ON public.insights_cache
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
    )
    OR workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Service role can insert/update insights
DROP POLICY IF EXISTS "insights_cache_insert_service" ON public.insights_cache;
CREATE POLICY "insights_cache_insert_service" ON public.insights_cache
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "insights_cache_update_service" ON public.insights_cache;
CREATE POLICY "insights_cache_update_service" ON public.insights_cache
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Function to get latest insights for a workspace
CREATE OR REPLACE FUNCTION public.get_latest_insights(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_insights jsonb;
BEGIN
  SELECT data INTO v_insights
  FROM public.insights_cache
  WHERE workspace_id = p_workspace_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN COALESCE(v_insights, '{}'::jsonb);
END;
$$;









