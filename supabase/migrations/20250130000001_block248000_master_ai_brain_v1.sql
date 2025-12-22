-- =========================================================
-- Block 248000 — Master AI Brain v1
-- One Unified Intelligence for Sales, Production, Estimating, Customers, Finance, and Forecasting
-- =========================================================
-- 
-- This is the block that makes SmartSend unstoppable.
-- SmartSend stops being a tool and becomes a living operating intelligence for roofing companies.
--
-- Features:
-- - Unified AI intelligence layer
-- - Cross-domain reasoning
-- - Event-driven prediction
-- - Multi-agent collaboration
-- - Smart workflow management
-- - Real-time company health scoring

-- ============================================================================
-- PART 1 — AI GLOBAL STATE TABLE
-- ============================================================================
-- Stores up-to-date summary of all live company data for AI reasoning

CREATE TABLE IF NOT EXISTS public.ai_global_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL, -- Primary identifier for multi-tenant
  company_id uuid, -- Optional: reference to roofing_companies if exists
  
  -- Global context summary (JSONB for flexible structure)
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Context includes:
  -- - job_status: summary of all jobs
  -- - crews: active crews and assignments
  -- - schedules: upcoming schedules
  -- - leads: pipeline status
  -- - marketing: campaign performance
  -- - profit_metrics: financial health
  -- - bills: outstanding invoices
  -- - materials: inventory status
  -- - weather_risks: upcoming weather concerns
  -- - customer_sentiment: overall satisfaction
  
  -- Metadata
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one global state per workspace
  UNIQUE(workspace_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_global_state_workspace ON public.ai_global_state(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_global_state_company ON public.ai_global_state(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_global_state_updated ON public.ai_global_state(updated_at DESC);

-- ============================================================================
-- PART 2 — AI EVENT STREAM TABLE
-- ============================================================================
-- Tracks every important event for AI reasoning

CREATE TABLE IF NOT EXISTS public.ai_event_stream (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid,
  
  -- Event classification
  event_type text NOT NULL, -- e.g., 'job_created', 'lead_replied', 'payment_received', 'weather_alert'
  event_category text NOT NULL, -- 'sales', 'production', 'finance', 'customer', 'marketing', 'weather', 'material'
  
  -- Event data
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Related entities
  related_lead_id uuid,
  related_job_id uuid,
  related_crew_id uuid,
  related_invoice_id uuid,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz, -- When AI processed this event
  importance_score numeric(3,2) DEFAULT 0.5 CHECK (importance_score >= 0 AND importance_score <= 1) -- 0-1 scale
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_event_stream_workspace ON public.ai_event_stream(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_event_stream_company ON public.ai_event_stream(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_event_stream_type ON public.ai_event_stream(event_type);
CREATE INDEX IF NOT EXISTS idx_ai_event_stream_category ON public.ai_event_stream(event_category);
CREATE INDEX IF NOT EXISTS idx_ai_event_stream_created ON public.ai_event_stream(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_event_stream_processed ON public.ai_event_stream(processed_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_event_stream_lead ON public.ai_event_stream(related_lead_id) WHERE related_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_event_stream_job ON public.ai_event_stream(related_job_id) WHERE related_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_event_stream_importance ON public.ai_event_stream(importance_score DESC);

-- ============================================================================
-- PART 3 — AI TASKS TABLE
-- ============================================================================
-- AI-generated tasks for the company

CREATE TABLE IF NOT EXISTS public.ai_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid,
  
  -- Task details
  type text NOT NULL, -- 'action', 'alert', 'recommendation', 'prediction', 'optimization'
  category text NOT NULL, -- 'sales', 'production', 'finance', 'customer', 'marketing', 'safety'
  title text NOT NULL,
  description text NOT NULL,
  
  -- Priority and status
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'dismissed', 'expired')),
  
  -- Related entities
  related_lead_id uuid,
  related_job_id uuid,
  related_crew_id uuid,
  related_invoice_id uuid,
  
  -- Action data (if task requires action)
  action_type text, -- 'reschedule', 'alert_crew', 'send_update', 'adjust_pricing', etc.
  action_data jsonb DEFAULT '{}'::jsonb,
  
  -- AI metadata
  confidence_score numeric(3,2) DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  reasoning text, -- AI explanation for this task
  model_version text DEFAULT 'v1',
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz, -- When task should be completed
  completed_at timestamptz,
  dismissed_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_tasks_workspace ON public.ai_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_company ON public.ai_tasks(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_tasks_status ON public.ai_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_priority ON public.ai_tasks(priority DESC);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_type ON public.ai_tasks(type);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_category ON public.ai_tasks(category);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_created ON public.ai_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_due ON public.ai_tasks(due_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_ai_tasks_lead ON public.ai_tasks(related_lead_id) WHERE related_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_tasks_job ON public.ai_tasks(related_job_id) WHERE related_job_id IS NOT NULL;

-- ============================================================================
-- PART 4 — AI COMPANY HEALTH SCORE TABLE
-- ============================================================================
-- Real-time company health score calculation

CREATE TABLE IF NOT EXISTS public.ai_company_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid,
  
  -- Overall health score (0-100)
  overall_score numeric(5,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- Component scores
  sales_score numeric(5,2) CHECK (sales_score >= 0 AND sales_score <= 100),
  production_score numeric(5,2) CHECK (production_score >= 0 AND production_score <= 100),
  financial_score numeric(5,2) CHECK (financial_score >= 0 AND financial_score <= 100),
  customer_score numeric(5,2) CHECK (customer_score >= 0 AND customer_score <= 100),
  backlog_score numeric(5,2) CHECK (backlog_score >= 0 AND backlog_score <= 100),
  weather_score numeric(5,2) CHECK (weather_score >= 0 AND weather_score <= 100),
  materials_score numeric(5,2) CHECK (materials_score >= 0 AND materials_score <= 100),
  
  -- Health status
  status text NOT NULL CHECK (status IN ('excellent', 'good', 'fair', 'poor', 'critical')),
  trend text NOT NULL CHECK (trend IN ('improving', 'stable', 'declining')),
  
  -- Key insights
  top_risks jsonb DEFAULT '[]'::jsonb, -- Array of risk objects
  top_opportunities jsonb DEFAULT '[]'::jsonb, -- Array of opportunity objects
  summary text, -- Human-readable summary
  
  -- Metadata
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, calculated_at) -- One score per workspace per calculation time
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_company_health_workspace ON public.ai_company_health(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_company_health_company ON public.ai_company_health(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_company_health_calculated ON public.ai_company_health(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_company_health_score ON public.ai_company_health(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_company_health_status ON public.ai_company_health(status);

-- ============================================================================
-- PART 5 — TRIGGERS AND FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_ai_global_state_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ai_global_state_updated_at
BEFORE UPDATE ON public.ai_global_state
FOR EACH ROW EXECUTE FUNCTION public.update_ai_global_state_updated_at();

-- Function to update ai_tasks updated_at
CREATE OR REPLACE FUNCTION public.update_ai_tasks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ai_tasks_updated_at
BEFORE UPDATE ON public.ai_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_ai_tasks_updated_at();

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.ai_global_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_event_stream ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_company_health ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Workspace members can view their workspace's AI data
CREATE POLICY "ai_global_state_workspace_members"
  ON public.ai_global_state FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_global_state.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "ai_event_stream_workspace_members"
  ON public.ai_event_stream FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_event_stream.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "ai_tasks_workspace_members"
  ON public.ai_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_tasks.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "ai_company_health_workspace_members"
  ON public.ai_company_health FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_company_health.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Service role can do everything (for system operations)
CREATE POLICY "ai_global_state_service_role"
  ON public.ai_global_state FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "ai_event_stream_service_role"
  ON public.ai_event_stream FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "ai_tasks_service_role"
  ON public.ai_tasks FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "ai_company_health_service_role"
  ON public.ai_company_health FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- RLS Policy: Allow workspace members to update tasks (mark complete, dismiss)
CREATE POLICY "ai_tasks_update_workspace_members"
  ON public.ai_tasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_tasks.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_tasks.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 7 — HELPER FUNCTIONS
-- ============================================================================

-- Function to get or create global state for a workspace
CREATE OR REPLACE FUNCTION public.get_or_create_ai_global_state(p_workspace_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_state_id uuid;
BEGIN
  SELECT id INTO v_state_id
  FROM public.ai_global_state
  WHERE workspace_id = p_workspace_id;
  
  IF v_state_id IS NULL THEN
    INSERT INTO public.ai_global_state (workspace_id, context)
    VALUES (p_workspace_id, '{}'::jsonb)
    RETURNING id INTO v_state_id;
  END IF;
  
  RETURN v_state_id;
END;
$$;

-- Function to log an AI event
CREATE OR REPLACE FUNCTION public.log_ai_event(
  p_workspace_id uuid,
  p_event_type text,
  p_event_category text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_related_lead_id uuid DEFAULT NULL,
  p_related_job_id uuid DEFAULT NULL,
  p_related_crew_id uuid DEFAULT NULL,
  p_importance_score numeric DEFAULT 0.5
)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_event_id uuid;
  v_company_id uuid;
BEGIN
  -- Try to get company_id from workspace if roofing_companies table exists
  SELECT id INTO v_company_id
  FROM public.roofing_companies
  WHERE workspace_id = p_workspace_id
  LIMIT 1;
  
  INSERT INTO public.ai_event_stream (
    workspace_id,
    company_id,
    event_type,
    event_category,
    payload,
    related_lead_id,
    related_job_id,
    related_crew_id,
    importance_score
  )
  VALUES (
    p_workspace_id,
    v_company_id,
    p_event_type,
    p_event_category,
    p_payload,
    p_related_lead_id,
    p_related_job_id,
    p_related_crew_id,
    p_importance_score
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

























