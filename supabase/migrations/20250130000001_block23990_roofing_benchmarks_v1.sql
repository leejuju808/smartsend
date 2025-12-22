-- =========================================================
-- Block 23990 — SmartSend Roofing Performance Benchmarks v1
-- (Roofing Metrics • What "Good" Looks Like • Intervention Triggers • Benchmarks That Increase Retention, Confidence & Upgrades)
-- =========================================================
--
-- This migration creates a comprehensive benchmark system that:
-- 1. Tracks 9 key performance metrics for roofers
-- 2. Provides intervention triggers for underperformance
-- 3. Calculates SmartSend Usage Score
-- 4. Enables "What Good Looks Like" dashboard display
-- 5. Drives upgrades and retention through clarity
-- =========================================================

-- ============================================================================
-- 1. BENCHMARK INTERVENTIONS TABLE
-- ============================================================================
-- Tracks when interventions are triggered and their status

CREATE TABLE IF NOT EXISTS public.benchmark_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  intervention_type text NOT NULL CHECK (intervention_type IN (
    'open_rate_low',
    'no_replies_48h',
    'low_lead_conversion',
    'no_campaigns_7d',
    'slow_hot_lead_response'
  )),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  message_sent_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_interventions_workspace 
  ON public.benchmark_interventions(workspace_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_benchmark_interventions_type 
  ON public.benchmark_interventions(intervention_type, resolved_at);

-- ============================================================================
-- 2. BENCHMARK SNAPSHOTS TABLE
-- ============================================================================
-- Stores calculated benchmark values per workspace (for historical tracking)

CREATE TABLE IF NOT EXISTS public.benchmark_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  
  -- Benchmark #1: Open Rate
  open_rate_pct numeric(5,2),
  
  -- Benchmark #2: Reply Rate
  reply_rate_pct numeric(5,2),
  
  -- Benchmark #3: Lead Conversion Rate (Replies → HOT/WARM)
  lead_conversion_rate_pct numeric(5,2),
  
  -- Benchmark #4: Booked Estimates (count per week)
  booked_estimates_per_week numeric(5,2),
  
  -- Benchmark #5: Estimated Job Value (10-40x monthly spend)
  estimated_job_value_multiplier numeric(5,2),
  estimated_job_value_dollars numeric(12,2),
  monthly_spend_dollars numeric(12,2),
  
  -- Benchmark #6: Campaign Launch Frequency (campaigns per week)
  campaigns_per_week numeric(5,2),
  
  -- Benchmark #7: Time to First Reply (hours)
  avg_time_to_first_reply_hours numeric(8,2),
  
  -- Benchmark #8: Response Time to HOT Leads (minutes)
  avg_hot_lead_response_time_minutes numeric(8,2),
  
  -- Benchmark #9: SmartSend Usage Score (0-100)
  usage_score numeric(5,2),
  
  -- Metadata
  total_campaigns int,
  total_emails_sent int,
  total_replies int,
  total_hot_warm_leads int,
  total_booked_estimates int,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_snapshots_workspace_date 
  ON public.benchmark_snapshots(workspace_id, snapshot_date DESC);

-- ============================================================================
-- 3. BENCHMARK CALCULATION FUNCTION
-- ============================================================================
-- Calculates all 9 benchmarks for a workspace

CREATE OR REPLACE FUNCTION public.calculate_workspace_benchmarks(
  p_workspace_id uuid,
  p_date_range_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz;
  v_end_date timestamptz;
  v_result jsonb;
  
  -- Benchmark values
  v_open_rate numeric;
  v_reply_rate numeric;
  v_lead_conversion_rate numeric;
  v_booked_estimates_per_week numeric;
  v_estimated_job_value_multiplier numeric;
  v_estimated_job_value_dollars numeric;
  v_monthly_spend_dollars numeric;
  v_campaigns_per_week numeric;
  v_avg_time_to_first_reply_hours numeric;
  v_avg_hot_lead_response_time_minutes numeric;
  v_usage_score numeric;
  
  -- Counts
  v_total_sent int;
  v_total_delivered int;
  v_total_opens int;
  v_total_replies int;
  v_total_hot_warm_leads int;
  v_total_booked_estimates int;
  v_total_campaigns int;
  v_days_in_range numeric;
  v_weeks_in_range numeric;
BEGIN
  v_end_date := now();
  v_start_date := v_end_date - (p_date_range_days || ' days')::interval;
  v_days_in_range := GREATEST(p_date_range_days, 1);
  v_weeks_in_range := v_days_in_range / 7.0;
  
  -- Get monthly spend from subscription
  SELECT COALESCE(sp.price_cents::numeric / 100.0, 0)
  INTO v_monthly_spend_dollars
  FROM public.workspace_subscriptions ws
  LEFT JOIN public.subscription_plans sp ON sp.id = ws.plan_id
  WHERE ws.workspace_id = p_workspace_id
    AND ws.status = 'active'
  LIMIT 1;
  
  -- Benchmark #1: Open Rate (30-55% target)
  SELECT 
    COUNT(*) FILTER (WHERE e.event_type = 'delivered') as delivered,
    COUNT(DISTINCT e.recipient_email) FILTER (WHERE e.event_type = 'open') as opens
  INTO v_total_delivered, v_total_opens
  FROM public.email_events e
  JOIN public.campaigns c ON c.id = e.campaign_id
  WHERE c.workspace_id = p_workspace_id
    AND e.created_at >= v_start_date
    AND e.created_at <= v_end_date;
  
  v_total_sent := COALESCE(v_total_delivered, 0);
  IF v_total_sent > 0 THEN
    v_open_rate := (v_total_opens::numeric / v_total_sent::numeric) * 100;
  ELSE
    v_open_rate := 0;
  END IF;
  
  -- Benchmark #2: Reply Rate (8-15% target)
  SELECT COUNT(DISTINCT im.from_email)
  INTO v_total_replies
  FROM public.inbound_messages im
  WHERE im.workspace_id = p_workspace_id
    AND im.created_at >= v_start_date
    AND im.created_at <= v_end_date;
  
  IF v_total_sent > 0 THEN
    v_reply_rate := (v_total_replies::numeric / v_total_sent::numeric) * 100;
  ELSE
    v_reply_rate := 0;
  END IF;
  
  -- Benchmark #3: Lead Conversion Rate (Replies → HOT/WARM) (25-40% target)
  SELECT COUNT(DISTINCT l.id)
  INTO v_total_hot_warm_leads
  FROM public.leads l
  WHERE l.workspace_id = p_workspace_id
    AND l.status IN ('hot', 'warm')
    AND l.replied_at >= v_start_date
    AND l.replied_at <= v_end_date;
  
  IF v_total_replies > 0 THEN
    v_lead_conversion_rate := (v_total_hot_warm_leads::numeric / v_total_replies::numeric) * 100;
  ELSE
    v_lead_conversion_rate := 0;
  END IF;
  
  -- Benchmark #4: Booked Estimates per Week (2-6 target)
  SELECT COUNT(*)
  INTO v_total_booked_estimates
  FROM public.jobs_conversions jc
  JOIN public.campaigns c ON c.id = jc.campaign_id
  WHERE c.workspace_id = p_workspace_id
    AND jc.conversion_type = 'booked_estimate'
    AND jc.created_at >= v_start_date
    AND jc.created_at <= v_end_date;
  
  IF v_weeks_in_range > 0 THEN
    v_booked_estimates_per_week := v_total_booked_estimates::numeric / v_weeks_in_range;
  ELSE
    v_booked_estimates_per_week := 0;
  END IF;
  
  -- Benchmark #5: Estimated Job Value (10-40x monthly spend)
  SELECT COALESCE(SUM(jc.estimated_value), 0)
  INTO v_estimated_job_value_dollars
  FROM public.jobs_conversions jc
  JOIN public.campaigns c ON c.id = jc.campaign_id
  WHERE c.workspace_id = p_workspace_id
    AND jc.conversion_type = 'booked_estimate'
    AND jc.created_at >= v_start_date
    AND jc.created_at <= v_end_date;
  
  IF v_monthly_spend_dollars > 0 THEN
    v_estimated_job_value_multiplier := v_estimated_job_value_dollars / v_monthly_spend_dollars;
  ELSE
    v_estimated_job_value_multiplier := 0;
  END IF;
  
  -- Benchmark #6: Campaign Launch Frequency (1-2/week target)
  SELECT COUNT(DISTINCT c.id)
  INTO v_total_campaigns
  FROM public.campaigns c
  WHERE c.workspace_id = p_workspace_id
    AND c.created_at >= v_start_date
    AND c.created_at <= v_end_date;
  
  IF v_weeks_in_range > 0 THEN
    v_campaigns_per_week := v_total_campaigns::numeric / v_weeks_in_range;
  ELSE
    v_campaigns_per_week := 0;
  END IF;
  
  -- Benchmark #7: Time to First Reply (<48 hours target)
  SELECT AVG(EXTRACT(EPOCH FROM (l.replied_at - c.created_at)) / 3600.0)
  INTO v_avg_time_to_first_reply_hours
  FROM public.leads l
  JOIN public.campaigns c ON c.id = l.campaign_id
  WHERE l.workspace_id = p_workspace_id
    AND l.replied_at IS NOT NULL
    AND l.replied_at >= v_start_date
    AND l.replied_at <= v_end_date
    AND c.created_at IS NOT NULL;
  
  v_avg_time_to_first_reply_hours := COALESCE(v_avg_time_to_first_reply_hours, 0);
  
  -- Benchmark #8: Response Time to HOT Leads (<15 minutes target)
  -- This requires tracking when HOT leads are created vs when they're responded to
  -- For now, we'll use a simplified calculation based on lead status changes
  SELECT AVG(EXTRACT(EPOCH FROM (l.updated_at - l.replied_at)) / 60.0)
  INTO v_avg_hot_lead_response_time_minutes
  FROM public.leads l
  WHERE l.workspace_id = p_workspace_id
    AND l.status = 'hot'
    AND l.replied_at IS NOT NULL
    AND l.replied_at >= v_start_date
    AND l.replied_at <= v_end_date
    AND l.updated_at > l.replied_at;
  
  v_avg_hot_lead_response_time_minutes := COALESCE(v_avg_hot_lead_response_time_minutes, 0);
  
  -- Benchmark #9: SmartSend Usage Score (70+ target)
  -- Score factors:
  -- - campaigns launched (20 points max)
  -- - replies handled (20 points max)
  -- - open rate (15 points max)
  -- - response time (15 points max)
  -- - dashboard visits (10 points max)
  -- - list size (10 points max)
  -- - engagement (10 points max)
  
  v_usage_score := 0;
  
  -- Campaigns launched (20 points)
  IF v_total_campaigns >= 4 THEN
    v_usage_score := v_usage_score + 20;
  ELSIF v_total_campaigns >= 2 THEN
    v_usage_score := v_usage_score + 15;
  ELSIF v_total_campaigns >= 1 THEN
    v_usage_score := v_usage_score + 10;
  END IF;
  
  -- Replies handled (20 points)
  IF v_total_replies >= 20 THEN
    v_usage_score := v_usage_score + 20;
  ELSIF v_total_replies >= 10 THEN
    v_usage_score := v_usage_score + 15;
  ELSIF v_total_replies >= 5 THEN
    v_usage_score := v_usage_score + 10;
  ELSIF v_total_replies >= 1 THEN
    v_usage_score := v_usage_score + 5;
  END IF;
  
  -- Open rate (15 points)
  IF v_open_rate >= 40 THEN
    v_usage_score := v_usage_score + 15;
  ELSIF v_open_rate >= 30 THEN
    v_usage_score := v_usage_score + 12;
  ELSIF v_open_rate >= 25 THEN
    v_usage_score := v_usage_score + 8;
  ELSIF v_open_rate >= 15 THEN
    v_usage_score := v_usage_score + 5;
  END IF;
  
  -- Response time (15 points) - inverse: faster = better
  IF v_avg_hot_lead_response_time_minutes <= 15 THEN
    v_usage_score := v_usage_score + 15;
  ELSIF v_avg_hot_lead_response_time_minutes <= 60 THEN
    v_usage_score := v_usage_score + 12;
  ELSIF v_avg_hot_lead_response_time_minutes <= 240 THEN
    v_usage_score := v_usage_score + 8;
  ELSIF v_avg_hot_lead_response_time_minutes > 0 THEN
    v_usage_score := v_usage_score + 5;
  END IF;
  
  -- Dashboard visits (10 points) - simplified: assume active if benchmarks are being calculated
  v_usage_score := v_usage_score + 10;
  
  -- List size (10 points) - count unique leads
  DECLARE
    v_list_size int;
  BEGIN
    SELECT COUNT(DISTINCT l.id)
    INTO v_list_size
    FROM public.leads l
    WHERE l.workspace_id = p_workspace_id;
    
    IF v_list_size >= 500 THEN
      v_usage_score := v_usage_score + 10;
    ELSIF v_list_size >= 200 THEN
      v_usage_score := v_usage_score + 8;
    ELSIF v_list_size >= 100 THEN
      v_usage_score := v_usage_score + 5;
    ELSIF v_list_size >= 50 THEN
      v_usage_score := v_usage_score + 3;
    END IF;
  END;
  
  -- Engagement (10 points) - based on reply rate
  IF v_reply_rate >= 12 THEN
    v_usage_score := v_usage_score + 10;
  ELSIF v_reply_rate >= 8 THEN
    v_usage_score := v_usage_score + 8;
  ELSIF v_reply_rate >= 5 THEN
    v_usage_score := v_usage_score + 5;
  ELSIF v_reply_rate >= 2 THEN
    v_usage_score := v_usage_score + 3;
  END IF;
  
  -- Build result JSON
  v_result := jsonb_build_object(
    'workspace_id', p_workspace_id,
    'date_range_days', p_date_range_days,
    'start_date', v_start_date,
    'end_date', v_end_date,
    'benchmarks', jsonb_build_object(
      'open_rate_pct', ROUND(v_open_rate, 2),
      'reply_rate_pct', ROUND(v_reply_rate, 2),
      'lead_conversion_rate_pct', ROUND(v_lead_conversion_rate, 2),
      'booked_estimates_per_week', ROUND(v_booked_estimates_per_week, 2),
      'estimated_job_value_multiplier', ROUND(v_estimated_job_value_multiplier, 2),
      'estimated_job_value_dollars', ROUND(v_estimated_job_value_dollars, 2),
      'monthly_spend_dollars', ROUND(v_monthly_spend_dollars, 2),
      'campaigns_per_week', ROUND(v_campaigns_per_week, 2),
      'avg_time_to_first_reply_hours', ROUND(v_avg_time_to_first_reply_hours, 2),
      'avg_hot_lead_response_time_minutes', ROUND(v_avg_hot_lead_response_time_minutes, 2),
      'usage_score', ROUND(v_usage_score, 2)
    ),
    'counts', jsonb_build_object(
      'total_campaigns', v_total_campaigns,
      'total_emails_sent', v_total_sent,
      'total_replies', v_total_replies,
      'total_hot_warm_leads', v_total_hot_warm_leads,
      'total_booked_estimates', v_total_booked_estimates
    )
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- 4. INTERVENTION DETECTION FUNCTION
-- ============================================================================
-- Checks if any interventions should be triggered

CREATE OR REPLACE FUNCTION public.check_benchmark_interventions(
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_benchmarks jsonb;
  v_interventions jsonb := '[]'::jsonb;
  v_intervention jsonb;
  v_open_rate numeric;
  v_reply_rate numeric;
  v_lead_conversion_rate numeric;
  v_campaigns_per_week numeric;
  v_avg_hot_lead_response_time_minutes numeric;
  v_last_campaign_date timestamptz;
BEGIN
  -- Get benchmarks for last 7 days
  v_benchmarks := public.calculate_workspace_benchmarks(p_workspace_id, 7);
  
  v_open_rate := (v_benchmarks->'benchmarks'->>'open_rate_pct')::numeric;
  v_reply_rate := (v_benchmarks->'benchmarks'->>'reply_rate_pct')::numeric;
  v_lead_conversion_rate := (v_benchmarks->'benchmarks'->>'lead_conversion_rate_pct')::numeric;
  v_campaigns_per_week := (v_benchmarks->'benchmarks'->>'campaigns_per_week')::numeric;
  v_avg_hot_lead_response_time_minutes := (v_benchmarks->'benchmarks'->>'avg_hot_lead_response_time_minutes')::numeric;
  
  -- Intervention #1: Open Rate Below 25%
  IF v_open_rate < 25 AND v_open_rate > 0 THEN
    -- Check if intervention already exists and unresolved
    IF NOT EXISTS (
      SELECT 1 FROM public.benchmark_interventions
      WHERE workspace_id = p_workspace_id
        AND intervention_type = 'open_rate_low'
        AND resolved_at IS NULL
    ) THEN
      INSERT INTO public.benchmark_interventions (workspace_id, intervention_type, metadata)
      VALUES (p_workspace_id, 'open_rate_low', jsonb_build_object('open_rate', v_open_rate))
      RETURNING jsonb_build_object(
        'type', 'open_rate_low',
        'message', 'Try this subject line: ''Quick question about your roof in {{city}}''',
        'triggered_at', triggered_at
      ) INTO v_intervention;
      
      v_interventions := v_interventions || jsonb_build_array(v_intervention);
    END IF;
  END IF;
  
  -- Intervention #2: No Replies After 48 Hours
  -- Check if there are campaigns with no replies after 48 hours
  SELECT MAX(c.created_at)
  INTO v_last_campaign_date
  FROM public.campaigns c
  WHERE c.workspace_id = p_workspace_id
    AND c.created_at >= now() - interval '7 days';
  
  IF v_last_campaign_date IS NOT NULL 
     AND v_last_campaign_date < now() - interval '48 hours'
     AND NOT EXISTS (
       SELECT 1 FROM public.inbound_messages im
       JOIN public.campaigns c ON c.id = im.campaign_id
       WHERE c.workspace_id = p_workspace_id
         AND im.created_at >= v_last_campaign_date
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.benchmark_interventions
       WHERE workspace_id = p_workspace_id
         AND intervention_type = 'no_replies_48h'
         AND resolved_at IS NULL
     ) THEN
    INSERT INTO public.benchmark_interventions (workspace_id, intervention_type, metadata)
    VALUES (p_workspace_id, 'no_replies_48h', jsonb_build_object('last_campaign_date', v_last_campaign_date))
    RETURNING jsonb_build_object(
      'type', 'no_replies_48h',
      'message', 'Try launching: Lead Revival, Free Inspection, or Storm Campaign',
      'triggered_at', triggered_at
    ) INTO v_intervention;
    
    v_interventions := v_interventions || jsonb_build_array(v_intervention);
  END IF;
  
  -- Intervention #3: Low Lead Conversion (<20%)
  IF v_lead_conversion_rate < 20 AND v_lead_conversion_rate > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.benchmark_interventions
      WHERE workspace_id = p_workspace_id
        AND intervention_type = 'low_lead_conversion'
        AND resolved_at IS NULL
    ) THEN
      INSERT INTO public.benchmark_interventions (workspace_id, intervention_type, metadata)
      VALUES (p_workspace_id, 'low_lead_conversion', jsonb_build_object('conversion_rate', v_lead_conversion_rate))
      RETURNING jsonb_build_object(
        'type', 'low_lead_conversion',
        'message', 'Try a different template to improve lead quality',
        'triggered_at', triggered_at
      ) INTO v_intervention;
      
      v_interventions := v_interventions || jsonb_build_array(v_intervention);
    END IF;
  END IF;
  
  -- Intervention #4: No Campaigns in 7 Days
  IF v_campaigns_per_week = 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.benchmark_interventions
      WHERE workspace_id = p_workspace_id
        AND intervention_type = 'no_campaigns_7d'
        AND resolved_at IS NULL
    ) THEN
      INSERT INTO public.benchmark_interventions (workspace_id, intervention_type, metadata)
      VALUES (p_workspace_id, 'no_campaigns_7d', jsonb_build_object('campaigns_per_week', v_campaigns_per_week))
      RETURNING jsonb_build_object(
        'type', 'no_campaigns_7d',
        'message', 'Roofers who launch weekly campaigns book 3× more estimates — want to activate one now?',
        'triggered_at', triggered_at
      ) INTO v_intervention;
      
      v_interventions := v_interventions || jsonb_build_array(v_intervention);
    END IF;
  END IF;
  
  -- Intervention #5: Slow Response to HOT Leads (>1 hour)
  IF v_avg_hot_lead_response_time_minutes > 60 AND v_avg_hot_lead_response_time_minutes > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.benchmark_interventions
      WHERE workspace_id = p_workspace_id
        AND intervention_type = 'slow_hot_lead_response'
        AND resolved_at IS NULL
    ) THEN
      INSERT INTO public.benchmark_interventions (workspace_id, intervention_type, metadata)
      VALUES (p_workspace_id, 'slow_hot_lead_response', jsonb_build_object('response_time_minutes', v_avg_hot_lead_response_time_minutes))
      RETURNING jsonb_build_object(
        'type', 'slow_hot_lead_response',
        'message', 'Hurry — HOT lead waiting. Respond now to increase chances of booking the estimate.',
        'triggered_at', triggered_at
      ) INTO v_intervention;
      
      v_interventions := v_interventions || jsonb_build_array(v_intervention);
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'workspace_id', p_workspace_id,
    'interventions', v_interventions,
    'benchmarks', v_benchmarks
  );
END;
$$;

-- ============================================================================
-- 5. BENCHMARK SNAPSHOT FUNCTION
-- ============================================================================
-- Creates a daily snapshot of benchmarks

CREATE OR REPLACE FUNCTION public.create_benchmark_snapshot(
  p_workspace_id uuid,
  p_snapshot_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_benchmarks jsonb;
  v_snapshot_id uuid;
BEGIN
  -- Calculate benchmarks for last 30 days
  v_benchmarks := public.calculate_workspace_benchmarks(p_workspace_id, 30);
  
  -- Insert or update snapshot
  INSERT INTO public.benchmark_snapshots (
    workspace_id,
    snapshot_date,
    open_rate_pct,
    reply_rate_pct,
    lead_conversion_rate_pct,
    booked_estimates_per_week,
    estimated_job_value_multiplier,
    estimated_job_value_dollars,
    monthly_spend_dollars,
    campaigns_per_week,
    avg_time_to_first_reply_hours,
    avg_hot_lead_response_time_minutes,
    usage_score,
    total_campaigns,
    total_emails_sent,
    total_replies,
    total_hot_warm_leads,
    total_booked_estimates
  )
  VALUES (
    p_workspace_id,
    p_snapshot_date,
    (v_benchmarks->'benchmarks'->>'open_rate_pct')::numeric,
    (v_benchmarks->'benchmarks'->>'reply_rate_pct')::numeric,
    (v_benchmarks->'benchmarks'->>'lead_conversion_rate_pct')::numeric,
    (v_benchmarks->'benchmarks'->>'booked_estimates_per_week')::numeric,
    (v_benchmarks->'benchmarks'->>'estimated_job_value_multiplier')::numeric,
    (v_benchmarks->'benchmarks'->>'estimated_job_value_dollars')::numeric,
    (v_benchmarks->'benchmarks'->>'monthly_spend_dollars')::numeric,
    (v_benchmarks->'benchmarks'->>'campaigns_per_week')::numeric,
    (v_benchmarks->'benchmarks'->>'avg_time_to_first_reply_hours')::numeric,
    (v_benchmarks->'benchmarks'->>'avg_hot_lead_response_time_minutes')::numeric,
    (v_benchmarks->'benchmarks'->>'usage_score')::numeric,
    (v_benchmarks->'counts'->>'total_campaigns')::int,
    (v_benchmarks->'counts'->>'total_emails_sent')::int,
    (v_benchmarks->'counts'->>'total_replies')::int,
    (v_benchmarks->'counts'->>'total_hot_warm_leads')::int,
    (v_benchmarks->'counts'->>'total_booked_estimates')::int
  )
  ON CONFLICT (workspace_id, snapshot_date) 
  DO UPDATE SET
    open_rate_pct = EXCLUDED.open_rate_pct,
    reply_rate_pct = EXCLUDED.reply_rate_pct,
    lead_conversion_rate_pct = EXCLUDED.lead_conversion_rate_pct,
    booked_estimates_per_week = EXCLUDED.booked_estimates_per_week,
    estimated_job_value_multiplier = EXCLUDED.estimated_job_value_multiplier,
    estimated_job_value_dollars = EXCLUDED.estimated_job_value_dollars,
    monthly_spend_dollars = EXCLUDED.monthly_spend_dollars,
    campaigns_per_week = EXCLUDED.campaigns_per_week,
    avg_time_to_first_reply_hours = EXCLUDED.avg_time_to_first_reply_hours,
    avg_hot_lead_response_time_minutes = EXCLUDED.avg_hot_lead_response_time_minutes,
    usage_score = EXCLUDED.usage_score,
    total_campaigns = EXCLUDED.total_campaigns,
    total_emails_sent = EXCLUDED.total_emails_sent,
    total_replies = EXCLUDED.total_replies,
    total_hot_warm_leads = EXCLUDED.total_hot_warm_leads,
    total_booked_estimates = EXCLUDED.total_booked_estimates
  RETURNING id INTO v_snapshot_id;
  
  RETURN v_snapshot_id;
END;
$$;

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.benchmark_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_snapshots ENABLE ROW LEVEL SECURITY;

-- Policies for benchmark_interventions
CREATE POLICY "Users can view interventions for their workspace"
  ON public.benchmark_interventions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = benchmark_interventions.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage interventions"
  ON public.benchmark_interventions
  FOR ALL
  USING (true) WITH CHECK (true);

-- Policies for benchmark_snapshots
CREATE POLICY "Users can view snapshots for their workspace"
  ON public.benchmark_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = benchmark_snapshots.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage snapshots"
  ON public.benchmark_snapshots
  FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.benchmark_interventions IS 'Tracks benchmark intervention triggers and their resolution status';
COMMENT ON TABLE public.benchmark_snapshots IS 'Daily snapshots of workspace benchmark metrics for historical tracking';
COMMENT ON FUNCTION public.calculate_workspace_benchmarks IS 'Calculates all 9 SmartSend roofing benchmarks for a workspace';
COMMENT ON FUNCTION public.check_benchmark_interventions IS 'Checks and creates intervention records for underperforming benchmarks';
COMMENT ON FUNCTION public.create_benchmark_snapshot IS 'Creates or updates a daily benchmark snapshot for a workspace';






































