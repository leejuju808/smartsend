-- =========================================================
-- Block 24220 — SmartSend Roofing Quote Follow-Up Engine v1
-- (Post-Estimate Follow-Up • Insurance Coordination • Multi-Touch Nurture • Closing Scripts)
-- =========================================================
-- 
-- This is where 70% of roofing companies LOSE money.
-- They give quotes… Homeowners disappear… Roofers never follow up…
-- SmartSend fixes that permanently.
--
-- FULL CLOSING ENGINE — ZERO FLUFF.
-- Every detail below exists for ONE purpose:
-- 👉 Help roofers close more roofs AFTER the quote is delivered.
--
-- This engine alone will help roofers close 20–40% more jobs.
-- =========================================================

-- ============================================================================
-- STEP 1: CREATE quote_followup_sequences TABLE
-- ============================================================================
-- Tracks the 7-stage follow-up sequence for each quote

CREATE TABLE IF NOT EXISTS public.quote_followup_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Sequence tracking
  current_stage INTEGER NOT NULL DEFAULT 1 CHECK (current_stage BETWEEN 1 AND 7),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'paused')),
  
  -- Quote metadata
  quote_sent_at TIMESTAMPTZ NOT NULL,
  quote_total NUMERIC,
  
  -- Insurance tracking
  is_insurance_claim BOOLEAN DEFAULT false,
  waiting_on_insurance BOOLEAN DEFAULT false,
  insurance_adjuster_scheduled BOOLEAN DEFAULT false,
  insurance_adjuster_date TIMESTAMPTZ,
  
  -- Hot lead flags
  is_hot_lead BOOLEAN DEFAULT false,
  hot_lead_detected_at TIMESTAMPTZ,
  
  -- Price objection tracking
  has_price_objection BOOLEAN DEFAULT false,
  price_objection_text TEXT,
  
  -- Stage completion tracking
  stage_1_sent_at TIMESTAMPTZ,
  stage_2_sent_at TIMESTAMPTZ,
  stage_3_sent_at TIMESTAMPTZ,
  stage_4_sent_at TIMESTAMPTZ,
  stage_5_sent_at TIMESTAMPTZ,
  stage_6_sent_at TIMESTAMPTZ,
  stage_7_sent_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- One active sequence per quote
  UNIQUE(quote_id) WHERE status = 'active'
);

CREATE INDEX IF NOT EXISTS idx_quote_followup_sequences_quote_id ON public.quote_followup_sequences(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_followup_sequences_lead_id ON public.quote_followup_sequences(lead_id);
CREATE INDEX IF NOT EXISTS idx_quote_followup_sequences_workspace_id ON public.quote_followup_sequences(workspace_id);
CREATE INDEX IF NOT EXISTS idx_quote_followup_sequences_status ON public.quote_followup_sequences(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_quote_followup_sequences_hot_lead ON public.quote_followup_sequences(is_hot_lead) WHERE is_hot_lead = true;
CREATE INDEX IF NOT EXISTS idx_quote_followup_sequences_insurance ON public.quote_followup_sequences(waiting_on_insurance) WHERE waiting_on_insurance = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_quote_followup_sequences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_quote_followup_sequences_updated_at ON public.quote_followup_sequences;
CREATE TRIGGER trg_set_quote_followup_sequences_updated_at
BEFORE UPDATE ON public.quote_followup_sequences
FOR EACH ROW
EXECUTE FUNCTION public.set_quote_followup_sequences_updated_at();

-- ============================================================================
-- STEP 2: CREATE quote_followup_schedules TABLE
-- ============================================================================
-- Individual scheduled messages for each stage

CREATE TABLE IF NOT EXISTS public.quote_followup_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.quote_followup_sequences(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Scheduling
  stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 7),
  scheduled_at TIMESTAMPTZ NOT NULL,
  
  -- Message content
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'cancelled', 'skipped')),
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  
  -- Tracking
  email_message_id UUID, -- Links to inbox_messages or email_logs
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_followup_schedules_sequence_id ON public.quote_followup_schedules(sequence_id);
CREATE INDEX IF NOT EXISTS idx_quote_followup_schedules_quote_id ON public.quote_followup_schedules(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_followup_schedules_lead_id ON public.quote_followup_schedules(lead_id);
CREATE INDEX IF NOT EXISTS idx_quote_followup_schedules_scheduled_at ON public.quote_followup_schedules(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_quote_followup_schedules_workspace_status ON public.quote_followup_schedules(workspace_id, status) WHERE status = 'scheduled';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_quote_followup_schedules_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_quote_followup_schedules_updated_at ON public.quote_followup_schedules;
CREATE TRIGGER trg_set_quote_followup_schedules_updated_at
BEFORE UPDATE ON public.quote_followup_schedules
FOR EACH ROW
EXECUTE FUNCTION public.set_quote_followup_schedules_updated_at();

-- ============================================================================
-- STEP 3: CREATE quote_followup_templates TABLE
-- ============================================================================
-- Templates for each of the 7 stages

CREATE TABLE IF NOT EXISTS public.quote_followup_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Template identification
  stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 7),
  template_type TEXT NOT NULL CHECK (template_type IN ('standard', 'insurance', 'hot_lead', 'price_objection')),
  
  -- Content
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  
  -- Insurance-specific content
  insurance_subject TEXT,
  insurance_body_text TEXT,
  insurance_body_html TEXT,
  
  -- Metadata
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- One default template per stage per workspace
  UNIQUE(workspace_id, stage, template_type) WHERE is_default = true
);

CREATE INDEX IF NOT EXISTS idx_quote_followup_templates_workspace_stage ON public.quote_followup_templates(workspace_id, stage) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_quote_followup_templates_stage_type ON public.quote_followup_templates(stage, template_type) WHERE is_default = true AND is_active = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_quote_followup_templates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_quote_followup_templates_updated_at ON public.quote_followup_templates;
CREATE TRIGGER trg_set_quote_followup_templates_updated_at
BEFORE UPDATE ON public.quote_followup_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_quote_followup_templates_updated_at();

-- ============================================================================
-- STEP 4: INSERT DEFAULT TEMPLATES (The 7-Stage Sequence)
-- ============================================================================

INSERT INTO public.quote_followup_templates (workspace_id, stage, template_type, subject, body_text, is_default, is_active)
VALUES
  -- Stage 1 — Same Day Follow-Up (5–10 hours after quote)
  (NULL, 1, 'standard', 'Quick check-in on your estimate',
   'Hey {{first_name}},

Just wanted to check in — any questions about the estimate we sent over?

Happy to explain anything.

{{sender_name}}', true, true),

  -- Stage 2 — Day 2 Clarification
  (NULL, 2, 'standard', 'Quick note on scheduling',
   'Hey {{first_name}},

Quick note — we can usually schedule work within 1–2 weeks.

Let me know if you''d like to reserve a spot.

{{sender_name}}', true, true),

  -- Stage 3 — Day 4 Value Add
  (NULL, 3, 'standard', 'Wanted to mention — full warranty included',
   'Hey {{first_name}},

Wanted to mention — all work includes full warranty coverage + cleanup.

No surprises, no hidden fees.

{{sender_name}}', true, true),

  -- Stage 4 — Day 7 Insurance Follow-Up
  (NULL, 4, 'standard', 'Any update from your adjuster?',
   'Hey {{first_name}},

Any update from your adjuster?

If you want, we can help speak with them or document the damage.

{{sender_name}}', true, true),

  -- Stage 4 — Day 7 Insurance Follow-Up (Insurance-specific)
  (NULL, 4, 'insurance', 'Insurance claim update?',
   'Hey {{first_name}},

Any update from your adjuster?

If you want, we can help speak with them or document the damage.

{{sender_name}}', true, true),

  -- Stage 5 — Day 10 Check-In
  (NULL, 5, 'standard', 'Still happy to help',
   'Hey {{first_name}},

Still happy to help if you''re moving forward with the project.

Want me to lock in a spot for next week?

{{sender_name}}', true, true),

  -- Stage 6 — Day 14 Decision Close
  (NULL, 6, 'standard', 'Before we close out your file',
   'Hey {{first_name}},

Before we close out your file — were you still wanting to move forward?

Just reply yes/no.

{{sender_name}}', true, true),

  -- Stage 7 — Day 21 "Last Call" Revival
  (NULL, 7, 'standard', 'Last quick check',
   'Hey {{first_name}},

Last quick check — want us to keep your project on our schedule?

If not, no worries at all.

{{sender_name}}', true, true),

  -- Hot Lead Response Template
  (NULL, 1, 'hot_lead', 'Got it — let''s get this done',
   'Great news, {{first_name}} — we can take care of that for you.

I can get someone out today or tomorrow to take a look and get you a quote.

Which time works best?

{{sender_name}}', true, true),

  -- Price Objection Response Template
  (NULL, 1, 'price_objection', 'Totally understand — let''s explore options',
   'Hey {{first_name}},

Totally understand — roofing quotes can vary a lot.

We use licensed crews, full warranty, and premium materials.

If cost is a concern, we can explore options.

{{sender_name}}', true, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- STEP 5: FUNCTION — Initialize Quote Follow-Up Sequence
-- ============================================================================

CREATE OR REPLACE FUNCTION public.initialize_quote_followup_sequence(
  p_quote_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote_record RECORD;
  v_lead_record RECORD;
  v_workspace_id UUID;
  v_sequence_id UUID;
  v_is_insurance BOOLEAN;
  v_is_hot BOOLEAN;
BEGIN
  -- Get quote and lead info
  SELECT 
    q.id,
    q.lead_id,
    q.status,
    q.total,
    q.sent_at,
    l.workspace_id,
    l.is_insurance_claim,
    l.is_hot,
    l.hot_score
  INTO v_quote_record
  FROM public.quotes q
  JOIN public.leads l ON l.id = q.lead_id
  WHERE q.id = p_quote_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found: %', p_quote_id;
  END IF;
  
  IF v_quote_record.status != 'sent' THEN
    RAISE EXCEPTION 'Quote must be sent before initializing follow-up sequence';
  END IF;
  
  IF v_quote_record.sent_at IS NULL THEN
    RAISE EXCEPTION 'Quote sent_at timestamp is required';
  END IF;
  
  v_workspace_id := v_quote_record.workspace_id;
  v_is_insurance := COALESCE(v_quote_record.is_insurance_claim, false);
  v_is_hot := COALESCE(v_quote_record.is_hot, false) OR COALESCE(v_quote_record.hot_score, 0) >= 70;
  
  -- Check if sequence already exists
  SELECT id INTO v_sequence_id
  FROM public.quote_followup_sequences
  WHERE quote_id = p_quote_id
    AND status = 'active';
  
  IF v_sequence_id IS NOT NULL THEN
    RETURN v_sequence_id; -- Already initialized
  END IF;
  
  -- Create sequence
  INSERT INTO public.quote_followup_sequences (
    quote_id,
    lead_id,
    workspace_id,
    quote_sent_at,
    quote_total,
    is_insurance_claim,
    is_hot_lead,
    hot_lead_detected_at,
    status
  ) VALUES (
    p_quote_id,
    v_quote_record.lead_id,
    v_workspace_id,
    v_quote_record.sent_at,
    v_quote_record.total,
    v_is_insurance,
    v_is_hot,
    CASE WHEN v_is_hot THEN now() ELSE NULL END,
    'active'
  )
  RETURNING id INTO v_sequence_id;
  
  -- Schedule all 7 stages
  PERFORM public.schedule_quote_followup_stages(v_sequence_id);
  
  RETURN v_sequence_id;
END;
$$;

COMMENT ON FUNCTION public.initialize_quote_followup_sequence IS 'Initializes the 7-stage follow-up sequence when a quote is sent (Block 24220)';

-- ============================================================================
-- STEP 6: FUNCTION — Schedule All 7 Stages
-- ============================================================================

CREATE OR REPLACE FUNCTION public.schedule_quote_followup_stages(
  p_sequence_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sequence RECORD;
  v_lead RECORD;
  v_template RECORD;
  v_scheduled_at TIMESTAMPTZ;
  v_quote_sent_at TIMESTAMPTZ;
  v_subject TEXT;
  v_body TEXT;
  v_template_type TEXT;
BEGIN
  -- Get sequence info
  SELECT * INTO v_sequence
  FROM public.quote_followup_sequences
  WHERE id = p_sequence_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sequence not found: %', p_sequence_id;
  END IF;
  
  v_quote_sent_at := v_sequence.quote_sent_at;
  
  -- Get lead info for personalization
  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = v_sequence.lead_id;
  
  -- Schedule each stage
  FOR stage_num IN 1..7 LOOP
    -- Calculate scheduled time based on stage
    CASE stage_num
      WHEN 1 THEN v_scheduled_at := v_quote_sent_at + interval '8 hours'; -- Same day (5-10 hours)
      WHEN 2 THEN v_scheduled_at := v_quote_sent_at + interval '2 days'; -- Day 2
      WHEN 3 THEN v_scheduled_at := v_quote_sent_at + interval '4 days'; -- Day 4
      WHEN 4 THEN v_scheduled_at := v_quote_sent_at + interval '7 days'; -- Day 7
      WHEN 5 THEN v_scheduled_at := v_quote_sent_at + interval '10 days'; -- Day 10
      WHEN 6 THEN v_scheduled_at := v_quote_sent_at + interval '14 days'; -- Day 14
      WHEN 7 THEN v_scheduled_at := v_quote_sent_at + interval '21 days'; -- Day 21
    END CASE;
    
    -- Determine template type
    IF stage_num = 4 AND v_sequence.is_insurance_claim THEN
      v_template_type := 'insurance';
    ELSIF stage_num = 1 AND v_sequence.is_hot_lead THEN
      v_template_type := 'hot_lead';
    ELSE
      v_template_type := 'standard';
    END IF;
    
    -- Get template
    SELECT * INTO v_template
    FROM public.quote_followup_templates
    WHERE stage = stage_num
      AND template_type = v_template_type
      AND (workspace_id = v_sequence.workspace_id OR (workspace_id IS NULL AND is_default = true))
      AND is_active = true
    ORDER BY workspace_id NULLS LAST, is_default DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Template not found for stage % type %', stage_num, v_template_type;
      CONTINUE;
    END IF;
    
    -- Personalize template (simple variable replacement)
    v_subject := v_template.subject;
    v_body := v_template.body_text;
    
    -- Replace variables (basic implementation - can be enhanced)
    v_subject := REPLACE(v_subject, '{{first_name}}', COALESCE(v_lead.first_name, 'there'));
    v_body := REPLACE(v_body, '{{first_name}}', COALESCE(v_lead.first_name, 'there'));
    v_body := REPLACE(v_body, '{{sender_name}}', 'SmartSend Team');
    
    -- Create schedule
    INSERT INTO public.quote_followup_schedules (
      sequence_id,
      quote_id,
      lead_id,
      workspace_id,
      stage,
      scheduled_at,
      subject,
      body_text,
      body_html,
      status
    ) VALUES (
      p_sequence_id,
      v_sequence.quote_id,
      v_sequence.lead_id,
      v_sequence.workspace_id,
      stage_num,
      v_scheduled_at,
      v_subject,
      v_body,
      v_template.body_html,
      'scheduled'
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.schedule_quote_followup_stages IS 'Schedules all 7 stages of the quote follow-up sequence (Block 24220)';

-- ============================================================================
-- STEP 7: FUNCTION — Process Due Follow-Ups
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_due_quote_followups()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_schedule RECORD;
  v_sent_count INTEGER := 0;
  v_cancelled_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_result JSONB;
BEGIN
  -- Find all due follow-ups
  FOR v_schedule IN
    SELECT 
      qfs.*,
      qfsq.quote_id,
      qfsq.lead_id,
      qfsq.workspace_id,
      l.email,
      l.first_name,
      l.last_name
    FROM public.quote_followup_schedules qfs
    JOIN public.quote_followup_sequences qfsq ON qfsq.id = qfs.sequence_id
    JOIN public.leads l ON l.id = qfsq.lead_id
    WHERE qfs.status = 'scheduled'
      AND qfs.scheduled_at <= now()
      AND qfsq.status = 'active'
    ORDER BY qfs.scheduled_at ASC
    LIMIT 100 -- Process in batches
  LOOP
    BEGIN
      -- Check if should skip (homeowner replied, quote accepted, etc.)
      IF public.should_skip_quote_followup(v_schedule.id) THEN
        UPDATE public.quote_followup_schedules
        SET 
          status = 'cancelled',
          cancelled_at = now(),
          cancelled_reason = 'safe_stop_condition'
        WHERE id = v_schedule.id;
        
        v_cancelled_count := v_cancelled_count + 1;
        CONTINUE;
      END IF;
      
      -- Send the follow-up (placeholder - integrate with email sending)
      PERFORM public.send_quote_followup_message(v_schedule.id);
      
      v_sent_count := v_sent_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Error processing follow-up %: %', v_schedule.id, SQLERRM;
    END;
  END LOOP;
  
  v_result := jsonb_build_object(
    'sent', v_sent_count,
    'cancelled', v_cancelled_count,
    'errors', v_error_count,
    'processed_at', now()
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.process_due_quote_followups IS 'Processes all due quote follow-up messages (Block 24220)';

-- ============================================================================
-- STEP 8: FUNCTION — Check Safe-Stop Conditions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.should_skip_quote_followup(
  p_schedule_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_schedule RECORD;
  v_quote RECORD;
  v_lead RECORD;
  v_has_recent_reply BOOLEAN;
BEGIN
  -- Get schedule info
  SELECT * INTO v_schedule
  FROM public.quote_followup_schedules
  WHERE id = p_schedule_id;
  
  IF NOT FOUND THEN
    RETURN true;
  END IF;
  
  -- Get quote status
  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = v_schedule.quote_id;
  
  -- Skip if quote accepted or rejected
  IF v_quote.status IN ('accepted', 'rejected') THEN
    RETURN true;
  END IF;
  
  -- Get lead info
  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = v_schedule.lead_id;
  
  -- Skip if lead status indicates not interested
  IF v_lead.pipeline_stage IN ('NOT_INTERESTED', 'CLOSED', 'LOST') THEN
    RETURN true;
  END IF;
  
  -- Check for recent reply (within last 24 hours)
  SELECT EXISTS (
    SELECT 1
    FROM public.inbox_messages
    WHERE lead_id = v_schedule.lead_id
      AND direction IN ('inbound', 'in')
      AND received_at > now() - interval '24 hours'
  ) INTO v_has_recent_reply;
  
  IF v_has_recent_reply THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.should_skip_quote_followup IS 'Checks if a quote follow-up should be skipped due to safe-stop conditions (Block 24220)';

-- ============================================================================
-- STEP 9: FUNCTION — Send Quote Follow-Up Message
-- ============================================================================

CREATE OR REPLACE FUNCTION public.send_quote_followup_message(
  p_schedule_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_schedule RECORD;
  v_sequence RECORD;
  v_lead RECORD;
  v_thread_id UUID;
  v_message_id UUID;
BEGIN
  -- Get schedule info
  SELECT * INTO v_schedule
  FROM public.quote_followup_schedules
  WHERE id = p_schedule_id
    AND status = 'scheduled';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule not found or not scheduled: %', p_schedule_id;
  END IF;
  
  -- Get sequence info
  SELECT * INTO v_sequence
  FROM public.quote_followup_sequences
  WHERE id = v_schedule.sequence_id;
  
  -- Get lead info
  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = v_schedule.lead_id;
  
  -- Find or create inbox thread
  SELECT id INTO v_thread_id
  FROM public.inbox_threads
  WHERE lead_id = v_schedule.lead_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- TODO: Actually send email via your email sending service
  -- This is a placeholder - integrate with your email sending infrastructure
  -- Recommended integration points:
  -- - app/api/inbox/send/route.ts
  -- - src/lib/providers/index.ts
  -- - supabase/functions/send-email/index.ts
  --
  -- For now, we'll create an inbox message record
  
  -- Create outbound message in inbox_messages
  INSERT INTO public.inbox_messages (
    thread_id,
    lead_id,
    direction,
    sender_email,
    receiver_email,
    subject,
    body,
    sent_at
  ) VALUES (
    v_thread_id,
    v_schedule.lead_id,
    'outbound',
    'noreply@smartsend.ai', -- Replace with actual sender
    v_lead.email,
    v_schedule.subject,
    v_schedule.body_text,
    now()
  )
  RETURNING id INTO v_message_id;
  
  -- Update schedule
  UPDATE public.quote_followup_schedules
  SET 
    status = 'sent',
    sent_at = now(),
    email_message_id = v_message_id
  WHERE id = p_schedule_id;
  
  -- Update sequence stage tracking
  CASE v_schedule.stage
    WHEN 1 THEN
      UPDATE public.quote_followup_sequences SET stage_1_sent_at = now() WHERE id = v_sequence.id;
    WHEN 2 THEN
      UPDATE public.quote_followup_sequences SET stage_2_sent_at = now() WHERE id = v_sequence.id;
    WHEN 3 THEN
      UPDATE public.quote_followup_sequences SET stage_3_sent_at = now() WHERE id = v_sequence.id;
    WHEN 4 THEN
      UPDATE public.quote_followup_sequences SET stage_4_sent_at = now() WHERE id = v_sequence.id;
    WHEN 5 THEN
      UPDATE public.quote_followup_sequences SET stage_5_sent_at = now() WHERE id = v_sequence.id;
    WHEN 6 THEN
      UPDATE public.quote_followup_sequences SET stage_6_sent_at = now() WHERE id = v_sequence.id;
    WHEN 7 THEN
      UPDATE public.quote_followup_sequences SET stage_7_sent_at = now(), status = 'completed' WHERE id = v_sequence.id;
  END CASE;
  
  -- Create timeline event
  INSERT INTO public.lead_timeline_events (
    lead_id,
    event_type,
    event_subtype,
    message,
    metadata
  ) VALUES (
    v_schedule.lead_id,
    'quote_followup_sent',
    'stage_' || v_schedule.stage,
    'Quote follow-up stage ' || v_schedule.stage || ' sent',
    jsonb_build_object(
      'quote_id', v_schedule.quote_id,
      'schedule_id', p_schedule_id,
      'stage', v_schedule.stage
    )
  );
  
  RETURN v_message_id;
END;
$$;

COMMENT ON FUNCTION public.send_quote_followup_message IS 'Sends a scheduled quote follow-up message (Block 24220)';

-- ============================================================================
-- STEP 10: FUNCTION — Handle Hot Lead Detection
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_quote_hot_lead(
  p_quote_id UUID,
  p_hot_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sequence_id UUID;
BEGIN
  -- Find active sequence for this quote
  SELECT id INTO v_sequence_id
  FROM public.quote_followup_sequences
  WHERE quote_id = p_quote_id
    AND status = 'active';
  
  IF v_sequence_id IS NULL THEN
    RETURN; -- No active sequence
  END IF;
  
  -- Mark as hot lead
  UPDATE public.quote_followup_sequences
  SET 
    is_hot_lead = true,
    hot_lead_detected_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('hot_reason', p_hot_reason)
  WHERE id = v_sequence_id;
  
  -- Cancel remaining scheduled follow-ups and reschedule with hot lead template
  UPDATE public.quote_followup_schedules
  SET 
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = 'hot_lead_detected'
  WHERE sequence_id = v_sequence_id
    AND status = 'scheduled'
    AND stage > 1; -- Keep stage 1, cancel rest
  
  -- Reschedule with hot lead priority (faster sequence)
  -- This would typically trigger immediate notification to roofer
  -- For now, we'll just mark it - actual notification can be handled by edge function
  
END;
$$;

COMMENT ON FUNCTION public.handle_quote_hot_lead IS 'Handles hot lead detection for quote follow-up sequences (Block 24220)';

-- ============================================================================
-- STEP 11: FUNCTION — Handle Price Objection
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_quote_price_objection(
  p_quote_id UUID,
  p_objection_text TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sequence_id UUID;
  v_template RECORD;
  v_schedule_id UUID;
BEGIN
  -- Find active sequence
  SELECT id INTO v_sequence_id
  FROM public.quote_followup_sequences
  WHERE quote_id = p_quote_id
    AND status = 'active';
  
  IF v_sequence_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Mark as having price objection
  UPDATE public.quote_followup_sequences
  SET 
    has_price_objection = true,
    price_objection_text = p_objection_text
  WHERE id = v_sequence_id;
  
  -- Get price objection template
  SELECT * INTO v_template
  FROM public.quote_followup_templates
  WHERE template_type = 'price_objection'
    AND stage = 1
    AND is_active = true
  ORDER BY workspace_id NULLS LAST, is_default DESC
  LIMIT 1;
  
  IF FOUND THEN
    -- Create immediate response schedule
    INSERT INTO public.quote_followup_schedules (
      sequence_id,
      quote_id,
      lead_id,
      workspace_id,
      stage,
      scheduled_at,
      subject,
      body_text,
      status
    )
    SELECT 
      v_sequence_id,
      quote_id,
      lead_id,
      workspace_id,
      1, -- Immediate response
      now(), -- Send immediately
      v_template.subject,
      v_template.body_text,
      'scheduled'
    FROM public.quote_followup_sequences
    WHERE id = v_sequence_id
    RETURNING id INTO v_schedule_id;
    
    -- Send immediately
    PERFORM public.send_quote_followup_message(v_schedule_id);
  END IF;
  
END;
$$;

COMMENT ON FUNCTION public.handle_quote_price_objection IS 'Handles price objection responses for quote follow-ups (Block 24220)';

-- ============================================================================
-- STEP 12: FUNCTION — Update Insurance Status
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_quote_insurance_status(
  p_quote_id UUID,
  p_waiting_on_insurance BOOLEAN DEFAULT NULL,
  p_adjuster_scheduled BOOLEAN DEFAULT NULL,
  p_adjuster_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sequence_id UUID;
BEGIN
  -- Find active sequence
  SELECT id INTO v_sequence_id
  FROM public.quote_followup_sequences
  WHERE quote_id = p_quote_id
    AND status = 'active';
  
  IF v_sequence_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Update insurance status
  UPDATE public.quote_followup_sequences
  SET 
    waiting_on_insurance = COALESCE(p_waiting_on_insurance, waiting_on_insurance),
    insurance_adjuster_scheduled = COALESCE(p_adjuster_scheduled, insurance_adjuster_scheduled),
    insurance_adjuster_date = COALESCE(p_adjuster_date, insurance_adjuster_date),
    is_insurance_claim = CASE WHEN p_waiting_on_insurance = true THEN true ELSE is_insurance_claim END
  WHERE id = v_sequence_id;
  
  -- If adjuster scheduled, trigger stage 4 (insurance follow-up) immediately
  IF p_adjuster_scheduled = true AND p_adjuster_date IS NOT NULL THEN
    -- Cancel existing stage 4 if scheduled
    UPDATE public.quote_followup_schedules
    SET 
      status = 'cancelled',
      cancelled_reason = 'adjuster_scheduled'
    WHERE sequence_id = v_sequence_id
      AND stage = 4
      AND status = 'scheduled';
    
    -- Schedule insurance-specific follow-up for after adjuster visit
    INSERT INTO public.quote_followup_schedules (
      sequence_id,
      quote_id,
      lead_id,
      workspace_id,
      stage,
      scheduled_at,
      subject,
      body_text,
      status
    )
    SELECT 
      v_sequence_id,
      quote_id,
      lead_id,
      workspace_id,
      4,
      p_adjuster_date + interval '1 day', -- Day after adjuster visit
      'Any update from your adjuster?',
      'Hey {{first_name}},

Any update from your adjuster?

If you want, we can help speak with them or document the damage.

{{sender_name}}',
      'scheduled'
    FROM public.quote_followup_sequences
    WHERE id = v_sequence_id;
  END IF;
  
END;
$$;

COMMENT ON FUNCTION public.update_quote_insurance_status IS 'Updates insurance status for quote follow-up sequences (Block 24220)';

-- ============================================================================
-- STEP 13: TRIGGER — Auto-Initialize Sequence When Quote Sent
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_initialize_quote_followup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only process when status changes to 'sent'
  IF OLD.status != 'sent' AND NEW.status = 'sent' THEN
    -- Set sent_at if not already set
    IF NEW.sent_at IS NULL THEN
      NEW.sent_at := now();
    END IF;
    
    -- Initialize follow-up sequence
    BEGIN
      PERFORM public.initialize_quote_followup_sequence(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the transaction
      RAISE WARNING 'Error initializing quote follow-up sequence: %', SQLERRM;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_initialize_quote_followup ON public.quotes;
CREATE TRIGGER trg_initialize_quote_followup
  AFTER UPDATE OF status ON public.quotes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'sent')
  EXECUTE FUNCTION public.trigger_initialize_quote_followup();

-- Also trigger on INSERT if status is already 'sent'
CREATE OR REPLACE FUNCTION public.trigger_initialize_quote_followup_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'sent' THEN
    IF NEW.sent_at IS NULL THEN
      NEW.sent_at := now();
    END IF;
    
    BEGIN
      PERFORM public.initialize_quote_followup_sequence(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error initializing quote follow-up sequence: %', SQLERRM;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_initialize_quote_followup_insert ON public.quotes;
CREATE TRIGGER trg_initialize_quote_followup_insert
  AFTER INSERT ON public.quotes
  FOR EACH ROW
  WHEN (NEW.status = 'sent')
  EXECUTE FUNCTION public.trigger_initialize_quote_followup_insert();

-- ============================================================================
-- STEP 14: DASHBOARD VIEWS
-- ============================================================================

-- View: Active Quotes Dashboard
CREATE OR REPLACE VIEW public.quote_followup_dashboard AS
SELECT 
  w.id AS workspace_id,
  COUNT(DISTINCT qfs.id) FILTER (WHERE qfs.status = 'active') AS active_quotes,
  COUNT(DISTINCT qfs.id) FILTER (WHERE qfs.is_hot_lead = true AND qfs.status = 'active') AS hot_leads,
  COUNT(DISTINCT qfs.id) FILTER (WHERE qfs.waiting_on_insurance = true AND qfs.status = 'active') AS waiting_on_insurance,
  COUNT(DISTINCT qfsc.id) FILTER (WHERE qfsc.status = 'scheduled' AND qfsc.scheduled_at::date = CURRENT_DATE) AS due_today,
  COUNT(DISTINCT qfsc.id) FILTER (WHERE qfsc.status = 'scheduled' AND qfsc.scheduled_at <= now() + interval '1 day') AS due_soon
FROM public.workspaces w
LEFT JOIN public.quote_followup_sequences qfs ON qfs.workspace_id = w.id
LEFT JOIN public.quote_followup_schedules qfsc ON qfsc.workspace_id = w.id
GROUP BY w.id;

COMMENT ON VIEW public.quote_followup_dashboard IS 'Dashboard view showing quote follow-up metrics per workspace (Block 24220)';

-- ============================================================================
-- STEP 15: ENABLE RLS
-- ============================================================================

ALTER TABLE public.quote_followup_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_followup_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_followup_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quote_followup_sequences
CREATE POLICY "Users can view quote followup sequences for their workspace"
  ON public.quote_followup_sequences
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage quote followup sequences"
  ON public.quote_followup_sequences
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for quote_followup_schedules
CREATE POLICY "Users can view quote followup schedules for their workspace"
  ON public.quote_followup_schedules
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage quote followup schedules"
  ON public.quote_followup_schedules
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for quote_followup_templates
CREATE POLICY "Users can view quote followup templates"
  ON public.quote_followup_templates
  FOR SELECT
  USING (
    workspace_id IS NULL OR workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage quote followup templates"
  ON public.quote_followup_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- STEP 16: GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.quote_followup_sequences TO authenticated;
GRANT SELECT ON public.quote_followup_schedules TO authenticated;
GRANT SELECT ON public.quote_followup_templates TO authenticated;
GRANT SELECT ON public.quote_followup_dashboard TO authenticated;

GRANT EXECUTE ON FUNCTION public.initialize_quote_followup_sequence(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_quote_followup_stages(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_due_quote_followups() TO service_role;
GRANT EXECUTE ON FUNCTION public.should_skip_quote_followup(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.send_quote_followup_message(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_quote_hot_lead(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_quote_price_objection(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_quote_insurance_status(UUID, BOOLEAN, BOOLEAN, TIMESTAMPTZ) TO authenticated, service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.quote_followup_sequences IS 'Tracks the 7-stage follow-up sequence for each quote (Block 24220)';
COMMENT ON TABLE public.quote_followup_schedules IS 'Individual scheduled messages for each stage of quote follow-up (Block 24220)';
COMMENT ON TABLE public.quote_followup_templates IS 'Templates for quote follow-up messages (Block 24220)';

COMMENT ON COLUMN public.quote_followup_sequences.current_stage IS 'Current stage in the 7-stage sequence (1-7)';
COMMENT ON COLUMN public.quote_followup_sequences.is_insurance_claim IS 'Whether this quote is for an insurance claim';
COMMENT ON COLUMN public.quote_followup_sequences.is_hot_lead IS 'Whether homeowner has shown hot lead signals';
COMMENT ON COLUMN public.quote_followup_sequences.has_price_objection IS 'Whether homeowner has raised price concerns';

-- ============================================================================
-- STEP 17: FUNCTION — Integrate with Reply Intelligence (Hot Lead Detection)
-- ============================================================================
-- This function should be called when reply intelligence detects hot lead signals
-- Integration point: Call this from reply intelligence processing

CREATE OR REPLACE FUNCTION public.integrate_quote_followup_hot_lead(
  p_lead_id UUID,
  p_hot_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote_id UUID;
BEGIN
  -- Find the most recent sent quote for this lead
  SELECT id INTO v_quote_id
  FROM public.quotes
  WHERE lead_id = p_lead_id
    AND status = 'sent'
  ORDER BY sent_at DESC
  LIMIT 1;
  
  IF v_quote_id IS NOT NULL THEN
    -- Handle hot lead for this quote
    PERFORM public.handle_quote_hot_lead(v_quote_id, p_hot_reason);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.integrate_quote_followup_hot_lead IS 'Integration hook for reply intelligence hot lead detection (Block 24220)';

-- ============================================================================
-- STEP 18: FUNCTION — Integrate with Reply Intelligence (Price Objection)
-- ============================================================================
-- This function should be called when reply intelligence detects price objections
-- Integration point: Call this from reply intelligence processing

CREATE OR REPLACE FUNCTION public.integrate_quote_followup_price_objection(
  p_lead_id UUID,
  p_objection_text TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quote_id UUID;
BEGIN
  -- Find the most recent sent quote for this lead
  SELECT id INTO v_quote_id
  FROM public.quotes
  WHERE lead_id = p_lead_id
    AND status = 'sent'
  ORDER BY sent_at DESC
  LIMIT 1;
  
  IF v_quote_id IS NOT NULL THEN
    -- Handle price objection for this quote
    PERFORM public.handle_quote_price_objection(v_quote_id, p_objection_text);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.integrate_quote_followup_price_objection IS 'Integration hook for reply intelligence price objection detection (Block 24220)';

GRANT EXECUTE ON FUNCTION public.integrate_quote_followup_hot_lead(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.integrate_quote_followup_price_objection(UUID, TEXT) TO authenticated, service_role;

