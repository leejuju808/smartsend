-- Block 277 — Campaign Analytics v2
-- Campaign-level analytics snapshot table for fast UI loading
-- Migration: 296_campaign_analytics_v2.sql

-- ============================================================================
-- 1. Create campaign_analytics table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.campaign_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  data jsonb NOT NULL,              -- structured snapshot
  generated_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_workspace 
  ON public.campaign_analytics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_campaign 
  ON public.campaign_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_generated 
  ON public.campaign_analytics(generated_at DESC);

-- ============================================================================
-- 2. Enable RLS
-- ============================================================================

ALTER TABLE public.campaign_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Team members can view analytics for campaigns in their workspace
CREATE POLICY "campaign_analytics: select workspace members"
  ON public.campaign_analytics FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM public.team_members 
      WHERE user_id = auth.uid()
    )
    AND campaign_id IN (
      SELECT id 
      FROM public.campaigns 
      WHERE workspace_id = campaign_analytics.workspace_id
    )
  );

-- Service role has full access (for edge function)
CREATE POLICY "campaign_analytics: service role full access"
  ON public.campaign_analytics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 3. Comments for documentation
-- ============================================================================

COMMENT ON TABLE public.campaign_analytics IS 'Campaign-level analytics snapshot for fast UI loading. Updated 1-2 times per hour by generate-campaign-analytics-v2 edge function.';
COMMENT ON COLUMN public.campaign_analytics.data IS 'JSONB snapshot containing: overall metrics, steps array, variants array, reply_reasons object, conversion rates';
COMMENT ON COLUMN public.campaign_analytics.generated_at IS 'Timestamp when analytics were last generated';








