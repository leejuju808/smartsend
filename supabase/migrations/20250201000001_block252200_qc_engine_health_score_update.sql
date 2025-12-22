-- =========================================================
-- Block 252200 — QC Engine: Update Job Health Score
-- =========================================================
-- Updates job health score calculation to include QC score
-- Formula: production_health * 0.6 + safety_score * 0.2 + qc_score * 0.2
-- =========================================================

-- ============================================================================
-- PART 1 — UPDATE calculate_job_health_score FUNCTION
-- ============================================================================
-- Now includes QC score in the weighted calculation

CREATE OR REPLACE FUNCTION calculate_job_health_score(p_job_id uuid)
RETURNS numeric AS $$
DECLARE
  delayed_count int;
  blocker_count int;
  days_behind int;
  production_health numeric;
  safety_score numeric;
  qc_score numeric;
  final_score numeric;
BEGIN
  -- Calculate production health (existing logic)
  SELECT COUNT(*) INTO delayed_count
  FROM public.production_milestones
  WHERE job_id = p_job_id AND status = 'delayed';
  
  SELECT COUNT(*) INTO blocker_count
  FROM public.milestone_blockers mb
  JOIN public.production_milestones pm ON pm.id = mb.milestone_id
  WHERE pm.job_id = p_job_id AND mb.resolved = false;
  
  SELECT COALESCE(SUM(
    CASE 
      WHEN due_date < CURRENT_DATE AND status != 'completed' 
      THEN CURRENT_DATE - due_date 
      ELSE 0 
    END
  ), 0) INTO days_behind
  FROM public.production_milestones
  WHERE job_id = p_job_id;
  
  -- Production health: 100 - (delayed_count * 10) - (blocker_count * 7) - (days_behind * 5)
  production_health := 100 - (delayed_count * 10) - (blocker_count * 7) - (days_behind * 5);
  production_health := GREATEST(0, LEAST(100, production_health));
  
  -- Get safety score (if available)
  -- This would come from safety incidents, toolbox talks, etc.
  -- For now, default to 100 if no safety data
  SELECT COALESCE(
    -- Calculate safety score based on incidents
    -- Lower score for more incidents
    100 - (COUNT(*) FILTER (WHERE severity = 'critical') * 20) - 
         (COUNT(*) FILTER (WHERE severity = 'high') * 10) - 
         (COUNT(*) FILTER (WHERE severity = 'medium') * 5),
    100
  ) INTO safety_score
  FROM public.safety_incidents
  WHERE job_id = p_job_id
    AND created_at >= CURRENT_DATE - INTERVAL '30 days';
  
  safety_score := GREATEST(0, LEAST(100, COALESCE(safety_score, 100)));
  
  -- Get QC score using the function we created
  SELECT public.calculate_qc_score(p_job_id) INTO qc_score;
  
  -- If no QC data, set to 0 (fails the system's health score as specified)
  IF qc_score IS NULL THEN
    qc_score := 0;
  END IF;
  
  -- Calculate weighted final score
  -- 60% production, 20% safety, 20% QC
  final_score := 
    (production_health * 0.6) +
    (safety_score * 0.2) +
    (qc_score * 0.2);
  
  -- Ensure score is between 0 and 100
  RETURN GREATEST(0, LEAST(100, ROUND(final_score, 2)));
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_job_health_score IS 'Block 252200: Calculates job health score (0-100) using weighted formula: 60% production, 20% safety, 20% QC. Jobs without QC fail the system health score.';

-- ============================================================================
-- PART 2 — CREATE FUNCTION: Get Job Health Breakdown
-- ============================================================================
-- Returns detailed breakdown of health score components

CREATE OR REPLACE FUNCTION get_job_health_breakdown(p_job_id uuid)
RETURNS jsonb AS $$
DECLARE
  delayed_count int;
  blocker_count int;
  days_behind int;
  production_health numeric;
  safety_score numeric;
  qc_score numeric;
  result jsonb;
BEGIN
  -- Production metrics
  SELECT COUNT(*) INTO delayed_count
  FROM public.production_milestones
  WHERE job_id = p_job_id AND status = 'delayed';
  
  SELECT COUNT(*) INTO blocker_count
  FROM public.milestone_blockers mb
  JOIN public.production_milestones pm ON pm.id = mb.milestone_id
  WHERE pm.job_id = p_job_id AND mb.resolved = false;
  
  SELECT COALESCE(SUM(
    CASE 
      WHEN due_date < CURRENT_DATE AND status != 'completed' 
      THEN CURRENT_DATE - due_date 
      ELSE 0 
    END
  ), 0) INTO days_behind
  FROM public.production_milestones
  WHERE job_id = p_job_id;
  
  production_health := 100 - (delayed_count * 10) - (blocker_count * 7) - (days_behind * 5);
  production_health := GREATEST(0, LEAST(100, production_health));
  
  -- Safety score
  SELECT COALESCE(
    100 - (COUNT(*) FILTER (WHERE severity = 'critical') * 20) - 
         (COUNT(*) FILTER (WHERE severity = 'high') * 10) - 
         (COUNT(*) FILTER (WHERE severity = 'medium') * 5),
    100
  ) INTO safety_score
  FROM public.safety_incidents
  WHERE job_id = p_job_id
    AND created_at >= CURRENT_DATE - INTERVAL '30 days';
  
  safety_score := GREATEST(0, LEAST(100, COALESCE(safety_score, 100)));
  
  -- QC score
  SELECT public.calculate_qc_score(p_job_id) INTO qc_score;
  IF qc_score IS NULL THEN
    qc_score := 0;
  END IF;
  
  -- Build result
  result := jsonb_build_object(
    'production_health', production_health,
    'production_weight', 0.6,
    'safety_score', safety_score,
    'safety_weight', 0.2,
    'qc_score', qc_score,
    'qc_weight', 0.2,
    'final_score', (production_health * 0.6) + (safety_score * 0.2) + (qc_score * 0.2),
    'production_metrics', jsonb_build_object(
      'delayed_milestones', delayed_count,
      'open_blockers', blocker_count,
      'days_behind', days_behind
    )
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_job_health_breakdown IS 'Block 252200: Returns detailed breakdown of job health score components';
























