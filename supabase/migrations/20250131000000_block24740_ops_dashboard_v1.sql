-- =========================================================
-- Block 24740 — SmartSend Roofing Ops Dashboard v1
-- (Company Overview • Jobs Today • Revenue Tracking • Crew Load • Material Issues • Insurance Progress • The Command Center for Roofing Companies)
-- =========================================================
-- 
-- THE FULL OPERATIONS DASHBOARD — ZERO FLUFF.
-- This block builds the main control panel roofing companies will use EVERY morning.
-- It pulls together ALL SmartSend systems into one screen that answers:
-- ✔ "What's happening today?"
-- ✔ "What's going wrong?"
-- ✔ "Who needs attention?"
-- ✔ "Where is our money at?"
-- ✔ "Are jobs healthy?"
-- ✔ "Are crews overloaded?"
-- ✔ "What do I need to do next?"

-- ============================================================================
-- PART 1 — CREATE ops_dashboard_today_jobs VIEW
-- ============================================================================
-- Shows all jobs scheduled for today with crew, materials, payment, and health status

CREATE OR REPLACE VIEW public.ops_dashboard_today_jobs AS
SELECT 
  j.id,
  j.workspace_id,
  j.title,
  j.job_type,
  j.status,
  j.job_value,
  j.deposit_paid,
  j.balance_remaining,
  j.scheduled_start_date,
  j.scheduled_end_date,
  
  -- Crew info
  c.name as crew_name,
  c.id as crew_id,
  
  -- Material status
  mo.status as material_status,
  mo.expected_delivery_date as material_delivery_date,
  CASE 
    WHEN mo.status IN ('delivered', 'materials_approved_for_build') THEN true
    WHEN mo.status IN ('issue_reported', 'delayed') THEN false
    WHEN mo.expected_delivery_date < CURRENT_DATE THEN false
    WHEN mo.expected_delivery_date = CURRENT_DATE THEN true
    ELSE NULL
  END as materials_confirmed,
  
  -- Payment status
  CASE 
    WHEN j.deposit_paid >= j.deposit_required THEN 'deposit_received'
    WHEN j.deposit_paid > 0 THEN 'partial_deposit'
    ELSE 'no_deposit'
  END as payment_status,
  
  -- Health score
  hs.overall_score as health_score,
  hs.health_status,
  
  -- Status tag (ON SCHEDULE / AT RISK / DELAYED)
  CASE 
    WHEN j.status = 'completed' THEN 'completed'
    WHEN j.status = 'cancelled' THEN 'cancelled'
    WHEN hs.overall_score >= 80 AND mo.status IN ('delivered', 'materials_approved_for_build') AND j.deposit_paid >= j.deposit_required THEN 'on_schedule'
    WHEN hs.overall_score < 60 OR mo.status IN ('issue_reported', 'delayed') THEN 'delayed'
    ELSE 'at_risk'
  END as schedule_status,
  
  -- Issues count
  (SELECT COUNT(*) FROM public.job_health_issues WHERE job_id = j.id AND resolved = false) as issues_count,
  
  j.created_at,
  j.updated_at
FROM public.roofing_jobs j
LEFT JOIN public.job_crew_assignments jca ON jca.job_id = j.id AND jca.unassigned_at IS NULL
LEFT JOIN public.crews c ON c.id = jca.crew_id
LEFT JOIN public.material_orders mo ON mo.job_id = j.id AND mo.status != 'cancelled'
LEFT JOIN public.job_health_scores hs ON hs.job_id = j.id
WHERE j.workspace_id IS NOT NULL
  AND j.status IN ('scheduled', 'in_progress')
  AND j.scheduled_start_date = CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_ops_dashboard_today_jobs_workspace 
  ON public.roofing_jobs(workspace_id, scheduled_start_date) 
  WHERE scheduled_start_date = CURRENT_DATE AND status IN ('scheduled', 'in_progress');

-- ============================================================================
-- PART 2 — CREATE ops_dashboard_revenue_tracking FUNCTION
-- ============================================================================
-- Returns revenue metrics for this week, this month, and pipeline

CREATE OR REPLACE FUNCTION public.get_ops_dashboard_revenue(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_this_week_start date;
  v_this_month_start date;
  v_this_week_revenue numeric := 0;
  v_this_week_completed integer := 0;
  v_this_week_outstanding numeric := 0;
  v_this_month_revenue numeric := 0;
  v_this_month_forecast numeric := 0;
  v_avg_job_value numeric := 0;
BEGIN
  v_this_week_start := DATE_TRUNC('week', CURRENT_DATE)::date;
  v_this_month_start := DATE_TRUNC('month', CURRENT_DATE)::date;
  
  -- This Week: Completed jobs revenue
  SELECT 
    COALESCE(SUM(j.job_value), 0),
    COUNT(*)
  INTO v_this_week_revenue, v_this_week_completed
  FROM public.roofing_jobs j
  WHERE j.workspace_id = p_workspace_id
    AND j.status = 'completed'
    AND j.scheduled_end_date >= v_this_week_start
    AND j.scheduled_end_date < v_this_week_start + INTERVAL '7 days';
  
  -- This Week: Outstanding payments
  SELECT COALESCE(SUM(j.balance_remaining), 0)
  INTO v_this_week_outstanding
  FROM public.roofing_jobs j
  WHERE j.workspace_id = p_workspace_id
    AND j.status IN ('scheduled', 'in_progress', 'completed')
    AND j.scheduled_start_date >= v_this_week_start
    AND j.balance_remaining > 0;
  
  -- This Month: Total revenue
  SELECT COALESCE(SUM(j.job_value), 0)
  INTO v_this_month_revenue
  FROM public.roofing_jobs j
  WHERE j.workspace_id = p_workspace_id
    AND j.status = 'completed'
    AND j.scheduled_end_date >= v_this_month_start;
  
  -- This Month: Forecasted revenue (scheduled + in_progress)
  SELECT COALESCE(SUM(j.job_value), 0)
  INTO v_this_month_forecast
  FROM public.roofing_jobs j
  WHERE j.workspace_id = p_workspace_id
    AND j.status IN ('scheduled', 'in_progress')
    AND j.scheduled_start_date >= v_this_month_start;
  
  -- Average job value
  SELECT COALESCE(AVG(j.job_value), 0)
  INTO v_avg_job_value
  FROM public.roofing_jobs j
  WHERE j.workspace_id = p_workspace_id
    AND j.status = 'completed'
    AND j.scheduled_end_date >= v_this_month_start;
  
  -- Pipeline revenue (from leads table)
  v_result := jsonb_build_object(
    'this_week', jsonb_build_object(
      'jobs_completed', v_this_week_completed,
      'revenue_collected', v_this_week_revenue,
      'outstanding_payments', v_this_week_outstanding
    ),
    'this_month', jsonb_build_object(
      'total_revenue', v_this_month_revenue,
      'forecasted_revenue', v_this_month_forecast,
      'average_job_value', v_avg_job_value
    ),
    'pipeline', (
      SELECT jsonb_build_object(
        'lead_in', COALESCE(SUM(CASE WHEN l.stage = 'lead' THEN l.estimated_job_value ELSE 0 END), 0),
        'inspections_set', COALESCE(SUM(CASE WHEN l.stage = 'inspection_scheduled' THEN l.estimated_job_value ELSE 0 END), 0),
        'quotes_sent', COALESCE(SUM(CASE WHEN l.stage = 'quote_sent' THEN l.estimated_job_value ELSE 0 END), 0),
        'approved', COALESCE(SUM(CASE WHEN l.stage = 'approved' THEN l.estimated_job_value ELSE 0 END), 0),
        'scheduled', COALESCE(SUM(CASE WHEN l.stage = 'scheduled' THEN l.estimated_job_value ELSE 0 END), 0)
      )
      FROM public.leads l
      WHERE l.workspace_id = p_workspace_id
        AND l.stage IN ('lead', 'inspection_scheduled', 'quote_sent', 'approved', 'scheduled')
    )
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 3 — CREATE ops_dashboard_crew_load VIEW
-- ============================================================================
-- Shows crew workload and assignments for today

CREATE OR REPLACE VIEW public.ops_dashboard_crew_load AS
SELECT 
  c.id as crew_id,
  c.workspace_id,
  c.name as crew_name,
  c.is_active,
  
  -- Today's jobs
  COUNT(DISTINCT j.id) FILTER (WHERE j.scheduled_start_date = CURRENT_DATE) as jobs_today,
  
  -- Job details for today
  jsonb_agg(
    DISTINCT jsonb_build_object(
      'job_id', j.id,
      'job_title', j.title,
      'start_time', j.scheduled_start_date,
      'health_score', hs.overall_score,
      'status', j.status
    )
  ) FILTER (WHERE j.scheduled_start_date = CURRENT_DATE) as today_jobs,
  
  -- Load status
  CASE 
    WHEN COUNT(DISTINCT j.id) FILTER (WHERE j.scheduled_start_date = CURRENT_DATE) = 0 THEN 'idle'
    WHEN COUNT(DISTINCT j.id) FILTER (WHERE j.scheduled_start_date = CURRENT_DATE) = 1 THEN 'balanced'
    WHEN COUNT(DISTINCT j.id) FILTER (WHERE j.scheduled_start_date = CURRENT_DATE) = 2 THEN 'busy'
    ELSE 'overloaded'
  END as load_status,
  
  -- Average health score for today's jobs
  AVG(hs.overall_score) FILTER (WHERE j.scheduled_start_date = CURRENT_DATE) as avg_health_score
  
FROM public.crews c
LEFT JOIN public.job_crew_assignments jca ON jca.crew_id = c.id AND jca.unassigned_at IS NULL
LEFT JOIN public.roofing_jobs j ON j.id = jca.job_id AND j.status IN ('scheduled', 'in_progress')
LEFT JOIN public.job_health_scores hs ON hs.job_id = j.id
WHERE c.is_active = true
GROUP BY c.id, c.workspace_id, c.name, c.is_active;

-- ============================================================================
-- PART 4 — CREATE ops_dashboard_material_issues VIEW
-- ============================================================================
-- Shows real-time material and supplier issues

CREATE OR REPLACE VIEW public.ops_dashboard_material_issues AS
SELECT 
  mo.id as material_order_id,
  mo.workspace_id,
  mo.job_id,
  j.title as job_title,
  mo.status,
  mo.expected_delivery_date,
  mo.actual_delivery_date,
  mo.issue_reported,
  mo.issue_description,
  
  -- Supplier info
  s.id as supplier_id,
  s.name as supplier_name,
  s.phone as supplier_phone,
  s.email as supplier_email,
  
  -- Issue type
  CASE 
    WHEN mo.issue_reported = true THEN 'issue_reported'
    WHEN mo.status = 'delayed' THEN 'delayed'
    WHEN mo.expected_delivery_date < CURRENT_DATE AND mo.status NOT IN ('delivered', 'materials_approved_for_build') THEN 'overdue'
    WHEN mo.status = 'issue_reported' THEN 'issue_reported'
    ELSE NULL
  END as issue_type,
  
  -- Material items summary
  (SELECT jsonb_agg(jsonb_build_object(
    'description', moi.description,
    'quantity', moi.quantity,
    'unit', moi.unit
  ))
  FROM public.material_order_items moi
  WHERE moi.material_order_id = mo.id) as material_items,
  
  mo.created_at,
  mo.updated_at
  
FROM public.material_orders mo
LEFT JOIN public.roofing_jobs j ON j.id = mo.job_id
LEFT JOIN public.suppliers s ON s.id = mo.supplier_id
WHERE mo.workspace_id IS NOT NULL
  AND (
    mo.issue_reported = true
    OR mo.status = 'delayed'
    OR (mo.expected_delivery_date < CURRENT_DATE AND mo.status NOT IN ('delivered', 'materials_approved_for_build'))
  )
  AND j.status IN ('scheduled', 'in_progress');

-- ============================================================================
-- PART 5 — CREATE ops_dashboard_insurance_progress VIEW
-- ============================================================================
-- Shows insurance job progress and status

CREATE OR REPLACE VIEW public.ops_dashboard_insurance_progress AS
SELECT 
  jif.id,
  jif.workspace_id,
  jif.job_id,
  j.title as job_title,
  jif.carrier,
  jif.claim_number,
  
  -- ACV status
  CASE 
    WHEN jif.acv_received = true THEN 'paid'
    WHEN jif.acv_amount > 0 THEN 'pending'
    ELSE NULL
  END as acv_status,
  jif.acv_amount,
  jif.acv_received_date,
  
  -- Supplement status
  jif.supplement_status,
  jif.supplement_amount,
  jif.supplement_approved_date,
  
  -- Depreciation status
  CASE 
    WHEN jif.depreciation_payment_received = true THEN 'paid'
    WHEN jif.depreciation_owed > 0 THEN 'pending'
    ELSE NULL
  END as depreciation_status,
  jif.depreciation_owed,
  jif.depreciation_payment_received_date,
  
  -- Adjuster visits today
  CASE 
    WHEN jif.adjuster_inspection_scheduled_date = CURRENT_DATE THEN true
    ELSE false
  END as adjuster_visit_today,
  
  -- Health score
  hs.overall_score as health_score,
  hs.health_status,
  
  -- Document vault status (simplified - would need document_vault table)
  false as document_vault_complete,
  
  jif.created_at,
  jif.updated_at
  
FROM public.job_insurance_flow jif
LEFT JOIN public.roofing_jobs j ON j.id = jif.job_id
LEFT JOIN public.job_health_scores hs ON hs.job_id = j.id
WHERE jif.workspace_id IS NOT NULL
  AND j.status IN ('scheduled', 'in_progress', 'completed');

-- ============================================================================
-- PART 6 — CREATE ops_dashboard_job_health_overview FUNCTION
-- ============================================================================
-- Returns job health distribution

CREATE OR REPLACE FUNCTION public.get_ops_dashboard_job_health(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_healthy integer := 0;
  v_needs_attention integer := 0;
  v_at_risk integer := 0;
BEGIN
  -- Count jobs by health status
  SELECT 
    COUNT(*) FILTER (WHERE hs.overall_score >= 80),
    COUNT(*) FILTER (WHERE hs.overall_score >= 60 AND hs.overall_score < 80),
    COUNT(*) FILTER (WHERE hs.overall_score < 60)
  INTO v_healthy, v_needs_attention, v_at_risk
  FROM public.job_health_scores hs
  INNER JOIN public.roofing_jobs j ON j.id = hs.job_id
  WHERE j.workspace_id = p_workspace_id
    AND j.status IN ('scheduled', 'in_progress');
  
  -- Get jobs by category with details
  v_result := jsonb_build_object(
    'healthy', jsonb_build_object(
      'count', v_healthy,
      'jobs', (
        SELECT jsonb_agg(jsonb_build_object(
          'job_id', j.id,
          'title', j.title,
          'health_score', hs.overall_score,
          'status', j.status
        ))
        FROM public.job_health_scores hs
        INNER JOIN public.roofing_jobs j ON j.id = hs.job_id
        WHERE j.workspace_id = p_workspace_id
          AND j.status IN ('scheduled', 'in_progress')
          AND hs.overall_score >= 80
        LIMIT 20
      )
    ),
    'needs_attention', jsonb_build_object(
      'count', v_needs_attention,
      'jobs', (
        SELECT jsonb_agg(jsonb_build_object(
          'job_id', j.id,
          'title', j.title,
          'health_score', hs.overall_score,
          'status', j.status,
          'issues', (
            SELECT jsonb_agg(jsonb_build_object(
              'issue_type', jhi.issue_type,
              'description', jhi.description
            ))
            FROM public.job_health_issues jhi
            WHERE jhi.job_id = j.id AND jhi.resolved = false
            LIMIT 5
          )
        ))
        FROM public.job_health_scores hs
        INNER JOIN public.roofing_jobs j ON j.id = hs.job_id
        WHERE j.workspace_id = p_workspace_id
          AND j.status IN ('scheduled', 'in_progress')
          AND hs.overall_score >= 60 AND hs.overall_score < 80
        LIMIT 20
      )
    ),
    'at_risk', jsonb_build_object(
      'count', v_at_risk,
      'jobs', (
        SELECT jsonb_agg(jsonb_build_object(
          'job_id', j.id,
          'title', j.title,
          'health_score', hs.overall_score,
          'status', j.status,
          'issues', (
            SELECT jsonb_agg(jsonb_build_object(
              'issue_type', jhi.issue_type,
              'description', jhi.description
            ))
            FROM public.job_health_issues jhi
            WHERE jhi.job_id = j.id AND jhi.resolved = false
            LIMIT 5
          )
        ))
        FROM public.job_health_scores hs
        INNER JOIN public.roofing_jobs j ON j.id = hs.job_id
        WHERE j.workspace_id = p_workspace_id
          AND j.status IN ('scheduled', 'in_progress')
          AND hs.overall_score < 60
        LIMIT 20
      )
    )
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 7 — CREATE ops_dashboard_action_suggestions FUNCTION
-- ============================================================================
-- Returns AI-powered action suggestions based on dashboard data

CREATE OR REPLACE FUNCTION public.get_ops_dashboard_action_suggestions(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_fix_now jsonb := '[]'::jsonb;
  v_revenue_opportunity jsonb := '[]'::jsonb;
  v_risk jsonb := '[]'::jsonb;
BEGIN
  -- FIX THESE NOW: Material issues, overdue payments, crew overload
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', 'fix_now',
      'priority', 'high',
      'title', 'Contact supplier about ' || j.title || ' delay',
      'description', COALESCE(mo.issue_description, 'Material delivery delayed'),
      'action', 'contact_supplier',
      'job_id', j.id,
      'supplier_id', mo.supplier_id
    )
  )
  INTO v_fix_now
  FROM public.material_orders mo
  INNER JOIN public.roofing_jobs j ON j.id = mo.job_id
  WHERE j.workspace_id = p_workspace_id
    AND mo.issue_reported = true
    AND j.status IN ('scheduled', 'in_progress')
  LIMIT 5;
  
  -- REVENUE OPPORTUNITY: Pending quotes, follow-ups needed
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', 'revenue_opportunity',
      'priority', 'medium',
      'title', 'Follow up on ' || COUNT(*) || ' pending quotes worth $' || COALESCE(SUM(l.estimated_job_value), 0),
      'description', 'Quotes sent but not yet approved',
      'action', 'follow_up_quotes',
      'count', COUNT(*),
      'value', COALESCE(SUM(l.estimated_job_value), 0)
    )
  )
  INTO v_revenue_opportunity
  FROM public.leads l
  WHERE l.workspace_id = p_workspace_id
    AND l.stage = 'quote_sent'
    AND l.updated_at < NOW() - INTERVAL '3 days'
  GROUP BY l.workspace_id
  LIMIT 3;
  
  -- RISK: Weather alerts, missing ACV, crew overload
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', 'risk',
      'priority', 'high',
      'title', 'Crew ' || c.name || ' is overloaded',
      'description', 'Multiple jobs assigned today - consider rescheduling',
      'action', 'reschedule_crew',
      'crew_id', c.id
    )
  )
  INTO v_risk
  FROM public.crews c
  INNER JOIN public.job_crew_assignments jca ON jca.crew_id = c.id AND jca.unassigned_at IS NULL
  INNER JOIN public.roofing_jobs j ON j.id = jca.job_id
  WHERE c.workspace_id = p_workspace_id
    AND j.scheduled_start_date = CURRENT_DATE
    AND j.status IN ('scheduled', 'in_progress')
  GROUP BY c.id, c.name
  HAVING COUNT(*) > 2
  LIMIT 3;
  
  v_result := jsonb_build_object(
    'fix_now', COALESCE(v_fix_now, '[]'::jsonb),
    'revenue_opportunity', COALESCE(v_revenue_opportunity, '[]'::jsonb),
    'risk', COALESCE(v_risk, '[]'::jsonb)
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 8 — GRANTS
-- ============================================================================

GRANT SELECT ON public.ops_dashboard_today_jobs TO authenticated;
GRANT SELECT ON public.ops_dashboard_crew_load TO authenticated;
GRANT SELECT ON public.ops_dashboard_material_issues TO authenticated;
GRANT SELECT ON public.ops_dashboard_insurance_progress TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ops_dashboard_revenue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ops_dashboard_job_health(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ops_dashboard_action_suggestions(uuid) TO authenticated;

COMMENT ON VIEW public.ops_dashboard_today_jobs IS 'Block 24740: Today''s jobs with crew, materials, payment, and health status';
COMMENT ON VIEW public.ops_dashboard_crew_load IS 'Block 24740: Crew workload and assignments for today';
COMMENT ON VIEW public.ops_dashboard_material_issues IS 'Block 24740: Real-time material and supplier issues';
COMMENT ON VIEW public.ops_dashboard_insurance_progress IS 'Block 24740: Insurance job progress and status';
COMMENT ON FUNCTION public.get_ops_dashboard_revenue(uuid) IS 'Block 24740: Returns revenue metrics for ops dashboard';
COMMENT ON FUNCTION public.get_ops_dashboard_job_health(uuid) IS 'Block 24740: Returns job health distribution';
COMMENT ON FUNCTION public.get_ops_dashboard_action_suggestions(uuid) IS 'Block 24740: Returns AI-powered action suggestions';






































