-- =========================================================
-- Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1
-- (LIVE PROFIT ANALYSIS • AI PRICE RECOMMENDATIONS • UNDERBID DETECTION • UPSALE SUGGESTIONS • JOB PROFIT HEALTH SCORE)
-- =========================================================
-- 
-- This block turns SmartSend into the financial brain of a roofing company.
-- Most roofing businesses don't know their TRUE profit on a job until weeks later...
-- ...and even when they do, it's WRONG because:
--   - labor wasn't tracked
--   - materials were over-ordered
--   - equipment wasn't logged
--   - crews took too long
--   - wrong price was quoted
--   - owner forgot to add profit margin
--   - storms caused price shifts
--
-- SmartSend will FIX ALL OF IT.

-- ============================================================================
-- PART 1 — CREATE profit_analysis TABLE
-- ============================================================================
-- Real-time profit calculation with estimated vs actual tracking

CREATE TABLE IF NOT EXISTS public.profit_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Estimated costs (from proposal/estimate)
  estimated_material_cost numeric(12,2) DEFAULT 0,
  estimated_labor_cost numeric(12,2) DEFAULT 0,
  estimated_equipment_cost numeric(12,2) DEFAULT 0,
  estimated_overhead_cost numeric(12,2) DEFAULT 0,
  
  -- Actual costs (from job execution)
  actual_material_cost numeric(12,2) DEFAULT 0,
  actual_labor_cost numeric(12,2) DEFAULT 0,
  actual_equipment_cost numeric(12,2) DEFAULT 0,
  actual_overhead_cost numeric(12,2) DEFAULT 0,
  
  -- Revenue
  revenue numeric(12,2) DEFAULT 0,
  
  -- Calculated profit metrics
  estimated_profit numeric(12,2) GENERATED ALWAYS AS (
    revenue - (
      COALESCE(estimated_material_cost, 0) +
      COALESCE(estimated_labor_cost, 0) +
      COALESCE(estimated_equipment_cost, 0) +
      COALESCE(estimated_overhead_cost, 0)
    )
  ) STORED,
  
  actual_profit numeric(12,2) GENERATED ALWAYS AS (
    revenue - (
      COALESCE(actual_material_cost, 0) +
      COALESCE(actual_labor_cost, 0) +
      COALESCE(actual_equipment_cost, 0) +
      COALESCE(actual_overhead_cost, 0)
    )
  ) STORED,
  
  -- Variance (actual - estimated)
  variance numeric(12,2) GENERATED ALWAYS AS (
    actual_profit - estimated_profit
  ) STORED,
  
  -- Margin percentage
  margin_percent numeric(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN revenue > 0 THEN
        ROUND(((actual_profit / revenue) * 100)::numeric, 2)
      ELSE 0
    END
  ) STORED,
  
  -- Health score (0-100)
  health_score int DEFAULT 0 CHECK (health_score >= 0 AND health_score <= 100),
  
  -- AI recommendations (JSONB for flexibility)
  ai_recommendations jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profit_analysis_job ON public.profit_analysis(job_id);
CREATE INDEX IF NOT EXISTS idx_profit_analysis_team ON public.profit_analysis(team_id);
CREATE INDEX IF NOT EXISTS idx_profit_analysis_health_score ON public.profit_analysis(health_score);
CREATE INDEX IF NOT EXISTS idx_profit_analysis_margin ON public.profit_analysis(margin_percent);
CREATE INDEX IF NOT EXISTS idx_profit_analysis_created ON public.profit_analysis(created_at DESC);

-- ============================================================================
-- PART 2 — CREATE pricing_recommendations TABLE
-- ============================================================================
-- AI-generated pricing recommendations for proposals

CREATE TABLE IF NOT EXISTS public.pricing_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Recommended prices
  recommended_price numeric(12,2) NOT NULL,
  minimum_price numeric(12,2) NOT NULL,
  high_value_price numeric(12,2), -- For high-value neighborhoods
  
  -- AI reasoning (JSONB for structured data)
  reasoning jsonb DEFAULT '{}'::jsonb,
  
  -- Context used for recommendation
  material_costs jsonb DEFAULT '{}'::jsonb,
  labor_rates jsonb DEFAULT '{}'::jsonb,
  historical_performance jsonb DEFAULT '{}'::jsonb,
  season text,
  complexity_score int,
  market_conditions jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_recommendations_job ON public.pricing_recommendations(job_id);
CREATE INDEX IF NOT EXISTS idx_pricing_recommendations_team ON public.pricing_recommendations(team_id);
CREATE INDEX IF NOT EXISTS idx_pricing_recommendations_created ON public.pricing_recommendations(created_at DESC);

-- ============================================================================
-- PART 3 — CREATE upsell_suggestions TABLE
-- ============================================================================
-- AI-generated upsell opportunities

CREATE TABLE IF NOT EXISTS public.upsell_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Upsell details
  suggestion text NOT NULL,
  category text CHECK (category IN (
    'shingles',
    'ventilation',
    'underlayment',
    'warranty',
    'gutters',
    'skylights',
    'maintenance',
    'other'
  )),
  
  -- Revenue impact
  estimated_revenue numeric(12,2) DEFAULT 0,
  estimated_cost numeric(12,2) DEFAULT 0,
  estimated_profit numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(estimated_revenue, 0) - COALESCE(estimated_cost, 0)
  ) STORED,
  
  -- Impact score (0-100)
  impact_score int DEFAULT 0 CHECK (impact_score >= 0 AND impact_score <= 100),
  
  -- Status
  status text DEFAULT 'suggested' CHECK (status IN (
    'suggested',
    'presented',
    'accepted',
    'declined',
    'expired'
  )),
  
  -- Context
  reasoning text,
  homeowner_budget_indicators jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  presented_at timestamptz,
  accepted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_upsell_suggestions_job ON public.upsell_suggestions(job_id);
CREATE INDEX IF NOT EXISTS idx_upsell_suggestions_team ON public.upsell_suggestions(team_id);
CREATE INDEX IF NOT EXISTS idx_upsell_suggestions_status ON public.upsell_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_upsell_suggestions_impact_score ON public.upsell_suggestions(impact_score DESC);
CREATE INDEX IF NOT EXISTS idx_upsell_suggestions_created ON public.upsell_suggestions(created_at DESC);

-- ============================================================================
-- PART 4 — CREATE underbid_detections TABLE
-- ============================================================================
-- Track detected underbids and corrections

CREATE TABLE IF NOT EXISTS public.underbid_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Detection details
  proposed_price numeric(12,2) NOT NULL,
  minimum_profitable_price numeric(12,2) NOT NULL,
  potential_loss numeric(12,2) GENERATED ALWAYS AS (
    GREATEST(minimum_profitable_price - proposed_price, 0)
  ) STORED,
  
  -- Breakdown of missing costs
  missing_costs jsonb DEFAULT '{}'::jsonb,
  
  -- Suggested corrections
  suggested_corrections jsonb DEFAULT '{}'::jsonb,
  
  -- Risk factors
  risk_factors jsonb DEFAULT '[]'::jsonb,
  
  -- Status
  status text DEFAULT 'detected' CHECK (status IN (
    'detected',
    'corrected',
    'ignored',
    'sent_anyway'
  )),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  corrected_at timestamptz,
  corrected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_underbid_detections_job ON public.underbid_detections(job_id);
CREATE INDEX IF NOT EXISTS idx_underbid_detections_team ON public.underbid_detections(team_id);
CREATE INDEX IF NOT EXISTS idx_underbid_detections_status ON public.underbid_detections(status) WHERE status = 'detected';
CREATE INDEX IF NOT EXISTS idx_underbid_detections_created ON public.underbid_detections(created_at DESC);

-- ============================================================================
-- PART 5 — FUNCTIONS
-- ============================================================================

-- Function: Calculate profit health score (0-100)
CREATE OR REPLACE FUNCTION public.calculate_profit_health_score(
  p_margin_percent numeric,
  p_variance numeric,
  p_actual_profit numeric
)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_score int := 0;
BEGIN
  -- Base score from margin (0-50 points)
  IF p_margin_percent >= 40 THEN
    v_score := v_score + 50;
  ELSIF p_margin_percent >= 35 THEN
    v_score := v_score + 40;
  ELSIF p_margin_percent >= 30 THEN
    v_score := v_score + 30;
  ELSIF p_margin_percent >= 25 THEN
    v_score := v_score + 20;
  ELSIF p_margin_percent >= 20 THEN
    v_score := v_score + 10;
  END IF;
  
  -- Variance score (0-30 points)
  IF p_variance >= 0 THEN
    v_score := v_score + 30; -- On or above estimate
  ELSIF p_variance >= -500 THEN
    v_score := v_score + 20; -- Small variance
  ELSIF p_variance >= -1000 THEN
    v_score := v_score + 10; -- Medium variance
  -- Large variance gets 0 points
  END IF;
  
  -- Profit score (0-20 points)
  IF p_actual_profit > 0 THEN
    IF p_actual_profit >= 5000 THEN
      v_score := v_score + 20;
    ELSIF p_actual_profit >= 3000 THEN
      v_score := v_score + 15;
    ELSIF p_actual_profit >= 1000 THEN
      v_score := v_score + 10;
    ELSE
      v_score := v_score + 5;
    END IF;
  END IF;
  
  RETURN LEAST(v_score, 100);
END;
$$;

-- Function: Update profit analysis health score
CREATE OR REPLACE FUNCTION public.update_profit_health_score(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_analysis public.profit_analysis%rowtype;
  v_health_score int;
BEGIN
  SELECT * INTO v_analysis
  FROM public.profit_analysis
  WHERE job_id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  v_health_score := public.calculate_profit_health_score(
    v_analysis.margin_percent,
    v_analysis.variance,
    v_analysis.actual_profit
  );
  
  UPDATE public.profit_analysis
  SET health_score = v_health_score,
      updated_at = now()
  WHERE job_id = p_job_id;
END;
$$;

-- ============================================================================
-- PART 6 — TRIGGERS
-- ============================================================================

-- Trigger: Auto-update health score when profit analysis changes
CREATE OR REPLACE FUNCTION public.trigger_update_profit_health_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.update_profit_health_score(COALESCE(NEW.job_id, OLD.job_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_profit_health_score ON public.profit_analysis;
CREATE TRIGGER trg_update_profit_health_score
AFTER INSERT OR UPDATE ON public.profit_analysis
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_profit_health_score();

-- Trigger: Update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profit_analysis_updated_at ON public.profit_analysis;
CREATE TRIGGER trg_profit_analysis_updated_at
BEFORE UPDATE ON public.profit_analysis
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_pricing_recommendations_updated_at ON public.pricing_recommendations;
CREATE TRIGGER trg_pricing_recommendations_updated_at
BEFORE UPDATE ON public.pricing_recommendations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_upsell_suggestions_updated_at ON public.upsell_suggestions;
CREATE TRIGGER trg_upsell_suggestions_updated_at
BEFORE UPDATE ON public.upsell_suggestions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.profit_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upsell_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.underbid_detections ENABLE ROW LEVEL SECURITY;

-- Profit analysis: Team members can access
CREATE POLICY "profit_analysis_team_member" ON public.profit_analysis
  FOR ALL USING (
    team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = profit_analysis.team_id AND user_id = auth.uid()
    )
  );

-- Pricing recommendations: Team members can access
CREATE POLICY "pricing_recommendations_team_member" ON public.pricing_recommendations
  FOR ALL USING (
    team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = pricing_recommendations.team_id AND user_id = auth.uid()
    )
  );

-- Upsell suggestions: Team members can access
CREATE POLICY "upsell_suggestions_team_member" ON public.upsell_suggestions
  FOR ALL USING (
    team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = upsell_suggestions.team_id AND user_id = auth.uid()
    )
  );

-- Underbid detections: Team members can access
CREATE POLICY "underbid_detections_team_member" ON public.underbid_detections
  FOR ALL USING (
    team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = underbid_detections.team_id AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profit_analysis TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upsell_suggestions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.underbid_detections TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_profit_health_score(numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_profit_health_score(uuid) TO authenticated;

-- ============================================================================
-- PART 9 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.profit_analysis IS 'Block 61000: Real-time profit calculation with estimated vs actual tracking';
COMMENT ON TABLE public.pricing_recommendations IS 'Block 61000: AI-generated pricing recommendations for proposals';
COMMENT ON TABLE public.upsell_suggestions IS 'Block 61000: AI-generated upsell opportunities';
COMMENT ON TABLE public.underbid_detections IS 'Block 61000: Track detected underbids and corrections';
COMMENT ON FUNCTION public.calculate_profit_health_score IS 'Block 61000: Calculate profit health score (0-100)';
COMMENT ON FUNCTION public.update_profit_health_score IS 'Block 61000: Update profit analysis health score';





























