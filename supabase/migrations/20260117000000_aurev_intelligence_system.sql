-- AUREV HQ Intelligence System
-- Predictive AI Operating System - Self-optimizing ecosystem
-- Creates intelligence tracking, feedback loop, and prediction infrastructure

-- =====================================================
-- 1. Intelligence Feedback Table
-- Stores success/failure of AI actions for learning
-- =====================================================
CREATE TABLE IF NOT EXISTS public.intel_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Action metadata
  action TEXT NOT NULL, -- e.g., "adjusted_send_window", "rewrote_template", "optimized_crm_flow"
  action_type TEXT NOT NULL CHECK (action_type IN ('optimization', 'prediction', 'recommendation', 'auto_fix')),
  
  -- Results
  success BOOLEAN NOT NULL,
  confidence NUMERIC(5, 4) CHECK (confidence >= 0 AND confidence <= 1), -- 0.0000 to 1.0000
  
  -- Context
  context JSONB DEFAULT '{}'::jsonb, -- Stores relevant context like campaign_id, metric values, etc.
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional metadata
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intel_feedback_org ON public.intel_feedback(org_id);
CREATE INDEX IF NOT EXISTS idx_intel_feedback_action ON public.intel_feedback(action);
CREATE INDEX IF NOT EXISTS idx_intel_feedback_success ON public.intel_feedback(success);
CREATE INDEX IF NOT EXISTS idx_intel_feedback_created ON public.intel_feedback(created_at DESC);

-- RLS
ALTER TABLE public.intel_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY intel_feedback_read ON public.intel_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = intel_feedback.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Service role can insert (for AI operations)
CREATE POLICY intel_feedback_service ON public.intel_feedback
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 2. Intelligence Predictions Table
-- Stores prediction history and outcomes
-- =====================================================
CREATE TABLE IF NOT EXISTS public.intel_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Prediction metadata
  scope TEXT NOT NULL CHECK (scope IN ('org', 'global', 'campaign', 'user')),
  metric TEXT NOT NULL, -- e.g., 'churn', 'growth', 'campaign_reply_rate', 'revenue'
  horizon_days INTEGER NOT NULL CHECK (horizon_days > 0), -- Prediction horizon in days
  
  -- Prediction values
  predicted_value NUMERIC(10, 4),
  confidence NUMERIC(5, 4) CHECK (confidence >= 0 AND confidence <= 1),
  drivers JSONB DEFAULT '[]'::jsonb, -- Array of driver factors
  
  -- Actual outcome (filled when prediction comes true)
  actual_value NUMERIC(10, 4),
  actual_at TIMESTAMPTZ,
  
  -- Context
  context JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL -- When this prediction expires
);

CREATE INDEX IF NOT EXISTS idx_intel_predictions_org ON public.intel_predictions(org_id);
CREATE INDEX IF NOT EXISTS idx_intel_predictions_metric ON public.intel_predictions(metric);
CREATE INDEX IF NOT EXISTS idx_intel_predictions_scope ON public.intel_predictions(scope);
CREATE INDEX IF NOT EXISTS idx_intel_predictions_expires ON public.intel_predictions(expires_at);

-- RLS
ALTER TABLE public.intel_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY intel_predictions_read ON public.intel_predictions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = intel_predictions.org_id
      AND om.user_id = auth.uid()
    )
  );

-- =====================================================
-- 3. Intelligence Recommendations Table
-- Stores AI-generated recommendations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.intel_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Recommendation details
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('optimization', 'alert', 'action', 'insight')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  
  -- Action details
  suggested_action TEXT, -- e.g., "Adjust send window to 8am–10am"
  action_context JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'applied', 'ignored', 'rejected')),
  auto_apply BOOLEAN DEFAULT false,
  
  -- Impact estimation
  estimated_impact JSONB DEFAULT '{}'::jsonb, -- e.g., {"metric": "reply_rate", "expected_change": "+3%"}
  confidence NUMERIC(5, 4) CHECK (confidence >= 0 AND confidence <= 1),
  
  -- Context
  context JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_intel_recommendations_org ON public.intel_recommendations(org_id);
CREATE INDEX IF NOT EXISTS idx_intel_recommendations_status ON public.intel_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_intel_recommendations_priority ON public.intel_recommendations(priority);
CREATE INDEX IF NOT EXISTS idx_intel_recommendations_created ON public.intel_recommendations(created_at DESC);

-- RLS
ALTER TABLE public.intel_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY intel_recommendations_read ON public.intel_recommendations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = intel_recommendations.org_id
      AND om.user_id = auth.uid()
    )
  );

-- =====================================================
-- 4. Intelligence Events Table
-- Tracks all intelligence-related events for analytics
-- =====================================================
CREATE TABLE IF NOT EXISTS public.intel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  
  -- Event metadata
  event_type TEXT NOT NULL CHECK (event_type IN ('prediction_made', 'recommendation_created', 'action_applied', 'feedback_recorded', 'anomaly_detected')),
  source TEXT NOT NULL CHECK (source IN ('smartsend', 'opsgrid', 'agentcloud', 'hq', 'system')),
  
  -- Event data
  event_data JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intel_events_org ON public.intel_events(org_id);
CREATE INDEX IF NOT EXISTS idx_intel_events_type ON public.intel_events(event_type);
CREATE INDEX IF NOT EXISTS idx_intel_events_source ON public.intel_events(source);
CREATE INDEX IF NOT EXISTS idx_intel_events_created ON public.intel_events(created_at DESC);

-- RLS
ALTER TABLE public.intel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY intel_events_read ON public.intel_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = intel_events.org_id
      AND om.user_id = auth.uid()
    )
  );

-- =====================================================
-- 5. Helper Functions
-- =====================================================

-- Record intelligence feedback
CREATE OR REPLACE FUNCTION record_intel_feedback(
  p_org_id UUID,
  p_action TEXT,
  p_action_type TEXT,
  p_success BOOLEAN,
  p_confidence NUMERIC,
  p_context JSONB DEFAULT '{}'::jsonb,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_feedback_id UUID;
BEGIN
  INSERT INTO public.intel_feedback (
    org_id, action, action_type, success, confidence, context, metadata
  )
  VALUES (
    p_org_id, p_action, p_action_type, p_success, p_confidence, p_context, p_metadata
  )
  RETURNING id INTO v_feedback_id;
  
  -- Also log as event
  INSERT INTO public.intel_events (org_id, event_type, source, event_data)
  VALUES (
    p_org_id,
    'feedback_recorded',
    'hq',
    jsonb_build_object(
      'feedback_id', v_feedback_id,
      'action', p_action,
      'success', p_success
    )
  );
  
  RETURN v_feedback_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Store prediction
CREATE OR REPLACE FUNCTION store_intel_prediction(
  p_org_id UUID,
  p_scope TEXT,
  p_metric TEXT,
  p_horizon_days INTEGER,
  p_predicted_value NUMERIC,
  p_confidence NUMERIC,
  p_drivers JSONB,
  p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_prediction_id UUID;
BEGIN
  INSERT INTO public.intel_predictions (
    org_id, scope, metric, horizon_days,
    predicted_value, confidence, drivers, context,
    expires_at
  )
  VALUES (
    p_org_id, p_scope, p_metric, p_horizon_days,
    p_predicted_value, p_confidence, p_drivers, p_context,
    NOW() + (p_horizon_days || ' days')::INTERVAL
  )
  RETURNING id INTO v_prediction_id;
  
  -- Log event
  INSERT INTO public.intel_events (org_id, event_type, source, event_data)
  VALUES (
    p_org_id,
    'prediction_made',
    'hq',
    jsonb_build_object(
      'prediction_id', v_prediction_id,
      'metric', p_metric,
      'scope', p_scope
    )
  );
  
  RETURN v_prediction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create recommendation
CREATE OR REPLACE FUNCTION create_intel_recommendation(
  p_org_id UUID,
  p_recommendation_type TEXT,
  p_title TEXT,
  p_description TEXT,
  p_priority TEXT DEFAULT 'medium',
  p_suggested_action TEXT DEFAULT NULL,
  p_action_context JSONB DEFAULT '{}'::jsonb,
  p_estimated_impact JSONB DEFAULT '{}'::jsonb,
  p_confidence NUMERIC DEFAULT NULL,
  p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_recommendation_id UUID;
BEGIN
  INSERT INTO public.intel_recommendations (
    org_id, recommendation_type, title, description, priority,
    suggested_action, action_context, estimated_impact, confidence, context
  )
  VALUES (
    p_org_id, p_recommendation_type, p_title, p_description, p_priority,
    p_suggested_action, p_action_context, p_estimated_impact, p_confidence, p_context
  )
  RETURNING id INTO v_recommendation_id;
  
  -- Log event
  INSERT INTO public.intel_events (org_id, event_type, source, event_data)
  VALUES (
    p_org_id,
    'recommendation_created',
    'hq',
    jsonb_build_object(
      'recommendation_id', v_recommendation_id,
      'type', p_recommendation_type,
      'priority', p_priority
    )
  );
  
  RETURN v_recommendation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get prediction accuracy stats
CREATE OR REPLACE FUNCTION get_prediction_accuracy(p_days_back INTEGER DEFAULT 90)
RETURNS TABLE (
  total_predictions BIGINT,
  predictions_with_outcomes BIGINT,
  avg_accuracy NUMERIC,
  avg_confidence NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_predictions,
    COUNT(*) FILTER (WHERE actual_value IS NOT NULL)::BIGINT as predictions_with_outcomes,
    CASE 
      WHEN COUNT(*) FILTER (WHERE actual_value IS NOT NULL) > 0 
      THEN AVG(
        CASE 
          WHEN actual_value IS NOT NULL AND predicted_value IS NOT NULL
          THEN 1.0 - ABS((actual_value - predicted_value) / NULLIF(predicted_value, 0))
          ELSE NULL
        END
      )
      ELSE NULL
    END::NUMERIC as avg_accuracy,
    AVG(confidence)::NUMERIC as avg_confidence
  FROM public.intel_predictions
  WHERE created_at >= NOW() - (p_days_back || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. Comments
-- =====================================================
COMMENT ON TABLE public.intel_feedback IS 'Stores AI action feedback for learning and optimization';
COMMENT ON TABLE public.intel_predictions IS 'Stores prediction history and outcomes for accuracy tracking';
COMMENT ON TABLE public.intel_recommendations IS 'AI-generated recommendations with approval workflow';
COMMENT ON TABLE public.intel_events IS 'Event log for intelligence system analytics';

COMMENT ON FUNCTION record_intel_feedback IS 'Record feedback for AI actions';
COMMENT ON FUNCTION store_intel_prediction IS 'Store prediction with expiration';
COMMENT ON FUNCTION create_intel_recommendation IS 'Create new AI recommendation';
COMMENT ON FUNCTION get_prediction_accuracy IS 'Calculate prediction accuracy metrics';

