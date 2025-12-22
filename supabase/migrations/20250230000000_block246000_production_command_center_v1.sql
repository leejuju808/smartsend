-- =========================================================
-- Block 246000 — SmartSend Roofing "Production Command Center v1" 
-- The Master Control Room for Roofing Operations
-- =========================================================
-- 
-- This is the block that makes SmartSend feel like a national-level enterprise system.
-- This is how you make every roofer feel STUPID for not using SmartSend.
--
-- Production Command Center provides:
-- - All jobs in motion
-- - Status of every crew
-- - Material order status
-- - Weather risks
-- - Supplier delivery ETA
-- - Job delays
-- - Issue reports
-- - Change orders
-- - Customer communication status
-- - Scheduling conflicts
-- - Equipment availability
-- - Job profitability risk
-- - AI recommendations & alerts

-- ============================================================================
-- PART 1 — CREATE job_alerts TABLE
-- ============================================================================
-- Centralized alert system for production issues

CREATE TABLE IF NOT EXISTS public.job_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  type text NOT NULL CHECK (type IN (
    'delay',
    'weather',
    'material_shortage',
    'cost_risk',
    'safety_risk',
    'crew_issue',
    'scheduling_conflict',
    'customer_communication',
    'equipment_unavailable',
    'profitability_risk',
    'change_order_pending',
    'inspection_required',
    'payment_issue',
    'other'
  )),
  
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  is_resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_alerts_workspace ON public.job_alerts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_alerts_job ON public.job_alerts(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_alerts_crew ON public.job_alerts(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_alerts_type ON public.job_alerts(type);
CREATE INDEX IF NOT EXISTS idx_job_alerts_severity ON public.job_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_job_alerts_resolved ON public.job_alerts(is_resolved);
CREATE INDEX IF NOT EXISTS idx_job_alerts_created ON public.job_alerts(created_at DESC);

-- ============================================================================
-- PART 2 — CREATE job_dependencies TABLE
-- ============================================================================
-- Track what each job depends on before it can proceed

CREATE TABLE IF NOT EXISTS public.job_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  
  dependency_type text NOT NULL CHECK (dependency_type IN (
    'materials',
    'crew',
    'equipment',
    'inspection',
    'payment',
    'weather',
    'permit',
    'customer_approval',
    'change_order',
    'other'
  )),
  
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_progress',
    'completed',
    'blocked',
    'cancelled'
  )),
  
  description text,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  expected_completion_date date,
  actual_completion_date date,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_dependencies_workspace ON public.job_dependencies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_dependencies_job ON public.job_dependencies(job_id);
CREATE INDEX IF NOT EXISTS idx_job_dependencies_type ON public.job_dependencies(dependency_type);
CREATE INDEX IF NOT EXISTS idx_job_dependencies_status ON public.job_dependencies(status);
CREATE INDEX IF NOT EXISTS idx_job_dependencies_expected_date ON public.job_dependencies(expected_completion_date) WHERE expected_completion_date IS NOT NULL;

-- ============================================================================
-- PART 3 — CREATE production_events TABLE
-- ============================================================================
-- Real-time event feed for production operations

CREATE TABLE IF NOT EXISTS public.production_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  event_type text NOT NULL CHECK (event_type IN (
    'job_started',
    'job_delayed',
    'job_resumed',
    'job_completed',
    'job_inspected',
    'crew_assigned',
    'crew_arrived',
    'crew_departed',
    'crew_clock_in',
    'crew_clock_out',
    'material_ordered',
    'material_delivered',
    'material_verified',
    'material_shortage',
    'issue_reported',
    'issue_resolved',
    'change_order_created',
    'change_order_approved',
    'inspection_scheduled',
    'inspection_completed',
    'payment_received',
    'customer_contacted',
    'weather_alert',
    'safety_incident',
    'equipment_issue',
    'schedule_updated',
    'other'
  )),
  
  details jsonb DEFAULT '{}'::jsonb,
  message text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_events_workspace ON public.production_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_production_events_job ON public.production_events(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_production_events_crew ON public.production_events(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_production_events_type ON public.production_events(event_type);
CREATE INDEX IF NOT EXISTS idx_production_events_created ON public.production_events(created_at DESC);

-- ============================================================================
-- PART 4 — TRIGGERS
-- ============================================================================

-- Update updated_at on job_alerts
CREATE OR REPLACE FUNCTION update_job_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_alerts_updated_at ON public.job_alerts;
CREATE TRIGGER trg_job_alerts_updated_at
BEFORE UPDATE ON public.job_alerts
FOR EACH ROW
EXECUTE FUNCTION update_job_alerts_updated_at();

-- Update updated_at on job_dependencies
CREATE OR REPLACE FUNCTION update_job_dependencies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_dependencies_updated_at ON public.job_dependencies;
CREATE TRIGGER trg_job_dependencies_updated_at
BEFORE UPDATE ON public.job_dependencies
FOR EACH ROW
EXECUTE FUNCTION update_job_dependencies_updated_at();

-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY
-- ============================================================================

-- job_alerts RLS
ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view job alerts in their workspace"
  ON public.job_alerts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create job alerts in their workspace"
  ON public.job_alerts FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update job alerts in their workspace"
  ON public.job_alerts FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- job_dependencies RLS
ALTER TABLE public.job_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view job dependencies in their workspace"
  ON public.job_dependencies FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage job dependencies in their workspace"
  ON public.job_dependencies FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- production_events RLS
ALTER TABLE public.production_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view production events in their workspace"
  ON public.production_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create production events in their workspace"
  ON public.production_events FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 6 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.job_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_dependencies TO authenticated;
GRANT SELECT, INSERT ON public.production_events TO authenticated;

-- ============================================================================
-- PART 7 — HELPER FUNCTIONS FOR COMMAND CENTER
-- ============================================================================

-- Function to get command center summary stats
CREATE OR REPLACE FUNCTION get_production_command_center_summary(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'active_jobs', (
      SELECT COUNT(*)::int
      FROM public.roofing_jobs
      WHERE workspace_id = p_workspace_id
        AND status IN ('scheduled', 'in_progress')
    ),
    'jobs_at_risk', (
      SELECT COUNT(DISTINCT job_id)::int
      FROM public.job_alerts
      WHERE workspace_id = p_workspace_id
        AND is_resolved = false
        AND severity IN ('warning', 'critical')
        AND job_id IS NOT NULL
    ),
    'crews_working_today', (
      SELECT COUNT(DISTINCT crew_id)::int
      FROM public.production_events
      WHERE workspace_id = p_workspace_id
        AND event_type = 'crew_clock_in'
        AND DATE(created_at) = CURRENT_DATE
        AND crew_id IS NOT NULL
    ),
    'deliveries_today', (
      SELECT COUNT(*)::int
      FROM public.production_events
      WHERE workspace_id = p_workspace_id
        AND event_type = 'material_delivered'
        AND DATE(created_at) = CURRENT_DATE
    ),
    'weather_risks', (
      SELECT COUNT(*)::int
      FROM public.job_alerts
      WHERE workspace_id = p_workspace_id
        AND type = 'weather'
        AND is_resolved = false
    ),
    'open_issues', (
      SELECT COUNT(*)::int
      FROM public.job_alerts
      WHERE workspace_id = p_workspace_id
        AND is_resolved = false
        AND type IN ('crew_issue', 'safety_risk', 'material_shortage', 'delay')
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_production_command_center_summary IS 'Returns summary statistics for the Production Command Center dashboard';

























