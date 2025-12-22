-- =========================================================
-- Block 244000 — Reporting Engine Automations
-- Daily report generation and alert functions
-- =========================================================

-- ============================================================================
-- PART 1 — DAILY REPORT GENERATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_daily_reports(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_month_start date := date_trunc('month', v_today);
  v_week_start date := date_trunc('week', v_today);
  v_company_id uuid;
BEGIN
  -- Get company ID if exists
  SELECT id INTO v_company_id
  FROM public.roofing_companies
  WHERE workspace_id = p_workspace_id
  LIMIT 1;

  -- Generate sales rep reports (monthly)
  PERFORM public.generate_sales_rep_report(
    p_workspace_id,
    rep.id,
    'monthly',
    v_month_start,
    v_today
  )
  FROM public.profiles rep
  WHERE rep.id IN (
    SELECT user_id FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
  );

  -- Generate marketing channel reports (monthly)
  -- This would be called via API or separate function
  -- For now, we'll create a placeholder

  -- Generate crew reports (monthly)
  -- This would be called via API or separate function

  -- Generate cashflow report (daily)
  -- This would be called via API or separate function

  RAISE NOTICE 'Daily reports generated for workspace %', p_workspace_id;
END;
$$;

-- ============================================================================
-- PART 2 — PREDICTIVE ALERT GENERATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_predictive_alerts(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
  v_job record;
  v_crew record;
  v_cashflow record;
  v_alert_id uuid;
BEGIN
  -- Get company ID if exists
  SELECT id INTO v_company_id
  FROM public.roofing_companies
  WHERE workspace_id = p_workspace_id
  LIMIT 1;

  -- Check for jobs trending over budget
  FOR v_job IN
    SELECT 
      j.id,
      j.workspace_id,
      COALESCE(jc.total_cost, 0) as current_cost,
      COALESCE(jc.projected_revenue, j.estimated_value, 0) as projected_revenue,
      COALESCE(pa.estimated_profit, 0) as estimated_profit,
      COALESCE(pa.actual_profit, 0) as actual_profit
    FROM public.jobs j
    LEFT JOIN public.job_costs jc ON jc.job_id = j.id
    LEFT JOIN public.profit_analysis pa ON pa.job_id = j.id
    WHERE j.workspace_id = p_workspace_id
      AND j.status IN ('in_progress', 'won')
      AND COALESCE(jc.total_cost, 0) > 0
      AND COALESCE(jc.projected_revenue, j.estimated_value, 0) > 0
  LOOP
    -- If actual cost is > 90% of revenue, flag as risk
    IF v_job.current_cost > (v_job.projected_revenue * 0.9) THEN
      -- Check if alert already exists
      SELECT id INTO v_alert_id
      FROM public.predictive_alerts
      WHERE workspace_id = p_workspace_id
        AND related_entity_type = 'job'
        AND related_entity_id = v_job.id
        AND alert_type = 'budget_overrun'
        AND is_resolved = false;

      IF v_alert_id IS NULL THEN
        INSERT INTO public.predictive_alerts (
          workspace_id,
          roofing_company_id,
          alert_type,
          severity,
          title,
          message,
          predicted_date,
          related_entity_type,
          related_entity_id,
          data
        ) VALUES (
          p_workspace_id,
          v_company_id,
          'budget_overrun',
          CASE 
            WHEN v_job.current_cost > v_job.projected_revenue THEN 'critical'
            ELSE 'high'
          END,
          'Job trending over budget',
          format('Job cost is %.0f%% of revenue. Risk of loss if costs continue.', 
            (v_job.current_cost / NULLIF(v_job.projected_revenue, 0)) * 100),
          CURRENT_DATE + INTERVAL '7 days',
          'job',
          v_job.id,
          jsonb_build_object(
            'current_cost', v_job.current_cost,
            'projected_revenue', v_job.projected_revenue,
            'margin_at_risk', ((v_job.projected_revenue - v_job.current_cost) / NULLIF(v_job.projected_revenue, 0)) * 100
          )
        );
      END IF;
    END IF;
  END LOOP;

  -- Check for cashflow issues
  SELECT 
    cash_in,
    cash_out,
    ar_total,
    ar_overdue_90
  INTO v_cashflow
  FROM public.report_cashflow
  WHERE workspace_id = p_workspace_id
    AND period_start >= CURRENT_DATE - INTERVAL '30 days'
  ORDER BY period_start DESC
  LIMIT 1;

  IF v_cashflow IS NOT NULL THEN
    -- If AR overdue 90+ days is > 20% of total AR, alert
    IF v_cashflow.ar_overdue_90 > (v_cashflow.ar_total * 0.2) THEN
      SELECT id INTO v_alert_id
      FROM public.predictive_alerts
      WHERE workspace_id = p_workspace_id
        AND alert_type = 'cashflow_dip'
        AND is_resolved = false
        AND created_at > CURRENT_DATE - INTERVAL '7 days';

      IF v_alert_id IS NULL THEN
        INSERT INTO public.predictive_alerts (
          workspace_id,
          roofing_company_id,
          alert_type,
          severity,
          title,
          message,
          predicted_date,
          data
        ) VALUES (
          p_workspace_id,
          v_company_id,
          'cashflow_dip',
          'high',
          'High overdue AR affecting cashflow',
          format('$%.0fK in invoices overdue 90+ days (%.0f%% of total AR). Cashflow at risk if not collected.', 
            v_cashflow.ar_overdue_90 / 1000,
            (v_cashflow.ar_overdue_90 / NULLIF(v_cashflow.ar_total, 1)) * 100),
          CURRENT_DATE + INTERVAL '14 days',
          jsonb_build_object(
            'ar_total', v_cashflow.ar_total,
            'ar_overdue_90', v_cashflow.ar_overdue_90,
            'percentage', (v_cashflow.ar_overdue_90 / NULLIF(v_cashflow.ar_total, 1)) * 100
          )
        );
      END IF;
    END IF;
  END IF;

  -- Check for crew underperformance
  FOR v_crew IN
    SELECT 
      c.id,
      c.workspace_id,
      c.name,
      COALESCE(rc.performance_score, 0) as performance_score,
      COALESCE(rc.rework_rate, 0) as rework_rate
    FROM public.crews c
    LEFT JOIN LATERAL (
      SELECT performance_score, rework_rate
      FROM public.report_crews
      WHERE crew_id = c.id
        AND period = 'monthly'
        AND period_start >= date_trunc('month', CURRENT_DATE)
      ORDER BY period_start DESC
      LIMIT 1
    ) rc ON true
    WHERE c.workspace_id = p_workspace_id
      AND c.is_active = true
  LOOP
    IF v_crew.performance_score < 60 OR v_crew.rework_rate > 15 THEN
      SELECT id INTO v_alert_id
      FROM public.predictive_alerts
      WHERE workspace_id = p_workspace_id
        AND related_entity_type = 'crew'
        AND related_entity_id = v_crew.id
        AND alert_type = 'crew_underperformance'
        AND is_resolved = false
        AND created_at > CURRENT_DATE - INTERVAL '7 days';

      IF v_alert_id IS NULL THEN
        INSERT INTO public.predictive_alerts (
          workspace_id,
          roofing_company_id,
          alert_type,
          severity,
          title,
          message,
          predicted_date,
          related_entity_type,
          related_entity_id,
          data
        ) VALUES (
          p_workspace_id,
          v_company_id,
          'crew_underperformance',
          CASE 
            WHEN v_crew.performance_score < 50 THEN 'high'
            ELSE 'medium'
          END,
          format('Crew %s underperforming', v_crew.name),
          format('Performance score: %.0f%%. Rework rate: %.1f%%. Review crew performance and provide coaching.', 
            v_crew.performance_score,
            v_crew.rework_rate),
          CURRENT_DATE + INTERVAL '3 days',
          'crew',
          v_crew.id,
          jsonb_build_object(
            'performance_score', v_crew.performance_score,
            'rework_rate', v_crew.rework_rate
          )
        );
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Predictive alerts generated for workspace %', p_workspace_id;
END;
$$;

-- ============================================================================
-- PART 3 — SCHEDULED JOB (CRON) SETUP
-- ============================================================================
-- Note: This would typically be set up via pg_cron extension or external scheduler
-- For Supabase, you would use Edge Functions with cron triggers

COMMENT ON FUNCTION public.generate_daily_reports IS 'Generate daily reports for a workspace (Block 244000)';
COMMENT ON FUNCTION public.generate_predictive_alerts IS 'Generate predictive alerts for a workspace (Block 244000)';

























