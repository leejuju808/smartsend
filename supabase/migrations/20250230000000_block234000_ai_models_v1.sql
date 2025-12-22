-- =========================================================
-- Block 234000 — SmartSend AI Models v1
-- Personalization, Detection, Forecasting, Scoring
-- =========================================================
-- 
-- This is the AI SUPERCHARGER that makes SmartSend unstoppable.
-- SmartSend becomes not just software, but an AI that runs the roofing company.
--
-- Features:
-- - AI Personalization Engine
-- - AI Lead Scoring
-- - AI Job Profitability Forecasting
-- - AI Safety Risk Detection
-- - AI Supplement Justification Engine
-- - AI Production Delay Prediction
-- - AI Customer Communication Engine

-- ============================================================================
-- PART 1 — AI LEAD SCORES TABLE
-- ============================================================================
-- Stores AI predictions for lead close probability

CREATE TABLE IF NOT EXISTS public.ai_lead_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  workspace_id uuid,
  team_id uuid,
  
  -- Scoring data
  score numeric NOT NULL CHECK (score >= 0 AND score <= 100), -- 0-100
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1), -- 0-1
  classification text NOT NULL CHECK (classification IN ('hot', 'warm', 'cold')), -- hot (80-100), warm (50-79), cold (0-49)
  reason text NOT NULL, -- explanation of the score
  
  -- Metadata
  model_version text DEFAULT 'v1',
  factors jsonb DEFAULT '{}'::jsonb, -- factors that influenced the score
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_lead_scores_lead_id ON public.ai_lead_scores(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_lead_scores_workspace_id ON public.ai_lead_scores(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_lead_scores_team_id ON public.ai_lead_scores(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_lead_scores_classification ON public.ai_lead_scores(classification);
CREATE INDEX IF NOT EXISTS idx_ai_lead_scores_score ON public.ai_lead_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_lead_scores_created_at ON public.ai_lead_scores(created_at DESC);

-- Foreign keys (handle if tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_lead_scores_lead_id_fkey'
    ) THEN
      ALTER TABLE public.ai_lead_scores
        ADD CONSTRAINT ai_lead_scores_lead_id_fkey
        FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_lead_scores_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.ai_lead_scores
        ADD CONSTRAINT ai_lead_scores_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'teams') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_lead_scores_team_id_fkey'
    ) THEN
      ALTER TABLE public.ai_lead_scores
        ADD CONSTRAINT ai_lead_scores_team_id_fkey
        FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 2 — AI JOB FORECASTS TABLE
-- ============================================================================
-- Stores AI predictions for job profitability and risk

CREATE TABLE IF NOT EXISTS public.ai_job_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  workspace_id uuid,
  team_id uuid,
  
  -- Forecast data
  predicted_profit numeric NOT NULL DEFAULT 0,
  predicted_margin numeric NOT NULL CHECK (predicted_margin >= -100 AND predicted_margin <= 100), -- percentage
  predicted_cost numeric NOT NULL DEFAULT 0,
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_factors jsonb DEFAULT '[]'::jsonb, -- array of risk factors
  
  -- Recommendations
  recommendations jsonb DEFAULT '[]'::jsonb, -- array of recommended actions
  
  -- Metadata
  model_version text DEFAULT 'v1',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_job_forecasts_job_id ON public.ai_job_forecasts(job_id);
CREATE INDEX IF NOT EXISTS idx_ai_job_forecasts_workspace_id ON public.ai_job_forecasts(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_job_forecasts_team_id ON public.ai_job_forecasts(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_job_forecasts_risk_level ON public.ai_job_forecasts(risk_level);
CREATE INDEX IF NOT EXISTS idx_ai_job_forecasts_created_at ON public.ai_job_forecasts(created_at DESC);

-- Foreign keys
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_job_forecasts_job_id_fkey'
    ) THEN
      ALTER TABLE public.ai_job_forecasts
        ADD CONSTRAINT ai_job_forecasts_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_job_forecasts_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.ai_job_forecasts
        ADD CONSTRAINT ai_job_forecasts_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'teams') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_job_forecasts_team_id_fkey'
    ) THEN
      ALTER TABLE public.ai_job_forecasts
        ADD CONSTRAINT ai_job_forecasts_team_id_fkey
        FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 3 — AI SAFETY PREDICTIONS TABLE
-- ============================================================================
-- Stores AI predictions for safety risks

CREATE TABLE IF NOT EXISTS public.ai_safety_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid,
  job_id uuid,
  workspace_id uuid,
  team_id uuid,
  
  -- Prediction data
  risk_score numeric NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100), -- 0-100
  risk_factors jsonb DEFAULT '[]'::jsonb, -- array of risk factors
  recommended_actions jsonb DEFAULT '[]'::jsonb, -- array of recommended actions
  
  -- Metadata
  model_version text DEFAULT 'v1',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_safety_predictions_crew_id ON public.ai_safety_predictions(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_safety_predictions_job_id ON public.ai_safety_predictions(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_safety_predictions_workspace_id ON public.ai_safety_predictions(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_safety_predictions_team_id ON public.ai_safety_predictions(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_safety_predictions_risk_score ON public.ai_safety_predictions(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_safety_predictions_created_at ON public.ai_safety_predictions(created_at DESC);

-- Foreign keys
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crews') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_safety_predictions_crew_id_fkey'
    ) THEN
      ALTER TABLE public.ai_safety_predictions
        ADD CONSTRAINT ai_safety_predictions_crew_id_fkey
        FOREIGN KEY (crew_id) REFERENCES public.crews(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_safety_predictions_job_id_fkey'
    ) THEN
      ALTER TABLE public.ai_safety_predictions
        ADD CONSTRAINT ai_safety_predictions_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_safety_predictions_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.ai_safety_predictions
        ADD CONSTRAINT ai_safety_predictions_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'teams') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_safety_predictions_team_id_fkey'
    ) THEN
      ALTER TABLE public.ai_safety_predictions
        ADD CONSTRAINT ai_safety_predictions_team_id_fkey
        FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 4 — AI SUPPLEMENTS GENERATED TABLE
-- ============================================================================
-- Stores AI-generated supplement justifications

CREATE TABLE IF NOT EXISTS public.ai_supplements_generated (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  supplement_id uuid,
  workspace_id uuid,
  team_id uuid,
  
  -- Generated content
  justification text NOT NULL, -- full justification text
  code_references jsonb DEFAULT '[]'::jsonb, -- array of code references
  xactimate_logic text, -- Xactimate-specific logic
  missing_items jsonb DEFAULT '[]'::jsonb, -- array of missing line items
  
  -- Metadata
  model_version text DEFAULT 'v1',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_supplements_generated_job_id ON public.ai_supplements_generated(job_id);
CREATE INDEX IF NOT EXISTS idx_ai_supplements_generated_supplement_id ON public.ai_supplements_generated(supplement_id) WHERE supplement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_supplements_generated_workspace_id ON public.ai_supplements_generated(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_supplements_generated_team_id ON public.ai_supplements_generated(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_supplements_generated_created_at ON public.ai_supplements_generated(created_at DESC);

-- Foreign keys
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_supplements_generated_job_id_fkey'
    ) THEN
      ALTER TABLE public.ai_supplements_generated
        ADD CONSTRAINT ai_supplements_generated_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'insurance_supplements') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_supplements_generated_supplement_id_fkey'
    ) THEN
      ALTER TABLE public.ai_supplements_generated
        ADD CONSTRAINT ai_supplements_generated_supplement_id_fkey
        FOREIGN KEY (supplement_id) REFERENCES public.insurance_supplements(id) ON DELETE SET NULL;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_supplements_generated_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.ai_supplements_generated
        ADD CONSTRAINT ai_supplements_generated_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'teams') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_supplements_generated_team_id_fkey'
    ) THEN
      ALTER TABLE public.ai_supplements_generated
        ADD CONSTRAINT ai_supplements_generated_team_id_fkey
        FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 5 — AI COMMUNICATION LOGS TABLE
-- ============================================================================
-- Stores AI communication generation logs for transparency

CREATE TABLE IF NOT EXISTS public.ai_communication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  team_id uuid,
  
  -- Communication data
  module text NOT NULL, -- 'personalize', 'summarize', 'suggest_reply', etc.
  input text NOT NULL, -- input text/context
  output text NOT NULL, -- generated output
  metadata jsonb DEFAULT '{}'::jsonb, -- additional metadata
  
  -- Metadata
  model_version text DEFAULT 'v1',
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_communication_logs_workspace_id ON public.ai_communication_logs(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_communication_logs_team_id ON public.ai_communication_logs(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_communication_logs_module ON public.ai_communication_logs(module);
CREATE INDEX IF NOT EXISTS idx_ai_communication_logs_created_at ON public.ai_communication_logs(created_at DESC);

-- Foreign keys
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_communication_logs_workspace_id_fkey'
    ) THEN
      ALTER TABLE public.ai_communication_logs
        ADD CONSTRAINT ai_communication_logs_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'teams') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'ai_communication_logs_team_id_fkey'
    ) THEN
      ALTER TABLE public.ai_communication_logs
        ADD CONSTRAINT ai_communication_logs_team_id_fkey
        FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 6 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_ai_tables_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply triggers
DROP TRIGGER IF EXISTS trg_ai_lead_scores_updated_at ON public.ai_lead_scores;
CREATE TRIGGER trg_ai_lead_scores_updated_at
  BEFORE UPDATE ON public.ai_lead_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ai_tables_updated_at();

DROP TRIGGER IF EXISTS trg_ai_job_forecasts_updated_at ON public.ai_job_forecasts;
CREATE TRIGGER trg_ai_job_forecasts_updated_at
  BEFORE UPDATE ON public.ai_job_forecasts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ai_tables_updated_at();

DROP TRIGGER IF EXISTS trg_ai_safety_predictions_updated_at ON public.ai_safety_predictions;
CREATE TRIGGER trg_ai_safety_predictions_updated_at
  BEFORE UPDATE ON public.ai_safety_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ai_tables_updated_at();

DROP TRIGGER IF EXISTS trg_ai_supplements_generated_updated_at ON public.ai_supplements_generated;
CREATE TRIGGER trg_ai_supplements_generated_updated_at
  BEFORE UPDATE ON public.ai_supplements_generated
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ai_tables_updated_at();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.ai_lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_job_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_safety_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_supplements_generated ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_communication_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow workspace/team members to access their AI data
-- Note: These policies will be refined based on your specific auth model

-- AI Lead Scores
DROP POLICY IF EXISTS "ai_lead_scores_workspace_access" ON public.ai_lead_scores;
CREATE POLICY "ai_lead_scores_workspace_access"
  ON public.ai_lead_scores
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- AI Job Forecasts
DROP POLICY IF EXISTS "ai_job_forecasts_workspace_access" ON public.ai_job_forecasts;
CREATE POLICY "ai_job_forecasts_workspace_access"
  ON public.ai_job_forecasts
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- AI Safety Predictions
DROP POLICY IF EXISTS "ai_safety_predictions_workspace_access" ON public.ai_safety_predictions;
CREATE POLICY "ai_safety_predictions_workspace_access"
  ON public.ai_safety_predictions
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- AI Supplements Generated
DROP POLICY IF EXISTS "ai_supplements_generated_workspace_access" ON public.ai_supplements_generated;
CREATE POLICY "ai_supplements_generated_workspace_access"
  ON public.ai_supplements_generated
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- AI Communication Logs
DROP POLICY IF EXISTS "ai_communication_logs_workspace_access" ON public.ai_communication_logs;
CREATE POLICY "ai_communication_logs_workspace_access"
  ON public.ai_communication_logs
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — HELPER FUNCTIONS
-- ============================================================================

-- Get latest AI lead score for a lead
CREATE OR REPLACE FUNCTION public.get_latest_lead_score(p_lead_id uuid)
RETURNS TABLE (
  score numeric,
  confidence numeric,
  classification text,
  reason text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    als.score,
    als.confidence,
    als.classification,
    als.reason,
    als.created_at
  FROM public.ai_lead_scores als
  WHERE als.lead_id = p_lead_id
  ORDER BY als.created_at DESC
  LIMIT 1;
$$;

-- Get latest AI job forecast for a job
CREATE OR REPLACE FUNCTION public.get_latest_job_forecast(p_job_id uuid)
RETURNS TABLE (
  predicted_profit numeric,
  predicted_margin numeric,
  risk_level text,
  risk_factors jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    ajf.predicted_profit,
    ajf.predicted_margin,
    ajf.risk_level,
    ajf.risk_factors,
    ajf.created_at
  FROM public.ai_job_forecasts ajf
  WHERE ajf.job_id = p_job_id
  ORDER BY ajf.created_at DESC
  LIMIT 1;
$$;

























