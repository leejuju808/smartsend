-- ============================================================
-- Block 60000 — SmartSend Roofing "AI Scheduling Assistant + Predictive Workload Planner" v1
-- (AUTO-SCHEDULE JOBS • PREDICT CREW CAPACITY • AVOID OVERBOOKING • SUGGEST OPTIMAL DATES • FORECAST WORKLOAD • AI SCHEDULING DECISION ENGINE)
-- ============================================================
-- 
-- This block gives SmartSend a brain that handles the HARDEST problem in roofing:
-- 
-- 👉 When should this job be scheduled?
-- 👉 Which crew should handle it?
-- 👉 How long will it take?
-- 👉 Will this overbook us?
-- 👉 Will weather affect us?
--
-- Most roofing companies have NO system for this.
-- Owners schedule off the top of their head.
-- Schedulers guess.
-- Crews get double-booked.
-- Homeowners get upset.
-- Weather ruins everything.
-- Jobs take longer than expected.
--
-- THIS MODULE FIXES ALL OF THAT.
-- ============================================================

-- ============================================================================
-- PART 1 — AI SCHEDULING RECOMMENDATIONS TABLE
-- ============================================================================
-- Stores AI-generated scheduling recommendations for each job
-- Includes: recommended dates, crew, duration, confidence, reasoning

CREATE TABLE IF NOT EXISTS public.ai_scheduling_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Recommended schedule
  recommended_start date NOT NULL,
  recommended_end date NOT NULL,
  recommended_crew uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  -- AI confidence and reasoning
  confidence numeric(3,2) CHECK (confidence >= 0 AND confidence <= 1) DEFAULT 0.7,
  reasoning jsonb DEFAULT '{}'::jsonb, -- Stores AI reasoning breakdown
  
  -- Duration estimates
  estimated_duration_hours numeric(10,2),
  estimated_duration_days numeric(5,2),
  
  -- Status tracking
  status text CHECK (status IN ('pending', 'accepted', 'rejected', 'modified')) DEFAULT 'pending',
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_scheduling_recommendations_job 
  ON public.ai_scheduling_recommendations(job_id);
CREATE INDEX IF NOT EXISTS idx_ai_scheduling_recommendations_workspace 
  ON public.ai_scheduling_recommendations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_scheduling_recommendations_crew 
  ON public.ai_scheduling_recommendations(recommended_crew) WHERE recommended_crew IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_scheduling_recommendations_status 
  ON public.ai_scheduling_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_ai_scheduling_recommendations_dates 
  ON public.ai_scheduling_recommendations(recommended_start, recommended_end);

-- ============================================================================
-- PART 2 — SCHEDULING FORECASTS TABLE
-- ============================================================================
-- Weekly/monthly workload forecasts
-- Shows: hours needed vs available, shortages, overloads

CREATE TABLE IF NOT EXISTS public.scheduling_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Forecast period
  week_start date NOT NULL, -- Monday of the week
  week_end date NOT NULL,   -- Sunday of the week
  
  -- Labor capacity
  total_hours_required numeric(10,2) DEFAULT 0,
  total_hours_available numeric(10,2) DEFAULT 0,
  shortage numeric(10,2) GENERATED ALWAYS AS 
    (GREATEST(total_hours_required - total_hours_available, 0)) STORED,
  surplus numeric(10,2) GENERATED ALWAYS AS 
    (GREATEST(total_hours_available - total_hours_required, 0)) STORED,
  
  -- Job counts
  jobs_scheduled integer DEFAULT 0,
  jobs_pending integer DEFAULT 0,
  
  -- Crew breakdown (stored as JSONB for flexibility)
  crew_breakdown jsonb DEFAULT '{}'::jsonb, -- {crew_id: {hours_required, hours_available, shortage}}
  
  -- Forecast metadata
  forecast_type text CHECK (forecast_type IN ('weekly', 'monthly')) DEFAULT 'weekly',
  generated_at timestamptz DEFAULT now(),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- One forecast per workspace per week
  UNIQUE(workspace_id, week_start, forecast_type)
);

CREATE INDEX IF NOT EXISTS idx_scheduling_forecasts_workspace 
  ON public.scheduling_forecasts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_forecasts_week 
  ON public.scheduling_forecasts(week_start, week_end);
CREATE INDEX IF NOT EXISTS idx_scheduling_forecasts_shortage 
  ON public.scheduling_forecasts(shortage DESC) WHERE shortage > 0;

-- ============================================================================
-- PART 3 — HOMEOWNER SCHEDULE RESPONSES TABLE
-- ============================================================================
-- Tracks homeowner responses to proposed schedule dates

CREATE TABLE IF NOT EXISTS public.homeowner_schedule_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  
  -- Proposed schedule
  proposed_start_date date NOT NULL,
  proposed_end_date date,
  
  -- Homeowner response
  response text CHECK (response IN ('accepted', 'rejected', 'requested_change')) NOT NULL,
  notes text, -- Homeowner's notes/feedback
  
  -- If requested_change, store alternate preferences
  alternate_preferences jsonb DEFAULT '{}'::jsonb, -- {preferred_dates: [], unavailable_dates: [], notes: ""}
  
  -- Response metadata
  responded_at timestamptz DEFAULT now(),
  notification_sent_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_schedule_responses_job 
  ON public.homeowner_schedule_responses(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_schedule_responses_workspace 
  ON public.homeowner_schedule_responses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_schedule_responses_homeowner 
  ON public.homeowner_schedule_responses(homeowner_id) WHERE homeowner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_homeowner_schedule_responses_response 
  ON public.homeowner_schedule_responses(response);
CREATE INDEX IF NOT EXISTS idx_homeowner_schedule_responses_pending 
  ON public.homeowner_schedule_responses(job_id, response) WHERE response = 'requested_change';

-- ============================================================================
-- PART 4 — SCHEDULE CONFLICTS TABLE (if not exists)
-- ============================================================================
-- Tracks scheduling conflicts detected by the system

CREATE TABLE IF NOT EXISTS public.schedule_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Conflicting schedules
  schedule_id_1 uuid, -- Reference to crew_schedules or similar
  schedule_id_2 uuid,
  job_id_1 uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  job_id_2 uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  -- Conflict details
  conflict_type text CHECK (conflict_type IN ('crew_overlap', 'date_overlap', 'workload_overload', 'weather_risk')) NOT NULL,
  conflict_date date NOT NULL,
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  
  -- Resolution
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_workspace 
  ON public.schedule_conflicts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_crew 
  ON public.schedule_conflicts(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_unresolved 
  ON public.schedule_conflicts(workspace_id, resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_date 
  ON public.schedule_conflicts(conflict_date);

-- ============================================================================
-- PART 5 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Get crew availability for date range
CREATE OR REPLACE FUNCTION public.get_crew_availability(
  p_crew_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  date date,
  hours_available numeric,
  hours_committed numeric,
  is_available boolean
) AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS date
  ),
  crew_schedule AS (
    SELECT 
      cs.start_date::date AS schedule_date,
      COALESCE(SUM(cs.estimated_duration), 0) AS hours_committed
    FROM public.crew_schedules cs
    WHERE cs.crew_id = p_crew_id
      AND cs.status = 'scheduled'
      AND cs.start_date::date <= p_end_date
      AND (cs.end_date::date IS NULL OR cs.end_date::date >= p_start_date)
    GROUP BY cs.start_date::date
  )
  SELECT 
    ds.date,
    COALESCE(c.daily_capacity_hours, 8.0) AS hours_available,
    COALESCE(cs.hours_committed, 0) AS hours_committed,
    (COALESCE(cs.hours_committed, 0) < COALESCE(c.daily_capacity_hours, 8.0)) AS is_available
  FROM date_series ds
  LEFT JOIN crew_schedule cs ON cs.schedule_date = ds.date
  LEFT JOIN public.crews c ON c.id = p_crew_id
  ORDER BY ds.date;
END;
$$ LANGUAGE plpgsql;

-- Function: Detect schedule conflicts
CREATE OR REPLACE FUNCTION public.detect_schedule_conflicts(
  p_workspace_id uuid,
  p_crew_id uuid,
  p_start_date date,
  p_end_date date,
  p_exclude_job_id uuid DEFAULT NULL
)
RETURNS TABLE (
  conflict_type text,
  conflict_date date,
  severity text,
  schedule_id uuid,
  job_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN cs.job_id = p_exclude_job_id THEN NULL
      WHEN cs.start_date::date <= p_end_date AND (cs.end_date::date IS NULL OR cs.end_date::date >= p_start_date) 
        THEN 'crew_overlap'::text
      ELSE NULL
    END AS conflict_type,
    GREATEST(cs.start_date::date, p_start_date) AS conflict_date,
    CASE 
      WHEN cs.start_date::date <= p_end_date AND (cs.end_date::date IS NULL OR cs.end_date::date >= p_start_date) 
        THEN 'high'::text
      ELSE 'low'::text
    END AS severity,
    cs.id AS schedule_id,
    cs.job_id
  FROM public.crew_schedules cs
  WHERE cs.workspace_id = p_workspace_id
    AND cs.crew_id = p_crew_id
    AND cs.status = 'scheduled'
    AND cs.job_id != COALESCE(p_exclude_job_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND cs.start_date::date <= p_end_date
    AND (cs.end_date::date IS NULL OR cs.end_date::date >= p_start_date);
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate weekly workload forecast
CREATE OR REPLACE FUNCTION public.calculate_weekly_forecast(
  p_workspace_id uuid,
  p_week_start date
)
RETURNS TABLE (
  week_start date,
  week_end date,
  total_hours_required numeric,
  total_hours_available numeric,
  shortage numeric,
  jobs_scheduled integer,
  jobs_pending integer
) AS $$
DECLARE
  v_week_end date;
  v_hours_required numeric;
  v_hours_available numeric;
  v_jobs_scheduled integer;
  v_jobs_pending integer;
BEGIN
  -- Calculate week end (Sunday)
  v_week_end := p_week_start + INTERVAL '6 days';
  
  -- Calculate hours required from scheduled jobs
  SELECT COALESCE(SUM(estimated_duration), 0)
  INTO v_hours_required
  FROM public.crew_schedules cs
  WHERE cs.workspace_id = p_workspace_id
    AND cs.status = 'scheduled'
    AND cs.start_date::date >= p_week_start
    AND cs.start_date::date <= v_week_end;
  
  -- Calculate hours available (assuming 8 hours/day per crew, 5 days/week)
  SELECT COALESCE(COUNT(*) * 8 * 5, 0)
  INTO v_hours_available
  FROM public.crews c
  WHERE c.workspace_id = p_workspace_id
    AND c.is_active = true;
  
  -- Count scheduled jobs
  SELECT COUNT(DISTINCT cs.job_id)
  INTO v_jobs_scheduled
  FROM public.crew_schedules cs
  WHERE cs.workspace_id = p_workspace_id
    AND cs.status = 'scheduled'
    AND cs.start_date::date >= p_week_start
    AND cs.start_date::date <= v_week_end;
  
  -- Count pending jobs (unscheduled)
  SELECT COUNT(*)
  INTO v_jobs_pending
  FROM public.roofing_jobs rj
  WHERE rj.workspace_id = p_workspace_id
    AND rj.status = 'unscheduled';
  
  RETURN QUERY
  SELECT 
    p_week_start,
    v_week_end,
    v_hours_required,
    v_hours_available,
    GREATEST(v_hours_required - v_hours_available, 0) AS shortage,
    v_jobs_scheduled,
    v_jobs_pending;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 6 — TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_ai_scheduling_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ai_scheduling_recommendations_updated_at
  BEFORE UPDATE ON public.ai_scheduling_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_scheduling_updated_at();

CREATE TRIGGER trg_scheduling_forecasts_updated_at
  BEFORE UPDATE ON public.scheduling_forecasts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_scheduling_updated_at();

CREATE TRIGGER trg_homeowner_schedule_responses_updated_at
  BEFORE UPDATE ON public.homeowner_schedule_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_scheduling_updated_at();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- AI Scheduling Recommendations
ALTER TABLE public.ai_scheduling_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_scheduling_recommendations_workspace_access"
  ON public.ai_scheduling_recommendations
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
      UNION
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Scheduling Forecasts
ALTER TABLE public.scheduling_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduling_forecasts_workspace_access"
  ON public.scheduling_forecasts
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
      UNION
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Homeowner Schedule Responses
ALTER TABLE public.homeowner_schedule_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_schedule_responses_workspace_access"
  ON public.homeowner_schedule_responses
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
      UNION
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Schedule Conflicts
ALTER TABLE public.schedule_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_conflicts_workspace_access"
  ON public.schedule_conflicts
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
      UNION
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.ai_scheduling_recommendations IS 'Block 60000: AI-generated scheduling recommendations for jobs';
COMMENT ON TABLE public.scheduling_forecasts IS 'Block 60000: Weekly/monthly workload forecasts';
COMMENT ON TABLE public.homeowner_schedule_responses IS 'Block 60000: Homeowner responses to proposed schedule dates';
COMMENT ON TABLE public.schedule_conflicts IS 'Block 60000: Detected scheduling conflicts';
































