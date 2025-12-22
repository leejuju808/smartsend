-- Block 280 — Deals Performance v1
-- Deal Analytics Snapshot Table for CRM-quality pipeline analytics

-- Create deal_analytics table
CREATE TABLE IF NOT EXISTS public.deal_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  generated_at timestamptz DEFAULT now(),
  data jsonb NOT NULL
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_deal_analytics_workspace ON public.deal_analytics(workspace_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_analytics_generated ON public.deal_analytics(generated_at DESC);

-- Enable RLS
ALTER TABLE public.deal_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Team members can view analytics in their workspace
CREATE POLICY "deal_analytics: select workspace members"
  ON public.deal_analytics FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = deal_analytics.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Service role can insert (for edge function)
CREATE POLICY "deal_analytics: insert service role"
  ON public.deal_analytics FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE public.deal_analytics IS 'Snapshot table for deal analytics. Updated hourly by edge function.';
COMMENT ON COLUMN public.deal_analytics.data IS 'JSONB containing analytics data: totals, by_stage, stage_conversion, velocity, owner_splits, deal_sources';








