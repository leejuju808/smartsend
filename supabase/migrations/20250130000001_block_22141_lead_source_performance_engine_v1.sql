-- ============================================================================
-- Block 22141 — SmartSend Roofing "Lead Source Performance Engine v1"
-- 📊🧠 The AI system that automatically ranks, grades, and routes every lead 
-- source based on actual revenue, quality, tone, momentum, risk, and win-rate
-- ============================================================================
-- FULL BLOCK. MAX DEPTH. THIS IS ONE OF THE MOST PROFIT-GENERATING FEATURES.
--
-- Roofers CONSTANTLY waste money because they:
-- - don't know which lead sources perform
-- - send best leads to the wrong estimator
-- - overpay for bad sources
-- - under-invest in high-performing channels
-- - have no clue which source produces quality conversations
-- - can't see long-term revenue patterns
-- - don't understand real close-rate by source
-- - don't track homeowner sentiment across sources
--
-- SmartSend fixes all of this.
-- ============================================================================

-- ============================================================================
-- PART 1 — CREATE lead_source_stats TABLE
-- ============================================================================
-- Stores aggregated performance metrics for each lead source per workspace
-- Updated automatically via materialized view refresh and edge function

CREATE TABLE IF NOT EXISTS public.lead_source_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_name text NOT NULL,

  -- Core Revenue Metrics
  total_leads int DEFAULT 0,
  leads_won int DEFAULT 0,
  revenue_won numeric DEFAULT 0,
  avg_job_size numeric DEFAULT 0,
  close_rate numeric DEFAULT 0,

  -- Intelligence Metrics
  avg_health numeric DEFAULT 0,
  avg_momentum numeric DEFAULT 0,
  avg_experience numeric DEFAULT 0,
  avg_risk numeric DEFAULT 0,

  -- Behavior Metrics
  ghosting_rate numeric DEFAULT 0,
  dropoff_rate numeric DEFAULT 0,
  avg_days_to_close numeric DEFAULT 0,

  -- Estimator Compatibility
  best_estimator_id uuid,
  best_estimator_performance numeric DEFAULT 0,

  -- Grade (A/B/C/D/F) - calculated by edge function
  grade text DEFAULT 'C' CHECK (grade IN ('A+', 'A', 'B', 'C', 'D', 'F')),

  -- Timestamps
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),

  -- Unique constraint: one stat row per workspace + source
  UNIQUE(workspace_id, source_name)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_lead_source_stats_workspace 
  ON public.lead_source_stats(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_source_stats_source 
  ON public.lead_source_stats(source_name);
CREATE INDEX IF NOT EXISTS idx_lead_source_stats_grade 
  ON public.lead_source_stats(grade);
CREATE INDEX IF NOT EXISTS idx_lead_source_stats_revenue 
  ON public.lead_source_stats(revenue_won DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_lead_source_stats_close_rate 
  ON public.lead_source_stats(close_rate DESC NULLS LAST);

-- Comments
COMMENT ON TABLE public.lead_source_stats IS 'Block 22141: Aggregated performance metrics per lead source per workspace. The 12-signal system for lead source intelligence.';
COMMENT ON COLUMN public.lead_source_stats.grade IS 'Block 22141: Auto-graded A-F based on close_rate, avg_job_size, avg_health, avg_momentum, avg_experience, avg_risk, ghosting_rate, and dropoff_rate';
COMMENT ON COLUMN public.lead_source_stats.ghosting_rate IS 'Block 22141: Percentage of leads that go 48+ hours without homeowner reply';
COMMENT ON COLUMN public.lead_source_stats.dropoff_rate IS 'Block 22141: Percentage of leads that drop off in proposal_sent or follow_up stages';

-- ============================================================================
-- PART 2 — CREATE MATERIALIZED VIEW lead_source_performance_view
-- ============================================================================
-- Calculates all metrics automatically from leads table
-- This view feeds the lead_source_stats table

CREATE MATERIALIZED VIEW IF NOT EXISTS public.lead_source_performance_view AS
SELECT
  l.workspace_id,
  COALESCE(l.lead_source, 'Unknown') as source_name,

  -- Volume metrics
  COUNT(*) as total_leads,

  -- Win metrics
  COUNT(*) FILTER (WHERE l.status = 'won') as leads_won,

  -- Revenue metrics
  COALESCE(SUM(COALESCE(l.estimated_job_value, l.estimated_value, 0)) 
    FILTER (WHERE l.status = 'won'), 0) as revenue_won,
  COALESCE(AVG(COALESCE(l.estimated_job_value, l.estimated_value, 0)) 
    FILTER (WHERE l.status = 'won'), 0) as avg_job_size,

  -- Close rate
  CASE 
    WHEN COUNT(*) = 0 THEN 0
    ELSE 100.0 * COUNT(*) FILTER (WHERE l.status = 'won') / COUNT(*)
  END as close_rate,

  -- Intelligence metrics (averages)
  COALESCE(AVG(l.job_health_score), 0) as avg_health,
  COALESCE(AVG(l.momentum_score), 0) as avg_momentum,
  COALESCE(AVG(l.homeowner_experience_score), 0) as avg_experience,
  
  -- Risk score (convert category to numeric: critical=90, high=60, medium=30, low=0)
  COALESCE(AVG(
    CASE 
      WHEN l.risk_category = 'critical' THEN 90
      WHEN l.risk_category = 'high' THEN 60
      WHEN l.risk_category = 'medium' THEN 30
      ELSE 0
    END
  ), 0) as avg_risk,

  -- Ghosting rate (leads with 48+ hours since last homeowner reply)
  CASE 
    WHEN COUNT(*) = 0 THEN 0
    ELSE 100.0 * COUNT(*) FILTER (
      WHERE l.last_reply_at IS NOT NULL 
        AND EXTRACT(EPOCH FROM (NOW() - l.last_reply_at)) / 3600 >= 48
        AND l.status NOT IN ('won', 'lost')
    ) / NULLIF(COUNT(*) FILTER (WHERE l.status NOT IN ('won', 'lost')), 0)
  END as ghosting_rate,

  -- Dropoff rate (lost leads in proposal_sent or follow_up stages)
  CASE 
    WHEN COUNT(*) = 0 THEN 0
    ELSE 100.0 * COUNT(*) FILTER (
      WHERE l.status = 'lost' 
        AND l.pipeline_stage IN ('proposal_sent', 'follow_up', 'estimate_completed')
    ) / NULLIF(COUNT(*), 0)
  END as dropoff_rate,

  -- Average days to close (for won leads)
  COALESCE(AVG(
    CASE 
      WHEN l.status = 'won' AND l.stage_entered_at IS NOT NULL THEN
        EXTRACT(EPOCH FROM (l.updated_at - l.stage_entered_at)) / 86400
      WHEN l.status = 'won' THEN
        EXTRACT(EPOCH FROM (l.updated_at - l.created_at)) / 86400
      ELSE NULL
    END
  ) FILTER (WHERE l.status = 'won'), 0) as avg_days_to_close

FROM public.leads l
WHERE l.workspace_id IS NOT NULL
  AND l.lead_source IS NOT NULL
GROUP BY l.workspace_id, COALESCE(l.lead_source, 'Unknown');

-- Create unique index on materialized view for fast refreshes
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_source_performance_view_unique
  ON public.lead_source_performance_view(workspace_id, source_name);

-- Grant access
GRANT SELECT ON public.lead_source_performance_view TO authenticated;
GRANT SELECT ON public.lead_source_performance_view TO service_role;

COMMENT ON MATERIALIZED VIEW public.lead_source_performance_view IS 'Block 22141: Real-time aggregated view of lead source performance metrics. Refreshed by edge function.';

-- ============================================================================
-- PART 3 — FUNCTION: Refresh Materialized View
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_lead_source_performance_view()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.lead_source_performance_view;
END;
$$;

COMMENT ON FUNCTION public.refresh_lead_source_performance_view IS 'Block 22141: Refreshes the lead_source_performance_view materialized view';

-- ============================================================================
-- PART 4 — FUNCTION: Calculate Estimator Performance by Source
-- ============================================================================
-- Finds the best performing estimator for each source

CREATE OR REPLACE FUNCTION public.calculate_estimator_source_performance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_source_name text;
  v_best_estimator_id uuid;
  v_best_performance numeric;
BEGIN
  -- For each workspace + source combination
  FOR v_workspace_id, v_source_name IN 
    SELECT DISTINCT workspace_id, source_name 
    FROM public.lead_source_performance_view
  LOOP
    -- Find estimator with best close rate for this source
    SELECT 
      l.estimator_id,
      COALESCE(
        100.0 * COUNT(*) FILTER (WHERE l.status = 'won') / NULLIF(COUNT(*), 0),
        0
      ) as performance
    INTO v_best_estimator_id, v_best_performance
    FROM public.leads l
    WHERE l.workspace_id = v_workspace_id
      AND l.lead_source = v_source_name
      AND l.estimator_id IS NOT NULL
    GROUP BY l.estimator_id
    ORDER BY performance DESC
    LIMIT 1;

    -- Update lead_source_stats with best estimator
    UPDATE public.lead_source_stats
    SET 
      best_estimator_id = v_best_estimator_id,
      best_estimator_performance = COALESCE(v_best_performance, 0)
    WHERE workspace_id = v_workspace_id
      AND source_name = v_source_name;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.calculate_estimator_source_performance IS 'Block 22141: Calculates which estimator performs best for each lead source';

-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.lead_source_stats ENABLE ROW LEVEL SECURITY;

-- Policy: Service role has full access (for edge functions)
CREATE POLICY "lead_source_stats_service_role_all"
  ON public.lead_source_stats
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can read stats for their workspace
CREATE POLICY "lead_source_stats_select_authenticated"
  ON public.lead_source_stats
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_source_stats.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 6 — TRIGGER: Update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_lead_source_stats_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_lead_source_stats_updated_at ON public.lead_source_stats;
CREATE TRIGGER trg_set_lead_source_stats_updated_at
  BEFORE UPDATE ON public.lead_source_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lead_source_stats_updated_at();

-- ============================================================================
-- PART 7 — CREATE lead_source_recommendations TABLE
-- ============================================================================
-- Stores AI-generated recommendations for each source

CREATE TABLE IF NOT EXISTS public.lead_source_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_name text NOT NULL,

  -- Recommendation details
  recommendation_type text NOT NULL CHECK (
    recommendation_type IN (
      'increase_budget',
      'decrease_budget',
      'stop_buying',
      'move_spend',
      'change_routing',
      'optimize_followup',
      'improve_quality'
    )
  ),
  recommendation_text text NOT NULL,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  
  -- Supporting data
  supporting_data jsonb DEFAULT '{}'::jsonb,
  
  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'applied')),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Unique constraint: one active recommendation per workspace + source + type
  UNIQUE(workspace_id, source_name, recommendation_type, status)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_source_recommendations_workspace 
  ON public.lead_source_recommendations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_source_recommendations_status 
  ON public.lead_source_recommendations(status) 
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_lead_source_recommendations_priority 
  ON public.lead_source_recommendations(priority DESC, created_at DESC) 
  WHERE status = 'active';

-- RLS
ALTER TABLE public.lead_source_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_source_recommendations_service_role_all"
  ON public.lead_source_recommendations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "lead_source_recommendations_select_authenticated"
  ON public.lead_source_recommendations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_source_recommendations.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.lead_source_recommendations IS 'Block 22141: AI-generated recommendations for optimizing lead source performance';

-- ============================================================================
-- PART 8 — CREATE lead_source_routing_rules TABLE
-- ============================================================================
-- Stores intelligent routing rules based on source performance

CREATE TABLE IF NOT EXISTS public.lead_source_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_name text NOT NULL,

  -- Routing configuration
  default_estimator_id uuid,
  routing_strategy text DEFAULT 'best_performer' CHECK (
    routing_strategy IN (
      'best_performer',
      'highest_value',
      'fastest_response',
      'insurance_specialist',
      'persistence_strong',
      'manual'
    )
  ),
  
  -- Conditions
  min_job_value numeric,
  priority_boost int DEFAULT 0,
  
  -- Status
  is_active boolean DEFAULT true,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Unique constraint: one routing rule per workspace + source
  UNIQUE(workspace_id, source_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_source_routing_rules_workspace 
  ON public.lead_source_routing_rules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_source_routing_rules_active 
  ON public.lead_source_routing_rules(is_active) 
  WHERE is_active = true;

-- RLS
ALTER TABLE public.lead_source_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_source_routing_rules_service_role_all"
  ON public.lead_source_routing_rules
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "lead_source_routing_rules_select_authenticated"
  ON public.lead_source_routing_rules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_source_routing_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.lead_source_routing_rules IS 'Block 22141: Intelligent routing rules for leads based on source performance';









































