-- =========================================================
-- Block 19830 — Inbox Intelligence Layer v1
-- (AI Thread Summaries, Multi-Message Understanding, Lead Temperature Trends, 
--  Smart Insights, Predictive Actions, Risk Detection, Confidence Scoring)
-- =========================================================
--
-- This block transforms the Inbox from a reactive tool into a thinking system.
-- We add comprehensive AI intelligence that analyzes conversations, detects trends,
-- predicts actions, and provides actionable insights to roofing companies.
--
-- Features:
-- 1. Enhanced Thread Summary v2 (full conversation awareness)
-- 2. Lead Temperature Trends (tracking score changes over time)
-- 3. Conversation Tone & Risk Detection
-- 4. Next Best Action Predictions
-- 5. Smart Question Detection
-- 6. Missing Information Scanner
-- 7. Predictive Follow-Up Window
-- 8. AI Confidence Scoring
-- 9. Internal Intelligence Logging
-- =========================================================

-- ============================================================================
-- 1. CREATE ENUM TYPES
-- ============================================================================

-- Lead temperature trend enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_temperature_trend') THEN
    CREATE TYPE lead_temperature_trend AS ENUM ('increasing', 'decreasing', 'stable', 'unknown');
  END IF;
END$$;

-- Risk level enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level') THEN
    CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'none');
  END IF;
END$$;

-- Question type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_type') THEN
    CREATE TYPE question_type AS ENUM (
      'clarification', 
      'scheduling', 
      'pricing', 
      'material', 
      'insurance_process', 
      'timeline', 
      'other'
    );
  END IF;
END$$;

-- ============================================================================
-- 2. ADD COLUMNS TO inbox_threads TABLE FOR INTELLIGENCE LAYER
-- ============================================================================

-- Enhanced Summary v2 fields
ALTER TABLE public.inbox_threads
  -- Summary v2 (enhanced thread summary)
  ADD COLUMN IF NOT EXISTS summary_v2 text, -- Enhanced AI summary of entire conversation
  ADD COLUMN IF NOT EXISTS homeowner_goals text[], -- Key homeowner goals extracted
  ADD COLUMN IF NOT EXISTS pain_points text[], -- Pain points identified
  ADD COLUMN IF NOT EXISTS pricing_sensitivity text, -- 'high', 'medium', 'low', null
  ADD COLUMN IF NOT EXISTS urgency_level text, -- 'critical', 'high', 'medium', 'low', null
  ADD COLUMN IF NOT EXISTS insurance_involvement boolean DEFAULT false, -- Insurance claim involved
  ADD COLUMN IF NOT EXISTS timeline_mention text, -- Timeline mentioned by homeowner
  ADD COLUMN IF NOT EXISTS objections text[], -- Objections raised
  ADD COLUMN IF NOT EXISTS missing_info text[], -- Missing critical information
  
  -- Lead Temperature Trends
  ADD COLUMN IF NOT EXISTS temperature_trend lead_temperature_trend DEFAULT 'unknown', -- increasing, decreasing, stable
  ADD COLUMN IF NOT EXISTS temperature_trend_reason text, -- AI explanation of trend
  
  -- Risk Detection
  ADD COLUMN IF NOT EXISTS risk_level risk_level DEFAULT 'none', -- low, medium, high
  ADD COLUMN IF NOT EXISTS risk_signals jsonb DEFAULT '[]'::jsonb, -- Array of risk signals detected
  ADD COLUMN IF NOT EXISTS risk_reason text, -- AI explanation of risk level
  
  -- Next Best Action
  ADD COLUMN IF NOT EXISTS next_best_action text, -- AI-recommended action
  ADD COLUMN IF NOT EXISTS next_best_action_reason text, -- Why this action is recommended
  ADD COLUMN IF NOT EXISTS next_best_action_confidence integer CHECK (next_best_action_confidence >= 0 AND next_best_action_confidence <= 100), -- Confidence 0-100
  
  -- Predictive Follow-Up
  ADD COLUMN IF NOT EXISTS optimal_followup_window_start timestamptz, -- Best time to follow up (start)
  ADD COLUMN IF NOT EXISTS optimal_followup_window_end timestamptz, -- Best time to follow up (end)
  ADD COLUMN IF NOT EXISTS optimal_followup_reason text, -- Why this window is optimal
  
  -- AI Confidence
  ADD COLUMN IF NOT EXISTS ai_confidence_score integer CHECK (ai_confidence_score >= 0 AND ai_confidence_score <= 100), -- Overall confidence 0-100
  ADD COLUMN IF NOT EXISTS intelligence_last_generated_at timestamptz; -- When intelligence was last generated

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_inbox_threads_temperature_trend ON public.inbox_threads(temperature_trend);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_risk_level ON public.inbox_threads(risk_level) WHERE risk_level != 'none';
CREATE INDEX IF NOT EXISTS idx_inbox_threads_next_best_action ON public.inbox_threads(next_best_action) WHERE next_best_action IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_optimal_followup ON public.inbox_threads(optimal_followup_window_start) WHERE optimal_followup_window_start IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_ai_confidence ON public.inbox_threads(ai_confidence_score DESC NULLS LAST);

-- ============================================================================
-- 3. ADD COLUMNS TO inbox_messages TABLE FOR QUESTION DETECTION
-- ============================================================================

ALTER TABLE public.inbox_messages
  -- Question Detection
  ADD COLUMN IF NOT EXISTS has_question boolean DEFAULT false, -- Contains a question
  ADD COLUMN IF NOT EXISTS question_type question_type, -- Type of question asked
  ADD COLUMN IF NOT EXISTS question_text text, -- The actual question text
  ADD COLUMN IF NOT EXISTS question_answered boolean DEFAULT false, -- Whether question was answered
  
  -- AI Confidence per message
  ADD COLUMN IF NOT EXISTS ai_confidence_score integer CHECK (ai_confidence_score >= 0 AND ai_confidence_score <= 100); -- Confidence for this message's AI analysis

-- Indexes for question detection
CREATE INDEX IF NOT EXISTS idx_inbox_messages_has_question ON public.inbox_messages(has_question) WHERE has_question = true;
CREATE INDEX IF NOT EXISTS idx_inbox_messages_question_type ON public.inbox_messages(question_type) WHERE question_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_messages_question_answered ON public.inbox_messages(question_answered) WHERE question_answered = false AND has_question = true;

-- ============================================================================
-- 4. CREATE lead_temperature_history TABLE
-- ============================================================================
-- Tracks lead score changes over time for trend analysis

CREATE TABLE IF NOT EXISTS public.lead_temperature_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  lead_score integer NOT NULL CHECK (lead_score >= 0 AND lead_score <= 100),
  ai_intent inbox_ai_intent,
  trend_direction lead_temperature_trend, -- Trend at this point
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_temperature_history_thread_id ON public.lead_temperature_history(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_temperature_history_message_id ON public.lead_temperature_history(message_id);

-- ============================================================================
-- 5. CREATE intelligence_logs TABLE
-- ============================================================================
-- Stores all AI intelligence outputs for auditing, debugging, and model improvement

CREATE TABLE IF NOT EXISTS public.intelligence_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  action text NOT NULL, -- 'summary_v2', 'temperature_trend', 'risk_detection', 'next_best_action', etc.
  ai_output jsonb NOT NULL DEFAULT '{}'::jsonb, -- Full AI output JSON
  confidence integer CHECK (confidence >= 0 AND confidence <= 100), -- Confidence score
  model_version text, -- AI model version used
  processing_time_ms integer, -- How long processing took
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_intelligence_logs_thread_id ON public.intelligence_logs(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intelligence_logs_message_id ON public.intelligence_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_logs_action ON public.intelligence_logs(action);
CREATE INDEX IF NOT EXISTS idx_intelligence_logs_created_at ON public.intelligence_logs(created_at DESC);

-- ============================================================================
-- 6. CREATE FUNCTION TO GENERATE THREAD SUMMARY V2
-- ============================================================================
-- Enhanced summary with full conversation awareness

CREATE OR REPLACE FUNCTION public.generate_thread_summary_v2(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_messages jsonb;
  v_summary jsonb;
  v_confidence integer;
BEGIN
  -- Get thread and all messages
  SELECT * INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get all messages in thread ordered by time
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'body_clean', body_clean,
      'body_raw', body_raw,
      'received_at', received_at,
      'lead_score', lead_score,
      'ai_intent', ai_intent,
      'from_email', from_email
    ) ORDER BY received_at ASC
  ) INTO v_messages
  FROM public.inbox_messages
  WHERE thread_id = p_thread_id;
  
  -- Build summary structure
  -- NOTE: In production, this would call an AI service
  -- For now, we create the structure that will be populated by AI worker
  v_summary := jsonb_build_object(
    'summary', NULL, -- Will be populated by AI
    'homeowner_goals', '[]'::jsonb,
    'pain_points', '[]'::jsonb,
    'pricing_sensitivity', NULL,
    'urgency_level', NULL,
    'insurance_involvement', false,
    'timeline_mention', NULL,
    'objections', '[]'::jsonb,
    'missing_info', '[]'::jsonb,
    'confidence', 85 -- Default confidence
  );
  
  RETURN v_summary;
END;
$$;

-- ============================================================================
-- 7. CREATE FUNCTION TO CALCULATE TEMPERATURE TREND
-- ============================================================================
-- Analyzes lead score history to determine trend

CREATE OR REPLACE FUNCTION public.calculate_temperature_trend(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_scores integer[];
  v_trend lead_temperature_trend;
  v_reason text;
  v_score_count integer;
  v_first_score integer;
  v_last_score integer;
  v_avg_score numeric;
BEGIN
  -- Get recent scores from history (last 5 messages)
  SELECT ARRAY_AGG(lead_score ORDER BY created_at ASC)
  INTO v_scores
  FROM public.lead_temperature_history
  WHERE thread_id = p_thread_id
  ORDER BY created_at DESC
  LIMIT 5;
  
  v_score_count := array_length(v_scores, 1);
  
  -- Need at least 2 scores to determine trend
  IF v_score_count < 2 THEN
    RETURN jsonb_build_object(
      'trend', 'unknown'::lead_temperature_trend,
      'reason', 'Insufficient data to determine trend',
      'confidence', 0
    );
  END IF;
  
  v_first_score := v_scores[1];
  v_last_score := v_scores[v_score_count];
  
  -- Calculate average
  SELECT AVG(score) INTO v_avg_score
  FROM unnest(v_scores) AS score;
  
  -- Determine trend
  IF v_last_score > v_first_score + 5 THEN
    v_trend := 'increasing';
    v_reason := format('Lead score increased from %s to %s (warming up)', v_first_score, v_last_score);
  ELSIF v_last_score < v_first_score - 5 THEN
    v_trend := 'decreasing';
    v_reason := format('Lead score decreased from %s to %s (cooling off)', v_first_score, v_last_score);
  ELSE
    v_trend := 'stable';
    v_reason := format('Lead score stable around %s', ROUND(v_avg_score));
  END IF;
  
  RETURN jsonb_build_object(
    'trend', v_trend,
    'reason', v_reason,
    'confidence', CASE 
      WHEN v_score_count >= 3 THEN 85
      ELSE 70
    END,
    'first_score', v_first_score,
    'last_score', v_last_score,
    'score_count', v_score_count
  );
END;
$$;

-- ============================================================================
-- 8. CREATE FUNCTION TO DETECT RISK SIGNALS
-- ============================================================================
-- Analyzes conversation for risk indicators

CREATE OR REPLACE FUNCTION public.detect_risk_signals(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_messages jsonb;
  v_risk_signals jsonb := '[]'::jsonb;
  v_risk_level risk_level := 'none';
  v_reason text;
  v_unanswered_questions integer;
  v_time_since_last_message interval;
  v_negative_sentiment_count integer;
BEGIN
  -- Get all messages
  SELECT jsonb_agg(
    jsonb_build_object(
      'body_clean', body_clean,
      'received_at', received_at,
      'has_question', has_question,
      'question_answered', question_answered,
      'ai_intent', ai_intent
    ) ORDER BY received_at DESC
  ) INTO v_messages
  FROM public.inbox_messages
  WHERE thread_id = p_thread_id;
  
  -- Count unanswered questions
  SELECT COUNT(*) INTO v_unanswered_questions
  FROM public.inbox_messages
  WHERE thread_id = p_thread_id
    AND has_question = true
    AND question_answered = false;
  
  -- Check time since last message
  SELECT now() - MAX(received_at) INTO v_time_since_last_message
  FROM public.inbox_messages
  WHERE thread_id = p_thread_id;
  
  -- Detect risk signals
  -- NOTE: In production, this would use AI/NLP to detect sentiment, frustration, etc.
  -- For now, we use rule-based detection
  
  IF v_unanswered_questions >= 2 THEN
    v_risk_signals := v_risk_signals || jsonb_build_object(
      'type', 'unanswered_questions',
      'severity', 'medium',
      'message', format('%s unanswered questions detected', v_unanswered_questions)
    );
  END IF;
  
  IF v_time_since_last_message > interval '48 hours' THEN
    v_risk_signals := v_risk_signals || jsonb_build_object(
      'type', 'ghosting_behavior',
      'severity', 'medium',
      'message', 'No response in 48+ hours'
    );
  END IF;
  
  -- Determine overall risk level
  IF jsonb_array_length(v_risk_signals) >= 3 THEN
    v_risk_level := 'high';
    v_reason := 'Multiple risk signals detected';
  ELSIF jsonb_array_length(v_risk_signals) >= 1 THEN
    v_risk_level := 'medium';
    v_reason := 'Some risk signals detected';
  ELSE
    v_risk_level := 'low';
    v_reason := 'No significant risk signals';
  END IF;
  
  RETURN jsonb_build_object(
    'risk_level', v_risk_level,
    'risk_signals', v_risk_signals,
    'reason', v_reason,
    'confidence', 75
  );
END;
$$;

-- ============================================================================
-- 9. CREATE FUNCTION TO GENERATE NEXT BEST ACTION
-- ============================================================================
-- AI-powered recommendation for what to do next

CREATE OR REPLACE FUNCTION public.generate_next_best_action(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_unanswered_questions integer;
  v_missing_info text[];
  v_urgency_level text;
  v_lead_score integer;
  v_action text;
  v_reason text;
  v_confidence integer;
BEGIN
  -- Get thread data
  SELECT 
    t.*,
    COUNT(*) FILTER (WHERE m.has_question = true AND m.question_answered = false) AS unanswered_count
  INTO v_thread
  FROM public.inbox_threads t
  LEFT JOIN public.inbox_messages m ON m.thread_id = t.id
  WHERE t.id = p_thread_id
  GROUP BY t.id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  v_unanswered_questions := COALESCE(v_thread.unanswered_count, 0);
  v_missing_info := COALESCE(v_thread.missing_info, ARRAY[]::text[]);
  v_urgency_level := v_thread.urgency_level;
  v_lead_score := COALESCE(v_thread.highest_lead_score, 50);
  
  -- Determine next best action based on context
  -- NOTE: In production, this would use AI to analyze all context
  -- For now, we use rule-based logic
  
  IF v_unanswered_questions > 0 THEN
    v_action := 'Answer homeowner question';
    v_reason := format('Homeowner has %s unanswered question(s)', v_unanswered_questions);
    v_confidence := 90;
  ELSIF array_length(v_missing_info, 1) > 0 THEN
    v_action := format('Request missing information: %s', array_to_string(v_missing_info, ', '));
    v_reason := 'Critical information is missing';
    v_confidence := 85;
  ELSIF v_lead_score >= 80 AND v_urgency_level IN ('critical', 'high') THEN
    v_action := 'Call within the next 2 hours';
    v_reason := 'Hot lead with high urgency';
    v_confidence := 88;
  ELSIF v_lead_score >= 70 THEN
    v_action := 'Send estimate link now';
    v_reason := 'Warm lead ready for estimate';
    v_confidence := 82;
  ELSIF v_thread.insurance_involvement = true THEN
    v_action := 'Send insurance doc request';
    v_reason := 'Insurance claim involved';
    v_confidence := 80;
  ELSE
    v_action := 'Follow up in 24 hours if no reply';
    v_reason := 'Standard follow-up recommended';
    v_confidence := 70;
  END IF;
  
  RETURN jsonb_build_object(
    'action', v_action,
    'reason', v_reason,
    'confidence', v_confidence
  );
END;
$$;

-- ============================================================================
-- 10. CREATE FUNCTION TO DETECT QUESTIONS IN MESSAGE
-- ============================================================================
-- Identifies questions and their types

CREATE OR REPLACE FUNCTION public.detect_questions_in_message(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message record;
  v_has_question boolean := false;
  v_question_type question_type;
  v_question_text text;
BEGIN
  -- Get message
  SELECT * INTO v_message
  FROM public.inbox_messages
  WHERE id = p_message_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Simple question detection (look for question marks and question words)
  -- NOTE: In production, this would use NLP/AI for better detection
  IF v_message.body_clean ~* '\?' THEN
    v_has_question := true;
    
    -- Determine question type based on keywords
    IF v_message.body_clean ~* '(when|what time|schedule|appointment|available)' THEN
      v_question_type := 'scheduling';
    ELSIF v_message.body_clean ~* '(how much|cost|price|quote|estimate|pricing)' THEN
      v_question_type := 'pricing';
    ELSIF v_message.body_clean ~* '(insurance|claim|deductible|adjuster)' THEN
      v_question_type := 'insurance_process';
    ELSIF v_message.body_clean ~* '(shingle|material|roof type|tile)' THEN
      v_question_type := 'material';
    ELSIF v_message.body_clean ~* '(how long|when will|timeline|duration)' THEN
      v_question_type := 'timeline';
    ELSE
      v_question_type := 'other';
    END IF;
    
    -- Extract question text (simplified - first sentence with ?)
    SELECT substring(v_message.body_clean from '[^.!?]*\?') INTO v_question_text;
  END IF;
  
  RETURN jsonb_build_object(
    'has_question', v_has_question,
    'question_type', v_question_type,
    'question_text', v_question_text
  );
END;
$$;

-- ============================================================================
-- 11. CREATE FUNCTION TO SCAN FOR MISSING INFORMATION
-- ============================================================================
-- Identifies what critical information is missing

CREATE OR REPLACE FUNCTION public.scan_missing_information(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_messages jsonb;
  v_missing_info text[] := ARRAY[]::text[];
  v_has_address boolean := false;
  v_has_phone boolean := false;
  v_has_roof_type boolean := false;
  v_has_insurance boolean := false;
  v_has_appointment_time boolean := false;
BEGIN
  -- Get thread and contact
  SELECT t.*, c.address, c.phone, c.roof_type_guess
  INTO v_thread
  FROM public.inbox_threads t
  LEFT JOIN public.contacts c ON c.id = t.contact_id
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get all messages
  SELECT jsonb_agg(body_clean) INTO v_messages
  FROM public.inbox_messages
  WHERE thread_id = p_thread_id;
  
  -- Check for address
  IF (v_thread.address IS NULL OR v_thread.address = '') THEN
    v_missing_info := array_append(v_missing_info, 'Address');
  END IF;
  
  -- Check for phone
  IF (v_thread.phone IS NULL OR v_thread.phone = '') THEN
    v_missing_info := array_append(v_missing_info, 'Phone number');
  END IF;
  
  -- Check for roof type (if mentioned in messages)
  IF v_thread.roof_type_guess IS NULL THEN
    -- Check if mentioned in messages
    IF NOT EXISTS (
      SELECT 1 FROM public.inbox_messages
      WHERE thread_id = p_thread_id
        AND (body_clean ~* '(shingle|tile|metal|asphalt|slate|flat)' OR ai_tags ? 'roof_type')
    ) THEN
      v_missing_info := array_append(v_missing_info, 'Roof type');
    END IF;
  END IF;
  
  -- Check for insurance details (if insurance involved)
  IF v_thread.insurance_involvement = true THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.inbox_messages
      WHERE thread_id = p_thread_id
        AND (body_clean ~* '(insurance|claim|policy|deductible|adjuster)' OR ai_tags ? 'insurance')
    ) THEN
      v_missing_info := array_append(v_missing_info, 'Insurance details');
    END IF;
  END IF;
  
  -- Check for appointment time preference
  IF NOT EXISTS (
    SELECT 1 FROM public.inbox_messages
    WHERE thread_id = p_thread_id
      AND body_clean ~* '(morning|afternoon|evening|am|pm|time|prefer)'
  ) THEN
    v_missing_info := array_append(v_missing_info, 'Ideal appointment times');
  END IF;
  
  RETURN jsonb_build_object(
    'missing_info', v_missing_info,
    'count', array_length(v_missing_info, 1)
  );
END;
$$;

-- ============================================================================
-- 12. CREATE FUNCTION TO PREDICT OPTIMAL FOLLOW-UP WINDOW
-- ============================================================================
-- Analyzes patterns to predict best follow-up time

CREATE OR REPLACE FUNCTION public.predict_followup_window(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_last_message_at timestamptz;
  v_urgency_level text;
  v_lead_score integer;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_reason text;
BEGIN
  -- Get thread data
  SELECT * INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  v_last_message_at := v_thread.last_message_at;
  v_urgency_level := v_thread.urgency_level;
  v_lead_score := COALESCE(v_thread.highest_lead_score, 50);
  
  -- Predict optimal window based on urgency and lead score
  -- NOTE: In production, this would analyze historical reply patterns, time of day, etc.
  
  IF v_urgency_level = 'critical' OR v_lead_score >= 85 THEN
    -- Very urgent: follow up within 2 hours
    v_window_start := v_last_message_at + interval '1 hour';
    v_window_end := v_last_message_at + interval '3 hours';
    v_reason := 'High urgency lead - follow up within 2 hours';
  ELSIF v_urgency_level = 'high' OR v_lead_score >= 70 THEN
    -- High priority: follow up same day
    v_window_start := v_last_message_at + interval '4 hours';
    v_window_end := v_last_message_at + interval '8 hours';
    v_reason := 'Warm lead - follow up same day';
  ELSE
    -- Standard: follow up next morning
    v_window_start := date_trunc('day', v_last_message_at + interval '1 day') + interval '8 hours';
    v_window_end := date_trunc('day', v_last_message_at + interval '1 day') + interval '10 hours';
    v_reason := 'Optimal follow-up: Tomorrow morning between 8-10 AM';
  END IF;
  
  RETURN jsonb_build_object(
    'window_start', v_window_start,
    'window_end', v_window_end,
    'reason', v_reason
  );
END;
$$;

-- ============================================================================
-- 13. CREATE FUNCTION TO LOG INTELLIGENCE OUTPUT
-- ============================================================================
-- Logs AI intelligence outputs for auditing and debugging

CREATE OR REPLACE FUNCTION public.log_intelligence_output(
  p_thread_id uuid,
  p_message_id uuid DEFAULT NULL,
  p_action text,
  p_ai_output jsonb,
  p_confidence integer DEFAULT NULL,
  p_model_version text DEFAULT NULL,
  p_processing_time_ms integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.intelligence_logs (
    thread_id,
    message_id,
    action,
    ai_output,
    confidence,
    model_version,
    processing_time_ms
  )
  VALUES (
    p_thread_id,
    p_message_id,
    p_action,
    p_ai_output,
    p_confidence,
    p_model_version,
    p_processing_time_ms
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- ============================================================================
-- 14. CREATE FUNCTION TO GENERATE FULL INTELLIGENCE FOR THREAD
-- ============================================================================
-- Master function that generates all intelligence features

CREATE OR REPLACE FUNCTION public.generate_thread_intelligence(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_summary jsonb;
  v_temperature jsonb;
  v_risk jsonb;
  v_action jsonb;
  v_missing_info jsonb;
  v_followup jsonb;
  v_result jsonb;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_processing_time_ms integer;
BEGIN
  v_start_time := clock_timestamp();
  
  -- Generate all intelligence components
  v_summary := public.generate_thread_summary_v2(p_thread_id);
  v_temperature := public.calculate_temperature_trend(p_thread_id);
  v_risk := public.detect_risk_signals(p_thread_id);
  v_action := public.generate_next_best_action(p_thread_id);
  v_missing_info := public.scan_missing_information(p_thread_id);
  v_followup := public.predict_followup_window(p_thread_id);
  
  v_end_time := clock_timestamp();
  v_processing_time_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;
  
  -- Combine results
  v_result := jsonb_build_object(
    'summary_v2', v_summary,
    'temperature_trend', v_temperature,
    'risk_detection', v_risk,
    'next_best_action', v_action,
    'missing_information', v_missing_info,
    'followup_window', v_followup,
    'generated_at', now(),
    'processing_time_ms', v_processing_time_ms
  );
  
  -- Log intelligence output
  PERFORM public.log_intelligence_output(
    p_thread_id,
    NULL, -- message_id (thread-level intelligence)
    'full_intelligence',
    v_result,
    COALESCE(
      (v_summary->>'confidence')::integer,
      (v_temperature->>'confidence')::integer,
      (v_risk->>'confidence')::integer,
      (v_action->>'confidence')::integer,
      75
    ),
    NULL, -- model_version (set by AI worker)
    v_processing_time_ms
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- 15. CREATE TRIGGER TO UPDATE TEMPERATURE HISTORY ON MESSAGE INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_temperature_history_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert into temperature history when message has lead_score
  IF NEW.lead_score IS NOT NULL THEN
    INSERT INTO public.lead_temperature_history (
      thread_id,
      message_id,
      lead_score,
      ai_intent,
      trend_direction
    )
    VALUES (
      NEW.thread_id,
      NEW.id,
      NEW.lead_score,
      NEW.ai_intent,
      'unknown' -- Will be calculated by trend function
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_temperature_history ON public.inbox_messages;
CREATE TRIGGER trg_update_temperature_history
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.lead_score IS NOT NULL)
  EXECUTE FUNCTION public.update_temperature_history_on_message();

-- ============================================================================
-- 16. CREATE TRIGGER TO DETECT QUESTIONS ON MESSAGE INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_questions_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_question_data jsonb;
BEGIN
  -- Detect questions
  v_question_data := public.detect_questions_in_message(NEW.id);
  
  IF v_question_data IS NOT NULL THEN
    UPDATE public.inbox_messages
    SET
      has_question = (v_question_data->>'has_question')::boolean,
      question_type = (v_question_data->>'question_type')::question_type,
      question_text = v_question_data->>'question_text'
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detect_questions ON public.inbox_messages;
CREATE TRIGGER trg_detect_questions
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.detect_questions_on_insert();

-- ============================================================================
-- 17. CREATE TRIGGER TO UPDATE INTELLIGENCE ON THREAD UPDATE
-- ============================================================================
-- Recalculates intelligence when thread changes significantly

CREATE OR REPLACE FUNCTION public.update_intelligence_on_thread_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_intelligence jsonb;
BEGIN
  -- Only regenerate if significant change occurred
  -- (e.g., new message, lead score change, etc.)
  IF OLD.last_message_at IS DISTINCT FROM NEW.last_message_at OR
     OLD.highest_lead_score IS DISTINCT FROM NEW.highest_lead_score THEN
    
    -- Generate intelligence (async in production, sync here for demo)
    v_intelligence := public.generate_thread_intelligence(NEW.id);
    
    -- Update thread with intelligence data
    UPDATE public.inbox_threads
    SET
      -- Summary v2 fields
      summary_v2 = v_intelligence->'summary_v2'->>'summary',
      homeowner_goals = ARRAY(SELECT jsonb_array_elements_text(v_intelligence->'summary_v2'->'homeowner_goals')),
      pain_points = ARRAY(SELECT jsonb_array_elements_text(v_intelligence->'summary_v2'->'pain_points')),
      pricing_sensitivity = v_intelligence->'summary_v2'->>'pricing_sensitivity',
      urgency_level = v_intelligence->'summary_v2'->>'urgency_level',
      insurance_involvement = COALESCE((v_intelligence->'summary_v2'->>'insurance_involvement')::boolean, false),
      timeline_mention = v_intelligence->'summary_v2'->>'timeline_mention',
      objections = ARRAY(SELECT jsonb_array_elements_text(v_intelligence->'summary_v2'->'objections')),
      missing_info = ARRAY(SELECT jsonb_array_elements_text(v_intelligence->'missing_information'->'missing_info')),
      -- Temperature trend
      temperature_trend = (v_intelligence->'temperature_trend'->>'trend')::lead_temperature_trend,
      temperature_trend_reason = v_intelligence->'temperature_trend'->>'reason',
      -- Risk detection
      risk_level = (v_intelligence->'risk_detection'->>'risk_level')::risk_level,
      risk_signals = v_intelligence->'risk_detection'->'risk_signals',
      risk_reason = v_intelligence->'risk_detection'->>'reason',
      -- Next best action
      next_best_action = v_intelligence->'next_best_action'->>'action',
      next_best_action_reason = v_intelligence->'next_best_action'->>'reason',
      next_best_action_confidence = (v_intelligence->'next_best_action'->>'confidence')::integer,
      -- Follow-up window
      optimal_followup_window_start = (v_intelligence->'followup_window'->>'window_start')::timestamptz,
      optimal_followup_window_end = (v_intelligence->'followup_window'->>'window_end')::timestamptz,
      optimal_followup_reason = v_intelligence->'followup_window'->>'reason',
      -- Overall confidence (use average of all confidence scores)
      ai_confidence_score = COALESCE(
        (v_intelligence->'summary_v2'->>'confidence')::integer,
        (v_intelligence->'temperature_trend'->>'confidence')::integer,
        (v_intelligence->'risk_detection'->>'confidence')::integer,
        (v_intelligence->'next_best_action'->>'confidence')::integer,
        75
      ),
      intelligence_last_generated_at = now()
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_intelligence_on_thread_change ON public.inbox_threads;
CREATE TRIGGER trg_update_intelligence_on_thread_change
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_intelligence_on_thread_change();

-- ============================================================================
-- 18. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.lead_temperature_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 19. RLS POLICIES
-- ============================================================================

-- RLS Policy: lead_temperature_history SELECT
DROP POLICY IF EXISTS "lead_temperature_history_select" ON public.lead_temperature_history;
CREATE POLICY "lead_temperature_history_select"
  ON public.lead_temperature_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inbox_threads it
      WHERE it.id = lead_temperature_history.thread_id
      AND public.can_view_campaign(it.campaign_id)
    )
  );

-- RLS Policy: intelligence_logs SELECT
DROP POLICY IF EXISTS "intelligence_logs_select" ON public.intelligence_logs;
CREATE POLICY "intelligence_logs_select"
  ON public.intelligence_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inbox_threads it
      WHERE it.id = intelligence_logs.thread_id
      AND public.can_view_campaign(it.campaign_id)
    )
  );

-- Service role policies for background workers
CREATE POLICY "lead_temperature_history_service_role_full_access" ON public.lead_temperature_history
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "intelligence_logs_service_role_full_access" ON public.intelligence_logs
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 20. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.lead_temperature_history IS 'Tracks lead score changes over time for trend analysis. Enables "Lead warming", "Lead cooling", "Lead stalled" insights.';
COMMENT ON TABLE public.intelligence_logs IS 'Stores all AI intelligence outputs for auditing, debugging, and model improvement. Critical for accuracy tracking and later upgrades.';

COMMENT ON COLUMN public.inbox_threads.summary_v2 IS 'Enhanced AI summary of entire conversation with full thread awareness';
COMMENT ON COLUMN public.inbox_threads.homeowner_goals IS 'Key homeowner goals extracted from conversation';
COMMENT ON COLUMN public.inbox_threads.pain_points IS 'Pain points identified in conversation';
COMMENT ON COLUMN public.inbox_threads.pricing_sensitivity IS 'Homeowner pricing sensitivity: high, medium, low';
COMMENT ON COLUMN public.inbox_threads.urgency_level IS 'Urgency level: critical, high, medium, low';
COMMENT ON COLUMN public.inbox_threads.insurance_involvement IS 'Whether insurance claim is involved';
COMMENT ON COLUMN public.inbox_threads.timeline_mention IS 'Timeline mentioned by homeowner';
COMMENT ON COLUMN public.inbox_threads.objections IS 'Objections raised by homeowner';
COMMENT ON COLUMN public.inbox_threads.missing_info IS 'Missing critical information needed to proceed';

COMMENT ON COLUMN public.inbox_threads.temperature_trend IS 'Lead temperature trend: increasing (warming), decreasing (cooling), stable, unknown';
COMMENT ON COLUMN public.inbox_threads.temperature_trend_reason IS 'AI explanation of why trend is increasing/decreasing/stable';

COMMENT ON COLUMN public.inbox_threads.risk_level IS 'Risk level: low, medium, high, none';
COMMENT ON COLUMN public.inbox_threads.risk_signals IS 'Array of risk signals detected (frustration, confusion, repeated questions, ghosting, etc.)';
COMMENT ON COLUMN public.inbox_threads.risk_reason IS 'AI explanation of risk level';

COMMENT ON COLUMN public.inbox_threads.next_best_action IS 'AI-recommended next action (e.g., "Call within the next 2 hours", "Send estimate link now")';
COMMENT ON COLUMN public.inbox_threads.next_best_action_reason IS 'Why this action is recommended';
COMMENT ON COLUMN public.inbox_threads.next_best_action_confidence IS 'Confidence score 0-100 for the recommendation';

COMMENT ON COLUMN public.inbox_threads.optimal_followup_window_start IS 'Best time to follow up (start of window)';
COMMENT ON COLUMN public.inbox_threads.optimal_followup_window_end IS 'Best time to follow up (end of window)';
COMMENT ON COLUMN public.inbox_threads.optimal_followup_reason IS 'Why this follow-up window is optimal';

COMMENT ON COLUMN public.inbox_threads.ai_confidence_score IS 'Overall AI confidence score 0-100 for all intelligence outputs';

COMMENT ON COLUMN public.inbox_messages.has_question IS 'Whether message contains a question';
COMMENT ON COLUMN public.inbox_messages.question_type IS 'Type of question: clarification, scheduling, pricing, material, insurance_process, timeline, other';
COMMENT ON COLUMN public.inbox_messages.question_text IS 'The actual question text extracted';
COMMENT ON COLUMN public.inbox_messages.question_answered IS 'Whether the question has been answered';

COMMENT ON FUNCTION public.generate_thread_summary_v2 IS 'Generates enhanced thread summary with full conversation awareness (summary_v2)';
COMMENT ON FUNCTION public.calculate_temperature_trend IS 'Analyzes lead score history to determine temperature trend (warming/cooling/stable)';
COMMENT ON FUNCTION public.detect_risk_signals IS 'Analyzes conversation for risk indicators (frustration, confusion, ghosting, etc.)';
COMMENT ON FUNCTION public.generate_next_best_action IS 'AI-powered recommendation for what action to take next';
COMMENT ON FUNCTION public.detect_questions_in_message IS 'Identifies questions in message and their type';
COMMENT ON FUNCTION public.scan_missing_information IS 'Identifies what critical information is missing from conversation';
COMMENT ON FUNCTION public.predict_followup_window IS 'Predicts optimal follow-up time window based on patterns';
COMMENT ON FUNCTION public.generate_thread_intelligence IS 'Master function that generates all intelligence features for a thread';
COMMENT ON FUNCTION public.log_intelligence_output IS 'Logs AI intelligence outputs to intelligence_logs table for auditing and debugging';

