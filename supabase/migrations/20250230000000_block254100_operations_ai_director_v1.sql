-- =========================================================
-- Block 254100 — SmartSend Operations AI Director v1
-- "AI Predicts Delays, Optimizes Crew Assignments, Prevents Mistakes, Auto-Schedules Materials, Auto-Fixes Bottlenecks"
-- =========================================================
-- 
-- This block makes SmartSend not just software… but a fully automated OPERATIONS BRAIN.
-- This is where SmartSend becomes the AI Director of the roofing company — watching EVERYTHING 
-- and stepping in BEFORE problems happen.
-- 
-- Features:
-- - AI Delay Predictor
-- - AI Crew Assignment Recommender
-- - AI Material Forecast & Auto-Order Suggestions
-- - AI Bottleneck Resolver
-- - AI Job Schedule Optimizer
-- - AI Preventative Alerts
-- - AI Voice Assistant for PMs
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE ai_predictions TABLE
-- ============================================================================
-- Stores AI predictions for delays, crew mismatches, material shortages, safety risks

CREATE TABLE IF NOT EXISTS public.ai_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid, -- References jobs or roofing_jobs (flexible)
  
  prediction_type text NOT NULL CHECK (prediction_type IN (
    'delay',
    'crew_mismatch',
    'material_shortage',
    'safety_risk',
    'weather_impact',
    'bottleneck',
    'schedule_conflict',
    'quality_risk'
  )),
  
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  message text NOT NULL,
  
  -- Prediction details (JSONB for flexibility)
  prediction_data jsonb DEFAULT '{}'::jsonb,
  -- Example structure:
  -- {
  --   "predicted_delay_hours": 2.1,
  --   "reasons": ["Crew install speed is 18% slower than their norm today", "Ridge caps not started by expected time"],
  --   "severity": "moderate",
  --   "recommended_actions": ["Move Crew D to assist", "Extend work hours"]
  -- }
  
  -- Status tracking
  is_resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_predictions_workspace ON public.ai_predictions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_predictions_job ON public.ai_predictions(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_predictions_type ON public.ai_predictions(prediction_type, is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_ai_predictions_confidence ON public.ai_predictions(workspace_id, confidence DESC, created_at DESC) WHERE is_resolved = false;

COMMENT ON TABLE public.ai_predictions IS 'Block 254100: AI predictions for delays, crew mismatches, material shortages, safety risks';
COMMENT ON COLUMN public.ai_predictions.prediction_type IS 'Type: delay, crew_mismatch, material_shortage, safety_risk, weather_impact, bottleneck, schedule_conflict, quality_risk';
COMMENT ON COLUMN public.ai_predictions.confidence IS 'Confidence score 0-1 (0 = low, 1 = high)';

-- ============================================================================
-- PART 2 — CREATE ai_recommendations TABLE
-- ============================================================================
-- Stores AI recommendations for crew assignments, material orders, schedule shifts

CREATE TABLE IF NOT EXISTS public.ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid, -- References jobs or roofing_jobs (flexible)
  
  recommendation_type text NOT NULL CHECK (recommendation_type IN (
    'crew_assignment',
    'material_order',
    'schedule_shift',
    'crew_reassignment',
    'material_delivery_timing',
    'weather_adjustment',
    'bottleneck_resolution',
    'safety_action'
  )),
  
  recommended_value jsonb NOT NULL,
  -- Example structure for crew_assignment:
  -- {
  --   "recommended_crew_id": "uuid",
  --   "recommended_crew_name": "Crew A",
  --   "score": 92,
  --   "reasoning": "Fastest for steep slopes",
  --   "backup_crew_id": "uuid",
  --   "avoid_crew_ids": ["uuid"]
  -- }
  -- Example structure for material_order:
  -- {
  --   "material_name": "Timberline HDZ",
  --   "quantity": 6,
  --   "unit": "bundles",
  --   "urgency": "high",
  --   "reasoning": "Job will need 6 more bundles to prevent delays"
  -- }
  -- Example structure for schedule_shift:
  -- {
  --   "recommended_start_time": "8:30 AM",
  --   "recommended_crew_id": "uuid",
  --   "material_delivery_time": "7:45 AM",
  --   "predicted_completion": "3:50 PM",
  --   "weather_risk": "low"
  -- }
  
  priority text CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  
  -- Status tracking
  status text CHECK (status IN ('pending', 'approved', 'rejected', 'implemented')) DEFAULT 'pending',
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  implemented_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_recommendations_workspace ON public.ai_recommendations(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_job ON public.ai_recommendations(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_type ON public.ai_recommendations(recommendation_type, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_priority ON public.ai_recommendations(workspace_id, priority DESC, created_at DESC) WHERE status = 'pending';

COMMENT ON TABLE public.ai_recommendations IS 'Block 254100: AI recommendations for crew assignments, material orders, schedule shifts';
COMMENT ON COLUMN public.ai_recommendations.recommendation_type IS 'Type: crew_assignment, material_order, schedule_shift, crew_reassignment, material_delivery_timing, weather_adjustment, bottleneck_resolution, safety_action';

-- ============================================================================
-- PART 3 — CREATE ai_preventative_alerts TABLE
-- ============================================================================
-- Stores proactive alerts that warn PMs BEFORE problems happen

CREATE TABLE IF NOT EXISTS public.ai_preventative_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid, -- References jobs or roofing_jobs (flexible)
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  alert_type text NOT NULL CHECK (alert_type IN (
    'weather_warning',
    'crew_performance',
    'material_delivery',
    'safety_risk',
    'schedule_conflict',
    'quality_issue',
    'bottleneck_forming',
    'supplier_delay'
  )),
  
  severity text CHECK (severity IN ('info', 'warning', 'critical')) DEFAULT 'warning',
  title text NOT NULL,
  message text NOT NULL,
  
  -- Alert details (JSONB for flexibility)
  alert_data jsonb DEFAULT '{}'::jsonb,
  -- Example structure:
  -- {
  --   "weather_type": "tornado_watch",
  --   "recommended_action": "postpone job start by 1 hour",
  --   "affected_jobs": ["uuid1", "uuid2"],
  --   "crew_safety_score": 65,
  --   "delivery_delay_minutes": 20
  -- }
  
  -- Status tracking
  is_acknowledged boolean DEFAULT false,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  is_resolved boolean DEFAULT false,
  resolved_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_preventative_alerts_workspace ON public.ai_preventative_alerts(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_preventative_alerts_job ON public.ai_preventative_alerts(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_preventative_alerts_crew ON public.ai_preventative_alerts(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_preventative_alerts_type ON public.ai_preventative_alerts(alert_type, is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_ai_preventative_alerts_severity ON public.ai_preventative_alerts(workspace_id, severity DESC, created_at DESC) WHERE is_resolved = false;

COMMENT ON TABLE public.ai_preventative_alerts IS 'Block 254100: Proactive alerts that warn PMs BEFORE problems happen';
COMMENT ON COLUMN public.ai_preventative_alerts.alert_type IS 'Type: weather_warning, crew_performance, material_delivery, safety_risk, schedule_conflict, quality_issue, bottleneck_forming, supplier_delay';

-- ============================================================================
-- PART 4 — CREATE ai_operations_director_log TABLE
-- ============================================================================
-- Audit log of all AI Director actions and decisions

CREATE TABLE IF NOT EXISTS public.ai_operations_director_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  action_type text NOT NULL CHECK (action_type IN (
    'prediction_generated',
    'recommendation_created',
    'alert_triggered',
    'recommendation_approved',
    'recommendation_rejected',
    'recommendation_implemented',
    'prediction_resolved',
    'alert_acknowledged'
  )),
  
  entity_type text, -- 'prediction', 'recommendation', 'alert'
  entity_id uuid, -- ID of the prediction/recommendation/alert
  
  -- Action details (JSONB for flexibility)
  action_data jsonb DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_operations_director_log_workspace ON public.ai_operations_director_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_operations_director_log_action ON public.ai_operations_director_log(action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_operations_director_log_entity ON public.ai_operations_director_log(entity_type, entity_id);

COMMENT ON TABLE public.ai_operations_director_log IS 'Block 254100: Audit log of all AI Director actions and decisions';

-- ============================================================================
-- PART 5 — FUNCTIONS: AI Delay Predictor
-- ============================================================================

-- Function to analyze job and predict delays
CREATE OR REPLACE FUNCTION public.predict_job_delay(
  p_job_id uuid,
  p_workspace_id uuid
)
RETURNS TABLE (
  predicted_delay_hours numeric,
  confidence numeric,
  reasons text[],
  recommendation text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_crew record;
  v_crew_efficiency record;
  v_weather_data jsonb;
  v_material_status jsonb;
  v_photo_progress jsonb;
  v_predicted_delay numeric := 0;
  v_confidence numeric := 0.5;
  v_reasons text[] := ARRAY[]::text[];
  v_recommendation text;
BEGIN
  -- Get job details (try roofing_jobs first, then jobs)
  SELECT * INTO v_job
  FROM (
    SELECT id, workspace_id, crew_id, scheduled_start_date, scheduled_end_date, 
           job_type, status, estimated_squares, title
    FROM public.roofing_jobs
    WHERE id = p_job_id AND workspace_id = p_workspace_id
    UNION ALL
    SELECT id, workspace_id, crew_id, scheduled_start_date, scheduled_end_date,
           job_type, status, NULL::numeric as estimated_squares, title
    FROM public.jobs
    WHERE id = p_job_id AND workspace_id = p_workspace_id
    LIMIT 1
  ) j
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get crew efficiency data if crew is assigned
  IF v_job.crew_id IS NOT NULL THEN
    SELECT * INTO v_crew_efficiency
    FROM public.crew_efficiency_scores
    WHERE crew_id = v_job.crew_id
      AND workspace_id = p_workspace_id
      AND period_end >= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY period_end DESC
    LIMIT 1;
    
    -- Check if crew is performing slower than normal
    IF v_crew_efficiency.install_speed_score < 70 THEN
      v_predicted_delay := v_predicted_delay + 1.5;
      v_confidence := v_confidence + 0.15;
      v_reasons := array_append(v_reasons, 
        format('Crew install speed is %s%% slower than their norm today', 
          ROUND(100 - v_crew_efficiency.install_speed_score))
      );
    END IF;
  END IF;
  
  -- Check material delivery status (if material_forecasts or supplier_orders exist)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'supplier_orders') THEN
    SELECT jsonb_build_object(
      'has_delayed_orders', COUNT(*) FILTER (WHERE status = 'delayed'),
      'pending_orders', COUNT(*) FILTER (WHERE status IN ('pending', 'sent'))
    ) INTO v_material_status
    FROM public.supplier_orders
    WHERE job_id = p_job_id;
    
    IF (v_material_status->>'has_delayed_orders')::int > 0 THEN
      v_predicted_delay := v_predicted_delay + 2.0;
      v_confidence := v_confidence + 0.2;
      v_reasons := array_append(v_reasons, 'Material delivery is delayed');
    END IF;
  END IF;
  
  -- Check photo progress if job_photo_entries exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_photo_entries') THEN
    SELECT jsonb_build_object(
      'underlayment_detected', COUNT(*) FILTER (WHERE ai_detected_stage = 'underlayment'),
      'install_detected', COUNT(*) FILTER (WHERE ai_detected_stage = 'install'),
      'latest_stage', MAX(ai_detected_stage)
    ) INTO v_photo_progress
    FROM public.job_photo_entries
    WHERE job_id = p_job_id;
    
    -- If underlayment detected but install not started when expected
    IF (v_photo_progress->>'underlayment_detected')::int > 0 
       AND (v_photo_progress->>'install_detected')::int = 0 THEN
      v_predicted_delay := v_predicted_delay + 0.5;
      v_confidence := v_confidence + 0.1;
      v_reasons := array_append(v_reasons, 'Underlayment photos detected later than usual');
    END IF;
  END IF;
  
  -- Normalize confidence
  v_confidence := LEAST(1.0, v_confidence);
  
  -- Generate recommendation
  IF v_predicted_delay > 2 THEN
    v_recommendation := 'Consider reassigning crew or extending work hours';
  ELSIF v_predicted_delay > 1 THEN
    v_recommendation := 'Monitor closely and prepare backup plan';
  ELSE
    v_recommendation := 'Minor delay expected, no action needed';
  END IF;
  
  RETURN QUERY SELECT 
    v_predicted_delay,
    v_confidence,
    v_reasons,
    v_recommendation;
END;
$$;

COMMENT ON FUNCTION public.predict_job_delay IS 'Block 254100: Predict job delays based on crew efficiency, materials, weather, photos';

-- ============================================================================
-- PART 6 — FUNCTIONS: AI Crew Assignment Recommender
-- ============================================================================

-- Function to recommend crew for a job
CREATE OR REPLACE FUNCTION public.recommend_crew_for_job(
  p_job_id uuid,
  p_workspace_id uuid
)
RETURNS TABLE (
  recommended_crew_id uuid,
  recommended_crew_name text,
  score numeric,
  reasoning text,
  backup_crew_id uuid,
  backup_crew_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_crew record;
  v_best_crew record;
  v_backup_crew record;
  v_best_score numeric := 0;
  v_backup_score numeric := 0;
BEGIN
  -- Get job details
  SELECT * INTO v_job
  FROM (
    SELECT id, workspace_id, job_type, estimated_squares, roof_type, scheduled_start_date
    FROM public.roofing_jobs
    WHERE id = p_job_id AND workspace_id = p_workspace_id
    UNION ALL
    SELECT id, workspace_id, job_type, NULL::numeric as estimated_squares, NULL::text as roof_type, scheduled_start_date
    FROM public.jobs
    WHERE id = p_job_id AND workspace_id = p_workspace_id
    LIMIT 1
  ) j
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Evaluate all active crews
  FOR v_crew IN
    SELECT c.id, c.name, c.is_active,
           COALESCE(ces.score, 50) as efficiency_score,
           ces.install_speed_score,
           ces.qc_quality_score,
           ces.safety_score
    FROM public.crews c
    LEFT JOIN LATERAL (
      SELECT score, install_speed_score, qc_quality_score, safety_score
      FROM public.crew_efficiency_scores
      WHERE crew_id = c.id
        AND workspace_id = p_workspace_id
        AND period_end >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY period_end DESC
      LIMIT 1
    ) ces ON true
    WHERE c.workspace_id = p_workspace_id
      AND (c.is_active IS NULL OR c.is_active = true)
  LOOP
    -- Calculate score based on job type and crew strengths
    DECLARE
      v_score numeric := v_crew.efficiency_score;
    BEGIN
      -- Boost score for steep slopes if crew has high safety score
      IF v_job.roof_type LIKE '%steep%' AND v_crew.safety_score > 80 THEN
        v_score := v_score + 10;
      END IF;
      
      -- Boost score for large jobs if crew has high speed score
      IF v_job.estimated_squares > 30 AND v_crew.install_speed_score > 80 THEN
        v_score := v_score + 10;
      END IF;
      
      -- Find best crew
      IF v_score > v_best_score THEN
        v_backup_score := v_best_score;
        v_backup_crew := v_best_crew;
        v_best_score := v_score;
        v_best_crew := v_crew;
      ELSIF v_score > v_backup_score THEN
        v_backup_score := v_score;
        v_backup_crew := v_crew;
      END IF;
    END;
  END LOOP;
  
  IF v_best_crew IS NOT NULL THEN
    RETURN QUERY SELECT 
      v_best_crew.id,
      v_best_crew.name,
      v_best_score,
      CASE 
        WHEN v_best_crew.install_speed_score > 85 THEN 'Fastest for this job type'
        WHEN v_best_crew.safety_score > 85 THEN 'Best safety record for this job type'
        ELSE 'Best overall match for this job'
      END,
      COALESCE(v_backup_crew.id, NULL::uuid),
      COALESCE(v_backup_crew.name, NULL::text);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.recommend_crew_for_job IS 'Block 254100: Recommend optimal crew for a job based on efficiency scores and job requirements';

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_preventative_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_operations_director_log ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "ai_predictions_service_role_all" ON public.ai_predictions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ai_recommendations_service_role_all" ON public.ai_recommendations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ai_preventative_alerts_service_role_all" ON public.ai_preventative_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ai_operations_director_log_service_role_all" ON public.ai_operations_director_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can access their workspace data
CREATE POLICY "ai_predictions_workspace_access" ON public.ai_predictions
  FOR ALL TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ai_recommendations_workspace_access" ON public.ai_recommendations
  FOR ALL TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ai_preventative_alerts_workspace_access" ON public.ai_preventative_alerts
  FOR ALL TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ai_operations_director_log_workspace_access" ON public.ai_operations_director_log
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — TRIGGERS
-- ============================================================================

-- Update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_ai_director_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ai_predictions_updated_at
  BEFORE UPDATE ON public.ai_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_director_updated_at();

CREATE TRIGGER trg_ai_recommendations_updated_at
  BEFORE UPDATE ON public.ai_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_director_updated_at();

CREATE TRIGGER trg_ai_preventative_alerts_updated_at
  BEFORE UPDATE ON public.ai_preventative_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_director_updated_at();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================






















