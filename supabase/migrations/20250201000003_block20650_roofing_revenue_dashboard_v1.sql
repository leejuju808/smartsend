-- =========================================================
-- Block 20650 — SmartSend Roofing Revenue Dashboard v1
-- (Pipeline Value • Approved Claims • Install-Ready Money • Supplement Upside • Real Roofing KPIs)
-- =========================================================
--
-- This block creates the "money scoreboard" for roofing companies.
-- Roofers LOVE dashboards — but they HATE entering data.
-- SmartSend already has ALL the data, now we turn it into:
-- "Here's EXACTLY how much money you have in your pipeline."
-- =========================================================

-- ============================================================================
-- PART 1 — Function to Get Roofing Revenue Dashboard Data
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_roofing_revenue_dashboard(
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  
  -- Card values
  v_pipeline_total numeric := 0;
  v_pipeline_count integer := 0;
  v_approved_claim_value numeric := 0;
  v_approved_claim_count integer := 0;
  v_install_ready_total numeric := 0;
  v_install_ready_count integer := 0;
  v_supplement_total numeric := 0;
  v_completed_total numeric := 0;
  v_completed_count integer := 0;
  
  -- KPI values
  v_leads_this_month integer := 0;
  v_filed_claims integer := 0;
  v_approvals integer := 0;
  v_approval_rate numeric := 0;
  v_leads_to_install integer := 0;
  v_lead_to_install_rate numeric := 0;
  v_avg_job_value numeric := 0;
  v_avg_turnaround_days numeric := 0;
  v_proposals_sent integer := 0;
  v_jobs_closed integer := 0;
  v_win_rate numeric := 0;
  
  -- Pipeline breakdown
  v_new_leads integer := 0;
  v_claim_filed integer := 0;
  v_adjuster_scheduled integer := 0;
  v_claim_pending integer := 0;
  v_claim_approved integer := 0;
  v_install_ready integer := 0;
  v_scheduled integer := 0;
  v_in_progress integer := 0;
  v_completed integer := 0;
  
  -- Revenue forecast (last 30 days of completed jobs)
  v_revenue_forecast jsonb := '[]'::jsonb;
  
  -- Completed revenue by day (last 30 days)
  v_completed_revenue jsonb := '[]'::jsonb;
  
  -- Block 21260 — Revenue Forecast Brain v1 data
  v_forecast_data jsonb := '{}'::jsonb;
BEGIN
  -- ========================================================================
  -- A) Total Pipeline Value (All Jobs)
  -- ========================================================================
  SELECT 
    COALESCE(SUM(projected_job_value), 0),
    COUNT(*)
  INTO v_pipeline_total, v_pipeline_count
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage NOT IN ('COMPLETED', 'LOST', 'NOT_A_FIT')
  AND rj.projected_job_value IS NOT NULL;
  
  -- ========================================================================
  -- B) Approved Claim Value
  -- ========================================================================
  SELECT 
    COALESCE(SUM(projected_job_value), 0),
    COUNT(*)
  INTO v_approved_claim_value, v_approved_claim_count
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage IN ('CLAIM_APPROVED', 'INSTALL_READY')
  AND rj.projected_job_value IS NOT NULL;
  
  -- ========================================================================
  -- C) Install-Ready Revenue
  -- ========================================================================
  SELECT 
    COALESCE(SUM(projected_job_value), 0),
    COUNT(*)
  INTO v_install_ready_total, v_install_ready_count
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'INSTALL_READY'
  AND rj.projected_job_value IS NOT NULL;
  
  -- ========================================================================
  -- D) Supplement Opportunity Value
  -- ========================================================================
  SELECT COALESCE(SUM(supplement_value_estimate), 0)
  INTO v_supplement_total
  FROM public.roof_estimates re
  WHERE re.workspace_id = p_workspace_id
    AND re.supplement_value_estimate > 0
    AND re.status != 'rejected';
  
  -- ========================================================================
  -- E) Completed Revenue (Last 30 Days)
  -- ========================================================================
  SELECT 
    COALESCE(SUM(projected_job_value), 0),
    COUNT(*)
  INTO v_completed_total, v_completed_count
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'COMPLETED'
  AND rj.updated_at >= NOW() - INTERVAL '30 days'
  AND rj.projected_job_value IS NOT NULL;
  
  -- ========================================================================
  -- KPI: Leads This Month
  -- ========================================================================
  SELECT COUNT(*)
  INTO v_leads_this_month
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.created_at >= DATE_TRUNC('month', CURRENT_DATE);
  
  -- ========================================================================
  -- KPI: Approval Rate (approvals / filed_claims)
  -- ========================================================================
  SELECT COUNT(*)
  INTO v_filed_claims
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage IN ('CLAIM_FILED', 'ADJUSTER_SCHEDULED', 'CLAIM_PENDING', 'CLAIM_APPROVED', 'INSTALL_READY', 'SCHEDULED_INSTALL', 'IN_PROGRESS', 'COMPLETED');
  
  SELECT COUNT(*)
  INTO v_approvals
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage IN ('CLAIM_APPROVED', 'INSTALL_READY', 'SCHEDULED_INSTALL', 'IN_PROGRESS', 'COMPLETED');
  
  IF v_filed_claims > 0 THEN
    v_approval_rate := (v_approvals::numeric / v_filed_claims::numeric) * 100;
  END IF;
  
  -- ========================================================================
  -- KPI: Lead-to-Install Conversion Rate
  -- ========================================================================
  SELECT COUNT(*)
  INTO v_leads_to_install
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage IN ('INSTALL_READY', 'SCHEDULED_INSTALL', 'IN_PROGRESS', 'COMPLETED');
  
  IF v_leads_this_month > 0 THEN
    v_lead_to_install_rate := (v_leads_to_install::numeric / v_leads_this_month::numeric) * 100;
  END IF;
  
  -- ========================================================================
  -- KPI: Average Job Value
  -- ========================================================================
  SELECT COALESCE(AVG(projected_job_value), 0)
  INTO v_avg_job_value
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.projected_job_value IS NOT NULL
  AND rj.current_stage NOT IN ('LOST', 'NOT_A_FIT');
  
  -- ========================================================================
  -- KPI: Average Turnaround (Claim → Install)
  -- ========================================================================
  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (rj.updated_at - rj.created_at)) / 86400), 0)
  INTO v_avg_turnaround_days
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage IN ('INSTALL_READY', 'SCHEDULED_INSTALL', 'IN_PROGRESS', 'COMPLETED')
  AND rj.created_at >= NOW() - INTERVAL '90 days';
  
  -- ========================================================================
  -- KPI: Win Rate (Proposals sent → jobs closed)
  -- ========================================================================
  -- Count proposals sent (from proposals table)
  SELECT COUNT(DISTINCT p.id)
  INTO v_proposals_sent
  FROM public.proposals p
  WHERE p.workspace_id = p_workspace_id
    AND (p.email_sent_at IS NOT NULL OR p.sent_at IS NOT NULL)
    AND COALESCE(p.email_sent_at, p.sent_at) >= NOW() - INTERVAL '90 days';
  
  -- Count jobs closed
  SELECT COUNT(*)
  INTO v_jobs_closed
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'COMPLETED'
  AND rj.updated_at >= NOW() - INTERVAL '90 days';
  
  IF v_proposals_sent > 0 THEN
    v_win_rate := (v_jobs_closed::numeric / v_proposals_sent::numeric) * 100;
  END IF;
  
  -- ========================================================================
  -- Pipeline Breakdown by Stage
  -- ========================================================================
  SELECT COUNT(*) INTO v_new_leads
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'NEW_LEAD';
  
  SELECT COUNT(*) INTO v_claim_filed
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'CLAIM_FILED';
  
  SELECT COUNT(*) INTO v_adjuster_scheduled
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'ADJUSTER_SCHEDULED';
  
  SELECT COUNT(*) INTO v_claim_pending
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'CLAIM_PENDING';
  
  SELECT COUNT(*) INTO v_claim_approved
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'CLAIM_APPROVED';
  
  SELECT COUNT(*) INTO v_install_ready
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'INSTALL_READY';
  
  SELECT COUNT(*) INTO v_scheduled
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'SCHEDULED_INSTALL';
  
  SELECT COUNT(*) INTO v_in_progress
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'IN_PROGRESS';
  
  SELECT COUNT(*) INTO v_completed
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'COMPLETED';
  
  -- ========================================================================
  -- Revenue Forecast (Last 30 days of completed jobs)
  -- ========================================================================
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', DATE_TRUNC('day', rj.updated_at)::text,
      'revenue', COALESCE(SUM(rj.projected_job_value), 0)
    )
    ORDER BY DATE_TRUNC('day', rj.updated_at)
  )
  INTO v_revenue_forecast
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'COMPLETED'
  AND rj.updated_at >= NOW() - INTERVAL '30 days'
  AND rj.projected_job_value IS NOT NULL
  GROUP BY DATE_TRUNC('day', rj.updated_at);
  
  -- ========================================================================
  -- Completed Revenue by Day (Last 30 days)
  -- ========================================================================
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', DATE_TRUNC('day', rj.updated_at)::text,
      'revenue', COALESCE(SUM(rj.projected_job_value), 0)
    )
    ORDER BY DATE_TRUNC('day', rj.updated_at)
  )
  INTO v_completed_revenue
  FROM public.roofing_jobs rj
  WHERE (
    rj.thread_id IN (SELECT id FROM public.inbox_threads WHERE workspace_id = p_workspace_id)
    OR rj.contact_id IN (SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id)
    OR rj.lead_id IN (SELECT id FROM public.leads WHERE workspace_id = p_workspace_id)
    OR rj.campaign_id IN (SELECT id FROM public.campaigns WHERE workspace_id = p_workspace_id)
  )
  AND rj.current_stage = 'COMPLETED'
  AND rj.updated_at >= NOW() - INTERVAL '30 days'
  AND rj.projected_job_value IS NOT NULL
  GROUP BY DATE_TRUNC('day', rj.updated_at);
  
  -- ========================================================================
  -- Get Revenue Forecast Brain v1 data (Block 21260)
  -- ========================================================================
  SELECT public.get_revenue_dashboard_forecast(p_workspace_id, 30)
  INTO v_forecast_data;
  
  -- ========================================================================
  -- Build Result JSON
  -- ========================================================================
  v_result := jsonb_build_object(
    'cards', jsonb_build_object(
      'pipelineTotal', v_pipeline_total,
      'pipelineCount', v_pipeline_count,
      'approvedClaimValue', v_approved_claim_value,
      'approvedClaimCount', v_approved_claim_count,
      'installReadyTotal', v_install_ready_total,
      'installReadyCount', v_install_ready_count,
      'supplementTotal', v_supplement_total,
      'completedTotal', v_completed_total,
      'completedCount', v_completed_count
    ),
    'kpis', jsonb_build_object(
      'leadsThisMonth', v_leads_this_month,
      'approvalRate', ROUND(v_approval_rate, 1),
      'leadToInstallConversion', ROUND(v_lead_to_install_rate, 1),
      'avgJobValue', ROUND(v_avg_job_value, 2),
      'avgTurnaroundDays', ROUND(v_avg_turnaround_days, 1),
      'winRate', ROUND(v_win_rate, 1)
    ),
    'pipelineBreakdown', jsonb_build_object(
      'newLeads', v_new_leads,
      'claimFiled', v_claim_filed,
      'adjusterScheduled', v_adjuster_scheduled,
      'claimPending', v_claim_pending,
      'claimApproved', v_claim_approved,
      'installReady', v_install_ready,
      'scheduled', v_scheduled,
      'inProgress', v_in_progress,
      'completed', v_completed
    ),
    'revenueForecast', COALESCE(v_revenue_forecast, '[]'::jsonb),
    'completedRevenue', COALESCE(v_completed_revenue, '[]'::jsonb),
    -- Block 21260 — Revenue Forecast Brain v1 Integration
    'revenueForecastBrain', COALESCE(v_forecast_data, '{}'::jsonb)
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_roofing_revenue_dashboard IS 'Returns comprehensive roofing revenue dashboard data including pipeline value, approved claims, install-ready revenue, supplements, KPIs, and charts (Block 20650)';

