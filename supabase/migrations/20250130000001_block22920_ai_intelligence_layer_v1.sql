-- =========================================================
-- Block 22920 — SmartSend Roofing AI Intelligence Layer v1
-- "Insights, Risks, Recommendations, Forecast Corrections."
-- =========================================================
-- 
-- This block creates the AI brain that sits on top of everything:
-- - Profit engine
-- - Forecast engine
-- - Production scheduling
-- - Material intelligence
-- - Field updates
-- - Homeowner portal
-- - Payments
-- 
-- The AI layer connects all of it and gives roofers:
-- - Real-time insights
-- - Early warnings
-- - Predictive losses
-- - Smart recommendations
-- - Automated schedule adjustments
-- - Material risk flags
-- - Crew productivity insights

-- ============================================================================
-- PART 1 — CREATE ai_insights TABLE
-- ============================================================================
-- Central table for storing AI-generated insights, risks, and recommendations

CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,

  category text CHECK (category IN (
    'margin_risk',
    'schedule_risk',
    'material_risk',
    'labor_risk',
    'payment_risk',
    'forecast_update',
    'general_insight'
  )) NOT NULL,

  severity text CHECK (severity IN ('info','warning','critical')) DEFAULT 'info',

  message text NOT NULL,
  recommendation text,

  created_at timestamptz DEFAULT now(),
  resolved boolean DEFAULT false,
  resolved_at timestamptz
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_ai_insights_workspace ON public.ai_insights(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_job ON public.ai_insights(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_insights_category ON public.ai_insights(category);
CREATE INDEX IF NOT EXISTS idx_ai_insights_severity ON public.ai_insights(severity);
CREATE INDEX IF NOT EXISTS idx_ai_insights_resolved ON public.ai_insights(resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_ai_insights_created_at ON public.ai_insights(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view insights for jobs in their workspace
CREATE POLICY "ai_insights_select" ON public.ai_insights
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_insights.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Service role can insert insights (for AI engine)
CREATE POLICY "ai_insights_insert" ON public.ai_insights
  FOR INSERT WITH CHECK (true);

-- RLS Policy: Users can update insights (mark as resolved, etc.)
CREATE POLICY "ai_insights_update" ON public.ai_insights
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_insights.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Comments for documentation
COMMENT ON TABLE public.ai_insights IS 'Block 22920: AI-generated insights, risks, and recommendations for roofing jobs';
COMMENT ON COLUMN public.ai_insights.category IS 'Type of insight: margin_risk, schedule_risk, material_risk, labor_risk, payment_risk, forecast_update, general_insight';
COMMENT ON COLUMN public.ai_insights.severity IS 'Severity level: info, warning, critical';
COMMENT ON COLUMN public.ai_insights.message IS 'Human-readable insight message';
COMMENT ON COLUMN public.ai_insights.recommendation IS 'Optional actionable recommendation';

-- ============================================================================
-- PART 2 — FUNCTION TO TRIGGER AI ANALYSIS
-- ============================================================================
-- This function calls the AI intelligence engine when job data changes

-- Ensure pg_net extension is available for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_ai_intel_analysis()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  func_url text;
  payload jsonb;
  job_workspace_id uuid;
BEGIN
  -- Get workspace_id from the job
  IF TG_OP = 'UPDATE' THEN
    job_workspace_id := NEW.workspace_id;
  ELSIF TG_OP = 'INSERT' THEN
    job_workspace_id := NEW.workspace_id;
  ELSE
    RETURN NEW;
  END IF;

  -- Only trigger for active jobs
  IF NEW.status IN ('cancelled', 'completed') THEN
    RETURN NEW;
  END IF;

  -- Build the edge function URL
  func_url := COALESCE(
    current_setting('app.supabase_url', true),
    current_setting('app.public_supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/ai-intel-engine';

  -- Build payload
  payload := jsonb_build_object(
    'job_id', NEW.id,
    'workspace_id', job_workspace_id
  );

  -- Call Edge Function via HTTP if pg_net is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    -- Fire and forget - don't wait for response
    PERFORM net.http_post(
      url := func_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(
          current_setting('app.supabase_service_role_key', true),
          current_setting('app.service_role_key', true)
        )
      ),
      body := payload
    );
  ELSE
    -- Log warning if pg_net is not available
    RAISE WARNING 'pg_net extension not available, cannot call ai-intel-engine function';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the update
    RAISE WARNING 'Failed to trigger ai-intel-engine: %', sqlerrm;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_ai_intel_analysis() IS 'Block 22920: Trigger function that calls AI intelligence engine when job data changes';

-- Create trigger on roofing_jobs table (after update)
DROP TRIGGER IF EXISTS trg_ai_intel_on_job_update ON public.roofing_jobs;
CREATE TRIGGER trg_ai_intel_on_job_update
  AFTER UPDATE OF 
    progress_percent,
    estimated_material_cost,
    estimated_labor_cost,
    job_value,
    supplement_amount,
    status,
    scheduled_start_date,
    scheduled_end_date
  ON public.roofing_jobs
  FOR EACH ROW
  WHEN (NEW.status NOT IN ('cancelled', 'completed'))
  EXECUTE FUNCTION public.trigger_ai_intel_analysis();

-- Also trigger on insert for new jobs
DROP TRIGGER IF EXISTS trg_ai_intel_on_job_insert ON public.roofing_jobs;
CREATE TRIGGER trg_ai_intel_on_job_insert
  AFTER INSERT ON public.roofing_jobs
  FOR EACH ROW
  WHEN (NEW.status NOT IN ('cancelled', 'completed'))
  EXECUTE FUNCTION public.trigger_ai_intel_analysis();

-- ============================================================================
-- PART 3 — TRIGGERS FOR RELATED DATA CHANGES
-- ============================================================================
-- Also trigger AI analysis when material orders, invoices, or field notes change

CREATE OR REPLACE FUNCTION public.trigger_ai_intel_on_related_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  func_url text;
  payload jsonb;
  job_workspace_id uuid;
  job_id_val uuid;
BEGIN
  -- Get job_id and workspace_id from the changed record
  IF TG_TABLE_NAME = 'material_orders' THEN
    job_id_val := NEW.job_id;
    job_workspace_id := NEW.workspace_id;
  ELSIF TG_TABLE_NAME = 'job_invoices' THEN
    job_id_val := NEW.job_id;
    job_workspace_id := NEW.workspace_id;
  ELSIF TG_TABLE_NAME = 'job_field_notes' THEN
    job_id_val := NEW.job_id;
    job_workspace_id := NEW.workspace_id;
  ELSE
    RETURN NEW;
  END IF;

  IF job_id_val IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build the edge function URL
  func_url := COALESCE(
    current_setting('app.supabase_url', true),
    current_setting('app.public_supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/ai-intel-engine';

  -- Build payload
  payload := jsonb_build_object(
    'job_id', job_id_val,
    'workspace_id', job_workspace_id
  );

  -- Call Edge Function via HTTP if pg_net is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    -- Fire and forget - don't wait for response
    PERFORM net.http_post(
      url := func_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(
          current_setting('app.supabase_service_role_key', true),
          current_setting('app.service_role_key', true)
        )
      ),
      body := payload
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger ai-intel-engine from %: %', TG_TABLE_NAME, sqlerrm;
    RETURN NEW;
END;
$$;

-- Trigger on material_orders changes
DROP TRIGGER IF EXISTS trg_ai_intel_on_material_order ON public.material_orders;
CREATE TRIGGER trg_ai_intel_on_material_order
  AFTER INSERT OR UPDATE ON public.material_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ai_intel_on_related_change();

-- Trigger on job_invoices changes
DROP TRIGGER IF EXISTS trg_ai_intel_on_invoice ON public.job_invoices;
CREATE TRIGGER trg_ai_intel_on_invoice
  AFTER INSERT OR UPDATE OF status ON public.job_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ai_intel_on_related_change();

-- Trigger on job_field_notes changes
DROP TRIGGER IF EXISTS trg_ai_intel_on_field_note ON public.job_field_notes;
CREATE TRIGGER trg_ai_intel_on_field_note
  AFTER INSERT ON public.job_field_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ai_intel_on_related_change();

