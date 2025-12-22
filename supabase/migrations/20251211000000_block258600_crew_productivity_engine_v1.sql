-- ============================================================
-- Block 258600 — SmartSend Crew Productivity Engine v1
-- Labor Efficiency • Output/Hour • Fatigue • Bonuses • Waste
-- ============================================================
-- 
-- This block turns SmartSend into the crew performance weapon
-- roofing companies have ALWAYS needed.
-- 
-- Crews are the heart of production — but they are also the #1
-- source of labor waste, schedule overruns, sloppy installs,
-- inconsistent quality, callbacks, and chaos.
-- 
-- This schema gives SmartSend the data spine for:
-- - REAL output tracking (squares per hour / per day)
-- - Labor efficiency scoring (0–100 per crew)
-- - AI fatigue detection signals
-- - Benchmarks by pitch / material / crew size
-- - Waste reduction analytics
-- - Automated bonus logs
-- - Delay & job-time predictability intelligence
-- ============================================================

-- ============================================================================
-- PART 1 — CORE TABLES
-- ============================================================================

-- 1.1 crew_daily_output
-- One row per crew per job per day with production + context
CREATE TABLE IF NOT EXISTS public.crew_daily_output (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant + relationships
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  -- Date this production happened (local to company)
  work_date date NOT NULL,

  -- Core production metrics
  squares_installed numeric(10,2) NOT NULL DEFAULT 0,
  hours_worked numeric(10,2) NOT NULL DEFAULT 0,
  crew_size int,
  output_per_hour numeric(10,3) GENERATED ALWAYS AS (
    CASE 
      WHEN hours_worked > 0 THEN ROUND(squares_installed / hours_worked, 3)
      ELSE 0
    END
  ) STORED,

  -- Difficulty / context (for benchmarks)
  roof_pitch numeric(5,2),                     -- e.g. 6.0 for 6/12
  material_type text,                          -- shingles, metal, tile, etc.
  deck_condition text,                         -- good, soft_spots, redeck, etc.

  -- Weather / fatigue-relevant context
  weather_summary text,                        -- "hot & humid", "overcast", etc.
  high_heat boolean DEFAULT false,
  heat_index numeric(5,2),                     -- e.g. 95.5

  -- Quality / callbacks / safety / waste
  callbacks_count int DEFAULT 0,
  safety_incidents_count int DEFAULT 0,
  waste_bundles numeric(10,2),
  waste_squares numeric(10,2),
  waste_cost numeric(12,2),                    -- material dollars wasted

  -- Time + attendance context
  arrival_time timestamptz,
  departure_time timestamptz,
  arrival_delay_minutes numeric(6,2),          -- minutes late vs scheduled
  break_minutes numeric(6,2),                  -- total break time logged

  -- AI fatigue detection signals (per day / job)
  fatigue_detected boolean DEFAULT false,
  fatigue_score numeric(5,2),                  -- 0–100 risk
  fatigue_signals jsonb DEFAULT '{}'::jsonb,   -- {"slowed_productivity_pct": 37, ...}

  -- Metadata
  source text DEFAULT 'manual' CHECK (source IN ('manual','mobile_app','api','import')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_daily_output_workspace_date
  ON public.crew_daily_output(workspace_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_crew_daily_output_crew_date
  ON public.crew_daily_output(crew_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_crew_daily_output_job
  ON public.crew_daily_output(job_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_crew_daily_output_output_per_hour
  ON public.crew_daily_output(output_per_hour DESC);


-- 1.2 crew_productivity_scores
-- Daily 0–100 score per crew with JSON breakdown
CREATE TABLE IF NOT EXISTS public.crew_productivity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,

  score_date date NOT NULL,                    -- usually work_date being scored
  score numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),

  -- JSON breakdown for AI + dashboards
  -- Example:
  -- {
  --   "avg_output_per_hour": 2.95,
  --   "workspace_avg_output_per_hour": 2.10,
  --   "speed_component": 18.2,
  --   "waste_percent": 7.5,
  --   "waste_penalty": 0,
  --   "callbacks": 0,
  --   "safety_incidents": 0,
  --   "arrival_delay_minutes": 4.0,
  --   "on_time_penalty": 0,
  --   "fatigue_detected": false,
  --   "fatigue_penalty": 0,
  --   "base_score": 70
  -- }
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT crew_productivity_scores_unique_per_day
    UNIQUE (workspace_id, crew_id, score_date)
);

CREATE INDEX IF NOT EXISTS idx_crew_productivity_scores_workspace_date
  ON public.crew_productivity_scores(workspace_id, score_date DESC);

CREATE INDEX IF NOT EXISTS idx_crew_productivity_scores_crew_date
  ON public.crew_productivity_scores(crew_id, score_date DESC);

CREATE INDEX IF NOT EXISTS idx_crew_productivity_scores_score
  ON public.crew_productivity_scores(score DESC);


-- 1.3 crew_bonus_logs
-- Every bonus SmartSend awards or logs for a crew
CREATE TABLE IF NOT EXISTS public.crew_bonus_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,

  bonus_amount numeric(12,2) NOT NULL,
  bonus_type text DEFAULT 'manual' CHECK (bonus_type IN (
    'productivity',    -- high output
    'quality',         -- clean installs / happy homeowners
    'safety',          -- zero incidents
    'cleanup',         -- spotless job sites
    'on_time',         -- schedule reliability
    'manual',          -- manually awarded
    'other'
  )),
  reason text,

  period_start date,
  period_end date,

  awarded_at timestamptz DEFAULT now(),
  awarded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_bonus_logs_workspace_date
  ON public.crew_bonus_logs(workspace_id, awarded_at DESC);

CREATE INDEX IF NOT EXISTS idx_crew_bonus_logs_crew
  ON public.crew_bonus_logs(crew_id, awarded_at DESC);

CREATE INDEX IF NOT EXISTS idx_crew_bonus_logs_job
  ON public.crew_bonus_logs(job_id);


-- ============================================================================
-- PART 2 — HELPER VIEWS (BENCHMARKS, WASTE, DELAY SIGNALS, PREDICTIONS)
-- ============================================================================

-- 2.1 Crew Productivity Benchmarks
-- Benchmarks by pitch / material / crew size, powered by real data
CREATE OR REPLACE VIEW public.crew_productivity_benchmarks AS
SELECT
  workspace_id,
  roof_pitch,
  material_type,
  crew_size,
  AVG(output_per_hour)       AS avg_output_per_hour,
  AVG(squares_installed)     AS avg_squares_per_day,
  COUNT(*)                   AS sample_days
FROM public.crew_daily_output
WHERE squares_installed IS NOT NULL
  AND hours_worked IS NOT NULL
GROUP BY workspace_id, roof_pitch, material_type, crew_size;

COMMENT ON VIEW public.crew_productivity_benchmarks IS
  'Block 258600: Benchmarks crew output by pitch, material, and crew size.';


-- 2.2 Crew Waste Trends (Weekly)
-- Used to answer: "Is Crew B wasting too much material?"
CREATE OR REPLACE VIEW public.crew_waste_trends AS
SELECT
  workspace_id,
  crew_id,
  date_trunc('week', work_date)::date AS week_start,
  SUM(COALESCE(waste_squares, 0))     AS total_waste_squares,
  SUM(COALESCE(squares_installed, 0)) AS total_squares_installed,
  CASE
    WHEN SUM(COALESCE(squares_installed, 0) + COALESCE(waste_squares, 0)) = 0
      THEN NULL
    ELSE ROUND(
      100 * SUM(COALESCE(waste_squares, 0))
        / SUM(COALESCE(squares_installed, 0) + COALESCE(waste_squares, 0)),
      2
    )
  END AS waste_percent,
  SUM(COALESCE(waste_cost, 0))        AS waste_cost
FROM public.crew_daily_output
GROUP BY workspace_id, crew_id, week_start;

COMMENT ON VIEW public.crew_waste_trends IS
  'Block 258600: Weekly material waste trends per crew (squares, %, cost).';


-- 2.3 Crew Delay Signals (from crew_checkins)
-- Surfaces install-day timing segments per job/crew for delay detection
CREATE OR REPLACE VIEW public.crew_delay_signals AS
WITH status_times AS (
  SELECT
    job_id,
    crew_id,
    MIN(checked_in_at) FILTER (WHERE status = 'on_the_way')   AS on_the_way_at,
    MIN(checked_in_at) FILTER (WHERE status = 'arrived')      AS arrived_at,
    MIN(checked_in_at) FILTER (WHERE status = 'in_progress')  AS in_progress_at,
    MIN(checked_in_at) FILTER (WHERE status = 'completed')    AS completed_at,
    MIN(checked_in_at) FILTER (WHERE status = 'lunch')        AS lunch_at
  FROM public.crew_checkins
  GROUP BY job_id, crew_id
)
SELECT
  st.job_id,
  st.crew_id,
  st.on_the_way_at,
  st.arrived_at,
  st.in_progress_at,
  st.completed_at,
  st.lunch_at,
  EXTRACT(EPOCH FROM (st.arrived_at - st.on_the_way_at))   / 60.0 AS travel_minutes,
  EXTRACT(EPOCH FROM (st.in_progress_at - st.arrived_at))  / 60.0 AS setup_minutes,
  EXTRACT(EPOCH FROM (st.completed_at - st.in_progress_at))/ 60.0 AS production_minutes,
  EXTRACT(EPOCH FROM (st.completed_at - st.on_the_way_at)) / 60.0 AS total_day_minutes
FROM status_times st;

COMMENT ON VIEW public.crew_delay_signals IS
  'Block 258600: Derived travel/setup/production/total durations for delay detection.';


-- 2.4 Job-Time Predictability (Roofing Scheduled Jobs)
-- Predicts job duration days + confidence based on historical crew output
CREATE OR REPLACE VIEW public.job_time_predictions AS
SELECT
  rsj.job_id,
  rsj.crew_id,
  rsj.start_date,
  rsj.end_date,
  rsj.total_squares,
  GREATEST(
    1::numeric,
    CEIL(
      rsj.total_squares
      / NULLIF(cm.avg_squares_per_day, 1)
    )
  ) AS estimated_duration_days,
  LEAST(
    100::numeric,
    ROUND(
      100.0 * cm.sample_days::numeric
      / NULLIF(cm.sample_days::numeric + 10, 0),
      2
    )
  ) AS confidence_score
FROM public.roofing_scheduled_jobs rsj
JOIN (
  SELECT
    crew_id,
    AVG(squares_installed) AS avg_squares_per_day,
    COUNT(*)               AS sample_days
  FROM public.crew_daily_output
  GROUP BY crew_id
) cm ON cm.crew_id = rsj.crew_id;

COMMENT ON VIEW public.job_time_predictions IS
  'Block 258600: Predicts job duration days and confidence per scheduled job based on historical crew output.';


-- ============================================================================
-- PART 3 — SCORING & REPORT FUNCTIONS
-- ============================================================================

-- 3.1 Daily Crew Performance Report
-- Feeds the "Daily Crew Report" email for PM + owner
CREATE OR REPLACE FUNCTION public.get_daily_crew_report(
  p_workspace_id uuid,
  p_work_date date
)
RETURNS TABLE (
  crew_id uuid,
  crew_name text,
  work_date date,
  total_squares numeric,
  total_hours numeric,
  output_per_hour numeric,
  efficiency_vs_workspace numeric,
  waste_bundles numeric,
  waste_percent numeric,
  callbacks int,
  safety_incidents int
) AS $$
DECLARE
  workspace_avg_output numeric;
BEGIN
  -- Workspace-wide benchmark for that day
  SELECT NULLIF(AVG(output_per_hour), 0)
  INTO workspace_avg_output
  FROM public.crew_daily_output
  WHERE workspace_id = p_workspace_id
    AND work_date = p_work_date;

  RETURN QUERY
  SELECT
    cdo.crew_id,
    c.name AS crew_name,
    cdo.work_date,
    SUM(cdo.squares_installed) AS total_squares,
    SUM(cdo.hours_worked)      AS total_hours,
    CASE 
      WHEN SUM(cdo.hours_worked) > 0
        THEN ROUND(SUM(cdo.squares_installed) / SUM(cdo.hours_worked), 3)
      ELSE 0
    END AS output_per_hour,
    CASE 
      WHEN workspace_avg_output IS NULL OR workspace_avg_output = 0
        THEN NULL
      ELSE ROUND(
        100 * (
          CASE 
            WHEN SUM(cdo.hours_worked) > 0
              THEN (SUM(cdo.squares_installed) / SUM(cdo.hours_worked))
            ELSE 0
          END - workspace_avg_output
        ) / workspace_avg_output,
        2
      )
    END AS efficiency_vs_workspace,
    SUM(COALESCE(cdo.waste_bundles, 0)) AS waste_bundles,
    CASE
      WHEN SUM(COALESCE(cdo.squares_installed, 0) + COALESCE(cdo.waste_squares, 0)) = 0
        THEN NULL
      ELSE ROUND(
        100 * SUM(COALESCE(cdo.waste_squares, 0))
          / SUM(COALESCE(cdo.squares_installed, 0) + COALESCE(cdo.waste_squares, 0)),
        2
      )
    END AS waste_percent,
    SUM(cdo.callbacks_count)         AS callbacks,
    SUM(cdo.safety_incidents_count)  AS safety_incidents
  FROM public.crew_daily_output cdo
  JOIN public.crews c ON c.id = cdo.crew_id
  WHERE cdo.workspace_id = p_workspace_id
    AND cdo.work_date = p_work_date
  GROUP BY cdo.crew_id, c.name, cdo.work_date
  ORDER BY output_per_hour DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3.2 Labor Efficiency Scoring Engine
-- Calculates 0–100 score per crew per day and upserts into crew_productivity_scores
CREATE OR REPLACE FUNCTION public.calculate_crew_productivity_scores(
  p_workspace_id uuid,
  p_work_date date
)
RETURNS void AS $$
DECLARE
  rec RECORD;
  workspace_avg_output numeric;
  waste_pct numeric;
  speed_component numeric;
  quality_penalty numeric;
  waste_penalty numeric;
  on_time_penalty numeric;
  fatigue_penalty numeric;
  base_score numeric := 70; -- starting point before bonuses/penalties
  final_score numeric;
BEGIN
  -- Benchmark: average output/hour for this workspace (all crews, all time)
  SELECT NULLIF(AVG(output_per_hour), 0)
  INTO workspace_avg_output
  FROM public.crew_daily_output
  WHERE workspace_id = p_workspace_id;

  FOR rec IN
    SELECT
      crew_id,
      AVG(output_per_hour)                         AS avg_output_per_hour,
      SUM(callbacks_count)                         AS callbacks,
      SUM(safety_incidents_count)                  AS safety_incidents,
      SUM(COALESCE(waste_squares, 0))              AS waste_squares,
      SUM(COALESCE(squares_installed, 0))          AS total_squares,
      AVG(COALESCE(arrival_delay_minutes, 0))      AS avg_arrival_delay,
      BOOL_OR(fatigue_detected)                    AS any_fatigue
    FROM public.crew_daily_output
    WHERE workspace_id = p_workspace_id
      AND work_date = p_work_date
    GROUP BY crew_id
  LOOP
    -- Speed component: rewards output/hour vs workspace avg (0–20 pts)
    IF rec.avg_output_per_hour IS NULL OR rec.avg_output_per_hour = 0 THEN
      speed_component := 0;
    ELSIF workspace_avg_output IS NULL OR workspace_avg_output = 0 THEN
      speed_component := 10; -- neutral if no benchmark yet
    ELSE
      speed_component := LEAST(20, 20 * rec.avg_output_per_hour / workspace_avg_output);
    END IF;

    -- Waste penalty: 1 point per % above 10% waste
    IF rec.total_squares IS NULL OR rec.total_squares = 0 THEN
      waste_pct := 0;
    ELSE
      waste_pct := 100 * COALESCE(rec.waste_squares, 0)
        / (rec.total_squares + COALESCE(rec.waste_squares, 0));
    END IF;
    waste_penalty := GREATEST(0, waste_pct - 10);

    -- Quality penalties
    quality_penalty := COALESCE(rec.callbacks, 0) * 5
                      + COALESCE(rec.safety_incidents, 0) * 10;

    -- On-time penalty: 0.5 point per minute late after first 10 minutes
    on_time_penalty := GREATEST(0, COALESCE(rec.avg_arrival_delay, 0) - 10) * 0.5;

    -- Fatigue penalty: small nudge so owners pay attention
    fatigue_penalty := CASE WHEN rec.any_fatigue THEN 5 ELSE 0 END;

    final_score := LEAST(100, GREATEST(0,
      base_score
      + speed_component
      - quality_penalty
      - waste_penalty
      - on_time_penalty
      - fatigue_penalty
    ));

    INSERT INTO public.crew_productivity_scores (
      workspace_id,
      crew_id,
      score_date,
      score,
      breakdown
    ) VALUES (
      p_workspace_id,
      rec.crew_id,
      p_work_date,
      final_score,
      jsonb_build_object(
        'avg_output_per_hour', rec.avg_output_per_hour,
        'workspace_avg_output_per_hour', workspace_avg_output,
        'speed_component', speed_component,
        'callbacks', rec.callbacks,
        'safety_incidents', rec.safety_incidents,
        'waste_percent', waste_pct,
        'waste_penalty', waste_penalty,
        'arrival_delay_minutes', rec.avg_arrival_delay,
        'on_time_penalty', on_time_penalty,
        'fatigue_detected', rec.any_fatigue,
        'fatigue_penalty', fatigue_penalty,
        'base_score', base_score
      )
    )
    ON CONFLICT (workspace_id, crew_id, score_date)
    DO UPDATE SET
      score      = EXCLUDED.score,
      breakdown  = EXCLUDED.breakdown,
      updated_at = now();
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- PART 4 — ROW LEVEL SECURITY (RLS) & GRANTS
-- ============================================================================

ALTER TABLE public.crew_daily_output       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_productivity_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_bonus_logs         ENABLE ROW LEVEL SECURITY;

-- Helper: we already have public.is_workspace_member(workspace_id) from Reporting block

-- crew_daily_output policies
CREATE POLICY crew_daily_output_select ON public.crew_daily_output
  FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY crew_daily_output_insert ON public.crew_daily_output
  FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY crew_daily_output_update ON public.crew_daily_output
  FOR UPDATE
  USING (public.is_workspace_member(workspace_id));

-- crew_productivity_scores policies
CREATE POLICY crew_productivity_scores_select ON public.crew_productivity_scores
  FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY crew_productivity_scores_insert ON public.crew_productivity_scores
  FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY crew_productivity_scores_update ON public.crew_productivity_scores
  FOR UPDATE
  USING (public.is_workspace_member(workspace_id));

-- crew_bonus_logs policies
CREATE POLICY crew_bonus_logs_select ON public.crew_bonus_logs
  FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY crew_bonus_logs_insert ON public.crew_bonus_logs
  FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY crew_bonus_logs_update ON public.crew_bonus_logs
  FOR UPDATE
  USING (public.is_workspace_member(workspace_id));

-- Optional: service_role full access for internal automation
CREATE POLICY crew_daily_output_service_role_all ON public.crew_daily_output
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY crew_productivity_scores_service_role_all ON public.crew_productivity_scores
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY crew_bonus_logs_service_role_all ON public.crew_bonus_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Views: allow authenticated reads (RLS on base tables still applies)
GRANT SELECT ON public.crew_productivity_benchmarks TO authenticated;
GRANT SELECT ON public.crew_waste_trends           TO authenticated;
GRANT SELECT ON public.crew_delay_signals          TO authenticated;
GRANT SELECT ON public.job_time_predictions        TO authenticated;

-- Functions: allow execution to authenticated users
GRANT EXECUTE ON FUNCTION public.get_daily_crew_report(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_crew_productivity_scores(uuid, date) TO authenticated;

-- ============================================================================
-- END OF BLOCK 258600 — CREW PRODUCTIVITY ENGINE v1
-- ============================================================================













