-- =========================================================
-- Block 230000 — SmartSend Roofing "CEO Command Center Analytics + Financial Dashboard" v1
-- Full Sprint Step — No Bullshit. This is the CEO COMMAND CENTER.
-- =========================================================
-- 
-- This block makes roofing owners feel like executives, not firefighters.
-- Complete business intelligence system that shows:
-- - Are we making money?
-- - Which crews are performing?
-- - Which jobs are profitable?
-- - Where are we losing margin?
-- - What is our sales close rate?
-- - How many jobs are in the pipeline?
-- - What's our revenue forecast?
-- - Who's slacking? Who's elite?
-- =========================================================

-- ============================================================================
-- PART 1 — COMPANY REVENUE SUMMARY VIEW
-- ============================================================================
-- Aggregates total revenue, sold revenue, and completed revenue by workspace

CREATE OR REPLACE VIEW public.company_revenue_summary AS
SELECT 
  COALESCE(rj.workspace_id, j.workspace_id, ps.workspace_id) as workspace_id,
  COALESCE(SUM(rj.job_value), 0) as total_revenue,
  COALESCE(SUM(CASE WHEN rj.status = 'scheduled' OR rj.status = 'in_progress' OR rj.status = 'completed' THEN rj.job_value ELSE 0 END), 0) as sold_revenue,
  COALESCE(SUM(CASE WHEN rj.status = 'completed' THEN rj.job_value ELSE 0 END), 0) as completed_revenue,
  COALESCE(COUNT(DISTINCT CASE WHEN rj.status IN ('scheduled', 'in_progress', 'completed') THEN rj.id END), 0) as sold_jobs_count,
  COALESCE(COUNT(DISTINCT CASE WHEN rj.status = 'completed' THEN rj.id END), 0) as completed_jobs_count
FROM (
  SELECT id, workspace_id, job_value, status FROM public.roofing_jobs
  UNION ALL
  SELECT id, workspace_id, estimated_value as job_value, status FROM public.jobs WHERE estimated_value IS NOT NULL
) rj
LEFT JOIN public.jobs j ON j.id = rj.id
LEFT JOIN public.payment_schedules ps ON ps.job_id = rj.id
GROUP BY COALESCE(rj.workspace_id, j.workspace_id, ps.workspace_id);

-- ============================================================================
-- PART 2 — JOB PROFITABILITY VIEW
-- ============================================================================
-- Calculates revenue, costs, and profit per job

CREATE OR REPLACE VIEW public.job_profitability AS
SELECT 
  rj.id as job_id,
  COALESCE(rj.workspace_id, j.workspace_id) as workspace_id,
  COALESCE(rj.job_value, j.estimated_value, 0) as revenue,
  COALESCE(rj.actual_material_cost, rj.est_material_cost, 0) as materials_cost,
  COALESCE(rj.actual_labor_cost, rj.est_labor_cost, rj.calculated_labor_cost, 0) as labor_cost,
  COALESCE(rj.actual_other_cost, rj.est_other_cost, 0) as other_cost,
  (COALESCE(rj.actual_material_cost, rj.est_material_cost, 0) + 
   COALESCE(rj.actual_labor_cost, rj.est_labor_cost, rj.calculated_labor_cost, 0) + 
   COALESCE(rj.actual_other_cost, rj.est_other_cost, 0)) as total_cost,
  (COALESCE(rj.job_value, j.estimated_value, 0) - 
   (COALESCE(rj.actual_material_cost, rj.est_material_cost, 0) + 
    COALESCE(rj.actual_labor_cost, rj.est_labor_cost, rj.calculated_labor_cost, 0) + 
    COALESCE(rj.actual_other_cost, rj.est_other_cost, 0))) as gross_profit,
  CASE 
    WHEN COALESCE(rj.job_value, j.estimated_value, 0) > 0 
    THEN ROUND(
      ((COALESCE(rj.job_value, j.estimated_value, 0) - 
        (COALESCE(rj.actual_material_cost, rj.est_material_cost, 0) + 
         COALESCE(rj.actual_labor_cost, rj.est_labor_cost, rj.calculated_labor_cost, 0) + 
         COALESCE(rj.actual_other_cost, rj.est_other_cost, 0))) / 
       COALESCE(rj.job_value, j.estimated_value, 0)) * 100, 2
    )
    ELSE 0
  END as margin_pct,
  rj.status,
  rj.created_at
FROM public.roofing_jobs rj
LEFT JOIN public.jobs j ON j.id = rj.id
WHERE rj.job_value IS NOT NULL OR j.estimated_value IS NOT NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_job_profitability_workspace ON public.roofing_jobs(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_profitability_status ON public.roofing_jobs(status) WHERE status IS NOT NULL;

-- ============================================================================
-- PART 3 — SALES FUNNEL METRICS VIEW
-- ============================================================================
-- Tracks lead → estimate → contract → signed conversion

CREATE OR REPLACE VIEW public.sales_funnel_metrics AS
SELECT 
  l.workspace_id,
  COUNT(*) FILTER (WHERE l.status = 'new' OR l.status IS NULL) as leads_new,
  COUNT(*) FILTER (WHERE l.status = 'estimate_sent' OR l.status = 'quote_sent') as estimates_sent,
  COUNT(*) FILTER (WHERE l.status = 'contract_signed' OR l.status = 'signed' OR l.status = 'approved') as contracts_signed,
  COUNT(*) FILTER (WHERE l.status = 'lost' OR l.status = 'closed_lost') as lost_leads,
  COUNT(*) as total_leads,
  CASE 
    WHEN COUNT(*) FILTER (WHERE l.status = 'new' OR l.status IS NULL) > 0
    THEN ROUND(
      (COUNT(*) FILTER (WHERE l.status = 'contract_signed' OR l.status = 'signed' OR l.status = 'approved')::numeric / 
       COUNT(*) FILTER (WHERE l.status = 'new' OR l.status IS NULL)) * 100, 2
    )
    ELSE 0
  END as close_rate_pct
FROM public.leads l
WHERE l.workspace_id IS NOT NULL
GROUP BY l.workspace_id;

-- ============================================================================
-- PART 4 — CREW PERFORMANCE VIEW
-- ============================================================================
-- Aggregates crew performance metrics including safety, completion, and efficiency

CREATE OR REPLACE VIEW public.crew_performance AS
SELECT 
  c.id as crew_id,
  c.workspace_id,
  c.name as crew_name,
  COALESCE(AVG(ss.score), 0) as avg_safety_score,
  COUNT(DISTINCT CASE WHEN js.status = 'completed' OR rj.status = 'completed' THEN COALESCE(js.job_id, rj.id) END) as jobs_completed,
  COUNT(DISTINCT COALESCE(js.job_id, rj.id)) as total_jobs_assigned,
  COALESCE(AVG(cps.overall_score), 0) as overall_performance_score,
  COALESCE(AVG(cps.avg_hours_per_job), 0) as avg_hours_per_job,
  COALESCE(AVG(cps.on_time_percentage), 0) as on_time_percentage,
  COALESCE(AVG(cps.quality_score), 0) as quality_score,
  COALESCE(SUM(CASE WHEN rj.status = 'completed' THEN rj.job_value ELSE 0 END), 0) as total_revenue_generated
FROM public.crews c
LEFT JOIN public.safety_scores ss ON ss.crew_id = c.id
LEFT JOIN public.job_schedule js ON js.crew_id = c.id
LEFT JOIN public.roofing_jobs rj ON rj.id = js.job_id OR EXISTS (
  SELECT 1 FROM public.crew_assignments ca WHERE ca.crew_id = c.id AND ca.job_id = rj.id
)
LEFT JOIN public.crew_performance_scores cps ON cps.crew_id = c.id
WHERE c.is_active = true
GROUP BY c.id, c.workspace_id, c.name;

-- ============================================================================
-- PART 5 — ACCOUNTS RECEIVABLE VIEW
-- ============================================================================
-- Tracks unpaid invoices and overdue amounts

CREATE OR REPLACE VIEW public.accounts_receivable AS
SELECT 
  i.id as invoice_id,
  i.milestone_id,
  pm.schedule_id,
  ps.workspace_id,
  ps.company_id,
  COALESCE(i.amount, pm.amount, 0) as amount,
  COALESCE(i.amount_due, pm.amount - COALESCE(pm.paid_amount, 0), 0) as amount_due,
  i.status as invoice_status,
  pm.status as milestone_status,
  COALESCE(i.due_date, pm.due_date) as due_date,
  COALESCE(i.sent_at, i.created_at) as sent_at,
  CASE 
    WHEN COALESCE(i.due_date, pm.due_date) < CURRENT_DATE 
    THEN CURRENT_DATE - COALESCE(i.due_date, pm.due_date)
    ELSE 0
  END as days_overdue,
  rj.id as job_id,
  rj.title as job_title,
  l.homeowner_name,
  l.address as job_address
FROM public.invoices i
LEFT JOIN public.payment_milestones pm ON pm.id = i.milestone_id
LEFT JOIN public.payment_schedules ps ON ps.id = pm.schedule_id OR ps.id = i.schedule_id
LEFT JOIN public.roofing_jobs rj ON rj.id = i.job_id OR rj.id = ps.job_id
LEFT JOIN public.leads l ON l.id = rj.lead_id OR l.id = ps.lead_id
WHERE (i.status IN ('pending', 'unpaid', 'overdue', 'partial') OR i.status IS NULL)
  AND (pm.status IN ('unpaid', 'overdue', 'partial') OR pm.status IS NULL)
  AND COALESCE(i.amount_due, pm.amount - COALESCE(pm.paid_amount, 0), i.amount, pm.amount, 0) > 0;

-- ============================================================================
-- PART 6 — REVENUE FORECAST VIEW
-- ============================================================================
-- Projects revenue for next 30, 60, 90 days based on scheduled jobs and pipeline

CREATE OR REPLACE VIEW public.revenue_forecast AS
SELECT 
  workspace_id,
  -- Next 30 days
  COALESCE(SUM(CASE 
    WHEN scheduled_start_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    THEN job_value ELSE 0 END), 0) as forecast_30d,
  COUNT(DISTINCT CASE 
    WHEN scheduled_start_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    THEN id END) as jobs_30d,
  -- Next 60 days
  COALESCE(SUM(CASE 
    WHEN scheduled_start_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
    THEN job_value ELSE 0 END), 0) as forecast_60d,
  COUNT(DISTINCT CASE 
    WHEN scheduled_start_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
    THEN id END) as jobs_60d,
  -- Next 90 days
  COALESCE(SUM(CASE 
    WHEN scheduled_start_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
    THEN job_value ELSE 0 END), 0) as forecast_90d,
  COUNT(DISTINCT CASE 
    WHEN scheduled_start_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
    THEN id END) as jobs_90d,
  -- Signed but not scheduled (weighted probability)
  COALESCE(SUM(CASE 
    WHEN status IN ('scheduled', 'approved', 'signed') AND scheduled_start_date IS NULL
    THEN job_value * 0.85 ELSE 0 END), 0) as pending_signed_revenue,
  -- Estimates (weighted by close probability)
  COALESCE(SUM(CASE 
    WHEN status = 'estimate_sent' OR status = 'quote_sent'
    THEN projected_job_value * 0.30 ELSE 0 END), 0) as estimated_pipeline_revenue
FROM public.roofing_jobs
WHERE workspace_id IS NOT NULL
GROUP BY workspace_id;

-- ============================================================================
-- PART 7 — MONTHLY REVENUE TREND VIEW
-- ============================================================================
-- Tracks revenue by month for trend analysis

CREATE OR REPLACE VIEW public.monthly_revenue_trend AS
SELECT 
  workspace_id,
  DATE_TRUNC('month', COALESCE(rj.scheduled_start_date, rj.created_at, j.created_at)) as month,
  COALESCE(SUM(rj.job_value), SUM(j.estimated_value), 0) as revenue,
  COUNT(DISTINCT rj.id) as jobs_count,
  COALESCE(AVG(jp.margin_pct), 0) as avg_margin_pct
FROM public.roofing_jobs rj
LEFT JOIN public.jobs j ON j.id = rj.id
LEFT JOIN public.job_profitability jp ON jp.job_id = rj.id
WHERE rj.workspace_id IS NOT NULL
  AND rj.status = 'completed'
GROUP BY workspace_id, DATE_TRUNC('month', COALESCE(rj.scheduled_start_date, rj.created_at, j.created_at))
ORDER BY month DESC;

-- ============================================================================
-- PART 8 — TOP SALES REPS VIEW
-- ============================================================================
-- Ranks sales reps by revenue closed, win rate, and average deal size

CREATE OR REPLACE VIEW public.top_sales_reps AS
SELECT 
  l.workspace_id,
  l.owner_id as rep_user_id,
  COALESCE(p.email, u.email) as rep_email,
  COALESCE(p.full_name, u.email) as rep_name,
  COUNT(DISTINCT CASE WHEN rj.status IN ('scheduled', 'in_progress', 'completed', 'signed', 'approved') THEN rj.id END) as deals_closed,
  COUNT(DISTINCT l.id) as total_leads,
  CASE 
    WHEN COUNT(DISTINCT l.id) > 0
    THEN ROUND((COUNT(DISTINCT CASE WHEN rj.status IN ('scheduled', 'in_progress', 'completed', 'signed', 'approved') THEN rj.id END)::numeric / COUNT(DISTINCT l.id)) * 100, 2)
    ELSE 0
  END as win_rate_pct,
  COALESCE(SUM(CASE WHEN rj.status IN ('scheduled', 'in_progress', 'completed', 'signed', 'approved') THEN rj.job_value ELSE 0 END), 0) as total_revenue_closed,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN rj.status IN ('scheduled', 'in_progress', 'completed', 'signed', 'approved') THEN rj.id END) > 0
    THEN ROUND(COALESCE(SUM(CASE WHEN rj.status IN ('scheduled', 'in_progress', 'completed', 'signed', 'approved') THEN rj.job_value ELSE 0 END), 0) / COUNT(DISTINCT CASE WHEN rj.status IN ('scheduled', 'in_progress', 'completed', 'signed', 'approved') THEN rj.id END), 2)
    ELSE 0
  END as avg_deal_size
FROM public.leads l
LEFT JOIN public.roofing_jobs rj ON rj.lead_id = l.id
LEFT JOIN public.profiles p ON p.id = l.owner_id
LEFT JOIN auth.users u ON u.id = l.owner_id
WHERE l.workspace_id IS NOT NULL
  AND l.owner_id IS NOT NULL
GROUP BY l.workspace_id, l.owner_id, p.email, u.email, p.full_name
HAVING COUNT(DISTINCT l.id) > 0
ORDER BY total_revenue_closed DESC;

-- ============================================================================
-- PART 9 — JOB CYCLE TIME VIEW
-- ============================================================================
-- Tracks time from lead creation to job completion

CREATE OR REPLACE VIEW public.job_cycle_time AS
SELECT 
  rj.id as job_id,
  rj.workspace_id,
  l.created_at as lead_created_at,
  rj.created_at as job_created_at,
  rj.scheduled_start_date,
  rj.scheduled_end_date,
  CASE 
    WHEN rj.status = 'completed' AND rj.scheduled_end_date IS NOT NULL
    THEN rj.scheduled_end_date - l.created_at
    WHEN rj.status = 'completed' AND rj.updated_at IS NOT NULL
    THEN rj.updated_at::date - l.created_at::date
    ELSE NULL
  END as total_cycle_days,
  CASE 
    WHEN rj.scheduled_start_date IS NOT NULL AND l.created_at IS NOT NULL
    THEN rj.scheduled_start_date - l.created_at::date
    ELSE NULL
  END as days_to_schedule,
  CASE 
    WHEN rj.scheduled_end_date IS NOT NULL AND rj.scheduled_start_date IS NOT NULL
    THEN rj.scheduled_end_date - rj.scheduled_start_date
    ELSE NULL
  END as days_to_complete
FROM public.roofing_jobs rj
LEFT JOIN public.leads l ON l.id = rj.lead_id
WHERE rj.workspace_id IS NOT NULL;

-- ============================================================================
-- PART 10 — MATERIAL COST OVERRUN DETECTION VIEW
-- ============================================================================
-- Identifies jobs where actual material costs exceed estimates

CREATE OR REPLACE VIEW public.material_cost_overruns AS
SELECT 
  rj.id as job_id,
  rj.workspace_id,
  rj.job_value as revenue,
  rj.est_material_cost as estimated_material_cost,
  rj.actual_material_cost,
  CASE 
    WHEN rj.est_material_cost > 0 
    THEN rj.actual_material_cost - rj.est_material_cost
    ELSE 0
  END as overrun_amount,
  CASE 
    WHEN rj.est_material_cost > 0
    THEN ROUND(((rj.actual_material_cost - rj.est_material_cost) / rj.est_material_cost) * 100, 2)
    ELSE 0
  END as overrun_pct,
  rj.status
FROM public.roofing_jobs rj
WHERE rj.workspace_id IS NOT NULL
  AND rj.actual_material_cost IS NOT NULL
  AND rj.est_material_cost IS NOT NULL
  AND rj.actual_material_cost > rj.est_material_cost * 1.10; -- 10% threshold

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_workspace_status ON public.roofing_jobs(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_scheduled_date ON public.roofing_jobs(scheduled_start_date) WHERE scheduled_start_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_workspace_status ON public.leads(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due_date ON public.invoices(status, due_date) WHERE status IN ('pending', 'unpaid', 'overdue', 'partial');
CREATE INDEX IF NOT EXISTS idx_payment_milestones_status ON public.payment_milestones(status) WHERE status IN ('unpaid', 'overdue', 'partial');
CREATE INDEX IF NOT EXISTS idx_safety_scores_crew_period ON public.safety_scores(crew_id, period_end DESC);

COMMENT ON VIEW public.company_revenue_summary IS 'Block 230000: Aggregated revenue metrics by workspace';
COMMENT ON VIEW public.job_profitability IS 'Block 230000: Per-job profitability calculations';
COMMENT ON VIEW public.sales_funnel_metrics IS 'Block 230000: Lead conversion funnel metrics';
COMMENT ON VIEW public.crew_performance IS 'Block 230000: Crew performance aggregation';
COMMENT ON VIEW public.accounts_receivable IS 'Block 230000: Unpaid invoices and overdue tracking';
COMMENT ON VIEW public.revenue_forecast IS 'Block 230000: Revenue forecasting for next 30/60/90 days';
COMMENT ON VIEW public.monthly_revenue_trend IS 'Block 230000: Monthly revenue trends';
COMMENT ON VIEW public.top_sales_reps IS 'Block 230000: Sales rep performance rankings';
COMMENT ON VIEW public.job_cycle_time IS 'Block 230000: Job lifecycle time tracking';
COMMENT ON VIEW public.material_cost_overruns IS 'Block 230000: Material cost overrun detection';

























