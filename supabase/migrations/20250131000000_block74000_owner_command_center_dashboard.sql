-- =========================================================
-- Block 74000 — SmartSend Roofing
-- "Owner Command Center + Daily Money Dashboard" v1
-- =========================================================
-- 
-- Roofing owners have ZERO visibility in their business.
-- This dashboard gives them what no one else gives them:
-- A single screen that shows the money, leads, jobs, and safety
-- for the entire company in real time.
--
-- This feature alone makes roofers say:
-- "I cannot run my business without this."
-- =========================================================

-- ============================================================================
-- 1. CREATE owner_daily_snapshots TABLE
-- ============================================================================
-- Stores daily snapshots for performance history and trend analysis

CREATE TABLE IF NOT EXISTS public.owner_daily_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  date date NOT NULL,
  
  -- Lead metrics
  total_leads integer DEFAULT 0,
  hot_leads integer DEFAULT 0,
  warm_leads integer DEFAULT 0,
  new_leads_today integer DEFAULT 0,
  
  -- Estimate metrics
  estimates_sent integer DEFAULT 0,
  estimates_sent_today integer DEFAULT 0,
  pending_estimates integer DEFAULT 0,
  pending_estimates_value numeric(12,2) DEFAULT 0,
  
  -- Follow-up metrics
  followups_due integer DEFAULT 0,
  followups_due_today integer DEFAULT 0,
  
  -- Job metrics
  jobs_in_pipeline integer DEFAULT 0,
  active_jobs integer DEFAULT 0,
  scheduled_jobs integer DEFAULT 0,
  in_production_jobs integer DEFAULT 0,
  delayed_jobs integer DEFAULT 0,
  completed_jobs integer DEFAULT 0,
  
  -- Revenue metrics
  projected_revenue numeric(12,2) DEFAULT 0,
  won_jobs integer DEFAULT 0,
  won_jobs_value numeric(12,2) DEFAULT 0,
  lost_jobs integer DEFAULT 0,
  
  -- Safety metrics
  safety_flags integer DEFAULT 0,
  ppe_non_compliance_count integer DEFAULT 0,
  missing_toolbox_talk_today boolean DEFAULT false,
  open_incidents integer DEFAULT 0,
  critical_incidents integer DEFAULT 0,
  
  -- Conversion metrics
  conversion_rate numeric(5,2) DEFAULT 0,
  replies_today integer DEFAULT 0,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one snapshot per company/workspace per day
  UNIQUE(COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), 
         COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), 
         date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_owner_snapshots_company_date 
  ON public.owner_daily_snapshots(company_id, date DESC) 
  WHERE company_id IS NOT NULL;
  
CREATE INDEX IF NOT EXISTS idx_owner_snapshots_workspace_date 
  ON public.owner_daily_snapshots(workspace_id, date DESC) 
  WHERE workspace_id IS NOT NULL;
  
CREATE INDEX IF NOT EXISTS idx_owner_snapshots_date 
  ON public.owner_daily_snapshots(date DESC);

COMMENT ON TABLE public.owner_daily_snapshots IS 
  'Block 74000: Daily snapshots of owner dashboard metrics for performance tracking';

-- ============================================================================
-- 2. CREATE FUNCTION: generate_daily_snapshot
-- ============================================================================
-- Generates a daily snapshot for a workspace/company
-- Called by cron job at 2 AM daily

CREATE OR REPLACE FUNCTION public.generate_daily_snapshot(
  p_workspace_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot_id uuid;
  v_total_leads integer;
  v_hot_leads integer;
  v_warm_leads integer;
  v_new_leads_today integer;
  v_estimates_sent integer;
  v_estimates_sent_today integer;
  v_pending_estimates integer;
  v_pending_estimates_value numeric(12,2);
  v_followups_due integer;
  v_followups_due_today integer;
  v_jobs_in_pipeline integer;
  v_active_jobs integer;
  v_scheduled_jobs integer;
  v_in_production_jobs integer;
  v_delayed_jobs integer;
  v_completed_jobs integer;
  v_projected_revenue numeric(12,2);
  v_won_jobs integer;
  v_won_jobs_value numeric(12,2);
  v_lost_jobs integer;
  v_safety_flags integer;
  v_ppe_non_compliance integer;
  v_missing_toolbox_talk boolean;
  v_open_incidents integer;
  v_critical_incidents integer;
  v_conversion_rate numeric(5,2);
  v_replies_today integer;
BEGIN
  -- Get lead metrics
  SELECT 
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE l.is_hot = true OR (l.pipeline_stage IN ('hot', 'Hot Lead')))::integer,
    COUNT(*) FILTER (WHERE l.pipeline_stage IN ('warm', 'Warm Lead'))::integer,
    COUNT(*) FILTER (WHERE DATE(l.created_at) = p_date)::integer
  INTO v_total_leads, v_hot_leads, v_warm_leads, v_new_leads_today
  FROM public.leads l
  WHERE (p_workspace_id IS NULL OR l.workspace_id = p_workspace_id)
    AND (p_company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.companies c 
      WHERE c.id = p_company_id AND c.workspace_id = l.workspace_id
    ));

  -- Get estimate metrics
  SELECT 
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE DATE(e.sent_at) = p_date)::integer,
    COUNT(*) FILTER (WHERE e.sent_at IS NULL OR e.sent_at > NOW() - INTERVAL '30 days')::integer,
    COALESCE(SUM(e.price) FILTER (WHERE e.sent_at IS NULL OR e.sent_at > NOW() - INTERVAL '30 days'), 0)
  INTO v_estimates_sent, v_estimates_sent_today, v_pending_estimates, v_pending_estimates_value
  FROM public.estimates e
  JOIN public.leads l ON l.id = e.lead_id
  WHERE (p_workspace_id IS NULL OR l.workspace_id = p_workspace_id)
    AND (p_company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.companies c 
      WHERE c.id = p_company_id AND c.workspace_id = l.workspace_id
    ));

  -- Get follow-up metrics
  SELECT 
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE ef.due_date = p_date)::integer
  INTO v_followups_due, v_followups_due_today
  FROM public.estimate_followups ef
  JOIN public.leads l ON l.id = ef.lead_id
  WHERE ef.sent = false
    AND (p_workspace_id IS NULL OR l.workspace_id = p_workspace_id)
    AND (p_company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.companies c 
      WHERE c.id = p_company_id AND c.workspace_id = l.workspace_id
    ));

  -- Get job metrics
  SELECT 
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE j.stage IN ('scheduled', 'in_progress', 'in_production'))::integer,
    COUNT(*) FILTER (WHERE j.stage = 'scheduled')::integer,
    COUNT(*) FILTER (WHERE j.stage IN ('in_progress', 'in_production'))::integer,
    COUNT(*) FILTER (WHERE j.stage = 'delayed')::integer,
    COUNT(*) FILTER (WHERE j.stage = 'completed')::integer
  INTO v_jobs_in_pipeline, v_active_jobs, v_scheduled_jobs, v_in_production_jobs, 
       v_delayed_jobs, v_completed_jobs
  FROM public.jobs j
  WHERE (p_workspace_id IS NULL OR EXISTS (
      SELECT 1 FROM public.leads l 
      WHERE l.id = j.lead_id AND l.workspace_id = p_workspace_id
    ))
    AND (p_company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.leads l 
      JOIN public.companies c ON c.workspace_id = l.workspace_id
      WHERE l.id = j.lead_id AND c.id = p_company_id
    ));

  -- Get revenue metrics
  SELECT 
    COALESCE(SUM(j.contract_value), 0),
    COUNT(*) FILTER (WHERE j.stage = 'completed' AND DATE(j.updated_at) = p_date)::integer,
    COALESCE(SUM(j.contract_value) FILTER (WHERE j.stage = 'completed' AND DATE(j.updated_at) = p_date), 0),
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.leads l 
      WHERE l.id = j.lead_id AND l.status = 'lost'
    ))::integer
  INTO v_projected_revenue, v_won_jobs, v_won_jobs_value, v_lost_jobs
  FROM public.jobs j
  WHERE j.stage IN ('scheduled', 'in_progress', 'in_production', 'approved')
    AND (p_workspace_id IS NULL OR EXISTS (
      SELECT 1 FROM public.leads l 
      WHERE l.id = j.lead_id AND l.workspace_id = p_workspace_id
    ))
    AND (p_company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.leads l 
      JOIN public.companies c ON c.workspace_id = l.workspace_id
      WHERE l.id = j.lead_id AND c.id = p_company_id
    ));

  -- Get safety metrics
  SELECT 
    COUNT(*) FILTER (WHERE 
      (pc.hard_hat = false OR pc.harness = false OR pc.boots = false OR pc.vest = false)
      AND DATE(pc.date) = p_date
    )::integer,
    NOT EXISTS (
      SELECT 1 FROM public.toolbox_talks tt
      WHERE DATE(tt.date) = p_date
        AND (p_workspace_id IS NULL OR tt.workspace_id = p_workspace_id)
    ),
    COUNT(*) FILTER (WHERE ir.status IN ('reported', 'investigating'))::integer,
    COUNT(*) FILTER (WHERE ir.severity IN ('high', 'critical') AND ir.status IN ('reported', 'investigating'))::integer
  INTO v_ppe_non_compliance, v_missing_toolbox_talk, v_open_incidents, v_critical_incidents
  FROM public.ppe_checks pc
  FULL OUTER JOIN public.incident_reports ir ON (
    (p_workspace_id IS NULL OR ir.workspace_id = p_workspace_id)
    AND (p_company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.companies c 
      WHERE c.id = p_company_id AND c.workspace_id = ir.workspace_id
    ))
  )
  WHERE (p_workspace_id IS NULL OR pc.workspace_id = p_workspace_id)
    AND (p_company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.companies c 
      WHERE c.id = p_company_id AND c.workspace_id = pc.workspace_id
    ));

  v_safety_flags := v_ppe_non_compliance + v_open_incidents + CASE WHEN v_missing_toolbox_talk THEN 1 ELSE 0 END;

  -- Get conversion and reply metrics
  SELECT 
    COUNT(*) FILTER (WHERE DATE(lr.created_at) = p_date)::integer,
    CASE 
      WHEN v_estimates_sent > 0 THEN 
        (v_won_jobs::numeric / NULLIF(v_estimates_sent, 0) * 100)
      ELSE 0
    END
  INTO v_replies_today, v_conversion_rate
  FROM public.lead_replies lr
  JOIN public.leads l ON l.id = lr.lead_id
  WHERE (p_workspace_id IS NULL OR l.workspace_id = p_workspace_id)
    AND (p_company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.companies c 
      WHERE c.id = p_company_id AND c.workspace_id = l.workspace_id
    ));

  -- Insert or update snapshot
  INSERT INTO public.owner_daily_snapshots (
    company_id,
    workspace_id,
    date,
    total_leads,
    hot_leads,
    warm_leads,
    new_leads_today,
    estimates_sent,
    estimates_sent_today,
    pending_estimates,
    pending_estimates_value,
    followups_due,
    followups_due_today,
    jobs_in_pipeline,
    active_jobs,
    scheduled_jobs,
    in_production_jobs,
    delayed_jobs,
    completed_jobs,
    projected_revenue,
    won_jobs,
    won_jobs_value,
    lost_jobs,
    safety_flags,
    ppe_non_compliance_count,
    missing_toolbox_talk_today,
    open_incidents,
    critical_incidents,
    conversion_rate,
    replies_today
  ) VALUES (
    p_company_id,
    p_workspace_id,
    p_date,
    v_total_leads,
    v_hot_leads,
    v_warm_leads,
    v_new_leads_today,
    v_estimates_sent,
    v_estimates_sent_today,
    v_pending_estimates,
    v_pending_estimates_value,
    v_followups_due,
    v_followups_due_today,
    v_jobs_in_pipeline,
    v_active_jobs,
    v_scheduled_jobs,
    v_in_production_jobs,
    v_delayed_jobs,
    v_completed_jobs,
    v_projected_revenue,
    v_won_jobs,
    v_won_jobs_value,
    v_lost_jobs,
    v_safety_flags,
    v_ppe_non_compliance,
    v_missing_toolbox_talk,
    v_open_incidents,
    v_critical_incidents,
    v_conversion_rate,
    v_replies_today
  )
  ON CONFLICT (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
    date
  )
  DO UPDATE SET
    total_leads = EXCLUDED.total_leads,
    hot_leads = EXCLUDED.hot_leads,
    warm_leads = EXCLUDED.warm_leads,
    new_leads_today = EXCLUDED.new_leads_today,
    estimates_sent = EXCLUDED.estimates_sent,
    estimates_sent_today = EXCLUDED.estimates_sent_today,
    pending_estimates = EXCLUDED.pending_estimates,
    pending_estimates_value = EXCLUDED.pending_estimates_value,
    followups_due = EXCLUDED.followups_due,
    followups_due_today = EXCLUDED.followups_due_today,
    jobs_in_pipeline = EXCLUDED.jobs_in_pipeline,
    active_jobs = EXCLUDED.active_jobs,
    scheduled_jobs = EXCLUDED.scheduled_jobs,
    in_production_jobs = EXCLUDED.in_production_jobs,
    delayed_jobs = EXCLUDED.delayed_jobs,
    completed_jobs = EXCLUDED.completed_jobs,
    projected_revenue = EXCLUDED.projected_revenue,
    won_jobs = EXCLUDED.won_jobs,
    won_jobs_value = EXCLUDED.won_jobs_value,
    lost_jobs = EXCLUDED.lost_jobs,
    safety_flags = EXCLUDED.safety_flags,
    ppe_non_compliance_count = EXCLUDED.ppe_non_compliance_count,
    missing_toolbox_talk_today = EXCLUDED.missing_toolbox_talk_today,
    open_incidents = EXCLUDED.open_incidents,
    critical_incidents = EXCLUDED.critical_incidents,
    conversion_rate = EXCLUDED.conversion_rate,
    replies_today = EXCLUDED.replies_today
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

COMMENT ON FUNCTION public.generate_daily_snapshot IS 
  'Block 74000: Generates daily snapshot of owner dashboard metrics';

-- ============================================================================
-- 3. ENABLE RLS
-- ============================================================================

ALTER TABLE public.owner_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Policy: Workspace members can view snapshots for their workspace
CREATE POLICY "owner_snapshots_workspace_members"
  ON public.owner_daily_snapshots
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT c.id
      FROM public.companies c
      JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- Policy: Service role can insert/update snapshots (for cron job)
CREATE POLICY "owner_snapshots_service_role"
  ON public.owner_daily_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);



























