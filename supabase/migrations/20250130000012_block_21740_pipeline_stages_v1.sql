-- =========================================================
-- Block 21740 — SmartSend Roofing Pipeline Stages v1
-- (Lead → Hot → Appointment Set → Estimate Sent → Won/Lost Pipeline Board)
-- =========================================================
-- 
-- This is one of the MOST IMPORTANT blocks in all of SmartSend.
-- This is the moment SmartSend stops being "An AI cold email tool"
-- and becomes "Our full roofing sales pipeline."
-- 
-- Roofers LIVE inside pipeline stages.
-- Owners run their ENTIRE business off this one screen.
-- This block is a MUST HAVE for revenue.

-- ============================================================================
-- STEP 1: Add Pipeline Stage Column to Leads Table
-- ============================================================================

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'new'
CHECK (pipeline_stage IN ('new', 'hot', 'appointment_set', 'estimate_sent', 'won', 'lost'));

-- Add index for pipeline queries
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage
ON public.leads (pipeline_stage);

-- Index for workspace + pipeline stage queries (common filter)
CREATE INDEX IF NOT EXISTS idx_leads_workspace_pipeline_stage
ON public.leads (workspace_id, pipeline_stage)
WHERE workspace_id IS NOT NULL;

-- ============================================================================
-- STEP 2: Create Pipeline Summary Function
-- ============================================================================
-- Returns JSON object with counts for each pipeline stage (filtered by workspace)

CREATE OR REPLACE FUNCTION public.get_pipeline_summary(p_workspace_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  v_workspace_id UUID;
BEGIN
  -- If workspace_id not provided, try to get from auth context
  IF p_workspace_id IS NULL THEN
    -- Try to get workspace from user's first workspace membership
    SELECT workspace_id INTO v_workspace_id
    FROM public.workspace_members
    WHERE user_id = auth.uid()
    LIMIT 1;
  ELSE
    v_workspace_id := p_workspace_id;
  END IF;

  -- Build summary with workspace filter
  result := json_build_object(
    'new', (SELECT COUNT(*) FROM public.leads WHERE pipeline_stage = 'new' AND (v_workspace_id IS NULL OR workspace_id = v_workspace_id)),
    'hot', (SELECT COUNT(*) FROM public.leads WHERE pipeline_stage = 'hot' AND (v_workspace_id IS NULL OR workspace_id = v_workspace_id)),
    'appointment_set', (SELECT COUNT(*) FROM public.leads WHERE pipeline_stage = 'appointment_set' AND (v_workspace_id IS NULL OR workspace_id = v_workspace_id)),
    'estimate_sent', (SELECT COUNT(*) FROM public.leads WHERE pipeline_stage = 'estimate_sent' AND (v_workspace_id IS NULL OR workspace_id = v_workspace_id)),
    'won', (SELECT COUNT(*) FROM public.leads WHERE pipeline_stage = 'won' AND (v_workspace_id IS NULL OR workspace_id = v_workspace_id)),
    'lost', (SELECT COUNT(*) FROM public.leads WHERE pipeline_stage = 'lost' AND (v_workspace_id IS NULL OR workspace_id = v_workspace_id))
  );

  RETURN result;
END;
$$;

-- ============================================================================
-- STEP 3: Update create_appointment() Function
-- ============================================================================
-- When appointment is created, automatically move lead to 'appointment_set' stage

CREATE OR REPLACE FUNCTION public.create_appointment(
  p_lead_id UUID,
  p_datetime TIMESTAMPTZ,
  p_source TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_appointment_id UUID;
BEGIN
  -- Validate source
  IF p_source NOT IN ('ai_hot_reply', 'estimator_call', 'manual') THEN
    RAISE EXCEPTION 'Invalid source: %', p_source;
  END IF;

  -- Insert appointment
  INSERT INTO public.appointments (lead_id, scheduled_for, source, notes)
  VALUES (p_lead_id, p_datetime, p_source, p_notes)
  RETURNING id INTO v_appointment_id;

  -- Update lead status to hot AND pipeline stage to appointment_set
  UPDATE public.leads
  SET status = 'hot',
      pipeline_stage = 'appointment_set',
      last_activity_at = now()
  WHERE id = p_lead_id;

  -- Cancel outstanding call tasks
  UPDATE public.call_tasks
  SET status = 'cancelled'
  WHERE lead_id = p_lead_id
    AND status IN ('pending', 'in_progress');

  -- Log to timeline
  INSERT INTO public.lead_timeline_events (
    lead_id,
    event_type,
    event_subtype,
    message,
    metadata
  )
  VALUES (
    p_lead_id,
    'appointment_created',
    p_source,
    'Appointment scheduled',
    jsonb_build_object(
      'scheduled_for', p_datetime,
      'notes', p_notes,
      'appointment_id', v_appointment_id
    )
  );

  RETURN v_appointment_id;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.leads.pipeline_stage IS 'Pipeline stage: new, hot, appointment_set, estimate_sent, won, lost';
COMMENT ON FUNCTION public.get_pipeline_summary IS 'Returns JSON object with counts for each pipeline stage (optionally filtered by workspace_id)';
COMMENT ON FUNCTION public.create_appointment IS 'Creates an appointment and updates lead status, pipeline_stage, cancels call tasks, and logs to timeline';

