-- =========================================================
-- Block 254000 — SmartSend Productivity Engine v1
-- "Crew Efficiency Scores, Install Speed Metrics, Material Waste Tracking, Predictive Bottleneck Detection"
-- =========================================================
-- 
-- This block turns SmartSend into a productivity and performance intelligence system.
-- Roofers will say:
-- "SmartSend shows us exactly where we lose money."
-- "We finally know which crews perform the best."
-- "You'd be stupid not using this."
-- 
-- Features:
-- - Crew Efficiency Score (100-point breakdown)
-- - Install Speed Metrics (per job task + per crew)
-- - Material Waste Tracker
-- - Predictive Bottleneck Detector
-- - Daily Productivity Dashboard
-- - Per-Crew Leaderboard
-- - Forecasted Completion Times
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE productivity_metrics TABLE
-- ============================================================================
-- Tracks all productivity metrics for jobs, crews, and employees

CREATE TABLE IF NOT EXISTS public.productivity_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid, -- References jobs or roofing_jobs (flexible)
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  employee_id uuid, -- References workforce_employees if exists
  
  metric_type text NOT NULL CHECK (metric_type IN (
    'install_speed',
    'waste',
    'qc',
    'arrival_accuracy',
    'safety',
    'on_time_completion',
    'material_efficiency',
    'labor_efficiency'
  )),
  
  value numeric NOT NULL, -- The metric value (speed in hours, waste %, score 0-100, etc.)
  unit text, -- 'hours', 'percent', 'score', 'bundles', etc.
  
  -- Context for the metric
  task_name text, -- 'tear-off', 'underlayment', 'install', 'ridge', 'cleanup'
  job_type text, -- 'roof_replacement', 'repair', etc.
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_productivity_metrics_workspace ON public.productivity_metrics(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_productivity_metrics_job ON public.productivity_metrics(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_productivity_metrics_crew ON public.productivity_metrics(crew_id, created_at DESC) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_productivity_metrics_type ON public.productivity_metrics(metric_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_productivity_metrics_crew_type ON public.productivity_metrics(crew_id, metric_type, created_at DESC) WHERE crew_id IS NOT NULL;

COMMENT ON TABLE public.productivity_metrics IS 'Block 254000: All productivity metrics for jobs, crews, and employees';
COMMENT ON COLUMN public.productivity_metrics.metric_type IS 'Type: install_speed, waste, qc, arrival_accuracy, safety, on_time_completion, material_efficiency, labor_efficiency';

-- ============================================================================
-- PART 2 — CREATE crew_efficiency_scores TABLE
-- ============================================================================
-- Stores calculated efficiency scores for crews (0-100)

CREATE TABLE IF NOT EXISTS public.crew_efficiency_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  
  -- Overall score (0-100)
  score int NOT NULL CHECK (score >= 0 AND score <= 100),
  
  -- Component scores (0-100 each)
  install_speed_score int DEFAULT 0 CHECK (install_speed_score >= 0 AND install_speed_score <= 100),
  qc_quality_score int DEFAULT 0 CHECK (qc_quality_score >= 0 AND qc_quality_score <= 100),
  material_waste_score int DEFAULT 0 CHECK (material_waste_score >= 0 AND material_waste_score <= 100),
  on_time_rate_score int DEFAULT 0 CHECK (on_time_rate_score >= 0 AND on_time_rate_score <= 100),
  safety_score int DEFAULT 0 CHECK (safety_score >= 0 AND safety_score <= 100),
  
  -- Rating tier
  rating_tier text CHECK (rating_tier IN ('elite', 'strong', 'average', 'needs_improvement', 'high_risk')),
  
  -- Calculation period
  period_start date NOT NULL,
  period_end date NOT NULL,
  jobs_count int DEFAULT 0, -- Number of jobs in this period
  
  -- Metadata
  calculated_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_efficiency_scores_crew_period ON public.crew_efficiency_scores(crew_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_crew_efficiency_scores_workspace ON public.crew_efficiency_scores(workspace_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_crew_efficiency_scores_score ON public.crew_efficiency_scores(workspace_id, score DESC, period_end DESC);

COMMENT ON TABLE public.crew_efficiency_scores IS 'Block 254000: Calculated efficiency scores for crews (0-100)';
COMMENT ON COLUMN public.crew_efficiency_scores.rating_tier IS 'Tier: elite (90-100), strong (80-89), average (70-79), needs_improvement (60-69), high_risk (<60)';

-- ============================================================================
-- PART 3 — CREATE job_task_durations TABLE
-- ============================================================================
-- Tracks duration of each task for a job (tear-off, underlayment, install, etc.)

CREATE TABLE IF NOT EXISTS public.job_task_durations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL, -- References jobs or roofing_jobs
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  task_name text NOT NULL, -- 'tear-off', 'underlayment', 'install', 'ridge', 'cleanup', etc.
  milestone_id uuid, -- References production_milestones if available
  
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  duration_minutes int, -- Calculated: EXTRACT(EPOCH FROM (end_time - start_time)) / 60
  
  -- Comparison to baseline
  baseline_duration_minutes int, -- Average for this task type/crew
  variance_percent numeric(5,2), -- How much faster/slower than baseline
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_task_durations_job ON public.job_task_durations(job_id, task_name);
CREATE INDEX IF NOT EXISTS idx_job_task_durations_crew ON public.job_task_durations(crew_id, task_name, created_at DESC) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_task_durations_workspace ON public.job_task_durations(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_task_durations_task ON public.job_task_durations(task_name, duration_minutes) WHERE duration_minutes IS NOT NULL;

COMMENT ON TABLE public.job_task_durations IS 'Block 254000: Task durations for jobs (tear-off, install, etc.)';
COMMENT ON COLUMN public.job_task_durations.task_name IS 'Task: tear-off, underlayment, install, ridge, cleanup, etc.';

-- ============================================================================
-- PART 4 — CREATE material_waste_logs TABLE
-- ============================================================================
-- Tracks material waste by comparing estimated vs actual usage

CREATE TABLE IF NOT EXISTS public.material_waste_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL, -- References jobs or roofing_jobs
  
  material_name text NOT NULL, -- 'bundles', 'ridge', 'underlayment', 'ice_water', etc.
  material_unit text, -- 'bundles', 'rolls', 'linear_feet', etc.
  
  estimated_needed numeric NOT NULL,
  actual_used numeric NOT NULL,
  waste_percent numeric GENERATED ALWAYS AS (
    CASE 
      WHEN estimated_needed > 0 
      THEN ROUND(((actual_used - estimated_needed) / estimated_needed * 100)::numeric, 2)
      ELSE 0
    END
  ) STORED,
  
  -- Waste categorization
  waste_category text CHECK (waste_category IN ('acceptable', 'moderate', 'excessive', 'critical')),
  
  -- Cost impact
  unit_cost numeric(10,2), -- Cost per unit
  waste_cost numeric(10,2), -- Calculated: (actual_used - estimated_needed) * unit_cost
  
  -- Metadata
  logged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_waste_logs_job ON public.material_waste_logs(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_waste_logs_workspace ON public.material_waste_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_waste_logs_waste ON public.material_waste_logs(workspace_id, waste_percent DESC) WHERE waste_percent > 5;

COMMENT ON TABLE public.material_waste_logs IS 'Block 254000: Material waste tracking (estimated vs actual)';
COMMENT ON COLUMN public.material_waste_logs.waste_category IS 'Category: acceptable (<5%), moderate (5-10%), excessive (10-15%), critical (>15%)';

-- ============================================================================
-- PART 5 — CREATE productivity_bottlenecks TABLE
-- ============================================================================
-- Tracks detected bottlenecks and predictive alerts

CREATE TABLE IF NOT EXISTS public.productivity_bottlenecks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid, -- References jobs or roofing_jobs
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  bottleneck_type text NOT NULL CHECK (bottleneck_type IN (
    'slow_tear_off',
    'late_materials',
    'absent_workers',
    'weather_delay',
    'poor_foreman_planning',
    'slow_underlayment',
    'slow_ridge_work',
    'material_shortage',
    'crew_late_arrival',
    'quality_issues',
    'other'
  )),
  
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  description text NOT NULL,
  detected_at timestamptz DEFAULT now(),
  
  -- Impact metrics
  estimated_delay_minutes int,
  cost_impact numeric(10,2),
  
  -- Resolution
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolution_notes text,
  
  -- Metadata
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_productivity_bottlenecks_workspace ON public.productivity_bottlenecks(workspace_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_productivity_bottlenecks_job ON public.productivity_bottlenecks(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_productivity_bottlenecks_crew ON public.productivity_bottlenecks(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_productivity_bottlenecks_unresolved ON public.productivity_bottlenecks(workspace_id, resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_productivity_bottlenecks_type ON public.productivity_bottlenecks(bottleneck_type, detected_at DESC);

COMMENT ON TABLE public.productivity_bottlenecks IS 'Block 254000: Detected productivity bottlenecks and alerts';
COMMENT ON COLUMN public.productivity_bottlenecks.bottleneck_type IS 'Type: slow_tear_off, late_materials, absent_workers, weather_delay, poor_foreman_planning, etc.';

-- ============================================================================
-- PART 6 — FUNCTION: Calculate Install Speed from Milestones
-- ============================================================================
-- Calculates install speed metrics from production_milestones

CREATE OR REPLACE FUNCTION calculate_install_speed_metrics(
  p_job_id uuid,
  p_crew_id uuid DEFAULT NULL
)
RETURNS TABLE (
  task_name text,
  duration_hours numeric,
  duration_minutes int,
  baseline_hours numeric,
  variance_percent numeric,
  speed_rating int
) AS $$
DECLARE
  task_record RECORD;
  avg_duration numeric;
  speed_score int;
BEGIN
  -- Get task durations from job_task_durations
  FOR task_record IN
    SELECT 
      jtd.task_name,
      jtd.duration_minutes,
      jtd.crew_id
    FROM public.job_task_durations jtd
    WHERE jtd.job_id = p_job_id
      AND (p_crew_id IS NULL OR jtd.crew_id = p_crew_id)
      AND jtd.duration_minutes IS NOT NULL
    ORDER BY jtd.start_time
  LOOP
    -- Get baseline (average for this task type and crew)
    SELECT AVG(duration_minutes) INTO avg_duration
    FROM public.job_task_durations
    WHERE task_name = task_record.task_name
      AND (task_record.crew_id IS NULL OR crew_id = task_record.crew_id)
      AND job_id != p_job_id
      AND duration_minutes IS NOT NULL
      AND created_at >= CURRENT_DATE - INTERVAL '90 days';
    
    -- Calculate variance
    DECLARE
      variance numeric;
    BEGIN
      IF avg_duration IS NOT NULL AND avg_duration > 0 THEN
        variance := ((task_record.duration_minutes - avg_duration) / avg_duration * 100);
      ELSE
        variance := 0;
      END IF;
      
      -- Calculate speed rating (0-100, higher is faster)
      -- If 20% faster than baseline = 100, if 20% slower = 0
      IF variance <= -20 THEN
        speed_score := 100; -- 20%+ faster
      ELSIF variance >= 20 THEN
        speed_score := 0; -- 20%+ slower
      ELSE
        speed_score := 100 - ABS(variance) * 2.5; -- Linear scale
      END IF;
      
      RETURN QUERY SELECT
        task_record.task_name,
        (task_record.duration_minutes::numeric / 60)::numeric(10,2) as duration_hours,
        task_record.duration_minutes,
        (avg_duration / 60)::numeric(10,2) as baseline_hours,
        variance::numeric(5,2) as variance_percent,
        GREATEST(0, LEAST(100, speed_score))::int as speed_rating;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_install_speed_metrics IS 'Block 254000: Calculates install speed metrics from job task durations';

-- ============================================================================
-- PART 7 — FUNCTION: Calculate Crew Efficiency Score
-- ============================================================================
-- Calculates 100-point efficiency score using weighted formula

CREATE OR REPLACE FUNCTION calculate_crew_efficiency_score(
  p_crew_id uuid,
  p_period_start date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_period_end date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  crew_id uuid,
  score int,
  install_speed_score int,
  qc_quality_score int,
  material_waste_score int,
  on_time_rate_score int,
  safety_score int,
  rating_tier text,
  jobs_count int
) AS $$
DECLARE
  v_install_speed_score int := 0;
  v_qc_score int := 0;
  v_material_waste_score int := 0;
  v_on_time_score int := 0;
  v_safety_score int := 0;
  v_total_score int;
  v_rating_tier text;
  v_jobs_count int;
BEGIN
  -- Get jobs for this crew in period
  SELECT COUNT(DISTINCT jtd.job_id) INTO v_jobs_count
  FROM public.job_task_durations jtd
  WHERE jtd.crew_id = p_crew_id
    AND DATE(jtd.start_time) BETWEEN p_period_start AND p_period_end;
  
  IF v_jobs_count = 0 THEN
    RETURN QUERY SELECT
      p_crew_id,
      0::int,
      0::int,
      0::int,
      0::int,
      0::int,
      0::int,
      'high_risk'::text,
      0::int;
    RETURN;
  END IF;
  
  -- 1. Install Speed Score (35% weight)
  -- Average speed rating from job_task_durations
  SELECT COALESCE(AVG(
    CASE 
      WHEN variance_percent <= -20 THEN 100
      WHEN variance_percent >= 20 THEN 0
      ELSE 100 - ABS(variance_percent) * 2.5
    END
  )::int, 0) INTO v_install_speed_score
  FROM public.job_task_durations jtd
  WHERE jtd.crew_id = p_crew_id
    AND DATE(jtd.start_time) BETWEEN p_period_start AND p_period_end
    AND jtd.variance_percent IS NOT NULL;
  
  -- 2. QC Quality Score (25% weight)
  -- Average QC scores from productivity_metrics
  SELECT COALESCE(AVG(value)::int, 0) INTO v_qc_score
  FROM public.productivity_metrics
  WHERE crew_id = p_crew_id
    AND metric_type = 'qc'
    AND created_at::date BETWEEN p_period_start AND p_period_end;
  
  -- 3. Material Waste Score (15% weight)
  -- Inverse of waste percentage (lower waste = higher score)
  SELECT COALESCE(
    GREATEST(0, LEAST(100, 100 - AVG(waste_percent) * 2))::int,
    0
  ) INTO v_material_waste_score
  FROM public.material_waste_logs mwl
  JOIN public.job_task_durations jtd ON jtd.job_id = mwl.job_id
  WHERE jtd.crew_id = p_crew_id
    AND mwl.created_at::date BETWEEN p_period_start AND p_period_end;
  
  -- 4. On-Time Rate Score (15% weight)
  -- Percentage of jobs completed on time (simplified - check if cleanup task completed within expected timeframe)
  SELECT COALESCE(
    (COUNT(*) FILTER (WHERE completed_on_time = true)::numeric / 
     NULLIF(COUNT(*), 0) * 100)::int,
    75
  ) INTO v_on_time_score
  FROM (
    SELECT 
      jtd.job_id,
      CASE 
        WHEN jtd.end_time IS NOT NULL AND jtd.start_time IS NOT NULL
          AND (jtd.end_time - jtd.start_time) <= INTERVAL '10 hours' -- Default: completed within 10 hours
        THEN true
        ELSE false
      END as completed_on_time
    FROM public.job_task_durations jtd
    WHERE jtd.crew_id = p_crew_id
      AND jtd.task_name = 'cleanup' -- Use cleanup as completion marker
      AND DATE(jtd.start_time) BETWEEN p_period_start AND p_period_end
    GROUP BY jtd.job_id, jtd.end_time, jtd.start_time
  ) on_time_check;
  
  -- 5. Safety Score (10% weight)
  -- Average safety scores from productivity_metrics
  SELECT COALESCE(AVG(value)::int, 100) INTO v_safety_score
  FROM public.productivity_metrics
  WHERE crew_id = p_crew_id
    AND metric_type = 'safety'
    AND created_at::date BETWEEN p_period_start AND p_period_end;
  
  -- Calculate weighted total
  v_total_score := (
    (v_install_speed_score * 0.35) +
    (v_qc_score * 0.25) +
    (v_material_waste_score * 0.15) +
    (v_on_time_score * 0.15) +
    (v_safety_score * 0.10)
  )::int;
  
  -- Determine rating tier
  IF v_total_score >= 90 THEN
    v_rating_tier := 'elite';
  ELSIF v_total_score >= 80 THEN
    v_rating_tier := 'strong';
  ELSIF v_total_score >= 70 THEN
    v_rating_tier := 'average';
  ELSIF v_total_score >= 60 THEN
    v_rating_tier := 'needs_improvement';
  ELSE
    v_rating_tier := 'high_risk';
  END IF;
  
  RETURN QUERY SELECT
    p_crew_id,
    GREATEST(0, LEAST(100, v_total_score))::int,
    GREATEST(0, LEAST(100, v_install_speed_score))::int,
    GREATEST(0, LEAST(100, v_qc_score))::int,
    GREATEST(0, LEAST(100, v_material_waste_score))::int,
    GREATEST(0, LEAST(100, v_on_time_score))::int,
    GREATEST(0, LEAST(100, v_safety_score))::int,
    v_rating_tier,
    v_jobs_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_crew_efficiency_score IS 'Block 254000: Calculates crew efficiency score (0-100) using weighted formula';

-- ============================================================================
-- PART 8 — FUNCTION: Detect Productivity Bottlenecks
-- ============================================================================
-- Analyzes patterns to detect bottlenecks

CREATE OR REPLACE FUNCTION detect_productivity_bottlenecks(
  p_workspace_id uuid,
  p_job_id uuid DEFAULT NULL
)
RETURNS TABLE (
  bottleneck_id uuid,
  job_id uuid,
  crew_id uuid,
  bottleneck_type text,
  severity text,
  description text,
  estimated_delay_minutes int
) AS $$
DECLARE
  job_record RECORD;
  crew_record RECORD;
  task_record RECORD;
  avg_duration numeric;
  current_duration numeric;
  variance numeric;
  delay_minutes int;
BEGIN
  -- Check for slow tasks
  FOR job_record IN
    SELECT DISTINCT jtd.job_id, jtd.crew_id
    FROM public.job_task_durations jtd
    WHERE jtd.workspace_id = p_workspace_id
      AND (p_job_id IS NULL OR jtd.job_id = p_job_id)
      AND jtd.end_time IS NULL -- Task still in progress
  LOOP
    -- Check each task for this job
    FOR task_record IN
      SELECT *
      FROM public.job_task_durations
      WHERE job_id = job_record.job_id
        AND end_time IS NULL
        AND start_time IS NOT NULL
    LOOP
      -- Get baseline
      SELECT AVG(duration_minutes) INTO avg_duration
      FROM public.job_task_durations
      WHERE task_name = task_record.task_name
        AND (task_record.crew_id IS NULL OR crew_id = task_record.crew_id)
        AND job_id != task_record.job_id
        AND duration_minutes IS NOT NULL
        AND created_at >= CURRENT_DATE - INTERVAL '90 days';
      
      -- Calculate current duration
      current_duration := EXTRACT(EPOCH FROM (NOW() - task_record.start_time)) / 60;
      
      -- If 20% slower than baseline, flag as bottleneck
      IF avg_duration IS NOT NULL AND current_duration > (avg_duration * 1.2) THEN
        variance := ((current_duration - avg_duration) / avg_duration * 100);
        delay_minutes := (current_duration - avg_duration)::int;
        
        -- Determine bottleneck type
        DECLARE
          bottleneck_type text;
          severity text;
        BEGIN
          IF task_record.task_name = 'tear-off' THEN
            bottleneck_type := 'slow_tear_off';
          ELSIF task_record.task_name = 'underlayment' THEN
            bottleneck_type := 'slow_underlayment';
          ELSIF task_record.task_name = 'ridge' THEN
            bottleneck_type := 'slow_ridge_work';
          ELSE
            bottleneck_type := 'other';
          END IF;
          
          -- Determine severity
          IF variance > 50 THEN
            severity := 'critical';
          ELSIF variance > 30 THEN
            severity := 'high';
          ELSIF variance > 20 THEN
            severity := 'medium';
          ELSE
            severity := 'low';
          END IF;
          
          -- Insert bottleneck record
          INSERT INTO public.productivity_bottlenecks (
            workspace_id,
            job_id,
            crew_id,
            bottleneck_type,
            severity,
            description,
            estimated_delay_minutes
          )
          VALUES (
            p_workspace_id,
            task_record.job_id,
            task_record.crew_id,
            bottleneck_type,
            severity,
            format('Task "%s" is running %s%% slower than average for this crew. Current duration: %.1f minutes vs baseline: %.1f minutes.',
              task_record.task_name, variance::text, current_duration, avg_duration),
            delay_minutes
          )
          ON CONFLICT DO NOTHING;
          
          RETURN QUERY SELECT
            pb.id,
            pb.job_id,
            pb.crew_id,
            pb.bottleneck_type,
            pb.severity,
            pb.description,
            pb.estimated_delay_minutes
          FROM public.productivity_bottlenecks pb
          WHERE pb.workspace_id = p_workspace_id
            AND pb.job_id = task_record.job_id
            AND pb.resolved = false
            ORDER BY pb.detected_at DESC
            LIMIT 1;
        END;
      END IF;
    END LOOP;
  END LOOP;
  
  -- Check for excessive material waste
  FOR job_record IN
    SELECT DISTINCT mwl.job_id
    FROM public.material_waste_logs mwl
    WHERE mwl.workspace_id = p_workspace_id
      AND (p_job_id IS NULL OR mwl.job_id = p_job_id)
      AND mwl.waste_percent > 10 -- More than 10% waste
  LOOP
    -- Get crew for this job
    SELECT jtd.crew_id INTO crew_record
    FROM public.job_task_durations jtd
    WHERE jtd.job_id = job_record.job_id
    LIMIT 1;
    
    INSERT INTO public.productivity_bottlenecks (
      workspace_id,
      job_id,
      crew_id,
      bottleneck_type,
      severity,
      description,
      cost_impact
    )
    SELECT
      p_workspace_id,
      mwl.job_id,
      crew_record.crew_id,
      'material_shortage'::text,
      CASE 
        WHEN mwl.waste_percent > 20 THEN 'critical'::text
        WHEN mwl.waste_percent > 15 THEN 'high'::text
        ELSE 'medium'::text
      END,
      format('Excessive material waste detected: %s%% more than estimated for %s.',
        mwl.waste_percent::text, mwl.material_name),
      mwl.waste_cost
    FROM public.material_waste_logs mwl
    WHERE mwl.job_id = job_record.job_id
      AND mwl.waste_percent > 10
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION detect_productivity_bottlenecks IS 'Block 254000: Detects productivity bottlenecks by analyzing patterns';

-- ============================================================================
-- PART 9 — FUNCTION: Predict Job Completion Time
-- ============================================================================
-- Predicts completion time based on crew speed history, job complexity, weather, etc.

CREATE OR REPLACE FUNCTION predict_job_completion_time(
  p_job_id uuid,
  p_crew_id uuid DEFAULT NULL
)
RETURNS TABLE (
  job_id uuid,
  estimated_completion timestamptz,
  original_plan timestamptz,
  forecasted_delay_minutes int,
  confidence_score int
) AS $$
DECLARE
  v_crew_id uuid;
  v_job_start timestamptz;
  v_original_end timestamptz;
  v_avg_total_hours numeric;
  v_crew_speed_factor numeric;
  v_estimated_completion timestamptz;
  v_delay_minutes int;
  v_confidence int;
BEGIN
  -- Get crew for job
  SELECT jtd.crew_id INTO v_crew_id
  FROM public.job_task_durations jtd
  WHERE jtd.job_id = p_job_id
  LIMIT 1;
  
  IF v_crew_id IS NULL AND p_crew_id IS NOT NULL THEN
    v_crew_id := p_crew_id;
  END IF;
  
  -- Get job start time
  SELECT MIN(start_time) INTO v_job_start
  FROM public.job_task_durations
  WHERE job_id = p_job_id;
  
  -- Get original planned end time (from crew_assignments or job schedule)
  SELECT scheduled_end_time INTO v_original_end
  FROM public.crew_assignments
  WHERE job_id = p_job_id
  LIMIT 1;
  
  -- Calculate average total hours for similar jobs by this crew
  SELECT AVG(total_duration_hours) INTO v_avg_total_hours
  FROM (
    SELECT 
      job_id,
      SUM(duration_minutes) / 60.0 as total_duration_hours
    FROM public.job_task_durations
    WHERE crew_id = v_crew_id
      AND job_id != p_job_id
      AND end_time IS NOT NULL
      AND created_at >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY job_id
  ) crew_history;
  
  -- If no history, use default
  IF v_avg_total_hours IS NULL THEN
    v_avg_total_hours := 8.0; -- Default 8 hours
  END IF;
  
  -- Calculate estimated completion
  v_estimated_completion := v_job_start + (v_avg_total_hours || ' hours')::interval;
  
  -- Calculate delay
  IF v_original_end IS NOT NULL THEN
    v_delay_minutes := EXTRACT(EPOCH FROM (v_estimated_completion - v_original_end)) / 60;
  ELSE
    v_delay_minutes := 0;
  END IF;
  
  -- Confidence score (based on amount of historical data)
  SELECT 
    CASE 
      WHEN COUNT(*) >= 10 THEN 90
      WHEN COUNT(*) >= 5 THEN 75
      WHEN COUNT(*) >= 2 THEN 60
      ELSE 40
    END INTO v_confidence
  FROM public.job_task_durations
  WHERE crew_id = v_crew_id
    AND job_id != p_job_id
    AND created_at >= CURRENT_DATE - INTERVAL '90 days';
  
  RETURN QUERY SELECT
    p_job_id,
    v_estimated_completion,
    v_original_end,
    v_delay_minutes::int,
    v_confidence;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION predict_job_completion_time IS 'Block 254000: Predicts job completion time based on crew history';

-- ============================================================================
-- PART 10 — TRIGGER: Auto-calculate task duration
-- ============================================================================
-- Automatically calculates duration when end_time is set

CREATE OR REPLACE FUNCTION trigger_calculate_task_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
    NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60;
    
    -- Calculate baseline and variance
    DECLARE
      baseline numeric;
    BEGIN
      SELECT AVG(duration_minutes) INTO baseline
      FROM public.job_task_durations
      WHERE task_name = NEW.task_name
        AND (NEW.crew_id IS NULL OR crew_id = NEW.crew_id)
        AND job_id != NEW.job_id
        AND duration_minutes IS NOT NULL
        AND created_at >= CURRENT_DATE - INTERVAL '90 days';
      
      IF baseline IS NOT NULL AND baseline > 0 THEN
        NEW.baseline_duration_minutes := baseline::int;
        NEW.variance_percent := ((NEW.duration_minutes - baseline) / baseline * 100)::numeric(5,2);
      END IF;
    END;
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_task_duration ON public.job_task_durations;
CREATE TRIGGER trg_calculate_task_duration
BEFORE INSERT OR UPDATE ON public.job_task_durations
FOR EACH ROW
EXECUTE FUNCTION trigger_calculate_task_duration();

-- ============================================================================
-- PART 11 — TRIGGER: Auto-categorize material waste
-- ============================================================================
-- Automatically categorizes waste when waste_percent is calculated

CREATE OR REPLACE FUNCTION trigger_categorize_material_waste()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.waste_percent < 5 THEN
    NEW.waste_category := 'acceptable';
  ELSIF NEW.waste_percent < 10 THEN
    NEW.waste_category := 'moderate';
  ELSIF NEW.waste_percent < 15 THEN
    NEW.waste_category := 'excessive';
  ELSE
    NEW.waste_category := 'critical';
  END IF;
  
  -- Calculate waste cost if unit_cost is available
  IF NEW.unit_cost IS NOT NULL AND NEW.estimated_needed IS NOT NULL THEN
    NEW.waste_cost := (NEW.actual_used - NEW.estimated_needed) * NEW.unit_cost;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_categorize_material_waste ON public.material_waste_logs;
CREATE TRIGGER trg_categorize_material_waste
BEFORE INSERT OR UPDATE ON public.material_waste_logs
FOR EACH ROW
EXECUTE FUNCTION trigger_categorize_material_waste();

-- ============================================================================
-- PART 12 — TRIGGER: Auto-update crew efficiency scores
-- ============================================================================
-- Periodically recalculates crew efficiency scores

CREATE OR REPLACE FUNCTION trigger_update_crew_efficiency_scores()
RETURNS TRIGGER AS $$
DECLARE
  crew_record RECORD;
  score_record RECORD;
BEGIN
  -- Only update if this is a completed task or new metric
  IF (TG_TABLE_NAME = 'job_task_durations' AND NEW.end_time IS NOT NULL) OR
     (TG_TABLE_NAME = 'productivity_metrics') THEN
    
    -- Get crew_id
    IF TG_TABLE_NAME = 'job_task_durations' THEN
      crew_record.crew_id := NEW.crew_id;
      SELECT workspace_id INTO crew_record.workspace_id
      FROM public.job_task_durations
      WHERE id = NEW.id;
    ELSE
      crew_record.crew_id := NEW.crew_id;
      crew_record.workspace_id := NEW.workspace_id;
    END IF;
    
    IF crew_record.crew_id IS NOT NULL THEN
      -- Recalculate efficiency score for current period
      SELECT * INTO score_record
      FROM calculate_crew_efficiency_score(
        crew_record.crew_id,
        CURRENT_DATE - INTERVAL '30 days',
        CURRENT_DATE
      );
      
      -- Upsert into crew_efficiency_scores
      INSERT INTO public.crew_efficiency_scores (
        workspace_id,
        crew_id,
        score,
        install_speed_score,
        qc_quality_score,
        material_waste_score,
        on_time_rate_score,
        safety_score,
        rating_tier,
        period_start,
        period_end,
        jobs_count
      )
      VALUES (
        crew_record.workspace_id,
        score_record.crew_id,
        score_record.score,
        score_record.install_speed_score,
        score_record.qc_quality_score,
        score_record.material_waste_score,
        score_record.on_time_rate_score,
        score_record.safety_score,
        score_record.rating_tier,
        CURRENT_DATE - INTERVAL '30 days',
        CURRENT_DATE,
        score_record.jobs_count
      )
      ON CONFLICT (crew_id, period_start, period_end)
      DO UPDATE SET
        score = EXCLUDED.score,
        install_speed_score = EXCLUDED.install_speed_score,
        qc_quality_score = EXCLUDED.qc_quality_score,
        material_waste_score = EXCLUDED.material_waste_score,
        on_time_rate_score = EXCLUDED.on_time_rate_score,
        safety_score = EXCLUDED.safety_score,
        rating_tier = EXCLUDED.rating_tier,
        jobs_count = EXCLUDED.jobs_count,
        updated_at = now();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for auto-updating efficiency scores
DROP TRIGGER IF EXISTS trg_update_efficiency_from_tasks ON public.job_task_durations;
CREATE TRIGGER trg_update_efficiency_from_tasks
AFTER INSERT OR UPDATE ON public.job_task_durations
FOR EACH ROW
WHEN (NEW.end_time IS NOT NULL)
EXECUTE FUNCTION trigger_update_crew_efficiency_scores();

DROP TRIGGER IF EXISTS trg_update_efficiency_from_metrics ON public.productivity_metrics;
CREATE TRIGGER trg_update_efficiency_from_metrics
AFTER INSERT OR UPDATE ON public.productivity_metrics
FOR EACH ROW
EXECUTE FUNCTION trigger_update_crew_efficiency_scores();

-- ============================================================================
-- PART 13 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE IF EXISTS public.productivity_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.crew_efficiency_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_task_durations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.material_waste_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.productivity_bottlenecks ENABLE ROW LEVEL SECURITY;

-- Productivity metrics: Workspace members can view/manage
DROP POLICY IF EXISTS "productivity_metrics_workspace_member" ON public.productivity_metrics;
CREATE POLICY "productivity_metrics_workspace_member" ON public.productivity_metrics
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = productivity_metrics.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.is_active = true
    )
  );

-- Crew efficiency scores: Workspace members can view/manage
DROP POLICY IF EXISTS "crew_efficiency_scores_workspace_member" ON public.crew_efficiency_scores;
CREATE POLICY "crew_efficiency_scores_workspace_member" ON public.crew_efficiency_scores
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = crew_efficiency_scores.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.is_active = true
    )
  );

-- Job task durations: Workspace members can view/manage
DROP POLICY IF EXISTS "job_task_durations_workspace_member" ON public.job_task_durations;
CREATE POLICY "job_task_durations_workspace_member" ON public.job_task_durations
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_task_durations.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.is_active = true
    )
  );

-- Material waste logs: Workspace members can view/manage
DROP POLICY IF EXISTS "material_waste_logs_workspace_member" ON public.material_waste_logs;
CREATE POLICY "material_waste_logs_workspace_member" ON public.material_waste_logs
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = material_waste_logs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.is_active = true
    )
  );

-- Productivity bottlenecks: Workspace members can view/manage
DROP POLICY IF EXISTS "productivity_bottlenecks_workspace_member" ON public.productivity_bottlenecks;
CREATE POLICY "productivity_bottlenecks_workspace_member" ON public.productivity_bottlenecks
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = productivity_bottlenecks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.is_active = true
    )
  );

-- ============================================================================
-- PART 14 — COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.productivity_metrics IS 'Block 254000: All productivity metrics for jobs, crews, and employees';
COMMENT ON TABLE public.crew_efficiency_scores IS 'Block 254000: Calculated efficiency scores for crews (0-100)';
COMMENT ON TABLE public.job_task_durations IS 'Block 254000: Task durations for jobs (tear-off, install, etc.)';
COMMENT ON TABLE public.material_waste_logs IS 'Block 254000: Material waste tracking (estimated vs actual)';
COMMENT ON TABLE public.productivity_bottlenecks IS 'Block 254000: Detected productivity bottlenecks and alerts';

COMMENT ON FUNCTION calculate_install_speed_metrics IS 'Block 254000: Calculates install speed metrics from job task durations';
COMMENT ON FUNCTION calculate_crew_efficiency_score IS 'Block 254000: Calculates crew efficiency score (0-100) using weighted formula';
COMMENT ON FUNCTION detect_productivity_bottlenecks IS 'Block 254000: Detects productivity bottlenecks by analyzing patterns';
COMMENT ON FUNCTION predict_job_completion_time IS 'Block 254000: Predicts job completion time based on crew history';























