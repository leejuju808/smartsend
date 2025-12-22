-- =========================================================
-- Block 22710 — SmartSend Roofing Production Alerts & Daily Crew Briefing v1
-- "Every morning, SmartSend tells the crews EXACTLY what's happening — before chaos can happen."
-- =========================================================
-- 
-- This block turns SmartSend into a real operations system, not a CRM:
-- - Daily crew briefings
-- - Production readiness alerts
-- - Material delay notifications
-- - Schedule change warnings
-- 
-- This is the contractor equivalent of a military command briefing + logistics system.

-- ============================================================================
-- PART 1 — CREATE production_alerts TABLE
-- ============================================================================
-- Used to store events like:
-- - Material delays
-- - Readiness changes
-- - Last-minute updates
-- - Weather risks
-- - Schedule changes

CREATE TABLE IF NOT EXISTS public.production_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  type text CHECK (type IN (
    'material_delay',
    'readiness_change',
    'weather_risk',
    'schedule_change',
    'job_unready'
  )) NOT NULL,
  
  severity text CHECK (severity IN ('info','warning','critical')) DEFAULT 'warning',
  message text NOT NULL,
  
  created_at timestamptz DEFAULT now(),
  is_read boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS production_alerts_workspace_idx
  ON public.production_alerts(workspace_id, created_at DESC);
  
CREATE INDEX IF NOT EXISTS production_alerts_job_idx
  ON public.production_alerts(job_id);
  
CREATE INDEX IF NOT EXISTS production_alerts_crew_idx
  ON public.production_alerts(crew_id);
  
CREATE INDEX IF NOT EXISTS production_alerts_unread_idx
  ON public.production_alerts(workspace_id, is_read, created_at DESC)
  WHERE is_read = false;

-- ============================================================================
-- PART 2 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.production_alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view alerts in their workspace
CREATE POLICY "alerts_select" ON public.production_alerts
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: System can insert alerts
CREATE POLICY "alerts_insert" ON public.production_alerts
  FOR INSERT WITH CHECK (true);

-- Policy: Users can update alerts in their workspace (mark as read)
CREATE POLICY "alerts_update" ON public.production_alerts
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 3 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.production_alerts TO authenticated;

-- ============================================================================
-- PART 4 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.production_alerts IS 'Production alerts for material delays, readiness changes, schedule updates, and weather risks';
COMMENT ON COLUMN public.production_alerts.type IS 'Type of alert: material_delay, readiness_change, weather_risk, schedule_change, job_unready';
COMMENT ON COLUMN public.production_alerts.severity IS 'Alert severity: info (green), warning (yellow), critical (red)';
COMMENT ON COLUMN public.production_alerts.is_read IS 'Whether the alert has been read by the owner';







































