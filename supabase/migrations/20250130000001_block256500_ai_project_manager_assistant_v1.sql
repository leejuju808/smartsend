-- =========================================================
-- Block 256500 — SmartSend AI Project Manager Assistant v1
-- "Daily PM Briefing, Task Prioritization, Red Flag Detection, Job Health Scores, PM Automation"
-- =========================================================
-- 
-- This block turns SmartSend into the digital project manager every roofing company desperately needs.
-- An AI assistant that monitors ALL active jobs, detects problems early, and tells PMs EXACTLY what to do each day.
-- 
-- Roofers will say:
-- "SmartSend is basically a second Project Manager."
-- "This stops so many fires before they start."
-- "We'd be stupid not using this."
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE project_managers TABLE
-- ============================================================================
-- Links to workforce_employees where role = 'project_manager'
-- Can also be standalone if needed

CREATE TABLE IF NOT EXISTS public.project_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  workforce_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_managers_company ON public.project_managers(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_project_managers_workforce ON public.project_managers(workforce_employee_id) WHERE workforce_employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_managers_user ON public.project_managers(user_id) WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.project_managers IS 'Project managers for roofing companies (Block 256500)';
COMMENT ON COLUMN public.project_managers.workforce_employee_id IS 'Optional link to workforce_employees table';

-- ============================================================================
-- PART 2 — CREATE pm_tasks TABLE
-- ============================================================================
-- Tasks assigned to PMs with priority and due dates

CREATE TABLE IF NOT EXISTS public.pm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pm_id uuid REFERENCES public.project_managers(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  task text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_tasks_pm ON public.pm_tasks(pm_id, status);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_job ON public.pm_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_priority ON public.pm_tasks(pm_id, priority, status) WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_pm_tasks_due_date ON public.pm_tasks(pm_id, due_date) WHERE status IN ('open', 'in_progress') AND due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pm_tasks_status ON public.pm_tasks(pm_id, status, created_at DESC);

COMMENT ON TABLE public.pm_tasks IS 'Tasks assigned to project managers (Block 256500)';

-- ============================================================================
-- PART 3 — CREATE job_health_scores TABLE
-- ============================================================================
-- Health scores (0-100) for jobs with detailed factors

CREATE TABLE IF NOT EXISTS public.job_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  score numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  status text NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'at_risk', 'critical')),
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- factors structure:
  -- {
  --   "material_availability": 85,
  --   "crew_performance": 90,
  --   "safety_compliance": 100,
  --   "delays": 75,
  --   "weather": 100,
  --   "customer_satisfaction": 80,
  --   "inspection_results": 95,
  --   "communication": 90,
  --   "punch_list_items": 100,
  --   "production_progress": 85
  -- }
  calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_health_scores_job ON public.job_health_scores(job_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_health_scores_status ON public.job_health_scores(job_id, status) WHERE calculated_at > now() - interval '7 days';
CREATE INDEX IF NOT EXISTS idx_job_health_scores_score ON public.job_health_scores(job_id, score DESC, calculated_at DESC);

COMMENT ON TABLE public.job_health_scores IS 'Health scores (0-100) for jobs with detailed factors (Block 256500)';

-- ============================================================================
-- PART 4 — CREATE pm_alerts TABLE
-- ============================================================================
-- Alerts and warnings for PMs

CREATE TABLE IF NOT EXISTS public.pm_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  pm_id uuid REFERENCES public.project_managers(id) ON DELETE SET NULL,
  alert_type text NOT NULL, -- 'material_shortage', 'weather_risk', 'crew_problem', 'customer_issue', 'delay', 'safety', 'inspection', 'punch_list', 'warranty', 'payment'
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical', 'warning', 'normal')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
  metadata jsonb DEFAULT '{}'::jsonb,
  -- metadata structure:
  -- {
  --   "material_type": "ridge_vent",
  --   "shortage_amount": 2,
  --   "estimated_hours_until_shortage": 3,
  --   "recommended_action": "express_order_from_beacon"
  -- }
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_alerts_job ON public.pm_alerts(job_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_alerts_pm ON public.pm_alerts(pm_id, status, severity) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pm_alerts_type ON public.pm_alerts(alert_type, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pm_alerts_severity ON public.pm_alerts(pm_id, severity, status) WHERE status = 'active' AND severity IN ('critical', 'warning');
CREATE INDEX IF NOT EXISTS idx_pm_alerts_created ON public.pm_alerts(pm_id, created_at DESC) WHERE status = 'active';

COMMENT ON TABLE public.pm_alerts IS 'Alerts and warnings for project managers (Block 256500)';

-- ============================================================================
-- PART 5 — CREATE crew_pm_communications TABLE
-- ============================================================================
-- Communication hub between crews and PMs

CREATE TABLE IF NOT EXISTS public.crew_pm_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  pm_id uuid REFERENCES public.project_managers(id) ON DELETE SET NULL,
  communication_type text NOT NULL CHECK (communication_type IN ('arrival', 'progress', 'material_request', 'safety_checklist', 'photo', 'issue', 'completion', 'other')),
  message text NOT NULL,
  photos jsonb DEFAULT '[]'::jsonb, -- Array of photo URLs
  metadata jsonb DEFAULT '{}'::jsonb,
  -- metadata structure varies by type:
  -- arrival: {"arrival_time": "2024-01-15T08:30:00Z", "crew_size": 4}
  -- material_request: {"material_type": "ice_water", "quantity": 2, "urgency": "high", "estimated_impact_hours": 1.5}
  -- issue: {"issue_type": "damage_discovered", "severity": "medium", "requires_pm_action": true}
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'resolved')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_pm_comm_job ON public.crew_pm_communications(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_pm_comm_pm ON public.crew_pm_communications(pm_id, status, created_at DESC) WHERE status = 'new';
CREATE INDEX IF NOT EXISTS idx_crew_pm_comm_crew ON public.crew_pm_communications(crew_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_pm_comm_type ON public.crew_pm_communications(communication_type, status) WHERE status = 'new';

COMMENT ON TABLE public.crew_pm_communications IS 'Communication hub between crews and project managers (Block 256500)';

-- ============================================================================
-- PART 6 — CREATE punch_list_items TABLE
-- ============================================================================
-- Punch list items for jobs

CREATE TABLE IF NOT EXISTS public.punch_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  item text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  assigned_to uuid REFERENCES public.project_managers(id) ON DELETE SET NULL,
  due_date date,
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_punch_list_job ON public.punch_list_items(job_id, status);
CREATE INDEX IF NOT EXISTS idx_punch_list_pm ON public.punch_list_items(assigned_to, status) WHERE status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_punch_list_due_date ON public.punch_list_items(job_id, due_date) WHERE status IN ('pending', 'in_progress') AND due_date IS NOT NULL;

COMMENT ON TABLE public.punch_list_items IS 'Punch list items for jobs (Block 256500)';

-- ============================================================================
-- PART 7 — CREATE pm_daily_briefings TABLE
-- ============================================================================
-- Daily AI-generated briefings for PMs

CREATE TABLE IF NOT EXISTS public.pm_daily_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pm_id uuid NOT NULL REFERENCES public.project_managers(id) ON DELETE CASCADE,
  briefing_date date NOT NULL DEFAULT CURRENT_DATE,
  summary text NOT NULL,
  -- AI-generated summary like:
  -- "Good morning — here is your SmartSend PM Briefing:
  -- • 4 jobs active today
  -- • 2 jobs delayed due to weather
  -- • Job #1098 missing drip edge delivery
  -- • Crew B missing 2 safety photos at Job #1103
  -- • Warranty claim #221 pending customer response
  -- • 3 customers require status updates"
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- metrics structure:
  -- {
  --   "active_jobs_count": 4,
  --   "delayed_jobs_count": 2,
  --   "critical_alerts_count": 1,
  --   "warning_alerts_count": 3,
  --   "pending_tasks_count": 8,
  --   "high_priority_tasks_count": 2,
  --   "material_issues_count": 1,
  --   "crew_communications_count": 5,
  --   "punch_list_items_pending": 3,
  --   "customer_updates_needed": 3
  -- }
  created_at timestamptz DEFAULT now(),
  UNIQUE(pm_id, briefing_date)
);

CREATE INDEX IF NOT EXISTS idx_pm_daily_briefings_pm ON public.pm_daily_briefings(pm_id, briefing_date DESC);
CREATE INDEX IF NOT EXISTS idx_pm_daily_briefings_date ON public.pm_daily_briefings(briefing_date DESC);

COMMENT ON TABLE public.pm_daily_briefings IS 'Daily AI-generated briefings for project managers (Block 256500)';

-- ============================================================================
-- PART 8 — CREATE FUNCTIONS
-- ============================================================================

-- Function: Calculate Job Health Score
CREATE OR REPLACE FUNCTION public.calculate_job_health_score(p_job_id uuid)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_score numeric := 100;
  v_factors jsonb := '{}'::jsonb;
  v_material_score numeric := 100;
  v_crew_score numeric := 100;
  v_safety_score numeric := 100;
  v_delay_score numeric := 100;
  v_weather_score numeric := 100;
  v_customer_score numeric := 100;
  v_inspection_score numeric := 100;
  v_communication_score numeric := 100;
  v_punch_list_score numeric := 100;
  v_progress_score numeric := 100;
  v_job_record RECORD;
  v_pending_punch_items int;
  v_critical_alerts int;
  v_warning_alerts int;
  v_material_issues int;
BEGIN
  -- Get job record
  SELECT * INTO v_job_record FROM public.jobs WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Material Availability Score (check for material shortages/alerts)
  SELECT COUNT(*) INTO v_material_issues
  FROM public.pm_alerts
  WHERE job_id = p_job_id
    AND alert_type = 'material_shortage'
    AND status = 'active'
    AND severity IN ('critical', 'warning');
  
  IF v_material_issues > 0 THEN
    v_material_score := GREATEST(0, 100 - (v_material_issues * 20));
  END IF;
  
  -- Crew Performance Score (check for crew alerts)
  SELECT COUNT(*) INTO v_critical_alerts
  FROM public.pm_alerts
  WHERE job_id = p_job_id
    AND alert_type = 'crew_problem'
    AND status = 'active'
    AND severity = 'critical';
  
  IF v_critical_alerts > 0 THEN
    v_crew_score := GREATEST(0, 100 - (v_critical_alerts * 30));
  END IF;
  
  -- Safety Compliance Score (assume 100 unless alerts exist)
  SELECT COUNT(*) INTO v_critical_alerts
  FROM public.pm_alerts
  WHERE job_id = p_job_id
    AND alert_type = 'safety'
    AND status = 'active'
    AND severity = 'critical';
  
  IF v_critical_alerts > 0 THEN
    v_safety_score := 50;
  END IF;
  
  -- Delay Score (check for delay alerts)
  SELECT COUNT(*) INTO v_warning_alerts
  FROM public.pm_alerts
  WHERE job_id = p_job_id
    AND alert_type = 'delay'
    AND status = 'active';
  
  IF v_warning_alerts > 0 THEN
    v_delay_score := GREATEST(0, 100 - (v_warning_alerts * 15));
  END IF;
  
  -- Weather Score (check for weather alerts)
  SELECT COUNT(*) INTO v_warning_alerts
  FROM public.pm_alerts
  WHERE job_id = p_job_id
    AND alert_type = 'weather_risk'
    AND status = 'active';
  
  IF v_warning_alerts > 0 THEN
    v_weather_score := 75;
  END IF;
  
  -- Customer Satisfaction Score (check for customer issue alerts)
  SELECT COUNT(*) INTO v_warning_alerts
  FROM public.pm_alerts
  WHERE job_id = p_job_id
    AND alert_type = 'customer_issue'
    AND status = 'active';
  
  IF v_warning_alerts > 0 THEN
    v_customer_score := GREATEST(0, 100 - (v_warning_alerts * 25));
  END IF;
  
  -- Inspection Score (assume 100 unless issues)
  v_inspection_score := 100;
  
  -- Communication Score (check for unacknowledged communications)
  SELECT COUNT(*) INTO v_warning_alerts
  FROM public.crew_pm_communications
  WHERE job_id = p_job_id
    AND status = 'new'
    AND created_at > now() - interval '24 hours';
  
  IF v_warning_alerts > 2 THEN
    v_communication_score := GREATEST(0, 100 - ((v_warning_alerts - 2) * 10));
  END IF;
  
  -- Punch List Score
  SELECT COUNT(*) INTO v_pending_punch_items
  FROM public.punch_list_items
  WHERE job_id = p_job_id
    AND status IN ('pending', 'in_progress');
  
  IF v_pending_punch_items > 0 THEN
    v_punch_list_score := GREATEST(0, 100 - (v_pending_punch_items * 10));
  END IF;
  
  -- Production Progress Score (based on job progress)
  IF v_job_record.progress IS NOT NULL THEN
    v_progress_score := v_job_record.progress;
  ELSE
    v_progress_score := 50; -- Unknown progress
  END IF;
  
  -- Calculate weighted average
  v_score := (
    (v_material_score * 0.15) +
    (v_crew_score * 0.15) +
    (v_safety_score * 0.10) +
    (v_delay_score * 0.10) +
    (v_weather_score * 0.05) +
    (v_customer_score * 0.10) +
    (v_inspection_score * 0.05) +
    (v_communication_score * 0.10) +
    (v_punch_list_score * 0.10) +
    (v_progress_score * 0.10)
  );
  
  -- Build factors object
  v_factors := jsonb_build_object(
    'material_availability', ROUND(v_material_score, 2),
    'crew_performance', ROUND(v_crew_score, 2),
    'safety_compliance', ROUND(v_safety_score, 2),
    'delays', ROUND(v_delay_score, 2),
    'weather', ROUND(v_weather_score, 2),
    'customer_satisfaction', ROUND(v_customer_score, 2),
    'inspection_results', ROUND(v_inspection_score, 2),
    'communication', ROUND(v_communication_score, 2),
    'punch_list_items', ROUND(v_punch_list_score, 2),
    'production_progress', ROUND(v_progress_score, 2)
  );
  
  -- Insert or update health score
  INSERT INTO public.job_health_scores (job_id, score, status, factors)
  VALUES (
    p_job_id,
    ROUND(v_score, 2),
    CASE
      WHEN v_score >= 80 THEN 'healthy'
      WHEN v_score >= 60 THEN 'at_risk'
      ELSE 'critical'
    END,
    v_factors
  )
  ON CONFLICT DO NOTHING;
  
  RETURN ROUND(v_score, 2);
END;
$$;

COMMENT ON FUNCTION public.calculate_job_health_score IS 'Calculates health score (0-100) for a job based on multiple factors (Block 256500)';

-- Function: Generate Daily PM Briefing
CREATE OR REPLACE FUNCTION public.generate_pm_daily_briefing(p_pm_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_briefing_id uuid;
  v_summary text := '';
  v_metrics jsonb := '{}'::jsonb;
  v_active_jobs_count int := 0;
  v_delayed_jobs_count int := 0;
  v_critical_alerts_count int := 0;
  v_warning_alerts_count int := 0;
  v_pending_tasks_count int := 0;
  v_high_priority_tasks_count int := 0;
  v_material_issues_count int := 0;
  v_crew_communications_count int := 0;
  v_punch_list_items_pending int := 0;
  v_customer_updates_needed int := 0;
  v_job_record RECORD;
BEGIN
  -- Count active jobs for this PM
  SELECT COUNT(DISTINCT j.id) INTO v_active_jobs_count
  FROM public.jobs j
  LEFT JOIN public.pm_tasks pt ON pt.job_id = j.id AND pt.pm_id = p_pm_id
  WHERE (j.crew_id IN (SELECT id FROM public.crews WHERE id IN (
    SELECT DISTINCT crew_id FROM public.crew_pm_communications WHERE pm_id = p_pm_id
  )) OR pt.pm_id = p_pm_id)
    AND j.stage NOT IN ('completed', 'cancelled')
    AND j.production_date <= p_date + interval '7 days';
  
  -- Count delayed jobs
  SELECT COUNT(DISTINCT job_id) INTO v_delayed_jobs_count
  FROM public.pm_alerts
  WHERE pm_id = p_pm_id
    AND alert_type = 'delay'
    AND status = 'active'
    AND created_at::date = p_date;
  
  -- Count alerts
  SELECT 
    COUNT(*) FILTER (WHERE severity = 'critical') INTO v_critical_alerts_count,
    COUNT(*) FILTER (WHERE severity = 'warning') INTO v_warning_alerts_count
  FROM public.pm_alerts
  WHERE pm_id = p_pm_id
    AND status = 'active'
    AND created_at::date = p_date;
  
  -- Count tasks
  SELECT 
    COUNT(*) INTO v_pending_tasks_count,
    COUNT(*) FILTER (WHERE priority = 'high') INTO v_high_priority_tasks_count
  FROM public.pm_tasks
  WHERE pm_id = p_pm_id
    AND status IN ('open', 'in_progress')
    AND (due_date IS NULL OR due_date <= p_date + interval '3 days');
  
  -- Count material issues
  SELECT COUNT(DISTINCT job_id) INTO v_material_issues_count
  FROM public.pm_alerts
  WHERE pm_id = p_pm_id
    AND alert_type = 'material_shortage'
    AND status = 'active';
  
  -- Count crew communications
  SELECT COUNT(*) INTO v_crew_communications_count
  FROM public.crew_pm_communications
  WHERE pm_id = p_pm_id
    AND status = 'new'
    AND created_at::date = p_date;
  
  -- Count punch list items
  SELECT COUNT(*) INTO v_punch_list_items_pending
  FROM public.punch_list_items
  WHERE assigned_to = p_pm_id
    AND status IN ('pending', 'in_progress');
  
  -- Count customer updates needed
  SELECT COUNT(DISTINCT job_id) INTO v_customer_updates_needed
  FROM public.pm_alerts
  WHERE pm_id = p_pm_id
    AND alert_type = 'customer_issue'
    AND status = 'active';
  
  -- Build metrics
  v_metrics := jsonb_build_object(
    'active_jobs_count', v_active_jobs_count,
    'delayed_jobs_count', v_delayed_jobs_count,
    'critical_alerts_count', v_critical_alerts_count,
    'warning_alerts_count', v_warning_alerts_count,
    'pending_tasks_count', v_pending_tasks_count,
    'high_priority_tasks_count', v_high_priority_tasks_count,
    'material_issues_count', v_material_issues_count,
    'crew_communications_count', v_crew_communications_count,
    'punch_list_items_pending', v_punch_list_items_pending,
    'customer_updates_needed', v_customer_updates_needed
  );
  
  -- Build summary text
  v_summary := 'Good morning — here is your SmartSend PM Briefing:' || E'\n\n';
  
  IF v_active_jobs_count > 0 THEN
    v_summary := v_summary || '• ' || v_active_jobs_count || ' jobs active today' || E'\n';
  END IF;
  
  IF v_delayed_jobs_count > 0 THEN
    v_summary := v_summary || '• ' || v_delayed_jobs_count || ' jobs delayed' || E'\n';
  END IF;
  
  IF v_material_issues_count > 0 THEN
    v_summary := v_summary || '• ' || v_material_issues_count || ' material issues requiring attention' || E'\n';
  END IF;
  
  IF v_crew_communications_count > 0 THEN
    v_summary := v_summary || '• ' || v_crew_communications_count || ' new crew communications' || E'\n';
  END IF;
  
  IF v_punch_list_items_pending > 0 THEN
    v_summary := v_summary || '• ' || v_punch_list_items_pending || ' punch list items pending' || E'\n';
  END IF;
  
  IF v_customer_updates_needed > 0 THEN
    v_summary := v_summary || '• ' || v_customer_updates_needed || ' customers require status updates' || E'\n';
  END IF;
  
  IF v_high_priority_tasks_count > 0 THEN
    v_summary := v_summary || '• ' || v_high_priority_tasks_count || ' high priority tasks due soon' || E'\n';
  END IF;
  
  IF v_critical_alerts_count > 0 THEN
    v_summary := v_summary || '• ' || v_critical_alerts_count || ' critical alerts need immediate attention' || E'\n';
  END IF;
  
  -- Insert briefing
  INSERT INTO public.pm_daily_briefings (pm_id, briefing_date, summary, metrics)
  VALUES (p_pm_id, p_date, v_summary, v_metrics)
  ON CONFLICT (pm_id, briefing_date) 
  DO UPDATE SET
    summary = EXCLUDED.summary,
    metrics = EXCLUDED.metrics,
    created_at = now()
  RETURNING id INTO v_briefing_id;
  
  RETURN v_briefing_id;
END;
$$;

COMMENT ON FUNCTION public.generate_pm_daily_briefing IS 'Generates daily AI briefing for a project manager (Block 256500)';

-- Function: Get PM Task Priorities
CREATE OR REPLACE FUNCTION public.get_pm_task_priorities(p_pm_id uuid, p_limit int DEFAULT 10)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  task text,
  priority text,
  due_date date,
  status text,
  job_address text,
  job_number text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pt.id,
    pt.job_id,
    pt.task,
    pt.priority,
    pt.due_date,
    pt.status,
    j.address as job_address,
    j.id::text as job_number
  FROM public.pm_tasks pt
  LEFT JOIN public.jobs j ON j.id = pt.job_id
  WHERE pt.pm_id = p_pm_id
    AND pt.status IN ('open', 'in_progress')
  ORDER BY 
    CASE pt.priority
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
    END,
    COALESCE(pt.due_date, '9999-12-31'::date),
    pt.created_at DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_pm_task_priorities IS 'Returns prioritized tasks for a PM (Block 256500)';

-- ============================================================================
-- PART 9 — CREATE TRIGGERS
-- ============================================================================

-- Trigger: Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_pm_tables_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pm_tasks_updated_at
BEFORE UPDATE ON public.pm_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_pm_tables_updated_at();

CREATE TRIGGER trg_pm_alerts_updated_at
BEFORE UPDATE ON public.pm_alerts
FOR EACH ROW
EXECUTE FUNCTION public.update_pm_tables_updated_at();

CREATE TRIGGER trg_crew_pm_communications_updated_at
BEFORE UPDATE ON public.crew_pm_communications
FOR EACH ROW
EXECUTE FUNCTION public.update_pm_tables_updated_at();

CREATE TRIGGER trg_punch_list_items_updated_at
BEFORE UPDATE ON public.punch_list_items
FOR EACH ROW
EXECUTE FUNCTION public.update_pm_tables_updated_at();

CREATE TRIGGER trg_project_managers_updated_at
BEFORE UPDATE ON public.project_managers
FOR EACH ROW
EXECUTE FUNCTION public.update_pm_tables_updated_at();

-- ============================================================================
-- PART 10 — ENABLE RLS
-- ============================================================================

ALTER TABLE public.project_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_pm_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_daily_briefings ENABLE ROW LEVEL SECURITY;

-- RLS Policies will be added based on company/org structure
-- For now, allow service role full access
CREATE POLICY "project_managers_service_role_all" ON public.project_managers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "pm_tasks_service_role_all" ON public.pm_tasks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "job_health_scores_service_role_all" ON public.job_health_scores
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "pm_alerts_service_role_all" ON public.pm_alerts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "crew_pm_communications_service_role_all" ON public.crew_pm_communications
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "punch_list_items_service_role_all" ON public.punch_list_items
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "pm_daily_briefings_service_role_all" ON public.pm_daily_briefings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Allow authenticated users to read their own PM data
CREATE POLICY "project_managers_select_own" ON public.project_managers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR id IN (
    SELECT pm_id FROM public.pm_tasks WHERE assigned_by = auth.uid()
  ));

CREATE POLICY "pm_tasks_select_own" ON public.pm_tasks
  FOR SELECT TO authenticated
  USING (pm_id IN (SELECT id FROM public.project_managers WHERE user_id = auth.uid()));

CREATE POLICY "pm_alerts_select_own" ON public.pm_alerts
  FOR SELECT TO authenticated
  USING (pm_id IN (SELECT id FROM public.project_managers WHERE user_id = auth.uid()));

CREATE POLICY "crew_pm_communications_select_own" ON public.crew_pm_communications
  FOR SELECT TO authenticated
  USING (pm_id IN (SELECT id FROM public.project_managers WHERE user_id = auth.uid()));

CREATE POLICY "punch_list_items_select_own" ON public.punch_list_items
  FOR SELECT TO authenticated
  USING (assigned_to IN (SELECT id FROM public.project_managers WHERE user_id = auth.uid()));

CREATE POLICY "pm_daily_briefings_select_own" ON public.pm_daily_briefings
  FOR SELECT TO authenticated
  USING (pm_id IN (SELECT id FROM public.project_managers WHERE user_id = auth.uid()));

-- ============================================================================
-- PART 11 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.project_managers IS 'Project managers for roofing companies (Block 256500)';
COMMENT ON TABLE public.pm_tasks IS 'Tasks assigned to project managers with priority and due dates (Block 256500)';
COMMENT ON TABLE public.job_health_scores IS 'Health scores (0-100) for jobs with detailed factors (Block 256500)';
COMMENT ON TABLE public.pm_alerts IS 'Alerts and warnings for project managers (Block 256500)';
COMMENT ON TABLE public.crew_pm_communications IS 'Communication hub between crews and project managers (Block 256500)';
COMMENT ON TABLE public.punch_list_items IS 'Punch list items for jobs (Block 256500)';
COMMENT ON TABLE public.pm_daily_briefings IS 'Daily AI-generated briefings for project managers (Block 256500)';





















