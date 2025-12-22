-- Block 23280 — SmartSend Quality & Reliability Monitoring v1
-- Error Logs • Performance Metrics • Reliability Alerts • Beta Issue Tracker
-- This is the internal shield that protects SmartSend during Silent Forge

-- ============================================================================
-- Layer 1 — Global Error Logging System
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- payments, documents, ai, automations, jobs, materials, scheduling, field_app, homeowner_portal, etc.
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')) DEFAULT 'error',
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb, -- stack trace, context, user_id, job_id, lead_id, etc.
  resolved_at TIMESTAMPTZ, -- when issue was resolved
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_system_errors_source ON public.system_errors(source);
CREATE INDEX IF NOT EXISTS idx_system_errors_severity ON public.system_errors(severity);
CREATE INDEX IF NOT EXISTS idx_system_errors_created_at ON public.system_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_errors_critical_unresolved ON public.system_errors(severity, created_at DESC) 
  WHERE severity = 'critical' AND resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_system_errors_unresolved ON public.system_errors(created_at DESC) 
  WHERE resolved_at IS NULL;

-- GIN index for JSONB details queries
CREATE INDEX IF NOT EXISTS idx_system_errors_details ON public.system_errors USING gin(details);

-- RLS Policies
ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "service_role_full_access" ON public.system_errors
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can view errors (for internal dashboard)
CREATE POLICY "authenticated_view_errors" ON public.system_errors
  FOR SELECT TO authenticated
  USING (true);

-- Only service role can insert/update errors
CREATE POLICY "service_role_insert_errors" ON public.system_errors
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "service_role_update_errors" ON public.system_errors
  FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- Layer 2 — Performance Monitoring
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL, -- edge_function_duration_ms, ai_latency_ms, automation_queue_depth, forecast_update_runtime, etc.
  value NUMERIC NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb, -- function_name, source, user_id, job_id, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_system_metrics_label ON public.system_metrics(label);
CREATE INDEX IF NOT EXISTS idx_system_metrics_created_at ON public.system_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_label_created ON public.system_metrics(label, created_at DESC);

-- RLS Policies
ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "service_role_full_access_metrics" ON public.system_metrics
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can view metrics
CREATE POLICY "authenticated_view_metrics" ON public.system_metrics
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- Layer 3 — Beta Issue Tracker (Internal Board)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.beta_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('critical', 'major', 'minor', 'improvement')),
  title TEXT NOT NULL,
  description TEXT,
  source TEXT, -- which system/feature reported this
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'shipped')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  priority INTEGER DEFAULT 0, -- higher = more urgent
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_beta_issues_category ON public.beta_issues(category);
CREATE INDEX IF NOT EXISTS idx_beta_issues_status ON public.beta_issues(status);
CREATE INDEX IF NOT EXISTS idx_beta_issues_created_at ON public.beta_issues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beta_issues_open ON public.beta_issues(status, priority DESC, created_at DESC) 
  WHERE status IN ('open', 'in_progress');

-- RLS Policies
ALTER TABLE public.beta_issues ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "service_role_full_access_issues" ON public.beta_issues
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can view and create issues
CREATE POLICY "authenticated_view_issues" ON public.beta_issues
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_create_issues" ON public.beta_issues
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_issues" ON public.beta_issues
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_beta_issues_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_beta_issues_updated_at
BEFORE UPDATE ON public.beta_issues
FOR EACH ROW
EXECUTE FUNCTION update_beta_issues_updated_at();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function: Log System Error
CREATE OR REPLACE FUNCTION public.fn_log_system_error(
  p_source TEXT,
  p_severity TEXT DEFAULT 'error',
  p_message TEXT,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  error_id UUID;
BEGIN
  INSERT INTO public.system_errors (
    source,
    severity,
    message,
    details
  ) VALUES (
    p_source,
    p_severity,
    p_message,
    p_details
  )
  RETURNING id INTO error_id;
  
  RETURN error_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_log_system_error TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_log_system_error TO authenticated;

-- Function: Record System Metric
CREATE OR REPLACE FUNCTION public.fn_record_metric(
  p_label TEXT,
  p_value NUMERIC,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  metric_id UUID;
BEGIN
  INSERT INTO public.system_metrics (
    label,
    value,
    metadata
  ) VALUES (
    p_label,
    p_value,
    p_metadata
  )
  RETURNING id INTO metric_id;
  
  RETURN metric_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_record_metric TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_record_metric TO authenticated;

-- Function: Create Beta Issue
CREATE OR REPLACE FUNCTION public.fn_create_beta_issue(
  p_category TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_reported_by UUID DEFAULT NULL,
  p_priority INTEGER DEFAULT 0,
  p_tags TEXT[] DEFAULT '{}',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  issue_id UUID;
BEGIN
  INSERT INTO public.beta_issues (
    category,
    title,
    description,
    source,
    reported_by,
    priority,
    tags,
    metadata
  ) VALUES (
    p_category,
    p_title,
    p_description,
    p_source,
    p_reported_by,
    p_priority,
    p_tags,
    p_metadata
  )
  RETURNING id INTO issue_id;
  
  RETURN issue_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_create_beta_issue TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_create_beta_issue TO authenticated;

-- ============================================================================
-- Database Trigger: Auto-Alert on Critical Errors
-- ============================================================================

-- Function to trigger alert on critical error
CREATE OR REPLACE FUNCTION public.fn_trigger_critical_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  alert_url TEXT;
  alert_payload JSONB;
BEGIN
  -- Only trigger for critical errors
  IF NEW.severity = 'critical' AND (OLD IS NULL OR OLD.severity != 'critical') THEN
    -- Build alert payload
    alert_payload := json_build_object(
      'error_id', NEW.id::text,
      'source', NEW.source,
      'message', NEW.message,
      'created_at', NEW.created_at::text,
      'details', NEW.details
    );
    
    -- Get alert function URL from environment or use default
    alert_url := current_setting('app.alert_function_url', true);
    IF alert_url IS NULL OR alert_url = '' THEN
      -- Default: construct URL from current database URL
      alert_url := current_setting('app.supabase_url', true) || '/functions/v1/system-alert';
    END IF;
    
    -- Call alert edge function via pg_net (requires pg_net extension)
    -- If pg_net is not available, this will fail silently and alerts can be sent via cron job
    BEGIN
      PERFORM net.http_post(
        url := alert_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
        ),
        body := alert_payload::text
      );
    EXCEPTION WHEN OTHERS THEN
      -- If pg_net is not available, log to system_logs for manual processing
      INSERT INTO public.system_logs (
        category,
        level,
        message,
        context
      ) VALUES (
        'reliability_alerts',
        'warn',
        'Failed to trigger critical error alert automatically - pg_net may not be available',
        jsonb_build_object(
          'error_id', NEW.id::text,
          'source', NEW.source,
          'alert_url', alert_url,
          'pg_net_error', SQLERRM
        )
      );
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_critical_error_alert ON public.system_errors;
CREATE TRIGGER trg_critical_error_alert
AFTER INSERT OR UPDATE ON public.system_errors
FOR EACH ROW
EXECUTE FUNCTION public.fn_trigger_critical_alert();

-- ============================================================================
-- Dashboard Views
-- ============================================================================

-- View: Today's Error Summary
CREATE OR REPLACE VIEW public.view_today_errors AS
SELECT 
  COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
  COUNT(*) FILTER (WHERE severity = 'error') as error_count,
  COUNT(*) FILTER (WHERE severity = 'warning') as warning_count,
  COUNT(*) FILTER (WHERE severity = 'info') as info_count,
  COUNT(*) as total_count,
  COUNT(DISTINCT source) as sources_affected
FROM public.system_errors
WHERE created_at >= CURRENT_DATE;

-- View: Errors by Source (Last 24h)
CREATE OR REPLACE VIEW public.view_errors_by_source AS
SELECT 
  source,
  severity,
  COUNT(*) as error_count,
  MAX(created_at) as last_occurrence
FROM public.system_errors
WHERE created_at >= now() - interval '24 hours'
GROUP BY source, severity
ORDER BY error_count DESC;

-- View: Critical Unresolved Errors
CREATE OR REPLACE VIEW public.view_critical_unresolved AS
SELECT 
  id,
  source,
  message,
  details,
  created_at,
  EXTRACT(EPOCH FROM (now() - created_at)) / 3600 as hours_open
FROM public.system_errors
WHERE severity = 'critical' 
  AND resolved_at IS NULL
ORDER BY created_at DESC;

-- View: Performance Metrics Summary (Last Hour)
CREATE OR REPLACE VIEW public.view_metrics_summary AS
SELECT 
  label,
  COUNT(*) as sample_count,
  AVG(value) as avg_value,
  MIN(value) as min_value,
  MAX(value) as max_value,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95_value,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value) as p99_value,
  MAX(created_at) as last_recorded
FROM public.system_metrics
WHERE created_at >= now() - interval '1 hour'
GROUP BY label
ORDER BY label;

-- View: Beta Issues Summary
CREATE OR REPLACE VIEW public.view_beta_issues_summary AS
SELECT 
  category,
  status,
  COUNT(*) as issue_count,
  MAX(created_at) as last_created
FROM public.beta_issues
GROUP BY category, status
ORDER BY 
  CASE category 
    WHEN 'critical' THEN 1
    WHEN 'major' THEN 2
    WHEN 'minor' THEN 3
    WHEN 'improvement' THEN 4
  END,
  CASE status
    WHEN 'open' THEN 1
    WHEN 'in_progress' THEN 2
    WHEN 'resolved' THEN 3
    WHEN 'shipped' THEN 4
  END;

-- Grant access to views
GRANT SELECT ON public.view_today_errors TO authenticated;
GRANT SELECT ON public.view_errors_by_source TO authenticated;
GRANT SELECT ON public.view_critical_unresolved TO authenticated;
GRANT SELECT ON public.view_metrics_summary TO authenticated;
GRANT SELECT ON public.view_beta_issues_summary TO authenticated;

-- ============================================================================
-- Health Check RPC Functions
-- ============================================================================

-- Function: Get Automation Health
CREATE OR REPLACE FUNCTION public.get_automation_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'jobs_processed', COALESCE((
      SELECT COUNT(*)::integer
      FROM public.system_metrics
      WHERE label = 'automation_job_processed'
        AND created_at >= now() - interval '24 hours'
    ), 0),
    'failures', COALESCE((
      SELECT COUNT(*)::integer
      FROM public.system_errors
      WHERE source = 'automations'
        AND severity IN ('error', 'critical')
        AND created_at >= now() - interval '24 hours'
    ), 0),
    'avg_execution_time_ms', COALESCE((
      SELECT AVG(value)::numeric
      FROM public.system_metrics
      WHERE label = 'automation_execution_time_ms'
        AND created_at >= now() - interval '24 hours'
    ), 0)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Function: Get AI Health
CREATE OR REPLACE FUNCTION public.get_ai_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'insights_generated', COALESCE((
      SELECT COUNT(*)::integer
      FROM public.system_metrics
      WHERE label = 'ai_insight_generated'
        AND created_at >= now() - interval '24 hours'
    ), 0),
    'failures', COALESCE((
      SELECT COUNT(*)::integer
      FROM public.system_errors
      WHERE source = 'ai'
        AND severity IN ('error', 'critical')
        AND created_at >= now() - interval '24 hours'
    ), 0),
    'avg_time_ms', COALESCE((
      SELECT AVG(value)::numeric
      FROM public.system_metrics
      WHERE label = 'ai_latency_ms'
        AND created_at >= now() - interval '24 hours'
    ), 0)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Function: Get Payments Health
CREATE OR REPLACE FUNCTION public.get_payments_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'payments_succeeded', COALESCE((
      SELECT COUNT(*)::integer
      FROM public.system_metrics
      WHERE label = 'payment_succeeded'
        AND created_at >= now() - interval '24 hours'
    ), 0),
    'payments_failed', COALESCE((
      SELECT COUNT(*)::integer
      FROM public.system_errors
      WHERE source = 'payments'
        AND severity IN ('error', 'critical')
        AND created_at >= now() - interval '24 hours'
    ), 0),
    'stripe_webhook_failures', COALESCE((
      SELECT COUNT(*)::integer
      FROM public.system_errors
      WHERE source = 'payments'
        AND details->>'type' = 'stripe_webhook'
        AND severity IN ('error', 'critical')
        AND created_at >= now() - interval '24 hours'
    ), 0)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Function: Get Field App Health
CREATE OR REPLACE FUNCTION public.get_field_app_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_uploads INTEGER;
  failed_uploads INTEGER;
  success_rate NUMERIC;
BEGIN
  SELECT COUNT(*)::integer INTO total_uploads
  FROM public.system_metrics
  WHERE label IN ('field_app_photo_upload', 'field_app_photo_upload_failed')
    AND created_at >= now() - interval '24 hours';
  
  SELECT COUNT(*)::integer INTO failed_uploads
  FROM public.system_errors
  WHERE source = 'field_app'
    AND details->>'type' = 'photo_upload'
    AND created_at >= now() - interval '24 hours';
  
  IF total_uploads > 0 THEN
    success_rate := ((total_uploads - failed_uploads)::numeric / total_uploads::numeric) * 100;
  ELSE
    success_rate := 100;
  END IF;
  
  RETURN jsonb_build_object(
    'photo_upload_success_rate', success_rate,
    'check_in_failures', COALESCE((
      SELECT COUNT(*)::integer
      FROM public.system_errors
      WHERE source = 'field_app'
        AND details->>'type' = 'check_in'
        AND created_at >= now() - interval '24 hours'
    ), 0)
  );
END;
$$;

-- Function: Get Documents Health
CREATE OR REPLACE FUNCTION public.get_documents_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'signed', COALESCE((
      SELECT COUNT(*)::integer
      FROM public.system_metrics
      WHERE label = 'document_signed'
        AND created_at >= now() - interval '24 hours'
    ), 0),
    'viewed', COALESCE((
      SELECT COUNT(*)::integer
      FROM public.system_metrics
      WHERE label = 'document_viewed'
        AND created_at >= now() - interval '24 hours'
    ), 0),
    'failed_sign_attempts', COALESCE((
      SELECT COUNT(*)::integer
      FROM public.system_errors
      WHERE source = 'documents'
        AND details->>'type' = 'sign_failed'
        AND created_at >= now() - interval '24 hours'
    ), 0)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_automation_health TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_health TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payments_health TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_field_app_health TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_documents_health TO authenticated;

-- ============================================================================
-- Sample Data/Comments
-- ============================================================================

COMMENT ON TABLE public.system_errors IS 'Global error logging system - every API error, database failure, automation failure, edge function crash, payment error, document signing error, scheduling conflict, and AI insight failure MUST be logged here';
COMMENT ON TABLE public.system_metrics IS 'Performance monitoring - tracks edge function execution time, database slow queries, API latency, automation delays, AI processing time';
COMMENT ON TABLE public.beta_issues IS 'Silent Forge Beta Issue Tracker - tracks critical issues, major issues, minor issues, and improvements during beta testing';

COMMENT ON COLUMN public.system_errors.source IS 'Source system: payments, documents, ai, automations, jobs, materials, scheduling, field_app, homeowner_portal, etc.';
COMMENT ON COLUMN public.system_errors.severity IS 'info, warning, error, critical - critical errors trigger instant alerts';
COMMENT ON COLUMN public.system_errors.details IS 'JSONB containing stack trace, context, user_id, job_id, lead_id, etc.';

COMMENT ON COLUMN public.system_metrics.label IS 'Metric name: edge_function_duration_ms, ai_latency_ms, automation_queue_depth, forecast_update_runtime, etc.';
COMMENT ON COLUMN public.system_metrics.value IS 'Numeric value of the metric';
COMMENT ON COLUMN public.system_metrics.metadata IS 'JSONB containing function_name, source, user_id, job_id, etc.';

COMMENT ON COLUMN public.beta_issues.category IS 'critical, major, minor, improvement';
COMMENT ON COLUMN public.beta_issues.status IS 'open, in_progress, resolved, shipped';

