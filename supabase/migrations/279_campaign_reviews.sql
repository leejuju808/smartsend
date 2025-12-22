-- Block 263 — Campaign Review Center v1
-- Pre-Launch Checklist, Spam/Risk Warnings, Missing Fields, Safety Gates

-- Campaign reviews table (log review results per campaign launch attempt)
CREATE TABLE IF NOT EXISTS public.campaign_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pass', 'warn', 'block')),
  score int NOT NULL CHECK (score >= 0 AND score <= 100),
  checks jsonb NOT NULL DEFAULT '[]'::jsonb, -- detailed result of each check
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_reviews_campaign ON public.campaign_reviews(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_reviews_workspace ON public.campaign_reviews(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaign_reviews_status ON public.campaign_reviews(status);
CREATE INDEX IF NOT EXISTS idx_campaign_reviews_created_at ON public.campaign_reviews(created_at DESC);

-- Enable RLS
ALTER TABLE public.campaign_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view reviews for campaigns in their workspace
CREATE POLICY "campaign_reviews_select_workspace" ON public.campaign_reviews
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
    )
    OR workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Service role can insert reviews
CREATE POLICY "campaign_reviews_insert_service" ON public.campaign_reviews
  FOR INSERT
  WITH CHECK (true);









