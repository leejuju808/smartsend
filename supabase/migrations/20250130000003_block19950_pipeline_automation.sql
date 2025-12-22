-- =========================================================
-- Block 19950 — Pipeline Automation Based on Roof Measurements
-- Automatically moves threads to appropriate pipeline stages based on AI measurements
-- =========================================================

-- ============================================================================
-- FUNCTION: Automate Pipeline Based on Roof Measurements
-- ============================================================================

CREATE OR REPLACE FUNCTION public.automate_pipeline_from_measurements(
  p_thread_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_measurement record;
  v_thread record;
  v_job_type text;
  v_squares_avg numeric;
  v_age_median numeric;
  v_replacement_cost_avg numeric;
  v_storm_damage boolean;
  v_pipeline_stage text;
  v_actions_taken text[];
BEGIN
  -- Get roof measurement for thread
  SELECT * INTO v_measurement
  FROM public.roof_measurements
  WHERE thread_id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No roof measurement found for this thread'
    );
  END IF;
  
  -- Get thread data
  SELECT * INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Thread not found'
    );
  END IF;
  
  v_job_type := v_measurement.likely_job_type;
  v_squares_avg := v_measurement.estimated_squares_avg;
  v_age_median := v_measurement.roof_age_median;
  v_replacement_cost_avg := v_measurement.replacement_cost_avg;
  
  -- Check for storm damage from photo intelligence
  SELECT EXISTS (
    SELECT 1 FROM public.photo_intelligence pi
    WHERE pi.attachment_id = v_measurement.attachment_id
    AND (pi.storm_damage_detected = true OR pi.hail_marks_detected = true)
  ) INTO v_storm_damage;
  
  -- Determine pipeline stage and actions based on measurements
  IF v_job_type = 'replacement' AND v_squares_avg >= 20 AND v_replacement_cost_avg >= 10000 THEN
    -- High-value replacement → Replacement Pipeline
    v_pipeline_stage := 'estimate_scheduled';
    v_actions_taken := array_append(v_actions_taken, 'moved_to_replacement_pipeline');
    v_actions_taken := array_append(v_actions_taken, 'added_high_value_estimate');
    
    -- Update thread
    UPDATE public.inbox_threads
    SET 
      pipeline_stage = v_pipeline_stage,
      thread_estimated_value = v_replacement_cost_avg,
      updated_at = now()
    WHERE id = p_thread_id;
    
    -- If storm damage detected, apply insurance workflow
    IF v_storm_damage THEN
      v_actions_taken := array_append(v_actions_taken, 'applied_insurance_workflow');
      
      -- Update revenue metadata
      UPDATE public.inbox_threads
      SET revenue_metadata = jsonb_build_object(
        'insurance_opportunity', true,
        'storm_damage_detected', true,
        'replacement_likely', true
      )
      WHERE id = p_thread_id;
    END IF;
    
  ELSIF v_job_type = 'repair_only' OR (v_squares_avg < 15 AND v_replacement_cost_avg < 5000) THEN
    -- Repair job → Repair Pipeline
    v_pipeline_stage := 'contacted';
    v_actions_taken := array_append(v_actions_taken, 'moved_to_repair_pipeline');
    
    -- Update thread
    UPDATE public.inbox_threads
    SET 
      pipeline_stage = v_pipeline_stage,
      thread_estimated_value = COALESCE(v_replacement_cost_avg * 0.3, 500), -- Estimate repair cost
      updated_at = now()
    WHERE id = p_thread_id;
    
    v_actions_taken := array_append(v_actions_taken, 'set_task_to_call_asap');
    
  ELSE
    -- Unknown or needs more info → Keep in current stage or move to contacted
    v_pipeline_stage := COALESCE(v_thread.pipeline_stage, 'contacted');
    v_actions_taken := array_append(v_actions_taken, 'requires_manual_review');
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'pipeline_stage', v_pipeline_stage,
    'actions_taken', v_actions_taken,
    'estimated_value', v_replacement_cost_avg,
    'job_type', v_job_type
  );
END;
$$;

-- ============================================================================
-- TRIGGER: Automatically run pipeline automation when measurement is created/updated
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_automate_pipeline_on_measurement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only automate if measurement has sufficient confidence and data
  IF NEW.confidence_score >= 50 
     AND NEW.likely_job_type != 'unknown'
     AND NEW.estimated_squares_avg IS NOT NULL THEN
    PERFORM public.automate_pipeline_from_measurements(NEW.thread_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_automate_pipeline_on_measurement ON public.roof_measurements;
CREATE TRIGGER tr_automate_pipeline_on_measurement
AFTER INSERT OR UPDATE ON public.roof_measurements
FOR EACH ROW
WHEN (NEW.confidence_score >= 50 AND NEW.likely_job_type != 'unknown')
EXECUTE FUNCTION public.tg_automate_pipeline_on_measurement();

-- ============================================================================
-- FUNCTION: Get Pipeline Recommendations Based on Measurements
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_pipeline_recommendations(
  p_thread_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_measurement record;
  v_recommendations jsonb;
BEGIN
  SELECT * INTO v_measurement
  FROM public.roof_measurements
  WHERE thread_id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('recommendations', '[]'::jsonb);
  END IF;
  
  v_recommendations := '[]'::jsonb;
  
  -- Replacement recommendations
  IF v_measurement.likely_job_type = 'replacement' THEN
    v_recommendations := jsonb_insert(
      v_recommendations,
      '{0}',
      jsonb_build_object(
        'action', 'schedule_estimator',
        'priority', 'high',
        'reason', 'Large replacement job detected'
      )
    );
    
    IF v_measurement.replacement_cost_avg >= 15000 THEN
      v_recommendations := jsonb_insert(
        v_recommendations,
        '{1}',
        jsonb_build_object(
          'action', 'assign_to_senior_rep',
          'priority', 'high',
          'reason', 'High-value replacement job'
        )
      );
    END IF;
  END IF;
  
  -- Repair recommendations
  IF v_measurement.likely_job_type = 'repair_only' THEN
    v_recommendations := jsonb_insert(
      v_recommendations,
      '{0}',
      jsonb_build_object(
        'action', 'assign_to_repair_technician',
        'priority', 'medium',
        'reason', 'Repair job detected'
      )
    );
  END IF;
  
  -- Low confidence recommendations
  IF v_measurement.confidence_score < 60 THEN
    v_recommendations := jsonb_insert(
      v_recommendations,
      '{0}',
      jsonb_build_object(
        'action', 'request_better_photos',
        'priority', 'medium',
        'reason', COALESCE(v_measurement.quality_feedback, 'Low confidence measurement')
      )
    );
  END IF;
  
  RETURN jsonb_build_object('recommendations', v_recommendations);
END;
$$;

COMMENT ON FUNCTION public.automate_pipeline_from_measurements IS 'Automatically moves threads to appropriate pipeline stages based on roof measurements';
COMMENT ON FUNCTION public.get_pipeline_recommendations IS 'Returns pipeline action recommendations based on roof measurements';



















































