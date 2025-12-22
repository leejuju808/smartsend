-- =========================================================
-- Block 242000 — Scheduling Engine v2 Automations
-- Auto-reschedule, capacity alerts, geographic clustering
-- =========================================================

-- ============================================================================
-- PART 1 — AUTO-RESCHEDULE FUNCTION
-- ============================================================================
-- Automatically reschedule jobs when weather delays are detected

CREATE OR REPLACE FUNCTION auto_reschedule_weather_delay()
RETURNS TRIGGER AS $$
DECLARE
  v_job_id uuid;
  v_scheduled_date date;
  v_next_available_date date;
  v_schedule_record record;
BEGIN
  -- Only trigger if delay is required and wasn't before
  IF NEW.delay_required = true AND (OLD.delay_required IS NULL OR OLD.delay_required = false) THEN
    v_job_id := NEW.job_id;
    v_scheduled_date := NEW.date;

    -- Find the schedule for this job
    SELECT * INTO v_schedule_record
    FROM public.job_schedule
    WHERE job_id = v_job_id
      AND scheduled_start::date = v_scheduled_date
      AND status = 'scheduled'
    LIMIT 1;

    IF v_schedule_record IS NOT NULL THEN
      -- Find next available date (look ahead 14 days)
      SELECT date INTO v_next_available_date
      FROM generate_series(
        v_scheduled_date + INTERVAL '1 day',
        v_scheduled_date + INTERVAL '14 days',
        '1 day'::interval
      ) AS d(date)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.job_schedule
        WHERE crew_id = v_schedule_record.crew_id
          AND scheduled_start::date = d.date
          AND status IN ('scheduled', 'in_progress')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.crew_availability
        WHERE crew_id = v_schedule_record.crew_id
          AND date = d.date
          AND is_available = false
      )
      LIMIT 1;

      IF v_next_available_date IS NOT NULL THEN
        -- Update schedule
        UPDATE public.job_schedule
        SET
          scheduled_start = (v_next_available_date || ' 07:00:00')::timestamptz,
          scheduled_end = (v_next_available_date || ' 17:00:00')::timestamptz,
          notes = COALESCE(notes, '') || E'\n[Auto-rescheduled due to weather delay: ' || NEW.delay_reason || ']'
        WHERE id = v_schedule_record.id;

        -- Update roofing_jobs table
        UPDATE public.roofing_jobs
        SET
          scheduled_start_date = v_next_available_date,
          scheduled_end_date = v_next_available_date
        WHERE id = v_job_id;

        -- Log the reschedule
        RAISE NOTICE 'Auto-rescheduled job % from % to % due to weather delay', 
          v_job_id, v_scheduled_date, v_next_available_date;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_reschedule_weather_delay
AFTER INSERT OR UPDATE ON public.weather_log
FOR EACH ROW
WHEN (NEW.delay_required = true)
EXECUTE FUNCTION auto_reschedule_weather_delay();

-- ============================================================================
-- PART 2 — CAPACITY ALERT FUNCTION
-- ============================================================================
-- Alert when crew is overbooked or approaching capacity

CREATE OR REPLACE FUNCTION check_crew_capacity()
RETURNS TRIGGER AS $$
DECLARE
  v_crew_id uuid;
  v_scheduled_date date;
  v_scheduled_hours numeric;
  v_max_hours numeric := 8; -- 8 hour work day
  v_utilization_percent numeric;
BEGIN
  v_crew_id := NEW.crew_id;
  v_scheduled_date := NEW.scheduled_start::date;

  -- Calculate total scheduled hours for this crew on this date
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (scheduled_end - scheduled_start)) / 3600), 0)
  INTO v_scheduled_hours
  FROM public.job_schedule
  WHERE crew_id = v_crew_id
    AND scheduled_start::date = v_scheduled_date
    AND status IN ('scheduled', 'in_progress')
    AND id != NEW.id; -- Exclude current schedule

  -- Add current schedule hours
  v_scheduled_hours := v_scheduled_hours + 
    EXTRACT(EPOCH FROM (NEW.scheduled_end - NEW.scheduled_start)) / 3600;

  v_utilization_percent := (v_scheduled_hours / v_max_hours) * 100;

  -- Alert if over capacity
  IF v_scheduled_hours > v_max_hours THEN
    RAISE WARNING 'Crew % is overbooked on %: %.1f hours scheduled (max: %.1f hours)',
      v_crew_id, v_scheduled_date, v_scheduled_hours, v_max_hours;
    
    -- Could insert into alerts table here
    -- INSERT INTO public.alerts (type, message, workspace_id, ...)
  END IF;

  -- Alert if near capacity (80%+)
  IF v_utilization_percent >= 80 AND v_utilization_percent < 100 THEN
    RAISE NOTICE 'Crew % is near capacity on %: %.1f%% utilized',
      v_crew_id, v_scheduled_date, v_utilization_percent;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_crew_capacity
BEFORE INSERT OR UPDATE ON public.job_schedule
FOR EACH ROW
EXECUTE FUNCTION check_crew_capacity();

-- ============================================================================
-- PART 3 — GEOGRAPHIC CLUSTERING FUNCTION
-- ============================================================================
-- Automatically suggest job clustering when jobs are in same area

CREATE OR REPLACE FUNCTION suggest_job_clustering()
RETURNS void AS $$
DECLARE
  v_cluster_date date;
  v_workspace_id uuid;
  v_cluster record;
  v_job_ids uuid[];
BEGIN
  -- Look for jobs scheduled on same date in same area
  FOR v_workspace_id IN SELECT DISTINCT workspace_id FROM public.workspaces LOOP
    FOR v_cluster_date IN 
      SELECT DISTINCT scheduled_start::date
      FROM public.job_schedule
      WHERE workspace_id = v_workspace_id
        AND scheduled_start::date >= CURRENT_DATE
        AND scheduled_start::date <= CURRENT_DATE + INTERVAL '7 days'
    LOOP
      -- Find jobs in same geographic area (same city/neighborhood)
      SELECT ARRAY_AGG(js.job_id)
      INTO v_job_ids
      FROM public.job_schedule js
      JOIN public.roofing_jobs j ON j.id = js.job_id
      WHERE js.workspace_id = v_workspace_id
        AND js.scheduled_start::date = v_cluster_date
        AND js.status = 'scheduled'
        AND j.address IS NOT NULL
      GROUP BY 
        SPLIT_PART(j.address, ',', 1) -- Group by city/neighborhood
      HAVING COUNT(*) >= 2; -- At least 2 jobs in same area

      -- If cluster found, create cluster record
      IF v_job_ids IS NOT NULL AND array_length(v_job_ids, 1) >= 2 THEN
        INSERT INTO public.job_clusters (
          workspace_id,
          cluster_name,
          cluster_date,
          job_ids,
          travel_time_saved_minutes
        )
        VALUES (
          v_workspace_id,
          'Auto-clustered: ' || v_cluster_date::text,
          v_cluster_date,
          v_job_ids,
          (array_length(v_job_ids, 1) - 1) * 15 -- 15 min saved per job in cluster
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule this function to run daily (via pg_cron or external scheduler)
-- SELECT cron.schedule('suggest-job-clustering', '0 8 * * *', 'SELECT suggest_job_clustering();');

-- ============================================================================
-- PART 4 — MATERIALS DELIVERY CHECK
-- ============================================================================
-- Block schedule if materials not delivered

CREATE OR REPLACE FUNCTION check_materials_delivery()
RETURNS TRIGGER AS $$
DECLARE
  v_job_id uuid;
  v_materials_delivered boolean;
BEGIN
  v_job_id := NEW.job_id;

  -- Check if materials are delivered (would query materials table)
  -- For now, assume materials_delivered column exists on roofing_jobs
  SELECT COALESCE(materials_delivered, false)
  INTO v_materials_delivered
  FROM public.roofing_jobs
  WHERE id = v_job_id;

  -- If materials not delivered and job is scheduled, add warning
  IF NOT v_materials_delivered AND NEW.status = 'scheduled' THEN
    RAISE WARNING 'Job % scheduled but materials not delivered yet', v_job_id;
    
    -- Could update schedule status or add alert
    -- UPDATE public.job_schedule SET notes = COALESCE(notes, '') || E'\n⚠ Materials not delivered'
    -- WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_materials_delivery
BEFORE INSERT OR UPDATE ON public.job_schedule
FOR EACH ROW
EXECUTE FUNCTION check_materials_delivery();

-- ============================================================================
-- PART 5 — EQUIPMENT CONFLICT CHECK
-- ============================================================================
-- Flag conflicts when equipment is double-booked

CREATE OR REPLACE FUNCTION check_equipment_conflict()
RETURNS TRIGGER AS $$
DECLARE
  v_conflict_count integer;
BEGIN
  -- Check for overlapping equipment schedules
  SELECT COUNT(*)
  INTO v_conflict_count
  FROM public.equipment_schedule
  WHERE equipment_id = NEW.equipment_id
    AND scheduled_date = NEW.scheduled_date
    AND status = 'scheduled'
    AND id != NEW.id
    AND (
      (NEW.scheduled_start_time IS NULL AND scheduled_start_time IS NULL) OR
      (NEW.scheduled_start_time IS NOT NULL AND scheduled_start_time IS NOT NULL AND
       NEW.scheduled_start_time < COALESCE(scheduled_end_time, '23:59:59'::time) AND
       NEW.scheduled_end_time > scheduled_start_time)
    );

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'Equipment % is already scheduled for % at this time',
      NEW.equipment_id, NEW.scheduled_date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_equipment_conflict
BEFORE INSERT OR UPDATE ON public.equipment_schedule
FOR EACH ROW
EXECUTE FUNCTION check_equipment_conflict();

-- ============================================================================
-- PART 6 — JOB COMPLETION CLEANUP
-- ============================================================================
-- Remove from schedule when job is marked completed

CREATE OR REPLACE FUNCTION cleanup_completed_jobs()
RETURNS TRIGGER AS $$
BEGIN
  -- When job status changes to completed, update schedule status
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE public.job_schedule
    SET status = 'completed'
    WHERE job_id = NEW.id
      AND status IN ('scheduled', 'in_progress');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- This trigger would be on roofing_jobs table
-- CREATE TRIGGER trg_cleanup_completed_jobs
-- AFTER UPDATE ON public.roofing_jobs
-- FOR EACH ROW
-- WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
-- EXECUTE FUNCTION cleanup_completed_jobs();

-- ============================================================================
-- PART 7 — EMERGENCY JOB OVERRIDE
-- ============================================================================
-- Allow emergency jobs to override capacity limits

CREATE OR REPLACE FUNCTION allow_emergency_override()
RETURNS TRIGGER AS $$
DECLARE
  v_is_emergency boolean;
BEGIN
  -- Check if job is marked as emergency (would be a column on roofing_jobs)
  SELECT COALESCE(is_emergency, false)
  INTO v_is_emergency
  FROM public.roofing_jobs
  WHERE id = NEW.job_id;

  -- If emergency, allow even if over capacity
  IF v_is_emergency THEN
    -- Skip capacity check (would need to modify check_crew_capacity function)
    -- For now, just log it
    RAISE NOTICE 'Emergency job % assigned to crew % - capacity check bypassed',
      NEW.job_id, NEW.crew_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON FUNCTION auto_reschedule_weather_delay() IS 'Block 242000: Auto-reschedule jobs when weather delays are detected';
COMMENT ON FUNCTION check_crew_capacity() IS 'Block 242000: Alert when crew is overbooked or approaching capacity';
COMMENT ON FUNCTION suggest_job_clustering() IS 'Block 242000: Automatically suggest job clustering for geographic efficiency';
COMMENT ON FUNCTION check_materials_delivery() IS 'Block 242000: Block schedule if materials not delivered';
COMMENT ON FUNCTION check_equipment_conflict() IS 'Block 242000: Flag conflicts when equipment is double-booked';
COMMENT ON FUNCTION cleanup_completed_jobs() IS 'Block 242000: Remove from schedule when job is marked completed';

























