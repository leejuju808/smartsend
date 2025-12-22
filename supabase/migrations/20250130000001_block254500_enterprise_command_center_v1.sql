-- =========================================================
-- Block 254500 — SmartSend Enterprise Command Center v1
-- (Franchise Mode, Multi-Branch Dashboard, Owner HQ Command Board, Multi-Crew Scaling Logic)
-- =========================================================
-- 
-- This block transforms SmartSend from a powerful roofing system
-- into a complete enterprise operating platform capable of running:
-- - multiple crews
-- - multiple branches
-- - multiple cities
-- - multiple states
-- - multiple companies (future franchise model)
-- 
-- This is where SmartSend becomes the central command station for owners
-- who grow beyond 1 crew and 1 city.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE branches TABLE
-- ============================================================================
-- Branches represent physical locations/offices within a roofing company
-- Each branch can operate independently with its own manager, crews, and operations

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Branch Identity
  name text NOT NULL,                    -- "Dallas Branch", "Austin Branch", etc.
  city text,
  state text NOT NULL,
  address text,
  zip_code text,
  
  -- Branch Management
  manager_name text,
  manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  phone text,
  
  -- Branch Status
  is_active boolean DEFAULT true,
  is_franchise boolean DEFAULT false,    -- For franchise locations
  
  -- Branch Settings
  settings jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique branch names per company
  CONSTRAINT unique_branch_name_per_company UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_branches_company ON public.branches(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_branches_state ON public.branches(state);
CREATE INDEX IF NOT EXISTS idx_branches_city ON public.branches(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_branches_manager ON public.branches(manager_user_id) WHERE manager_user_id IS NOT NULL;

COMMENT ON TABLE public.branches IS 'Physical branch locations within roofing companies (Block 254500)';

-- ============================================================================
-- PART 2 — CREATE branch_users TABLE
-- ============================================================================
-- Links users to branches with specific roles

CREATE TABLE IF NOT EXISTS public.branch_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Role within this branch
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('manager', 'sales_rep', 'pm', 'admin', 'crew', 'viewer')) DEFAULT 'member',
  
  -- Permissions
  can_view_financials boolean DEFAULT false,
  can_manage_crews boolean DEFAULT false,
  can_manage_jobs boolean DEFAULT false,
  
  -- Assignment Metadata
  assigned_at timestamptz DEFAULT now(),
  assigned_by_user_id uuid REFERENCES auth.users(id),
  
  is_active boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- One membership per user per branch
  CONSTRAINT unique_user_branch UNIQUE (branch_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_users_branch ON public.branch_users(branch_id, is_active);
CREATE INDEX IF NOT EXISTS idx_branch_users_user ON public.branch_users(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_branch_users_role ON public.branch_users(branch_id, role) WHERE is_active = true;

COMMENT ON TABLE public.branch_users IS 'Users assigned to branches with roles and permissions (Block 254500)';

-- ============================================================================
-- PART 3 — CREATE branch_metrics TABLE
-- ============================================================================
-- Stores aggregated performance metrics per branch (updated periodically)

CREATE TABLE IF NOT EXISTS public.branch_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  
  -- Performance Metrics
  jobs_sold int DEFAULT 0,
  jobs_completed int DEFAULT 0,
  total_revenue numeric(12,2) DEFAULT 0,
  avg_margin numeric(5,2) DEFAULT 0,     -- Percentage
  safety_incidents int DEFAULT 0,
  crew_efficiency numeric(5,2) DEFAULT 0, -- Percentage (0-100)
  
  -- Additional Metrics
  avg_install_speed_hours numeric(6,2),  -- Average hours per job
  customer_satisfaction numeric(3,2),    -- Rating out of 5.0
  safety_score numeric(5,2),             -- Score out of 100
  material_waste_percent numeric(5,2),   -- Percentage of waste
  
  -- Time Period
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'yearly')) DEFAULT 'monthly',
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure one metric record per branch per period
  CONSTRAINT unique_branch_metric_period UNIQUE (branch_id, period_start, period_end, period_type)
);

CREATE INDEX IF NOT EXISTS idx_branch_metrics_branch ON public.branch_metrics(branch_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_branch_metrics_period ON public.branch_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_branch_metrics_type ON public.branch_metrics(period_type);

COMMENT ON TABLE public.branch_metrics IS 'Performance metrics aggregated per branch (Block 254500)';

-- ============================================================================
-- PART 4 — CREATE enterprise_events TABLE
-- ============================================================================
-- Stores enterprise-level alerts and events (crew scaling, branch performance, etc.)

CREATE TABLE IF NOT EXISTS public.enterprise_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  
  -- Event Identity
  event_type text NOT NULL CHECK (event_type IN (
    'expansion_alert',
    'branch_low_performance',
    'crew_scaling_alert',
    'safety_incident',
    'resource_sharing_opportunity',
    'material_transfer_opportunity',
    'crew_idle_alert',
    'branch_high_performance',
    'margin_alert',
    'backlog_alert'
  )),
  
  -- Event Details
  title text NOT NULL,
  message text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  
  -- Event Status
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')) DEFAULT 'info',
  is_resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by_user_id uuid REFERENCES auth.users(id),
  
  -- AI Recommendations (if applicable)
  ai_recommendation text,
  ai_confidence numeric(3,2),            -- 0.00 to 1.00
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enterprise_events_company ON public.enterprise_events(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enterprise_events_branch ON public.enterprise_events(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enterprise_events_type ON public.enterprise_events(event_type);
CREATE INDEX IF NOT EXISTS idx_enterprise_events_severity ON public.enterprise_events(severity, is_resolved);
CREATE INDEX IF NOT EXISTS idx_enterprise_events_unresolved ON public.enterprise_events(company_id, is_resolved) WHERE is_resolved = false;

COMMENT ON TABLE public.enterprise_events IS 'Enterprise-level alerts and events (Block 254500)';

-- ============================================================================
-- PART 5 — ADD branch_id TO CORE TABLES
-- ============================================================================

-- Add branch_id to roofing_jobs
ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_branch ON public.roofing_jobs(branch_id) WHERE branch_id IS NOT NULL;

-- Add branch_id to leads
ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_branch ON public.leads(branch_id) WHERE branch_id IS NOT NULL;

-- Add branch_id to crews
ALTER TABLE IF EXISTS public.crews
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crews_branch ON public.crews(branch_id) WHERE branch_id IS NOT NULL;

-- Add branch_id to invoices (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
    ALTER TABLE public.invoices
      ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_invoices_branch ON public.invoices(branch_id) WHERE branch_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 6 — CREATE MULTI-BRANCH DASHBOARD VIEWS
-- ============================================================================

-- View: Multi-Branch Overview (All Branches Summary)
CREATE OR REPLACE VIEW public.v_multi_branch_overview AS
SELECT 
  b.id AS branch_id,
  b.name AS branch_name,
  b.city,
  b.state,
  rc.id AS company_id,
  rc.name AS company_name,
  rc.owner_id,
  
  -- Current Period Metrics (from latest branch_metrics)
  COALESCE(bm.total_revenue, 0) AS revenue,
  COALESCE(bm.avg_margin, 0) AS margin_percent,
  COALESCE(bm.crew_efficiency, 0) AS crew_efficiency,
  COALESCE(bm.jobs_completed, 0) AS jobs_completed,
  COALESCE(bm.safety_incidents, 0) AS safety_incidents,
  COALESCE(bm.customer_satisfaction, 0) AS customer_satisfaction,
  
  -- Real-time counts
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress')) AS active_jobs,
  COUNT(DISTINCT c.id) FILTER (WHERE c.is_active = true) AS active_crews,
  COUNT(DISTINCT bu.user_id) FILTER (WHERE bu.is_active = true) AS branch_staff_count,
  
  -- Performance Flags
  CASE 
    WHEN COALESCE(bm.avg_margin, 0) < 30 THEN true
    ELSE false
  END AS low_margin_flag,
  CASE 
    WHEN COALESCE(bm.safety_incidents, 0) > 2 THEN true
    ELSE false
  END AS safety_flag,
  CASE 
    WHEN COALESCE(bm.crew_efficiency, 0) < 75 THEN true
    ELSE false
  END AS efficiency_flag
  
FROM public.branches b
JOIN public.roofing_companies rc ON rc.id = b.company_id
LEFT JOIN public.branch_metrics bm ON bm.branch_id = b.id 
  AND bm.period_type = 'monthly'
  AND bm.period_start = (
    SELECT MAX(period_start) 
    FROM public.branch_metrics 
    WHERE branch_id = b.id AND period_type = 'monthly'
  )
LEFT JOIN public.roofing_jobs rj ON rj.branch_id = b.id
LEFT JOIN public.crews c ON c.branch_id = b.id
LEFT JOIN public.branch_users bu ON bu.branch_id = b.id
WHERE b.is_active = true AND rc.is_active = true
GROUP BY b.id, b.name, b.city, b.state, rc.id, rc.name, rc.owner_id,
  bm.total_revenue, bm.avg_margin, bm.crew_efficiency, bm.jobs_completed,
  bm.safety_incidents, bm.customer_satisfaction;

COMMENT ON VIEW public.v_multi_branch_overview IS 'Multi-branch dashboard overview (Block 254500)';

-- ============================================================================
-- PART 7 — CREATE OWNER HQ COMMAND BOARD VIEWS
-- ============================================================================

-- View: Owner HQ Command Board (Company-Wide KPIs)
CREATE OR REPLACE VIEW public.v_owner_hq_command_board AS
SELECT 
  rc.id AS company_id,
  rc.name AS company_name,
  rc.owner_id,
  
  -- Total Jobs
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress', 'completed')) AS total_jobs,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed') AS jobs_completed,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress')) AS jobs_active,
  
  -- Revenue Metrics
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS revenue_ytd,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed' AND rj.completed_at >= date_trunc('month', now())), 0) AS revenue_this_month,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed' AND rj.completed_at >= date_trunc('year', now())), 0) AS revenue_this_year,
  
  -- Margin Metrics
  COALESCE(AVG(
    CASE 
      WHEN rj.job_value > 0 AND rj.total_cost > 0 
      THEN ((rj.job_value - rj.total_cost) / rj.job_value * 100)
      ELSE NULL
    END
  ) FILTER (WHERE rj.status = 'completed'), 0) AS avg_margin_percent,
  
  -- Crew Metrics
  COUNT(DISTINCT c.id) FILTER (WHERE c.is_active = true) AS crews_active_today,
  COUNT(DISTINCT c.id) FILTER (WHERE c.is_active = true AND EXISTS (
    SELECT 1 FROM public.roofing_jobs rj2 
    WHERE rj2.crew_id = c.id 
    AND rj2.status IN ('scheduled', 'in_progress')
    AND rj2.scheduled_start_date::date = CURRENT_DATE
  )) AS crews_working_today,
  
  -- Financial Metrics
  COALESCE(SUM(
    CASE 
      WHEN inv.status = 'pending' OR inv.status = 'overdue'
      THEN inv.amount
      ELSE 0
    END
  ), 0) AS outstanding_invoices,
  
  -- Material Spend
  COALESCE(SUM(
    CASE 
      WHEN rj.status IN ('scheduled', 'in_progress', 'completed')
      AND rj.material_cost IS NOT NULL
      THEN rj.material_cost
      ELSE 0
    END
  ) FILTER (WHERE rj.created_at >= date_trunc('month', now())), 0) AS material_spend_this_month,
  
  -- Safety Metrics
  COUNT(DISTINCT ee.id) FILTER (WHERE ee.event_type = 'safety_incident' AND ee.created_at >= date_trunc('month', now())) AS safety_incidents_this_month,
  
  -- Customer Satisfaction
  COALESCE(AVG(bm.customer_satisfaction), 0) AS customer_satisfaction_avg,
  
  -- Branch Count
  COUNT(DISTINCT b.id) FILTER (WHERE b.is_active = true) AS total_branches,
  
  -- Active Alerts
  COUNT(DISTINCT ee.id) FILTER (WHERE ee.is_resolved = false AND ee.severity IN ('warning', 'critical')) AS active_alerts
  
FROM public.roofing_companies rc
LEFT JOIN public.branches b ON b.company_id = rc.id
LEFT JOIN public.roofing_jobs rj ON rj.roofing_company_id = rc.id OR rj.branch_id = b.id
LEFT JOIN public.crews c ON c.roofing_company_id = rc.id OR c.branch_id = b.id
LEFT JOIN public.branch_metrics bm ON bm.branch_id = b.id
LEFT JOIN public.enterprise_events ee ON ee.company_id = rc.id
LEFT JOIN LATERAL (
  SELECT SUM(amount) as amount, status
  FROM public.invoices
  WHERE roofing_company_id = rc.id OR branch_id = b.id
  GROUP BY status
) inv ON true
WHERE rc.is_active = true
GROUP BY rc.id, rc.name, rc.owner_id;

COMMENT ON VIEW public.v_owner_hq_command_board IS 'Owner HQ Command Board with company-wide KPIs (Block 254500)';

-- View: Branch Performance Comparison
CREATE OR REPLACE VIEW public.v_branch_performance_comparison AS
SELECT 
  b.id AS branch_id,
  b.name AS branch_name,
  b.city,
  b.state,
  rc.id AS company_id,
  rc.name AS company_name,
  
  -- Performance Metrics
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed') AS jobs_completed,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS total_revenue,
  COALESCE(AVG(
    CASE 
      WHEN rj.job_value > 0 AND rj.total_cost > 0 
      THEN ((rj.job_value - rj.total_cost) / rj.job_value * 100)
      ELSE NULL
    END
  ) FILTER (WHERE rj.status = 'completed'), 0) AS margin_percent,
  COALESCE(AVG(rj.actual_hours) FILTER (WHERE rj.status = 'completed' AND rj.actual_hours IS NOT NULL), 0) AS avg_install_speed_hours,
  COALESCE(AVG(bm.customer_satisfaction), 0) AS customer_satisfaction,
  COALESCE(AVG(bm.safety_score), 0) AS safety_score,
  
  -- Crew Performance
  COUNT(DISTINCT c.id) FILTER (WHERE c.is_active = true) AS crews_count,
  COALESCE(AVG(bm.crew_efficiency), 0) AS crew_efficiency,
  
  -- Material Efficiency
  COALESCE(AVG(bm.material_waste_percent), 0) AS material_waste_percent,
  
  -- Wins and Issues
  COUNT(DISTINCT ee.id) FILTER (WHERE ee.event_type = 'branch_high_performance') AS performance_wins,
  COUNT(DISTINCT ee.id) FILTER (WHERE ee.event_type = 'branch_low_performance') AS performance_issues
  
FROM public.branches b
JOIN public.roofing_companies rc ON rc.id = b.company_id
LEFT JOIN public.roofing_jobs rj ON rj.branch_id = b.id
LEFT JOIN public.crews c ON c.branch_id = b.id
LEFT JOIN public.branch_metrics bm ON bm.branch_id = b.id
LEFT JOIN public.enterprise_events ee ON ee.branch_id = b.id
WHERE b.is_active = true AND rc.is_active = true
GROUP BY b.id, b.name, b.city, b.state, rc.id, rc.name;

COMMENT ON VIEW public.v_branch_performance_comparison IS 'Branch-by-branch performance comparison (Block 254500)';

-- ============================================================================
-- PART 8 — CREATE CREW SCALING LOGIC FUNCTIONS
-- ============================================================================

-- Function: Analyze crew scaling needs for a branch
CREATE OR REPLACE FUNCTION public.analyze_crew_scaling_needs(p_branch_id uuid)
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  current_crews int,
  active_jobs int,
  backlog_days numeric,
  recommended_action text,
  recommendation_details jsonb,
  urgency text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_branch_record record;
  v_active_crews int;
  v_active_jobs int;
  v_scheduled_jobs int;
  v_avg_jobs_per_crew numeric;
  v_backlog_days numeric;
  v_crew_capacity_per_day numeric := 1.0; -- Assume 1 job per crew per day
BEGIN
  -- Get branch info
  SELECT b.*, rc.name as company_name
  INTO v_branch_record
  FROM public.branches b
  JOIN public.roofing_companies rc ON rc.id = b.company_id
  WHERE b.id = p_branch_id AND b.is_active = true;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Count active crews
  SELECT COUNT(*)
  INTO v_active_crews
  FROM public.crews
  WHERE branch_id = p_branch_id AND is_active = true;
  
  -- Count active and scheduled jobs
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('scheduled', 'in_progress')),
    COUNT(*) FILTER (WHERE status = 'scheduled' AND scheduled_start_date IS NOT NULL)
  INTO v_active_jobs, v_scheduled_jobs
  FROM public.roofing_jobs
  WHERE branch_id = p_branch_id;
  
  -- Calculate backlog days
  IF v_active_crews > 0 THEN
    v_avg_jobs_per_crew := v_active_jobs::numeric / v_active_crews;
    v_backlog_days := v_avg_jobs_per_crew / v_crew_capacity_per_day;
  ELSE
    v_backlog_days := 0;
  END IF;
  
  -- Generate recommendation
  RETURN QUERY
  SELECT 
    v_branch_record.id,
    v_branch_record.name,
    v_active_crews,
    v_active_jobs,
    v_backlog_days,
    CASE
      WHEN v_backlog_days > 10 THEN 'ADD_CREW'
      WHEN v_backlog_days < 3 AND v_active_crews > 1 THEN 'REDUCE_CREW'
      WHEN v_backlog_days BETWEEN 3 AND 10 THEN 'MONITOR'
      ELSE 'MAINTAIN'
    END,
    jsonb_build_object(
      'current_crews', v_active_crews,
      'active_jobs', v_active_jobs,
      'backlog_days', v_backlog_days,
      'avg_jobs_per_crew', v_avg_jobs_per_crew
    ),
    CASE
      WHEN v_backlog_days > 13 THEN 'critical'
      WHEN v_backlog_days > 10 THEN 'warning'
      ELSE 'info'
    END
  FROM (SELECT 1) t;
END;
$$;

COMMENT ON FUNCTION public.analyze_crew_scaling_needs(uuid) IS 'Analyzes crew scaling needs for a branch (Block 254500)';

-- Function: Find cross-branch resource sharing opportunities
CREATE OR REPLACE FUNCTION public.find_resource_sharing_opportunities(p_company_id uuid)
RETURNS TABLE (
  opportunity_type text,
  source_branch_id uuid,
  source_branch_name text,
  target_branch_id uuid,
  target_branch_name text,
  recommendation text,
  details jsonb,
  urgency text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- Crew sharing opportunities (idle crews in one branch, delayed jobs in another)
  RETURN QUERY
  WITH idle_crews AS (
    SELECT 
      c.id as crew_id,
      c.name as crew_name,
      c.branch_id,
      b.name as branch_name
    FROM public.crews c
    JOIN public.branches b ON b.id = c.branch_id
    WHERE b.company_id = p_company_id
      AND c.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.roofing_jobs rj
        WHERE rj.crew_id = c.id
        AND rj.status IN ('scheduled', 'in_progress')
        AND rj.scheduled_start_date::date = CURRENT_DATE
      )
  ),
  delayed_jobs AS (
    SELECT 
      rj.id as job_id,
      rj.branch_id,
      b.name as branch_name,
      rj.scheduled_start_date,
      CURRENT_DATE - rj.scheduled_start_date::date as days_delayed
    FROM public.roofing_jobs rj
    JOIN public.branches b ON b.id = rj.branch_id
    WHERE b.company_id = p_company_id
      AND rj.status = 'scheduled'
      AND rj.scheduled_start_date::date < CURRENT_DATE
      AND rj.crew_id IS NULL
  )
  SELECT 
    'crew_transfer'::text,
    ic.branch_id,
    ic.branch_name,
    dj.branch_id,
    dj.branch_name,
    format('Move %s from %s to %s for %s days', ic.crew_name, ic.branch_name, dj.branch_name, 1),
    jsonb_build_object(
      'crew_id', ic.crew_id,
      'crew_name', ic.crew_name,
      'delayed_jobs_count', (SELECT COUNT(*) FROM delayed_jobs WHERE branch_id = dj.branch_id),
      'days_delayed', dj.days_delayed
    ),
    CASE
      WHEN dj.days_delayed > 3 THEN 'critical'
      WHEN dj.days_delayed > 1 THEN 'warning'
      ELSE 'info'
    END
  FROM idle_crews ic
  CROSS JOIN delayed_jobs dj
  WHERE ic.branch_id != dj.branch_id
  LIMIT 10;
END;
$$;

COMMENT ON FUNCTION public.find_resource_sharing_opportunities(uuid) IS 'Finds cross-branch resource sharing opportunities (Block 254500)';

-- ============================================================================
-- PART 9 — CREATE ENTERPRISE ALERTS ENGINE FUNCTIONS
-- ============================================================================

-- Function: Generate enterprise alerts
CREATE OR REPLACE FUNCTION public.generate_enterprise_alerts(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_branch_record record;
  v_alert_count int;
BEGIN
  -- Loop through all active branches
  FOR v_branch_record IN
    SELECT b.*
    FROM public.branches b
    WHERE b.company_id = p_company_id AND b.is_active = true
  LOOP
    -- Check for low margin
    IF EXISTS (
      SELECT 1 FROM public.branch_metrics bm
      WHERE bm.branch_id = v_branch_record.id
      AND bm.avg_margin < 30
      AND bm.period_type = 'monthly'
      AND bm.period_start = (
        SELECT MAX(period_start) FROM public.branch_metrics 
        WHERE branch_id = v_branch_record.id AND period_type = 'monthly'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.enterprise_events ee
        WHERE ee.branch_id = v_branch_record.id
        AND ee.event_type = 'margin_alert'
        AND ee.is_resolved = false
        AND ee.created_at > now() - interval '7 days'
      )
    ) THEN
      INSERT INTO public.enterprise_events (
        company_id, branch_id, event_type, title, message, severity, details
      ) VALUES (
        p_company_id,
        v_branch_record.id,
        'margin_alert',
        format('%s branch margin dropped below 30%%', v_branch_record.name),
        format('%s branch margin is below 30%%. Investigate pricing, costs, or efficiency.', v_branch_record.name),
        'warning',
        jsonb_build_object('branch_name', v_branch_record.name, 'margin', (
          SELECT avg_margin FROM public.branch_metrics 
          WHERE branch_id = v_branch_record.id 
          ORDER BY period_start DESC LIMIT 1
        ))
      )
      ON CONFLICT DO NOTHING;
    END IF;
    
    -- Check for safety incidents
    IF EXISTS (
      SELECT 1 FROM public.branch_metrics bm
      WHERE bm.branch_id = v_branch_record.id
      AND bm.safety_incidents > 2
      AND bm.period_type = 'monthly'
      AND bm.period_start >= date_trunc('month', now())
      AND NOT EXISTS (
        SELECT 1 FROM public.enterprise_events ee
        WHERE ee.branch_id = v_branch_record.id
        AND ee.event_type = 'safety_incident'
        AND ee.is_resolved = false
        AND ee.created_at > now() - interval '7 days'
      )
    ) THEN
      INSERT INTO public.enterprise_events (
        company_id, branch_id, event_type, title, message, severity, details
      ) VALUES (
        p_company_id,
        v_branch_record.id,
        'safety_incident',
        format('%s branch had 2+ safety incidents this week', v_branch_record.name),
        format('%s branch has had multiple safety incidents. Immediate investigation required.', v_branch_record.name),
        'critical',
        jsonb_build_object('branch_name', v_branch_record.name, 'incidents', (
          SELECT safety_incidents FROM public.branch_metrics 
          WHERE branch_id = v_branch_record.id 
          ORDER BY period_start DESC LIMIT 1
        ))
      )
      ON CONFLICT DO NOTHING;
    END IF;
    
    -- Check crew scaling needs
    PERFORM public.check_crew_scaling_alerts(v_branch_record.id);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_enterprise_alerts(uuid) IS 'Generates enterprise alerts for a company (Block 254500)';

-- Function: Check crew scaling alerts
CREATE OR REPLACE FUNCTION public.check_crew_scaling_alerts(p_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_scaling_analysis record;
  v_branch_name text;
BEGIN
  SELECT name INTO v_branch_name FROM public.branches WHERE id = p_branch_id;
  
  -- Get scaling analysis
  SELECT * INTO v_scaling_analysis
  FROM public.analyze_crew_scaling_needs(p_branch_id)
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Create alert if needed
  IF v_scaling_analysis.recommended_action = 'ADD_CREW' AND v_scaling_analysis.backlog_days > 13 THEN
    INSERT INTO public.enterprise_events (
      company_id, branch_id, event_type, title, message, severity, ai_recommendation, details
    )
    SELECT 
      b.company_id,
      p_branch_id,
      'crew_scaling_alert',
      format('%s branch backlog will exceed capacity in %s days', v_branch_name, v_scaling_analysis.backlog_days::int),
      format('%s branch backlog will exceed capacity in %s days. Recommended: Add 1 new crew or reassign crew from another branch.', 
        v_branch_name, v_scaling_analysis.backlog_days::int),
      'warning',
      format('Add 1 new crew or reassign Crew from another branch. Backlog: %s days', v_scaling_analysis.backlog_days::int),
      v_scaling_analysis.recommendation_details
    FROM public.branches b
    WHERE b.id = p_branch_id
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.check_crew_scaling_alerts(uuid) IS 'Checks and creates crew scaling alerts for a branch (Block 254500)';

-- Function: Calculate and update branch metrics
CREATE OR REPLACE FUNCTION public.calculate_branch_metrics(
  p_branch_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_period_type text DEFAULT 'monthly'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metric_id uuid;
  v_jobs_sold int;
  v_jobs_completed int;
  v_total_revenue numeric(12,2);
  v_avg_margin numeric(5,2);
  v_safety_incidents int;
  v_crew_efficiency numeric(5,2);
  v_avg_install_speed numeric(6,2);
  v_customer_satisfaction numeric(3,2);
  v_safety_score numeric(5,2);
  v_material_waste_percent numeric(5,2);
BEGIN
  -- Calculate jobs sold (leads that became jobs)
  SELECT COUNT(*)
  INTO v_jobs_sold
  FROM public.roofing_jobs rj
  WHERE rj.branch_id = p_branch_id
    AND rj.created_at >= p_period_start
    AND rj.created_at < p_period_end;
  
  -- Calculate jobs completed
  SELECT COUNT(*)
  INTO v_jobs_completed
  FROM public.roofing_jobs rj
  WHERE rj.branch_id = p_branch_id
    AND rj.status = 'completed'
    AND rj.completed_at >= p_period_start
    AND rj.completed_at < p_period_end;
  
  -- Calculate total revenue
  SELECT COALESCE(SUM(job_value), 0)
  INTO v_total_revenue
  FROM public.roofing_jobs rj
  WHERE rj.branch_id = p_branch_id
    AND rj.status = 'completed'
    AND rj.completed_at >= p_period_start
    AND rj.completed_at < p_period_end;
  
  -- Calculate average margin
  SELECT COALESCE(AVG(
    CASE 
      WHEN job_value > 0 AND total_cost > 0 
      THEN ((job_value - total_cost) / job_value * 100)
      ELSE NULL
    END
  ), 0)
  INTO v_avg_margin
  FROM public.roofing_jobs rj
  WHERE rj.branch_id = p_branch_id
    AND rj.status = 'completed'
    AND rj.completed_at >= p_period_start
    AND rj.completed_at < p_period_end;
  
  -- Calculate safety incidents (from enterprise_events)
  SELECT COUNT(*)
  INTO v_safety_incidents
  FROM public.enterprise_events ee
  WHERE ee.branch_id = p_branch_id
    AND ee.event_type = 'safety_incident'
    AND ee.created_at >= p_period_start
    AND ee.created_at < p_period_end;
  
  -- Calculate crew efficiency (jobs completed per crew per period)
  SELECT COALESCE(
    CASE 
      WHEN COUNT(DISTINCT c.id) > 0 
      THEN (v_jobs_completed::numeric / COUNT(DISTINCT c.id))
      ELSE 0
    END * 10, -- Scale to 0-100
    0
  )
  INTO v_crew_efficiency
  FROM public.crews c
  WHERE c.branch_id = p_branch_id
    AND c.is_active = true;
  
  -- Calculate average install speed
  SELECT COALESCE(AVG(actual_hours), 0)
  INTO v_avg_install_speed
  FROM public.roofing_jobs rj
  WHERE rj.branch_id = p_branch_id
    AND rj.status = 'completed'
    AND rj.actual_hours IS NOT NULL
    AND rj.completed_at >= p_period_start
    AND rj.completed_at < p_period_end;
  
  -- Calculate customer satisfaction (from branch_metrics or default)
  SELECT COALESCE(AVG(customer_satisfaction), 4.5)
  INTO v_customer_satisfaction
  FROM public.branch_metrics bm
  WHERE bm.branch_id = p_branch_id
    AND bm.period_start >= p_period_start
    AND bm.period_start < p_period_end;
  
  -- Calculate safety score (100 - (incidents * 10), min 0)
  v_safety_score := GREATEST(0, 100 - (v_safety_incidents * 10));
  
  -- Calculate material waste (placeholder - would need material tracking)
  v_material_waste_percent := 5.0; -- Default, would be calculated from actual material usage
  
  -- Insert or update branch metrics
  INSERT INTO public.branch_metrics (
    branch_id,
    jobs_sold,
    jobs_completed,
    total_revenue,
    avg_margin,
    safety_incidents,
    crew_efficiency,
    avg_install_speed_hours,
    customer_satisfaction,
    safety_score,
    material_waste_percent,
    period_start,
    period_end,
    period_type
  )
  VALUES (
    p_branch_id,
    v_jobs_sold,
    v_jobs_completed,
    v_total_revenue,
    v_avg_margin,
    v_safety_incidents,
    v_crew_efficiency,
    v_avg_install_speed,
    v_customer_satisfaction,
    v_safety_score,
    v_material_waste_percent,
    p_period_start,
    p_period_end,
    p_period_type
  )
  ON CONFLICT (branch_id, period_start, period_end, period_type)
  DO UPDATE SET
    jobs_sold = EXCLUDED.jobs_sold,
    jobs_completed = EXCLUDED.jobs_completed,
    total_revenue = EXCLUDED.total_revenue,
    avg_margin = EXCLUDED.avg_margin,
    safety_incidents = EXCLUDED.safety_incidents,
    crew_efficiency = EXCLUDED.crew_efficiency,
    avg_install_speed_hours = EXCLUDED.avg_install_speed_hours,
    customer_satisfaction = EXCLUDED.customer_satisfaction,
    safety_score = EXCLUDED.safety_score,
    material_waste_percent = EXCLUDED.material_waste_percent,
    updated_at = now()
  RETURNING id INTO v_metric_id;
  
  RETURN v_metric_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_branch_metrics(uuid, timestamptz, timestamptz, text) IS 'Calculates and updates branch metrics for a given period (Block 254500)';

-- ============================================================================
-- PART 10 — CREATE TRIGGERS
-- ============================================================================

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.set_branches_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_branches_updated_at
BEFORE UPDATE ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.set_branches_updated_at();

CREATE OR REPLACE FUNCTION public.set_branch_users_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_branch_users_updated_at
BEFORE UPDATE ON public.branch_users
FOR EACH ROW
EXECUTE FUNCTION public.set_branch_users_updated_at();

CREATE OR REPLACE FUNCTION public.set_branch_metrics_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_branch_metrics_updated_at
BEFORE UPDATE ON public.branch_metrics
FOR EACH ROW
EXECUTE FUNCTION public.set_branch_metrics_updated_at();

CREATE OR REPLACE FUNCTION public.set_enterprise_events_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enterprise_events_updated_at
BEFORE UPDATE ON public.enterprise_events
FOR EACH ROW
EXECUTE FUNCTION public.set_enterprise_events_updated_at();

-- Auto-add branch manager to branch_users
CREATE OR REPLACE FUNCTION public.auto_add_branch_manager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.manager_user_id IS NOT NULL THEN
    INSERT INTO public.branch_users (
      branch_id,
      user_id,
      role,
      can_view_financials,
      can_manage_crews,
      can_manage_jobs,
      assigned_by_user_id
    )
    VALUES (
      NEW.id,
      NEW.manager_user_id,
      'manager',
      true,
      true,
      true,
      NEW.manager_user_id
    )
    ON CONFLICT (branch_id, user_id) DO UPDATE
    SET role = 'manager',
        can_view_financials = true,
        can_manage_crews = true,
        can_manage_jobs = true;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_add_branch_manager
AFTER INSERT OR UPDATE ON public.branches
FOR EACH ROW
WHEN (NEW.manager_user_id IS NOT NULL)
EXECUTE FUNCTION public.auto_add_branch_manager();

-- ============================================================================
-- PART 11 — ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_events ENABLE ROW LEVEL SECURITY;

-- Helper function to check branch access
CREATE OR REPLACE FUNCTION public.has_branch_access(check_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.branch_users bu
    JOIN public.branches b ON b.id = bu.branch_id
    JOIN public.roofing_companies rc ON rc.id = b.company_id
    WHERE bu.branch_id = check_branch_id 
      AND bu.user_id = auth.uid() 
      AND bu.is_active = true
      AND b.is_active = true
    UNION
    SELECT 1 FROM public.branches b
    JOIN public.roofing_companies rc ON rc.id = b.company_id
    WHERE b.id = check_branch_id
      AND rc.owner_id = auth.uid()
  );
$$;

-- RLS Policies for branches
CREATE POLICY "Users can view branches they have access to"
  ON public.branches FOR SELECT
  USING (
    public.has_branch_access(id) OR
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = branches.company_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "Company owners/admins can create branches"
  ON public.branches FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = branches.company_id
      AND rc.owner_id = auth.uid()
    )
  );

CREATE POLICY "Branch managers and company owners can update branches"
  ON public.branches FOR UPDATE
  USING (
    public.has_branch_access(id) AND
    (
      EXISTS (
        SELECT 1 FROM public.branch_users bu
        WHERE bu.branch_id = branches.id
        AND bu.user_id = auth.uid()
        AND bu.role IN ('manager', 'admin')
        AND bu.is_active = true
      )
      OR EXISTS (
        SELECT 1 FROM public.roofing_companies rc
        WHERE rc.id = branches.company_id
        AND rc.owner_id = auth.uid()
      )
    )
  );

-- RLS Policies for branch_users
CREATE POLICY "Users can view branch users in their branches"
  ON public.branch_users FOR SELECT
  USING (public.has_branch_access(branch_id));

CREATE POLICY "Branch managers and company owners can manage branch users"
  ON public.branch_users FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.branch_users bu
      WHERE bu.branch_id = branch_users.branch_id
      AND bu.user_id = auth.uid()
      AND bu.role IN ('manager', 'admin')
      AND bu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.branches b
      JOIN public.roofing_companies rc ON rc.id = b.company_id
      WHERE b.id = branch_users.branch_id
      AND rc.owner_id = auth.uid()
    )
  );

-- RLS Policies for branch_metrics
CREATE POLICY "Users can view branch metrics in their branches"
  ON public.branch_metrics FOR SELECT
  USING (public.has_branch_access(branch_id));

CREATE POLICY "System can insert/update branch metrics"
  ON public.branch_metrics FOR ALL
  USING (true);

-- RLS Policies for enterprise_events
CREATE POLICY "Users can view enterprise events for their companies"
  ON public.enterprise_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = enterprise_events.company_id
      AND (
        rc.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.branch_users bu
          JOIN public.branches b ON b.id = bu.branch_id
          WHERE b.company_id = rc.id
          AND bu.user_id = auth.uid()
          AND bu.is_active = true
        )
      )
    )
  );

CREATE POLICY "System can insert enterprise events"
  ON public.enterprise_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Company owners can update enterprise events"
  ON public.enterprise_events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_companies rc
      WHERE rc.id = enterprise_events.company_id
      AND rc.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 12 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enterprise_events TO authenticated;

GRANT SELECT ON public.v_multi_branch_overview TO authenticated;
GRANT SELECT ON public.v_owner_hq_command_board TO authenticated;
GRANT SELECT ON public.v_branch_performance_comparison TO authenticated;

GRANT EXECUTE ON FUNCTION public.analyze_crew_scaling_needs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_resource_sharing_opportunities(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_enterprise_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_crew_scaling_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_branch_metrics(uuid, timestamptz, timestamptz, text) TO authenticated;

-- ============================================================================
-- PART 13 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.branches IS 'Physical branch locations within roofing companies (Block 254500)';
COMMENT ON TABLE public.branch_users IS 'Users assigned to branches with roles and permissions (Block 254500)';
COMMENT ON TABLE public.branch_metrics IS 'Performance metrics aggregated per branch (Block 254500)';
COMMENT ON TABLE public.enterprise_events IS 'Enterprise-level alerts and events (Block 254500)';

COMMENT ON VIEW public.v_multi_branch_overview IS 'Multi-branch dashboard overview (Block 254500)';
COMMENT ON VIEW public.v_owner_hq_command_board IS 'Owner HQ Command Board with company-wide KPIs (Block 254500)';
COMMENT ON VIEW public.v_branch_performance_comparison IS 'Branch-by-branch performance comparison (Block 254500)';






















