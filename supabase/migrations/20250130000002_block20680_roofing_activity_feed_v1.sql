-- =========================================================
-- Block 20680 — SmartSend Roofing Activity Feed v1
-- (Live Feed of Emails • Claim Updates • Adjuster Actions • Stage Changes • Proposals Sent • Follow-Ups)
-- =========================================================
--
-- This block ties the entire SmartSend insurance engine together into a SINGLE, clean stream.
-- Roofing companies constantly lose track because:
-- - Leads come from everywhere
-- - Emails get buried
-- - Adjusters reply at random times
-- - Follow-ups get forgotten
-- - Staff doesn't know what's happening
-- - Owners don't know if jobs are moving
--
-- SmartSend Activity Feed v1 fixes ALL of that.
-- This creates a real-time feed of everything SmartSend detects, sends, or updates.
-- It makes SmartSend feel like a mission control center for roofing operations.
-- =========================================================

-- ============================================================================
-- PART 1 — Create Activity Feed Events Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.activity_feed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Links to related entities (at least one must be present)
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Event classification
  event_type text NOT NULL CHECK (event_type IN (
    -- 🔵 Lead Activity
    'new_email_received',
    'homeowner_replied',
    'homeowner_asked_for_estimate',
    'lead_marked_hot',
    'lead_marked_warm',
    'lead_marked_cold',
    'homeowner_clicked_proposal',
    
    -- 🟢 Insurance Activity
    'claim_filed_detected',
    'adjuster_assigned',
    'adjuster_visit_scheduled',
    'claim_approved',
    'claim_denied',
    'supplement_items_detected',
    'missing_code_items_detected',
    'scope_parsed_successfully',
    'insurance_email_forwarded',
    'adjuster_responded',
    
    -- 🟠 Proposal & Estimate Activity
    'estimate_generated',
    'proposal_created',
    'proposal_emailed_to_homeowner',
    'pricing_dispute_email_drafted',
    'homeowner_requested_changes',
    
    -- 🟣 Adjuster Communications
    'supplement_request_sent',
    'pricing_dispute_sent',
    'adjuster_followup_sent',
    'adjuster_replied',
    'need_photos_requested',
    
    -- 🟡 CRM / Job Stage Updates
    'stage_new_lead',
    'stage_claim_filed',
    'stage_adjuster_scheduled',
    'stage_claim_pending',
    'stage_claim_approved',
    'stage_install_ready',
    'stage_scheduled_install',
    'stage_in_progress',
    'stage_completed',
    'stage_lost',
    'stage_not_a_fit',
    
    -- 🔴 High-Urgency Warnings
    'adjuster_unresponsive_72h',
    'homeowner_replied_waiting',
    'install_ready_no_proposal',
    'supplement_value_high_not_requested'
  )),
  
  -- Human-readable event description
  event_text text NOT NULL,
  
  -- Flexible JSON payload for event-specific details
  event_payload jsonb DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'smart_ai' CHECK (created_by IN ('smart_ai', 'contractor_user')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- If created_by = 'contractor_user'
  
  -- Ensure at least one link exists
  CONSTRAINT activity_feed_has_link CHECK (
    lead_id IS NOT NULL OR job_id IS NOT NULL OR thread_id IS NOT NULL
  )
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_activity_feed_lead ON public.activity_feed_events(lead_id, created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_feed_job ON public.activity_feed_events(job_id, created_at DESC) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_feed_thread ON public.activity_feed_events(thread_id, created_at DESC) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_feed_campaign ON public.activity_feed_events(campaign_id, created_at DESC) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_feed_type ON public.activity_feed_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_created_at ON public.activity_feed_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_urgency ON public.activity_feed_events(event_type, created_at DESC) 
  WHERE event_type IN ('adjuster_unresponsive_72h', 'homeowner_replied_waiting', 'install_ready_no_proposal', 'supplement_value_high_not_requested');

COMMENT ON TABLE public.activity_feed_events IS 'SmartSend Roofing Activity Feed - tracks all events in the insurance engine';
COMMENT ON COLUMN public.activity_feed_events.event_type IS 'Type of event (lead, insurance, proposal, adjuster, stage, warning)';
COMMENT ON COLUMN public.activity_feed_events.event_text IS 'Human-readable description of the event';
COMMENT ON COLUMN public.activity_feed_events.event_payload IS 'JSONB payload with event-specific details (carrier, claim number, amounts, etc.)';
COMMENT ON COLUMN public.activity_feed_events.created_by IS 'Who created the event: smart_ai (system) or contractor_user (manual)';

-- ============================================================================
-- PART 2 — RLS Policies
-- ============================================================================

ALTER TABLE public.activity_feed_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read events for leads/jobs/threads in their campaigns
CREATE POLICY "Users can read activity feed events for their campaigns"
ON public.activity_feed_events
FOR SELECT
USING (
  -- Check if user has access via campaign
  EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = activity_feed_events.campaign_id
    AND (
      c.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = c.workspace_id
        AND wm.user_id = auth.uid()
      )
    )
  )
  OR
  -- Check if user has access via thread
  EXISTS (
    SELECT 1 FROM public.inbox_threads it
    JOIN public.campaigns c ON c.id = it.campaign_id
    WHERE it.id = activity_feed_events.thread_id
    AND (
      c.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = c.workspace_id
        AND wm.user_id = auth.uid()
      )
    )
  )
  OR
  -- Check if user has access via lead
  EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.campaigns c ON c.id = l.campaign_id
    WHERE l.id = activity_feed_events.lead_id
    AND (
      c.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = c.workspace_id
        AND wm.user_id = auth.uid()
      )
    )
  )
  OR
  -- Check if user has access via job
  EXISTS (
    SELECT 1 FROM public.roofing_jobs rj
    JOIN public.campaigns c ON c.id = rj.campaign_id
    WHERE rj.id = activity_feed_events.job_id
    AND (
      c.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = c.workspace_id
        AND wm.user_id = auth.uid()
      )
    )
  )
);

-- Policy: Service role and system can insert events
CREATE POLICY "Service role can insert activity feed events"
ON public.activity_feed_events
FOR INSERT
WITH CHECK (auth.role() = 'service_role' OR created_by = 'smart_ai');

-- Policy: Users can insert events they create
CREATE POLICY "Users can insert their own activity feed events"
ON public.activity_feed_events
FOR INSERT
WITH CHECK (
  created_by = 'contractor_user'
  AND user_id = auth.uid()
  AND (
    -- User has access to the related campaign/thread/lead/job
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = activity_feed_events.campaign_id
      AND (
        c.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = c.workspace_id
          AND wm.user_id = auth.uid()
        )
      )
    )
  )
);

-- ============================================================================
-- PART 3 — Helper Function to Log Activity Feed Events
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_activity_feed_event(
  p_event_type text,
  p_event_text text,
  p_event_payload jsonb DEFAULT '{}'::jsonb,
  p_lead_id uuid DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_created_by text DEFAULT 'smart_ai',
  p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  -- Validate event type
  IF p_event_type NOT IN (
    'new_email_received', 'homeowner_replied', 'homeowner_asked_for_estimate',
    'lead_marked_hot', 'lead_marked_warm', 'lead_marked_cold', 'homeowner_clicked_proposal',
    'claim_filed_detected', 'adjuster_assigned', 'adjuster_visit_scheduled',
    'claim_approved', 'claim_denied', 'supplement_items_detected', 'missing_code_items_detected',
    'scope_parsed_successfully', 'insurance_email_forwarded', 'adjuster_responded',
    'estimate_generated', 'proposal_created', 'proposal_emailed_to_homeowner',
    'pricing_dispute_email_drafted', 'homeowner_requested_changes',
    'supplement_request_sent', 'pricing_dispute_sent', 'adjuster_followup_sent',
    'adjuster_replied', 'need_photos_requested',
    'stage_new_lead', 'stage_claim_filed', 'stage_adjuster_scheduled',
    'stage_claim_pending', 'stage_claim_approved', 'stage_install_ready',
    'stage_scheduled_install', 'stage_in_progress', 'stage_completed',
    'stage_lost', 'stage_not_a_fit',
    'adjuster_unresponsive_72h', 'homeowner_replied_waiting',
    'install_ready_no_proposal', 'supplement_value_high_not_requested'
  ) THEN
    RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
  END IF;
  
  -- Ensure at least one link exists
  IF p_lead_id IS NULL AND p_job_id IS NULL AND p_thread_id IS NULL THEN
    RAISE EXCEPTION 'At least one of lead_id, job_id, or thread_id must be provided';
  END IF;
  
  -- Insert event
  INSERT INTO public.activity_feed_events (
    event_type,
    event_text,
    event_payload,
    lead_id,
    job_id,
    thread_id,
    campaign_id,
    created_by,
    user_id
  )
  VALUES (
    p_event_type,
    p_event_text,
    p_event_payload,
    p_lead_id,
    p_job_id,
    p_thread_id,
    p_campaign_id,
    p_created_by,
    p_user_id
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.log_activity_feed_event IS 'Helper function to log activity feed events. Used by SmartSend AI and manual user actions.';

-- ============================================================================
-- PART 4 — Function to Get Activity Feed (with filtering)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_activity_feed(
  p_campaign_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_event_types text[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_hours_back integer DEFAULT 24
)
RETURNS TABLE (
  id uuid,
  event_type text,
  event_text text,
  event_payload jsonb,
  lead_id uuid,
  job_id uuid,
  thread_id uuid,
  campaign_id uuid,
  created_at timestamptz,
  created_by text,
  user_id uuid,
  homeowner_name text,
  job_value numeric,
  stage text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    afe.id,
    afe.event_type,
    afe.event_text,
    afe.event_payload,
    afe.lead_id,
    afe.job_id,
    afe.thread_id,
    afe.campaign_id,
    afe.created_at,
    afe.created_by,
    afe.user_id,
    -- Get homeowner name from various sources
    COALESCE(
      rj.homeowner_name,
      l.name,
      (afe.event_payload->>'homeowner_name')::text,
      'Unknown'
    ) as homeowner_name,
    -- Get job value
    COALESCE(
      rj.projected_job_value,
      (afe.event_payload->>'job_value')::numeric,
      NULL
    ) as job_value,
    -- Get current stage
    rj.current_stage::text as stage
  FROM public.activity_feed_events afe
  LEFT JOIN public.roofing_jobs rj ON rj.id = afe.job_id
  LEFT JOIN public.leads l ON l.id = afe.lead_id
  WHERE 
    -- Time filter
    afe.created_at >= NOW() - (p_hours_back || ' hours')::interval
    -- Campaign filter
    AND (p_campaign_id IS NULL OR afe.campaign_id = p_campaign_id)
    -- Lead filter
    AND (p_lead_id IS NULL OR afe.lead_id = p_lead_id)
    -- Job filter
    AND (p_job_id IS NULL OR afe.job_id = p_job_id)
    -- Thread filter
    AND (p_thread_id IS NULL OR afe.thread_id = p_thread_id)
    -- Event type filter
    AND (p_event_types IS NULL OR afe.event_type = ANY(p_event_types))
  ORDER BY afe.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_activity_feed IS 'Get activity feed events with flexible filtering options';

-- ============================================================================
-- PART 5 — Function to Generate AI Summary (v1.5)
-- ============================================================================
-- When 6+ events occur for a lead in <24 hours, SmartSend generates a summary

CREATE OR REPLACE FUNCTION public.generate_activity_summary(
  p_lead_id uuid,
  p_hours_back integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_count integer;
  v_events jsonb;
  v_summary jsonb;
  v_homeowner_name text;
  v_suggested_action text;
BEGIN
  -- Count events in time window
  SELECT COUNT(*)
  INTO v_event_count
  FROM public.activity_feed_events
  WHERE lead_id = p_lead_id
    AND created_at >= NOW() - (p_hours_back || ' hours')::interval;
  
  -- Only generate summary if 6+ events
  IF v_event_count < 6 THEN
    RETURN jsonb_build_object(
      'has_summary', false,
      'event_count', v_event_count
    );
  END IF;
  
  -- Get homeowner name
  SELECT COALESCE(
    rj.homeowner_name,
    l.name,
    'Unknown'
  )
  INTO v_homeowner_name
  FROM public.leads l
  LEFT JOIN public.roofing_jobs rj ON rj.lead_id = l.id
  WHERE l.id = p_lead_id
  LIMIT 1;
  
  -- Get recent events
  SELECT jsonb_agg(
    jsonb_build_object(
      'type', event_type,
      'text', event_text,
      'time', created_at,
      'payload', event_payload
    )
    ORDER BY created_at DESC
  )
  INTO v_events
  FROM public.activity_feed_events
  WHERE lead_id = p_lead_id
    AND created_at >= NOW() - (p_hours_back || ' hours')::interval;
  
  -- Determine suggested action based on events
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.activity_feed_events
      WHERE lead_id = p_lead_id
        AND event_type IN ('stage_claim_approved', 'stage_install_ready')
        AND created_at >= NOW() - (p_hours_back || ' hours')::interval
    ) AND NOT EXISTS (
      SELECT 1 FROM public.activity_feed_events
      WHERE lead_id = p_lead_id
        AND event_type = 'proposal_emailed_to_homeowner'
        AND created_at >= NOW() - (p_hours_back || ' hours')::interval
    ) THEN 'Call today and schedule install.'
    WHEN EXISTS (
      SELECT 1 FROM public.activity_feed_events
      WHERE lead_id = p_lead_id
        AND event_type = 'homeowner_replied'
        AND created_at >= NOW() - (p_hours_back || ' hours')::interval
    ) THEN 'Respond to homeowner message.'
    WHEN EXISTS (
      SELECT 1 FROM public.activity_feed_events
      WHERE lead_id = p_lead_id
        AND event_type = 'adjuster_unresponsive_72h'
        AND created_at >= NOW() - (p_hours_back || ' hours')::interval
    ) THEN 'Follow up with adjuster.'
    ELSE 'Review activity and take next action.'
  END INTO v_suggested_action;
  
  -- Build summary
  v_summary := jsonb_build_object(
    'has_summary', true,
    'homeowner_name', v_homeowner_name,
    'event_count', v_event_count,
    'time_window_hours', p_hours_back,
    'events', v_events,
    'suggested_action', v_suggested_action,
    'generated_at', NOW()
  );
  
  RETURN v_summary;
END;
$$;

COMMENT ON FUNCTION public.generate_activity_summary IS 'Generate AI summary when 6+ events occur for a lead in <24 hours';

-- ============================================================================
-- PART 6 — Triggers to Auto-Log Events from Existing Systems
-- ============================================================================

-- Trigger: Log event when roofing job stage changes
CREATE OR REPLACE FUNCTION public.trigger_log_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_type text;
  v_event_text text;
BEGIN
  -- Only log if stage actually changed
  IF OLD.current_stage = NEW.current_stage THEN
    RETURN NEW;
  END IF;
  
  -- Map stage to event type
  v_event_type := 'stage_' || LOWER(REPLACE(NEW.current_stage::text, '_', '_'));
  
  -- Build event text
  v_event_text := format(
    'Stage Updated: %s → %s',
    REPLACE(OLD.current_stage::text, '_', ' '),
    REPLACE(NEW.current_stage::text, '_', ' ')
  );
  
  -- Log event
  PERFORM public.log_activity_feed_event(
    p_event_type := v_event_type,
    p_event_text := v_event_text,
    p_event_payload := jsonb_build_object(
      'old_stage', OLD.current_stage::text,
      'new_stage', NEW.current_stage::text,
      'status_reason', NEW.status_reason,
      'job_value', NEW.projected_job_value
    ),
    p_job_id := NEW.id,
    p_thread_id := NEW.thread_id,
    p_lead_id := NEW.lead_id,
    p_campaign_id := NEW.campaign_id,
    p_created_by := 'smart_ai'
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_stage_change ON public.roofing_jobs;
CREATE TRIGGER trg_log_stage_change
  AFTER UPDATE OF current_stage ON public.roofing_jobs
  FOR EACH ROW
  WHEN (OLD.current_stage IS DISTINCT FROM NEW.current_stage)
  EXECUTE FUNCTION public.trigger_log_stage_change();

COMMENT ON FUNCTION public.trigger_log_stage_change IS 'Auto-logs activity feed event when roofing job stage changes';

-- ============================================================================
-- PART 7 — Comments
-- ============================================================================

COMMENT ON TABLE public.activity_feed_events IS 'SmartSend Roofing Activity Feed v1 - Real-time feed of all SmartSend events';
COMMENT ON COLUMN public.activity_feed_events.event_type IS 'Event type from predefined enum (lead, insurance, proposal, adjuster, stage, warning)';
COMMENT ON COLUMN public.activity_feed_events.event_text IS 'Human-readable event description';
COMMENT ON COLUMN public.activity_feed_events.event_payload IS 'JSONB with event-specific details (carrier, claim number, amounts, etc.)';
COMMENT ON COLUMN public.activity_feed_events.created_by IS 'smart_ai (system-generated) or contractor_user (manual)';
















































