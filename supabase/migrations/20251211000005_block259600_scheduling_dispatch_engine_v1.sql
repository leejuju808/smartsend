-- Block 259600 — SmartSend Scheduling & Dispatch Engine v1
-- Crew Routing • Live GPS • Weather Sync • Job Start Risk • Multi-Day Sequencing
--
-- This block layers scheduling & dispatch "brains" on top of the
-- existing jobs + crew scheduling spine (jobs, job_schedule, crew_schedules,
-- weather_forecasts, crew productivity, etc.).
--
-- It is intentionally additive/idempotent and avoids breaking older blocks.

-- ============================================================================
-- PART 1 — EXTEND job_schedule FOR RISK SCORING
-- ============================================================================

-- Add risk columns + status if missing
ALTER TABLE public.job_schedule
  ADD COLUMN IF NOT EXISTS risk_score numeric,
  ADD COLUMN IF NOT EXISTS risk_reasons text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'job_schedule'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE public.job_schedule
      ADD COLUMN status text DEFAULT 'scheduled';
  END IF;
END $$;

-- Helpful index for querying high‑risk starts
CREATE INDEX IF NOT EXISTS idx_job_schedule_risk
  ON public.job_schedule (risk_score DESC NULLS LAST);


-- ============================================================================
-- PART 2 — CREW LOCATION LOG (LIVE GPS / ROUTING SIGNALS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crew_location_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,

  lat numeric(10,8),
  lng numeric(11,8),
  "timestamp" timestamptz DEFAULT now(),

  source text,              -- mobile_app | gps_tracker | manual | other
  accuracy_m numeric,       -- optional GPS accuracy in meters

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_location_log_crew_time
  ON public.crew_location_log(crew_id, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_crew_location_log_job_time
  ON public.crew_location_log(job_id, "timestamp" DESC)
  WHERE job_id IS NOT NULL;


-- ============================================================================
-- PART 3 — WEATHER CONDITIONS PER JOB / SCHEDULE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.weather_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.crew_schedules(id) ON DELETE SET NULL,

  forecast jsonb NOT NULL DEFAULT '{}'::jsonb,  -- full forecast payload
  summary text,                                 -- short human summary
  risk_level text DEFAULT 'low',                -- low | medium | high | critical
  risk_score numeric,                           -- 0–100

  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weather_conditions_job
  ON public.weather_conditions(job_id);

CREATE INDEX IF NOT EXISTS idx_weather_conditions_schedule
  ON public.weather_conditions(schedule_id);

CREATE INDEX IF NOT EXISTS idx_weather_conditions_risk
  ON public.weather_conditions(risk_level, updated_at DESC);


-- ============================================================================
-- PART 4 — JOB START RISK SCORE (0–100)
-- ============================================================================
-- Factors in:
-- - Weather risk (from weather_conditions or weather_forecasts)
-- - Material / deposit readiness (via check_job_readiness if present)
-- - Simple crew load signal (optional, via crew_schedules)

CREATE OR REPLACE FUNCTION public.calculate_job_start_risk(
  p_job_id uuid
)
RETURNS TABLE (
  job_id uuid,
  risk_score numeric,
  risk_reasons text[]
) AS $$
DECLARE
  v_score numeric := 0;
  v_reasons text[] := ARRAY[]::text[];

  v_is_ready boolean;
  v_readiness_issues text[];
  v_materials_status text;
  v_deposit_status text;

  v_weather_risk text;
  v_weather_component numeric := 0;

  v_crew_load_component numeric := 0;
  v_week_start date := date_trunc('week', current_date)::date;
  v_week_end date := (date_trunc('week', current_date) + interval '6 days')::date;
  v_crew_id uuid;
  v_weekly_days numeric;
BEGIN
  -- 1) Materials + deposit readiness (if helper exists)
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'check_job_readiness'
      AND pg_function_is_visible(oid)
  ) THEN
    SELECT
      is_ready,
      readiness_issues,
      materials_status,
      deposit_status
    INTO
      v_is_ready,
      v_readiness_issues,
      v_materials_status,
      v_deposit_status
    FROM public.check_job_readiness(p_job_id);

    IF NOT v_is_ready THEN
      v_score := v_score + 30; -- up to 30 points for readiness problems
      IF v_readiness_issues IS NOT NULL THEN
        v_reasons := v_reasons || v_readiness_issues;
      END IF;
    END IF;
  END IF;

  -- 2) Weather risk — prefer weather_conditions, fallback to weather_forecasts
  SELECT wc.risk_level
  INTO v_weather_risk
  FROM public.weather_conditions wc
  WHERE wc.job_id = p_job_id
  ORDER BY wc.updated_at DESC
  LIMIT 1;

  IF v_weather_risk IS NULL
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'weather_forecasts') THEN
    SELECT
      CASE
        WHEN wf.risk_level IN ('high', 'critical') THEN wf.risk_level
        WHEN wf.risk_level = 'medium' THEN 'medium'
        ELSE 'low'
      END
    INTO v_weather_risk
    FROM public.weather_forecasts wf
    WHERE wf.job_id = p_job_id
    ORDER BY wf.checked_at DESC
    LIMIT 1;
  END IF;

  IF v_weather_risk = 'critical' THEN
    v_weather_component := 60;
    v_reasons := array_append(v_reasons, 'Critical weather risk');
  ELSIF v_weather_risk = 'high' THEN
    v_weather_component := 40;
    v_reasons := array_append(v_reasons, 'High weather risk');
  ELSIF v_weather_risk = 'medium' THEN
    v_weather_component := 20;
    v_reasons := array_append(v_reasons, 'Medium weather risk');
  END IF;

  v_score := v_score + v_weather_component;

  -- 3) Simple crew load signal from crew_schedules (optional)
  -- If crew_schedules exists, look at total scheduled days for the primary crew this week
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crew_schedules') THEN
    SELECT cs.crew_id
    INTO v_crew_id
    FROM public.crew_schedules cs
    WHERE cs.job_id = p_job_id
      AND cs.status IN ('scheduled','in_progress')
    ORDER BY cs.start_date
    LIMIT 1;

    IF v_crew_id IS NOT NULL THEN
      SELECT COALESCE(SUM(GREATEST(1, (cs.end_date - cs.start_date + 1))), 0)
      INTO v_weekly_days
      FROM public.crew_schedules cs
      WHERE cs.crew_id = v_crew_id
        AND cs.status IN ('scheduled','in_progress')
        AND cs.start_date <= v_week_end
        AND cs.end_date >= v_week_start;

      -- Assume 5 working days/week is "100%" capacity
      IF v_weekly_days > 5 THEN
        v_crew_load_component := LEAST(20, (v_weekly_days - 5) * 4); -- up to +20
        v_reasons := array_append(v_reasons, 'Crew capacity heavy this week');
      END IF;
    END IF;
  END IF;

  v_score := v_score + v_crew_load_component;

  -- Cap score to 0–100
  v_score := LEAST(100, GREATEST(0, v_score));

  RETURN QUERY SELECT p_job_id, v_score, NULLIF(v_reasons, ARRAY[]::text[]);
END;
$$ LANGUAGE plpgsql STABLE;


-- Helper: refresh risk_score on job_schedule for a given job
CREATE OR REPLACE FUNCTION public.refresh_job_schedule_risk(p_job_id uuid)
RETURNS void AS $$
DECLARE
  v_risk public.calculate_job_start_risk%ROWTYPE;
BEGIN
  SELECT *
  INTO v_risk
  FROM public.calculate_job_start_risk(p_job_id);

  UPDATE public.job_schedule
  SET risk_score = v_risk.risk_score,
      risk_reasons = v_risk.risk_reasons
  WHERE job_id = p_job_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Crew GPS logs: visible to team members on that crew and service_role
ALTER TABLE public.crew_location_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crew_location_log_team_member" ON public.crew_location_log;
CREATE POLICY "crew_location_log_team_member" ON public.crew_location_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.crews c
      JOIN public.team_members tm ON c.team_id = tm.team_id
      WHERE c.id = crew_location_log.crew_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "crew_location_log_service_role" ON public.crew_location_log;
CREATE POLICY "crew_location_log_service_role" ON public.crew_location_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- Weather conditions: visible to team members on that job and service_role
ALTER TABLE public.weather_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weather_conditions_team_member" ON public.weather_conditions;
CREATE POLICY "weather_conditions_team_member" ON public.weather_conditions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = weather_conditions.job_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "weather_conditions_service_role" ON public.weather_conditions;
CREATE POLICY "weather_conditions_service_role" ON public.weather_conditions
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- PART 6 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.crew_location_log IS 'Block 259600: live GPS / routing pings for crews';
COMMENT ON TABLE public.weather_conditions IS 'Block 259600: per-job forecast snapshot + risk';
COMMENT ON FUNCTION public.calculate_job_start_risk(uuid) IS 'Block 259600: computes 0–100 job start risk score for a job.';
COMMENT ON FUNCTION public.refresh_job_schedule_risk(uuid) IS 'Block 259600: syncs job_schedule.risk_score / reasons from calculate_job_start_risk.';
COMMENT ON COLUMN public.job_schedule.risk_score IS 'Block 259600: 0–100 job start risk score (higher = riskier start date).';
COMMENT ON COLUMN public.job_schedule.risk_reasons IS 'Block 259600: textual reasons that drove job start risk_score.';













