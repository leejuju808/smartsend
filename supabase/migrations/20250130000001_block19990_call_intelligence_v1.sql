-- =========================================================
-- Block 19990 — SmartSend Inbox Call Intelligence v1
-- (Call Transcription, AI Summaries, Action Extraction, Intent Detection, and Phone-Call → Pipeline Automation)
-- =========================================================

-- ============================================================================
-- PART 1 — Call Transcripts Table
-- ============================================================================
-- Stores call transcripts, metadata, and AI-processed intelligence

CREATE TABLE IF NOT EXISTS public.call_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Call metadata
  caller_number text NOT NULL,
  called_number text,
  call_direction text NOT NULL CHECK (call_direction IN ('inbound', 'outbound')),
  duration_seconds integer NOT NULL DEFAULT 0,
  call_timestamp timestamptz NOT NULL DEFAULT now(),
  
  -- Transcription
  audio_url text, -- URL to audio file (if VoIP)
  transcription text NOT NULL, -- Full call transcription
  transcription_status text DEFAULT 'completed' CHECK (transcription_status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- AI Processing Status
  ai_summary_status text DEFAULT 'pending' CHECK (ai_summary_status IN ('pending', 'processing', 'completed', 'failed')),
  ai_intent_status text DEFAULT 'pending' CHECK (ai_intent_status IN ('pending', 'processing', 'completed', 'failed')),
  ai_outcome_status text DEFAULT 'pending' CHECK (ai_outcome_status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- AI-Generated Call Summary (Roofing-Tuned)
  call_summary text, -- Main summary of the call
  homeowner_concern text, -- Primary concern identified
  job_type text, -- 'repair', 'replacement', 'inspection', 'general_question', etc.
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  urgency text CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  insurance_involvement boolean DEFAULT false,
  insurance_claim_number text,
  insurance_company text,
  next_steps text[], -- Array of next steps identified
  key_questions text[], -- Key questions asked during call
  objections text[], -- Objections raised
  timeline_mentioned text, -- Timeline mentioned by homeowner
  
  -- AI Intent Extraction
  intents jsonb DEFAULT '{}'::jsonb, -- Structured intents: appointment_request, price_request, insurance_question, etc.
  extracted_info jsonb DEFAULT '{}'::jsonb, -- Extracted: address, email, preferred_time, availability, claim_status, etc.
  
  -- AI Call Outcome Detection
  call_outcome text CHECK (call_outcome IN (
    'appointment_scheduled',
    'appointment_requested',
    'estimate_requested',
    'pricing_discussed',
    'insurance_mentioned',
    'storm_damage_confirmed',
    'interested',
    'hesitation',
    'not_interested',
    'call_back_later',
    'thinking_about_it',
    'getting_other_quotes',
    'send_info_email',
    'deductible_discussed',
    'other'
  )),
  outcome_confidence numeric(5,2) CHECK (outcome_confidence >= 0 AND outcome_confidence <= 100), -- 0-100 confidence score
  
  -- Pipeline Automation Tracking
  pipeline_action_taken text[], -- Array of pipeline actions: moved_to_estimate_scheduled, added_followup_task, etc.
  pipeline_stage_before text,
  pipeline_stage_after text,
  
  -- Revenue Intelligence
  estimated_job_value numeric(12,2),
  job_potential_score integer CHECK (job_potential_score >= 0 AND job_potential_score <= 100),
  insurance_approval_likelihood integer CHECK (insurance_approval_likelihood >= 0 AND insurance_approval_likelihood <= 100),
  replacement_probability integer CHECK (replacement_probability >= 0 AND replacement_probability <= 100),
  urgency_score integer CHECK (urgency_score >= 0 AND urgency_score <= 100),
  sentiment text CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  
  -- Call Coaching
  coaching_tips text[], -- AI-generated coaching tips for the owner
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb, -- Flexible JSON for additional data
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz -- When AI processing completed
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_transcripts_workspace ON public.call_transcripts(workspace_id, call_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_thread ON public.call_transcripts(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_transcripts_contact ON public.call_transcripts(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_transcripts_lead ON public.call_transcripts(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_transcripts_status ON public.call_transcripts(ai_summary_status, ai_intent_status, ai_outcome_status);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_outcome ON public.call_transcripts(call_outcome) WHERE call_outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_transcripts_pipeline_action ON public.call_transcripts USING GIN(pipeline_action_taken);

-- ============================================================================
-- PART 2 — Call History View (for thread detail)
-- ============================================================================

CREATE OR REPLACE VIEW public.call_history_summary AS
SELECT 
  ct.id,
  ct.thread_id,
  ct.contact_id,
  ct.lead_id,
  ct.call_timestamp,
  ct.duration_seconds,
  ct.call_direction,
  ct.caller_number,
  ct.call_summary,
  ct.call_outcome,
  ct.job_type,
  ct.severity,
  ct.urgency,
  ct.insurance_involvement,
  ct.pipeline_action_taken,
  ct.coaching_tips,
  ct.created_at
FROM public.call_transcripts ct
ORDER BY ct.call_timestamp DESC;

-- ============================================================================
-- PART 3 — Function: Process Call Transcript (AI Summary Generation)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_call_summary(
  p_call_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_call record;
  v_summary text;
  v_result jsonb;
BEGIN
  -- Get call transcript
  SELECT * INTO v_call
  FROM public.call_transcripts
  WHERE id = p_call_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call not found');
  END IF;
  
  -- Update status to processing
  UPDATE public.call_transcripts
  SET ai_summary_status = 'processing', updated_at = now()
  WHERE id = p_call_id;
  
  -- Note: Actual AI processing will be done in API/Edge Function
  -- This function is a placeholder for database-level processing
  
  RETURN jsonb_build_object(
    'success', true,
    'call_id', p_call_id,
    'status', 'processing'
  );
END;
$$;

-- ============================================================================
-- PART 4 — Function: Extract Call Intents
-- ============================================================================

CREATE OR REPLACE FUNCTION public.extract_call_intents(
  p_call_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_call record;
  v_intents jsonb;
BEGIN
  -- Get call transcript
  SELECT * INTO v_call
  FROM public.call_transcripts
  WHERE id = p_call_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call not found');
  END IF;
  
  -- Update status to processing
  UPDATE public.call_transcripts
  SET ai_intent_status = 'processing', updated_at = now()
  WHERE id = p_call_id;
  
  -- Note: Actual AI processing will be done in API/Edge Function
  
  RETURN jsonb_build_object(
    'success', true,
    'call_id', p_call_id,
    'status', 'processing'
  );
END;
$$;

-- ============================================================================
-- PART 5 — Function: Detect Call Outcome
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_call_outcome(
  p_call_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_call record;
  v_outcome text;
  v_confidence numeric;
BEGIN
  -- Get call transcript
  SELECT * INTO v_call
  FROM public.call_transcripts
  WHERE id = p_call_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call not found');
  END IF;
  
  -- Update status to processing
  UPDATE public.call_transcripts
  SET ai_outcome_status = 'processing', updated_at = now()
  WHERE id = p_call_id;
  
  -- Note: Actual AI processing will be done in API/Edge Function
  
  RETURN jsonb_build_object(
    'success', true,
    'call_id', p_call_id,
    'status', 'processing'
  );
END;
$$;

-- ============================================================================
-- PART 6 — Function: Auto-Create Tasks from Call
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_tasks_from_call(
  p_call_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_call record;
  v_thread record;
  v_workspace_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
  v_tasks_created uuid[];
  v_task_id uuid;
  v_next_steps text[];
BEGIN
  -- Get call data
  SELECT * INTO v_call
  FROM public.call_transcripts
  WHERE id = p_call_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call not found');
  END IF;
  
  v_workspace_id := v_call.workspace_id;
  v_contact_id := v_call.contact_id;
  v_lead_id := v_call.lead_id;
  v_next_steps := COALESCE(v_call.next_steps, ARRAY[]::text[]);
  
  -- Get thread if exists
  IF v_call.thread_id IS NOT NULL THEN
    SELECT * INTO v_thread
    FROM public.inbox_threads
    WHERE id = v_call.thread_id;
  END IF;
  
  -- Create tasks based on call outcome and next steps
  IF v_call.call_outcome = 'appointment_requested' THEN
    -- Create "Schedule inspection" task
    INSERT INTO public.tasks_v3 (
      workspace_id,
      contact_id,
      lead_id,
      task_type,
      priority,
      status,
      title,
      description,
      due_at,
      due_date,
      auto_generated,
      auto_source,
      metadata
    ) VALUES (
      v_workspace_id,
      v_contact_id,
      v_lead_id,
      'follow_up',
      'high',
      'open',
      'Schedule inspection appointment',
      'Homeowner requested appointment during call on ' || to_char(v_call.call_timestamp, 'MM/DD/YYYY'),
      now() + INTERVAL '1 day',
      CURRENT_DATE + 1,
      true,
      'call_intelligence',
      jsonb_build_object(
        'call_id', p_call_id,
        'call_outcome', v_call.call_outcome,
        'preferred_time', COALESCE(v_call.extracted_info->>'preferred_time', ''),
        'urgency', v_call.urgency
      )
    ) RETURNING id INTO v_task_id;
    
    v_tasks_created := array_append(v_tasks_created, v_task_id);
  END IF;
  
  IF v_call.call_outcome = 'estimate_requested' OR v_call.call_outcome = 'pricing_discussed' THEN
    -- Create "Send estimate details" task
    INSERT INTO public.tasks_v3 (
      workspace_id,
      contact_id,
      lead_id,
      task_type,
      priority,
      status,
      title,
      description,
      due_at,
      due_date,
      auto_generated,
      auto_source,
      metadata
    ) VALUES (
      v_workspace_id,
      v_contact_id,
      v_lead_id,
      'follow_up',
      'high',
      'open',
      'Send estimate details',
      'Homeowner requested pricing/estimate during call on ' || to_char(v_call.call_timestamp, 'MM/DD/YYYY'),
      now() + INTERVAL '2 hours',
      CURRENT_DATE,
      true,
      'call_intelligence',
      jsonb_build_object(
        'call_id', p_call_id,
        'call_outcome', v_call.call_outcome,
        'job_type', v_call.job_type,
        'estimated_value', v_call.estimated_job_value
      )
    ) RETURNING id INTO v_task_id;
    
    v_tasks_created := array_append(v_tasks_created, v_task_id);
  END IF;
  
  IF v_call.insurance_involvement = true THEN
    -- Create "Prepare insurance docs" task
    INSERT INTO public.tasks_v3 (
      workspace_id,
      contact_id,
      lead_id,
      task_type,
      priority,
      status,
      title,
      description,
      due_at,
      due_date,
      auto_generated,
      auto_source,
      metadata
    ) VALUES (
      v_workspace_id,
      v_contact_id,
      v_lead_id,
      'follow_up',
      'high',
      'open',
      'Prepare insurance documentation',
      'Insurance claim mentioned during call. Claim #: ' || COALESCE(v_call.insurance_claim_number, 'N/A'),
      now() + INTERVAL '1 day',
      CURRENT_DATE + 1,
      true,
      'call_intelligence',
      jsonb_build_object(
        'call_id', p_call_id,
        'insurance_company', v_call.insurance_company,
        'insurance_claim_number', v_call.insurance_claim_number,
        'insurance_approval_likelihood', v_call.insurance_approval_likelihood
      )
    ) RETURNING id INTO v_task_id;
    
    v_tasks_created := array_append(v_tasks_created, v_task_id);
  END IF;
  
  IF v_call.call_outcome = 'call_back_later' OR v_call.call_outcome = 'thinking_about_it' THEN
    -- Create "Follow up call" task
    INSERT INTO public.tasks_v3 (
      workspace_id,
      contact_id,
      lead_id,
      task_type,
      priority,
      status,
      title,
      description,
      due_at,
      due_date,
      auto_generated,
      auto_source,
      metadata
    ) VALUES (
      v_workspace_id,
      v_contact_id,
      v_lead_id,
      'call',
      'medium',
      'open',
      'Follow up call',
      'Homeowner asked to call back later or is thinking about it. Follow up in 24-48 hours.',
      now() + INTERVAL '24 hours',
      CURRENT_DATE + 1,
      true,
      'call_intelligence',
      jsonb_build_object(
        'call_id', p_call_id,
        'call_outcome', v_call.call_outcome,
        'original_call_date', v_call.call_timestamp
      )
    ) RETURNING id INTO v_task_id;
    
    v_tasks_created := array_append(v_tasks_created, v_task_id);
  END IF;
  
  -- Create tasks from next_steps array
  IF array_length(v_next_steps, 1) > 0 THEN
    FOR i IN 1..array_length(v_next_steps, 1) LOOP
      INSERT INTO public.tasks_v3 (
        workspace_id,
        contact_id,
        lead_id,
        task_type,
        priority,
        status,
        title,
        description,
        due_at,
        due_date,
        auto_generated,
        auto_source,
        metadata
      ) VALUES (
        v_workspace_id,
        v_contact_id,
        v_lead_id,
        'follow_up',
        'medium',
        'open',
        v_next_steps[i],
        'Auto-generated from call on ' || to_char(v_call.call_timestamp, 'MM/DD/YYYY'),
        now() + INTERVAL '2 days',
        CURRENT_DATE + 2,
        true,
        'call_intelligence',
        jsonb_build_object('call_id', p_call_id)
      ) RETURNING id INTO v_task_id;
      
      v_tasks_created := array_append(v_tasks_created, v_task_id);
    END LOOP;
  END IF;
  
  -- Update call record with tasks created
  UPDATE public.call_transcripts
  SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{tasks_created}',
    to_jsonb(v_tasks_created)
  ),
  updated_at = now()
  WHERE id = p_call_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'tasks_created', array_length(v_tasks_created, 1),
    'task_ids', v_tasks_created
  );
END;
$$;

-- ============================================================================
-- PART 7 — Function: Auto-Move Pipeline Based on Call Outcome
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_move_pipeline_from_call(
  p_call_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_call record;
  v_thread record;
  v_contact record;
  v_new_stage text;
  v_actions_taken text[];
  v_pipeline_stage_before text;
BEGIN
  -- Get call data
  SELECT * INTO v_call
  FROM public.call_transcripts
  WHERE id = p_call_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call not found');
  END IF;
  
  -- Get thread if exists
  IF v_call.thread_id IS NOT NULL THEN
    SELECT * INTO v_thread
    FROM public.inbox_threads
    WHERE id = v_call.thread_id;
    
    v_pipeline_stage_before := COALESCE(v_thread.pipeline_stage, 'new_lead');
  END IF;
  
  -- Determine new pipeline stage based on call outcome
  CASE v_call.call_outcome
    WHEN 'appointment_scheduled' THEN
      v_new_stage := 'estimate_scheduled';
      v_actions_taken := array_append(v_actions_taken, 'moved_to_estimate_scheduled');
      
    WHEN 'appointment_requested' THEN
      v_new_stage := 'estimate_scheduled';
      v_actions_taken := array_append(v_actions_taken, 'moved_to_estimate_scheduled');
      
    WHEN 'estimate_requested', 'pricing_discussed' THEN
      v_new_stage := 'contacted';
      v_actions_taken := array_append(v_actions_taken, 'stayed_in_contacted_added_followup');
      
    WHEN 'storm_damage_confirmed' THEN
      v_new_stage := 'contacted';
      -- Check if storm pipeline exists, if so use that
      IF v_call.insurance_involvement THEN
        v_new_stage := 'contacted'; -- Will be handled by insurance workflow
        v_actions_taken := array_append(v_actions_taken, 'storm_damage_detected_insurance_workflow');
      ELSE
        v_actions_taken := array_append(v_actions_taken, 'storm_damage_detected_high_priority');
      END IF;
      
    WHEN 'insurance_mentioned' THEN
      v_new_stage := 'contacted';
      v_actions_taken := array_append(v_actions_taken, 'insurance_workflow_triggered');
      
    WHEN 'interested' THEN
      v_new_stage := 'contacted';
      v_actions_taken := array_append(v_actions_taken, 'marked_as_interested');
      
    WHEN 'not_interested' THEN
      v_new_stage := 'lost';
      v_actions_taken := array_append(v_actions_taken, 'moved_to_lost');
      
    WHEN 'hesitation', 'thinking_about_it', 'getting_other_quotes' THEN
      v_new_stage := COALESCE(v_pipeline_stage_before, 'contacted');
      v_actions_taken := array_append(v_actions_taken, 'added_followup_task');
      
    ELSE
      v_new_stage := COALESCE(v_pipeline_stage_before, 'contacted');
      v_actions_taken := array_append(v_actions_taken, 'no_pipeline_change');
  END CASE;
  
  -- Update thread pipeline stage
  IF v_call.thread_id IS NOT NULL AND v_thread IS NOT NULL THEN
    UPDATE public.inbox_threads
    SET 
      pipeline_stage = v_new_stage,
      updated_at = now(),
      -- Update revenue metadata if available
      thread_estimated_value = COALESCE(v_call.estimated_job_value, thread_estimated_value),
      close_probability_score = COALESCE(v_call.job_potential_score, close_probability_score),
      revenue_metadata = jsonb_set(
        COALESCE(revenue_metadata, '{}'::jsonb),
        '{call_intelligence}',
        jsonb_build_object(
          'last_call_id', p_call_id,
          'last_call_outcome', v_call.call_outcome,
          'insurance_involvement', v_call.insurance_involvement,
          'urgency', v_call.urgency
        )
      )
    WHERE id = v_call.thread_id;
    
    v_actions_taken := array_append(v_actions_taken, 'thread_pipeline_updated');
  END IF;
  
  -- Update contact pipeline stage if contact exists
  IF v_call.contact_id IS NOT NULL THEN
    SELECT * INTO v_contact
    FROM public.contacts
    WHERE id = v_call.contact_id;
    
    IF FOUND THEN
      -- Use the auto_move_pipeline_stage function if it exists
      BEGIN
        PERFORM public.auto_move_pipeline_stage(
          v_call.contact_id,
          v_new_stage,
          'call_intelligence',
          jsonb_build_object('call_id', p_call_id, 'call_outcome', v_call.call_outcome)
        );
        v_actions_taken := array_append(v_actions_taken, 'contact_pipeline_updated');
      EXCEPTION WHEN OTHERS THEN
        -- Function might not exist, skip
        NULL;
      END;
    END IF;
  END IF;
  
  -- Update call record with pipeline actions
  UPDATE public.call_transcripts
  SET 
    pipeline_action_taken = v_actions_taken,
    pipeline_stage_before = v_pipeline_stage_before,
    pipeline_stage_after = v_new_stage,
    updated_at = now()
  WHERE id = p_call_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'pipeline_stage_before', v_pipeline_stage_before,
    'pipeline_stage_after', v_new_stage,
    'actions_taken', v_actions_taken
  );
END;
$$;

-- ============================================================================
-- PART 8 — Function: Evaluate Call Revenue Intelligence
-- ============================================================================

CREATE OR REPLACE FUNCTION public.evaluate_call_revenue(
  p_call_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_call record;
  v_job_value numeric;
  v_job_potential integer;
  v_insurance_likelihood integer;
  v_replacement_prob integer;
  v_urgency_score integer;
  v_sentiment text;
BEGIN
  -- Get call data
  SELECT * INTO v_call
  FROM public.call_transcripts
  WHERE id = p_call_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call not found');
  END IF;
  
  -- Calculate job potential score (0-100)
  v_job_potential := 50; -- Base score
  
  -- Increase based on call outcome
  CASE v_call.call_outcome
    WHEN 'appointment_scheduled', 'appointment_requested' THEN
      v_job_potential := 75;
    WHEN 'estimate_requested', 'pricing_discussed' THEN
      v_job_potential := 70;
    WHEN 'storm_damage_confirmed' THEN
      v_job_potential := 85;
    WHEN 'insurance_mentioned' THEN
      v_job_potential := 80;
    WHEN 'interested' THEN
      v_job_potential := 65;
    WHEN 'hesitation', 'thinking_about_it' THEN
      v_job_potential := 45;
    WHEN 'not_interested' THEN
      v_job_potential := 10;
    ELSE
      v_job_potential := 50;
  END CASE;
  
  -- Adjust based on urgency
  CASE v_call.urgency
    WHEN 'critical' THEN
      v_job_potential := v_job_potential + 15;
    WHEN 'high' THEN
      v_job_potential := v_job_potential + 10;
    WHEN 'medium' THEN
      v_job_potential := v_job_potential + 5;
    ELSE
      NULL;
  END CASE;
  
  -- Cap at 100
  v_job_potential := LEAST(v_job_potential, 100);
  
  -- Calculate insurance approval likelihood
  IF v_call.insurance_involvement THEN
    v_insurance_likelihood := 60; -- Base likelihood
    
    -- Increase if claim number mentioned
    IF v_call.insurance_claim_number IS NOT NULL THEN
      v_insurance_likelihood := v_insurance_likelihood + 20;
    END IF;
    
    -- Increase if storm damage confirmed
    IF v_call.call_outcome = 'storm_damage_confirmed' THEN
      v_insurance_likelihood := v_insurance_likelihood + 15;
    END IF;
    
    v_insurance_likelihood := LEAST(v_insurance_likelihood, 100);
  ELSE
    v_insurance_likelihood := 0;
  END IF;
  
  -- Calculate replacement probability
  IF v_call.job_type = 'replacement' THEN
    v_replacement_prob := 70;
  ELSIF v_call.job_type = 'repair' THEN
    v_replacement_prob := 20;
  ELSE
    v_replacement_prob := 50;
  END IF;
  
  -- Calculate urgency score
  CASE v_call.urgency
    WHEN 'critical' THEN
      v_urgency_score := 90;
    WHEN 'high' THEN
      v_urgency_score := 70;
    WHEN 'medium' THEN
      v_urgency_score := 50;
    WHEN 'low' THEN
      v_urgency_score := 30;
    ELSE
      v_urgency_score := 50;
  END CASE;
  
  -- Determine sentiment
  IF v_call.call_outcome IN ('appointment_scheduled', 'interested', 'estimate_requested') THEN
    v_sentiment := 'positive';
  ELSIF v_call.call_outcome IN ('not_interested', 'hesitation') THEN
    v_sentiment := 'negative';
  ELSE
    v_sentiment := 'neutral';
  END IF;
  
  -- Estimate job value (if not already set)
  IF v_call.estimated_job_value IS NULL THEN
    -- Rough estimate based on job type
    IF v_call.job_type = 'replacement' THEN
      v_job_value := 15000; -- Average replacement
    ELSIF v_call.job_type = 'repair' THEN
      v_job_value := 2000; -- Average repair
    ELSE
      v_job_value := 5000; -- Default estimate
    END IF;
  ELSE
    v_job_value := v_call.estimated_job_value;
  END IF;
  
  -- Update call record
  UPDATE public.call_transcripts
  SET 
    estimated_job_value = v_job_value,
    job_potential_score = v_job_potential,
    insurance_approval_likelihood = v_insurance_likelihood,
    replacement_probability = v_replacement_prob,
    urgency_score = v_urgency_score,
    sentiment = v_sentiment,
    updated_at = now()
  WHERE id = p_call_id;
  
  -- Update thread revenue if thread exists
  IF v_call.thread_id IS NOT NULL THEN
    UPDATE public.inbox_threads
    SET 
      thread_estimated_value = v_job_value,
      close_probability_score = v_job_potential,
      revenue_metadata = jsonb_set(
        COALESCE(revenue_metadata, '{}'::jsonb),
        '{call_revenue}',
        jsonb_build_object(
          'last_call_id', p_call_id,
          'insurance_approval_likelihood', v_insurance_likelihood,
          'replacement_probability', v_replacement_prob,
          'urgency_score', v_urgency_score,
          'sentiment', v_sentiment
        )
      ),
      updated_at = now()
    WHERE id = v_call.thread_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'estimated_job_value', v_job_value,
    'job_potential_score', v_job_potential,
    'insurance_approval_likelihood', v_insurance_likelihood,
    'replacement_probability', v_replacement_prob,
    'urgency_score', v_urgency_score,
    'sentiment', v_sentiment
  );
END;
$$;

-- ============================================================================
-- PART 9 — Function: Generate Call Coaching Tips
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_call_coaching(
  p_call_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_call record;
  v_tips text[];
BEGIN
  -- Get call data
  SELECT * INTO v_call
  FROM public.call_transcripts
  WHERE id = p_call_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call not found');
  END IF;
  
  v_tips := ARRAY[]::text[];
  
  -- Check if photos were requested
  IF NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(v_call.next_steps, ARRAY[]::text[])) AS step
    WHERE LOWER(step) LIKE '%photo%' OR LOWER(step) LIKE '%picture%'
  ) AND v_call.job_type IS NOT NULL THEN
    v_tips := array_append(v_tips, 'You didn''t ask for photos — recommend asking ASAP to assess damage.');
  END IF;
  
  -- Check if insurance workflow was triggered
  IF v_call.insurance_involvement AND v_call.call_outcome != 'insurance_mentioned' THEN
    v_tips := array_append(v_tips, 'Homeowner mentioned insurance — trigger insurance workflow and prepare documentation.');
  END IF;
  
  -- Check if pricing was discussed
  IF v_call.call_outcome = 'pricing_discussed' AND v_call.estimated_job_value IS NULL THEN
    v_tips := array_append(v_tips, 'They asked about pricing — send estimate ranges and follow up with detailed quote.');
  END IF;
  
  -- Check for hesitation signals
  IF v_call.call_outcome IN ('hesitation', 'thinking_about_it', 'getting_other_quotes') THEN
    v_tips := array_append(v_tips, 'They said "I''ll think about it" or mentioned other quotes — follow up in 24 hours with value proposition.');
  END IF;
  
  -- Check if appointment was requested but not scheduled
  IF v_call.call_outcome = 'appointment_requested' THEN
    v_tips := array_append(v_tips, 'Appointment requested — send calendar link immediately and confirm preferred time.');
  END IF;
  
  -- Check if timeline was mentioned
  IF v_call.timeline_mentioned IS NULL AND v_call.urgency IN ('high', 'critical') THEN
    v_tips := array_append(v_tips, 'High urgency mentioned — clarify timeline and expedite if needed.');
  END IF;
  
  -- Update call record with coaching tips
  UPDATE public.call_transcripts
  SET 
    coaching_tips = v_tips,
    updated_at = now()
  WHERE id = p_call_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'coaching_tips', v_tips
  );
END;
$$;

-- ============================================================================
-- PART 10 — Trigger: Update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_call_transcripts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_call_transcripts_updated_at ON public.call_transcripts;
CREATE TRIGGER trg_call_transcripts_updated_at
  BEFORE UPDATE ON public.call_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_call_transcripts_updated_at();

-- ============================================================================
-- PART 11 — RLS Policies
-- ============================================================================

ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;

-- Helper function to check workspace access
CREATE OR REPLACE FUNCTION public.can_view_call_workspace(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid()
  );
END;
$$;

-- RLS Policy: call_transcripts SELECT
DROP POLICY IF EXISTS "call_transcripts_select" ON public.call_transcripts;
CREATE POLICY "call_transcripts_select"
  ON public.call_transcripts
  FOR SELECT
  USING (public.can_view_call_workspace(workspace_id));

-- RLS Policy: call_transcripts INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "call_transcripts_modify" ON public.call_transcripts;
CREATE POLICY "call_transcripts_modify"
  ON public.call_transcripts
  FOR ALL
  USING (public.can_view_call_workspace(workspace_id))
  WITH CHECK (public.can_view_call_workspace(workspace_id));

-- ============================================================================
-- PART 12 — Comments
-- ============================================================================

COMMENT ON TABLE public.call_transcripts IS 'Stores call transcripts, AI summaries, intent extraction, and call intelligence data';
COMMENT ON COLUMN public.call_transcripts.call_summary IS 'AI-generated summary of the call conversation';
COMMENT ON COLUMN public.call_transcripts.intents IS 'Structured JSONB of extracted intents: appointment_request, price_request, insurance_question, etc.';
COMMENT ON COLUMN public.call_transcripts.extracted_info IS 'Extracted information: address, email, preferred_time, availability, claim_status';
COMMENT ON COLUMN public.call_transcripts.call_outcome IS 'AI-detected call outcome: appointment_scheduled, estimate_requested, not_interested, etc.';
COMMENT ON COLUMN public.call_transcripts.pipeline_action_taken IS 'Array of pipeline actions taken: moved_to_estimate_scheduled, added_followup_task, etc.';
COMMENT ON COLUMN public.call_transcripts.coaching_tips IS 'AI-generated coaching tips for the owner to improve sales skills';



















































