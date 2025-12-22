-- ============================================================================
-- Block 80000 — SmartSend Roofing
-- "Job Value Predictor + Profit Probability AI" v1
-- ============================================================================
-- This block predicts which leads are worth chasing and which are a waste of time.
-- This turns SmartSend into a roofing business intelligence engine, not just a CRM.

-- ============================================================================
-- 1. AI Lead Value Predictions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lead_value_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL, -- Denormalized for faster queries
  
  -- Core Predictions
  predicted_job_value NUMERIC,      -- $ amount (e.g., 9800.00)
  predicted_job_value_min NUMERIC,  -- Lower bound (e.g., 9800.00)
  predicted_job_value_max NUMERIC,  -- Upper bound (e.g., 14200.00)
  close_probability NUMERIC,         -- 0 - 1 (e.g., 0.73)
  profit_score NUMERIC,              -- 0 - 100 (master metric)
  
  -- Priority & Reasoning
  recommended_priority TEXT NOT NULL DEFAULT 'Medium', -- "High", "Medium", "Low"
  reasoning TEXT,                    -- AI explanation
  
  -- Metadata
  prediction_model_version TEXT DEFAULT 'v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_lead_value_predictions_lead_id 
  ON public.lead_value_predictions(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_value_predictions_workspace 
  ON public.lead_value_predictions(workspace_id);

CREATE INDEX IF NOT EXISTS idx_lead_value_predictions_profit_score 
  ON public.lead_value_predictions(workspace_id, profit_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_lead_value_predictions_priority 
  ON public.lead_value_predictions(workspace_id, recommended_priority, profit_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_lead_value_predictions_close_probability 
  ON public.lead_value_predictions(workspace_id, close_probability DESC NULLS LAST);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_lead_value_predictions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_value_predictions_updated_at ON public.lead_value_predictions;
CREATE TRIGGER trg_lead_value_predictions_updated_at
BEFORE UPDATE ON public.lead_value_predictions
FOR EACH ROW
EXECUTE FUNCTION public.set_lead_value_predictions_updated_at();

-- RLS
ALTER TABLE public.lead_value_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lead value predictions are scoped to workspace"
  ON public.lead_value_predictions
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 2. Historical Job Outcomes (Training Data)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.job_history_training (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  company_id UUID,                    -- Optional: if multi-company support
  
  -- Job Details
  job_value NUMERIC NOT NULL,         -- Actual final job value
  job_type TEXT,                      -- "repair", "replacement", "insurance_claim"
  zipcode TEXT,                       -- ZIP code for neighborhood analysis
  source TEXT,                        -- "cold_email", "referral", "repeat", "storm"
  
  -- Campaign Context
  persona_used TEXT,                   -- Which persona was used
  campaign_id UUID,                   -- Which campaign generated this
  
  -- Timing Metrics
  response_time_minutes INTEGER,      -- Minutes from first contact to first reply
  estimate_speed_minutes INTEGER,     -- Minutes from reply to estimate sent
  
  -- Environmental Context
  weather_condition TEXT,             -- "storm", "normal", "seasonal"
  storm_category TEXT,                -- "hail", "wind", "hurricane", etc.
  
  -- Outcome
  closed BOOLEAN NOT NULL DEFAULT false, -- Did the job close?
  closed_at TIMESTAMPTZ,              -- When it closed
  
  -- Additional Context (JSONB for flexibility)
  metadata JSONB DEFAULT '{}'::jsonb, -- Store additional context
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for training queries
CREATE INDEX IF NOT EXISTS idx_job_history_workspace 
  ON public.job_history_training(workspace_id);

CREATE INDEX IF NOT EXISTS idx_job_history_zipcode 
  ON public.job_history_training(workspace_id, zipcode);

CREATE INDEX IF NOT EXISTS idx_job_history_source 
  ON public.job_history_training(workspace_id, source);

CREATE INDEX IF NOT EXISTS idx_job_history_closed 
  ON public.job_history_training(workspace_id, closed, closed_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_history_job_type 
  ON public.job_history_training(workspace_id, job_type);

-- RLS
ALTER TABLE public.job_history_training ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Job history training is scoped to workspace"
  ON public.job_history_training
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 3. Helper Function: Get Latest Prediction for Lead
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_lead_prediction(p_lead_id UUID)
RETURNS TABLE (
  id UUID,
  lead_id UUID,
  predicted_job_value NUMERIC,
  predicted_job_value_min NUMERIC,
  predicted_job_value_max NUMERIC,
  close_probability NUMERIC,
  profit_score NUMERIC,
  recommended_priority TEXT,
  reasoning TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lvp.id,
    lvp.lead_id,
    lvp.predicted_job_value,
    lvp.predicted_job_value_min,
    lvp.predicted_job_value_max,
    lvp.close_probability,
    lvp.profit_score,
    lvp.recommended_priority,
    lvp.reasoning,
    lvp.created_at
  FROM public.lead_value_predictions lvp
  WHERE lvp.lead_id = p_lead_id
  ORDER BY lvp.created_at DESC
  LIMIT 1;
END;
$$;

-- ============================================================================
-- 4. Helper Function: Get Training Stats by ZIP
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_zipcode_stats(
  p_workspace_id UUID,
  p_zipcode TEXT
)
RETURNS TABLE (
  zipcode TEXT,
  total_jobs BIGINT,
  closed_jobs BIGINT,
  avg_job_value NUMERIC,
  close_rate NUMERIC,
  avg_profit_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    jht.zipcode,
    COUNT(*)::BIGINT as total_jobs,
    COUNT(*) FILTER (WHERE jht.closed = true)::BIGINT as closed_jobs,
    AVG(jht.job_value) as avg_job_value,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        COUNT(*) FILTER (WHERE jht.closed = true)::NUMERIC / COUNT(*)::NUMERIC
      ELSE 0
    END as close_rate,
    NULL::NUMERIC as avg_profit_score -- Placeholder for future calculation
  FROM public.job_history_training jht
  WHERE jht.workspace_id = p_workspace_id
    AND jht.zipcode = p_zipcode
  GROUP BY jht.zipcode;
END;
$$;

-- ============================================================================
-- 5. Helper Function: Get Top ZIP Codes by Profit
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_top_profit_zipcodes(
  p_workspace_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  zipcode TEXT,
  total_jobs BIGINT,
  closed_jobs BIGINT,
  avg_job_value NUMERIC,
  close_rate NUMERIC,
  total_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    jht.zipcode,
    COUNT(*)::BIGINT as total_jobs,
    COUNT(*) FILTER (WHERE jht.closed = true)::BIGINT as closed_jobs,
    AVG(jht.job_value) FILTER (WHERE jht.closed = true) as avg_job_value,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        COUNT(*) FILTER (WHERE jht.closed = true)::NUMERIC / COUNT(*)::NUMERIC
      ELSE 0
    END as close_rate,
    SUM(jht.job_value) FILTER (WHERE jht.closed = true) as total_revenue
  FROM public.job_history_training jht
  WHERE jht.workspace_id = p_workspace_id
    AND jht.closed = true
  GROUP BY jht.zipcode
  ORDER BY total_revenue DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 6. Trigger: Auto-update workspace_id on prediction insert
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_lead_prediction_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If workspace_id is not set, get it from the lead
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
    FROM public.leads
    WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_prediction_workspace ON public.lead_value_predictions;
CREATE TRIGGER trg_sync_lead_prediction_workspace
BEFORE INSERT OR UPDATE ON public.lead_value_predictions
FOR EACH ROW
EXECUTE FUNCTION public.sync_lead_prediction_workspace();



























