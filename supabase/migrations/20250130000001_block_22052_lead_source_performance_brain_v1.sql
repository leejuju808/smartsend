-- ============================================================================
-- Block 22052 — SmartSend Roofing "Lead Source Performance Brain" v1
-- (🌎 Which Lead Sources Are Making Roofers Money — And Which Ones Are Burning Cash)
-- ============================================================================
-- FULL BLOCK. ZERO FLUFF. THIS FEATURE MAKES OWNERS SAY:
-- "SmartSend doesn't just run my sales… it tells me where to SPEND money and where to STOP."
--
-- This is a mission-critical intelligence layer for roofing companies.
--
-- Roofers constantly waste money because they DON'T KNOW:
-- - which sources produce real revenue
-- - which sources produce price-shoppers
-- - which sources create the most at-risk jobs
-- - which sources give them their highest close rates
-- - which sources produce high-margin jobs
-- - which sources should be CUT immediately
-- - which sources they should DOUBLE DOWN on
-- - which sources are worth paying for again next month
--
-- SmartSend will make lead source ROI undeniable.
-- ============================================================================

-- ============================================================================
-- 1. CREATE lead_source_performance TABLE
-- ============================================================================
-- This table stores aggregated performance metrics for each lead source per workspace

CREATE TABLE IF NOT EXISTS public.lead_source_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_source TEXT NOT NULL,

  -- Performance Metrics
  total_leads INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  active_leads INTEGER DEFAULT 0,

  close_rate NUMERIC(5,2), -- percentage (0-100)
  avg_job_size NUMERIC(12,2),
  total_revenue NUMERIC(12,2) DEFAULT 0,

  avg_health NUMERIC(5,2),
  avg_momentum NUMERIC(5,2),
  avg_experience NUMERIC(5,2),
  risk_low INTEGER DEFAULT 0,
  risk_med INTEGER DEFAULT 0,
  risk_high INTEGER DEFAULT 0,
  risk_critical INTEGER DEFAULT 0,

  lead_quality_score INTEGER DEFAULT 50, -- 0-100 composite score

  revenue_per_lead NUMERIC(12,2),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Unique constraint: one performance row per workspace + lead_source
  UNIQUE(workspace_id, lead_source)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_lead_source_performance_workspace 
  ON public.lead_source_performance(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_source_performance_source 
  ON public.lead_source_performance(lead_source);
CREATE INDEX IF NOT EXISTS idx_lead_source_performance_quality_score 
  ON public.lead_source_performance(lead_quality_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_lead_source_performance_revenue 
  ON public.lead_source_performance(total_revenue DESC NULLS LAST);

-- Add comments
COMMENT ON TABLE public.lead_source_performance IS 'Block 22052: Aggregated performance metrics per lead source per workspace. Real revenue intelligence for every source.';
COMMENT ON COLUMN public.lead_source_performance.lead_quality_score IS 'Block 22052: Composite score (0-100) combining close_rate, avg_health, avg_experience, and avg_momentum';
COMMENT ON COLUMN public.lead_source_performance.close_rate IS 'Block 22052: Close rate percentage (wins / total_leads * 100)';
COMMENT ON COLUMN public.lead_source_performance.revenue_per_lead IS 'Block 22052: Average revenue generated per lead (total_revenue / total_leads)';

-- ============================================================================
-- 2. CREATE lead_source_view (feeds analytics)
-- ============================================================================
-- This view aggregates all lead data by source for real-time analytics

CREATE OR REPLACE VIEW public.lead_source_view AS
SELECT
  workspace_id,
  lead_source,

  -- Volume metrics
  COUNT(*) as total_leads,
  COUNT(*) FILTER (WHERE status NOT IN ('won','lost')) as active_leads,
  COUNT(*) FILTER (WHERE status = 'won') as wins,
  COUNT(*) FILTER (WHERE status = 'lost') as losses,

  -- Close rate
  CASE 
    WHEN COUNT(*) = 0 THEN 0
    ELSE (COUNT(*) FILTER (WHERE status = 'won')::FLOAT / COUNT(*) * 100)
  END as close_rate,

  -- Revenue metrics
  AVG(COALESCE(estimated_job_value, estimated_value, 0)) 
    FILTER (WHERE status = 'won') as avg_job_size,
  SUM(COALESCE(estimated_job_value, estimated_value, 0)) 
    FILTER (WHERE status = 'won') as total_revenue,

  -- Health metrics
  AVG(job_health_score) as avg_health,
  AVG(momentum_score) as avg_momentum,
  AVG(homeowner_experience_score) as avg_experience,

  -- Risk distribution
  COUNT(*) FILTER (WHERE risk_category = 'low') as risk_low,
  COUNT(*) FILTER (WHERE risk_category = 'medium') as risk_med,
  COUNT(*) FILTER (WHERE risk_category = 'high') as risk_high,
  COUNT(*) FILTER (WHERE risk_category = 'critical') as risk_critical,

  -- Revenue per lead
  CASE 
    WHEN COUNT(*) = 0 THEN 0
    ELSE SUM(COALESCE(estimated_job_value, estimated_value, 0)) 
           FILTER (WHERE status = 'won')::FLOAT / COUNT(*)
  END as revenue_per_lead

FROM public.leads
WHERE lead_source IS NOT NULL
  AND workspace_id IS NOT NULL
GROUP BY workspace_id, lead_source;

-- Grant access
GRANT SELECT ON public.lead_source_view TO authenticated;
GRANT SELECT ON public.lead_source_view TO service_role;

COMMENT ON VIEW public.lead_source_view IS 'Block 22052: Real-time aggregated view of lead source performance metrics';

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.lead_source_performance ENABLE ROW LEVEL SECURITY;

-- Policy: Service role has full access (for edge functions)
CREATE POLICY "lead_source_performance_service_role_all"
  ON public.lead_source_performance
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can read performance for their workspace
CREATE POLICY "lead_source_performance_select_authenticated"
  ON public.lead_source_performance
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_source_performance.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. TRIGGER: Update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_lead_source_performance_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_lead_source_performance_updated_at 
  ON public.lead_source_performance;
CREATE TRIGGER trg_set_lead_source_performance_updated_at
  BEFORE UPDATE ON public.lead_source_performance
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lead_source_performance_updated_at();

-- ============================================================================
-- 5. FUNCTION: Calculate Lead Quality Score
-- ============================================================================
-- Simple V1 formula: (close_rate * 40) + (avg_health / 100 * 20) + 
--                     (avg_experience / 100 * 20) + (avg_momentum / 100 * 20)

CREATE OR REPLACE FUNCTION public.calculate_lead_quality_score(
  p_close_rate NUMERIC,
  p_avg_health NUMERIC,
  p_avg_experience NUMERIC,
  p_avg_momentum NUMERIC
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_quality NUMERIC;
BEGIN
  v_quality := 
    (COALESCE(p_close_rate, 0) * 0.40) +
    (COALESCE(p_avg_health, 50) / 100.0 * 20.0) +
    (COALESCE(p_avg_experience, 50) / 100.0 * 20.0) +
    (COALESCE(p_avg_momentum, 50) / 100.0 * 20.0);
  
  -- Clamp to 0-100 and round
  RETURN GREATEST(0, LEAST(100, ROUND(v_quality)));
END;
$$;

COMMENT ON FUNCTION public.calculate_lead_quality_score IS 'Block 22052: Calculates composite lead quality score (0-100) from close_rate, avg_health, avg_experience, and avg_momentum';

-- ============================================================================
-- 6. TRIGGER FUNCTION: Update lead source performance when leads change
-- ============================================================================
-- This function triggers the edge function to recalculate performance metrics
-- when relevant lead fields change

-- Ensure pg_net extension is available
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_update_lead_source_performance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _workspace_id UUID;
  _edge_base_url TEXT;
  _service_role_key TEXT;
  _payload JSONB;
BEGIN
  -- Get workspace_id from the lead
  _workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);
  
  -- Skip if no workspace_id
  IF _workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only trigger if relevant fields changed
  IF TG_OP = 'INSERT' THEN
    -- Always update on insert if lead_source is set
    IF NEW.lead_source IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only update if relevant fields changed
    IF (OLD.lead_source IS NOT DISTINCT FROM NEW.lead_source)
       AND (OLD.status IS NOT DISTINCT FROM NEW.status)
       AND (OLD.estimated_job_value IS NOT DISTINCT FROM NEW.estimated_job_value)
       AND (OLD.estimated_value IS NOT DISTINCT FROM NEW.estimated_value)
       AND (OLD.job_health_score IS NOT DISTINCT FROM NEW.job_health_score)
       AND (OLD.momentum_score IS NOT DISTINCT FROM NEW.momentum_score)
       AND (OLD.homeowner_experience_score IS NOT DISTINCT FROM NEW.homeowner_experience_score)
       AND (OLD.risk_category IS NOT DISTINCT FROM NEW.risk_category) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Build edge function URL
  _edge_base_url := COALESCE(
    current_setting('app.supabase_url', true),
    current_setting('app.public_supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/update-lead-source-performance';

  -- Get service role key
  _service_role_key := COALESCE(
    current_setting('app.supabase_service_role_key', true),
    current_setting('app.service_role_key', true)
  );

  -- Build payload
  _payload := jsonb_build_object('workspace_id', _workspace_id);

  -- Call edge function (fire and forget) if pg_net is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') 
     AND _edge_base_url IS NOT NULL THEN
    PERFORM net.http_post(
      url := _edge_base_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(_service_role_key, '')
      ),
      body := _payload
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the operation
    RAISE WARNING 'Failed to trigger update-lead-source-performance: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trg_update_lead_source_performance_insert ON public.leads;
DROP TRIGGER IF EXISTS trg_update_lead_source_performance_update ON public.leads;

-- Create trigger on INSERT
CREATE TRIGGER trg_update_lead_source_performance_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW
  WHEN (NEW.lead_source IS NOT NULL AND NEW.workspace_id IS NOT NULL)
  EXECUTE FUNCTION public.trigger_update_lead_source_performance();

-- Create trigger on UPDATE (only when relevant fields change)
CREATE TRIGGER trg_update_lead_source_performance_update
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  WHEN (
    (OLD.lead_source IS DISTINCT FROM NEW.lead_source)
    OR (OLD.status IS DISTINCT FROM NEW.status)
    OR (OLD.estimated_job_value IS DISTINCT FROM NEW.estimated_job_value)
    OR (OLD.estimated_value IS DISTINCT FROM NEW.estimated_value)
    OR (OLD.job_health_score IS DISTINCT FROM NEW.job_health_score)
    OR (OLD.momentum_score IS DISTINCT FROM NEW.momentum_score)
    OR (OLD.homeowner_experience_score IS DISTINCT FROM NEW.homeowner_experience_score)
    OR (OLD.risk_category IS DISTINCT FROM NEW.risk_category)
  )
  EXECUTE FUNCTION public.trigger_update_lead_source_performance();

COMMENT ON FUNCTION public.trigger_update_lead_source_performance IS 'Block 22052: Triggers edge function to update lead source performance when leads change';

