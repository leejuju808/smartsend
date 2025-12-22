-- Block 245000 — SmartSend Roofing "AI Company Assistant (Owner Mode) v1"
-- SmartSend Becomes the Owner's Brain
-- This block transforms SmartSend from 'software' into a TRUE business intelligence system

-- ============================================================
-- 1. AI QUERIES TABLE
-- ============================================================
-- Stores user questions and AI-generated answers
CREATE TABLE IF NOT EXISTS public.ai_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  context_data jsonb DEFAULT '{}'::jsonb, -- Store relevant data used for answer
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_queries_workspace ON public.ai_queries(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_queries_user ON public.ai_queries(user_id, created_at DESC);

-- ============================================================
-- 2. AI INSIGHTS TABLE
-- ============================================================
-- Stores AI-generated insights, warnings, and recommendations
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category text NOT NULL, -- 'profitability', 'risk', 'crew', 'sales', 'cashflow', 'marketing', 'optimization'
  insight text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  metadata jsonb DEFAULT '{}'::jsonb, -- Store related IDs, values, etc.
  acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_workspace ON public.ai_insights(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_category ON public.ai_insights(workspace_id, category);
CREATE INDEX IF NOT EXISTS idx_ai_insights_severity ON public.ai_insights(workspace_id, severity, created_at DESC) WHERE acknowledged = false;

-- ============================================================
-- 3. AI DAILY BRIEFINGS TABLE
-- ============================================================
-- Stores daily CEO briefings generated at 6 AM
CREATE TABLE IF NOT EXISTS public.ai_daily_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  content text NOT NULL, -- JSON or formatted text with briefing sections
  briefing_date date NOT NULL DEFAULT CURRENT_DATE,
  metrics jsonb DEFAULT '{}'::jsonb, -- Store key metrics for the day
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, briefing_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_daily_briefings_workspace ON public.ai_daily_briefings(workspace_id, briefing_date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_daily_briefings_date ON public.ai_daily_briefings(briefing_date DESC);

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

-- AI Queries: Users can only see queries from their workspace
ALTER TABLE public.ai_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_queries_workspace_members"
  ON public.ai_queries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_queries.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- AI Insights: Users can only see insights from their workspace
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_insights_workspace_members"
  ON public.ai_insights
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_insights.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- AI Daily Briefings: Users can only see briefings from their workspace
ALTER TABLE public.ai_daily_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_daily_briefings_workspace_members"
  ON public.ai_daily_briefings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_daily_briefings.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. HELPER FUNCTIONS
-- ============================================================

-- Function to get latest briefing for a workspace
CREATE OR REPLACE FUNCTION public.get_latest_briefing(p_workspace_id uuid)
RETURNS TABLE (
  id uuid,
  content text,
  briefing_date date,
  metrics jsonb,
  created_at timestamptz
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    adb.id,
    adb.content,
    adb.briefing_date,
    adb.metrics,
    adb.created_at
  FROM public.ai_daily_briefings adb
  WHERE adb.workspace_id = p_workspace_id
  ORDER BY adb.briefing_date DESC
  LIMIT 1;
$$;

-- Function to get unacknowledged critical insights
CREATE OR REPLACE FUNCTION public.get_critical_insights(p_workspace_id uuid)
RETURNS TABLE (
  id uuid,
  category text,
  insight text,
  severity text,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    ai.id,
    ai.category,
    ai.insight,
    ai.severity,
    ai.metadata,
    ai.created_at
  FROM public.ai_insights ai
  WHERE ai.workspace_id = p_workspace_id
    AND ai.acknowledged = false
    AND ai.severity IN ('warning', 'critical')
  ORDER BY 
    CASE ai.severity
      WHEN 'critical' THEN 1
      WHEN 'warning' THEN 2
    END,
    ai.created_at DESC
  LIMIT 20;
$$;

























