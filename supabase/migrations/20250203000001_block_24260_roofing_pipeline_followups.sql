-- =========================================================
-- Block 24260 — SmartSend Roofing Pipeline Follow-Up Sequences
-- Automated follow-up based on pipeline stage
-- =========================================================

-- ============================================================================
-- STEP 1: CREATE PIPELINE FOLLOW-UP SEQUENCES TABLE
-- ============================================================================
-- Stores follow-up sequences triggered by pipeline stage transitions

CREATE TABLE IF NOT EXISTS public.roofing_pipeline_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Pipeline stage context
  pipeline_stage TEXT NOT NULL CHECK (pipeline_stage IN ('lead_in', 'inspection_set', 'quote_sent', 'approved', 'scheduled', 'installed')),
  followup_type TEXT NOT NULL, -- e.g., 'inspection_reminder', 'quote_followup', 'scheduling_offer', 'review_request'
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  
  -- Template
  template_key TEXT, -- References email_templates table
  subject TEXT,
  body TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'cancelled', 'skipped')),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_pipeline_followups_lead_id 
  ON public.roofing_pipeline_followups(lead_id);

CREATE INDEX IF NOT EXISTS idx_roofing_pipeline_followups_workspace_id 
  ON public.roofing_pipeline_followups(workspace_id);

CREATE INDEX IF NOT EXISTS idx_roofing_pipeline_followups_scheduled 
  ON public.roofing_pipeline_followups(scheduled_at) 
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_roofing_pipeline_followups_stage 
  ON public.roofing_pipeline_followups(pipeline_stage, status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_roofing_pipeline_followups_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_roofing_pipeline_followups_updated_at
BEFORE UPDATE ON public.roofing_pipeline_followups
FOR EACH ROW
EXECUTE FUNCTION public.set_roofing_pipeline_followups_updated_at();

-- RLS
ALTER TABLE public.roofing_pipeline_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pipeline followups for their workspace"
  ON public.roofing_pipeline_followups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_pipeline_followups.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "SmartSend system can insert pipeline followups"
  ON public.roofing_pipeline_followups
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- STEP 2: FUNCTION — Schedule Pipeline Follow-Up
-- ============================================================================
-- Automatically schedules follow-up messages when leads move to specific stages

CREATE OR REPLACE FUNCTION public.schedule_pipeline_followup(
  p_lead_id UUID,
  p_pipeline_stage TEXT,
  p_followup_type TEXT,
  p_delay_hours INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead RECORD;
  v_workspace_id UUID;
  v_template_key TEXT;
  v_subject TEXT;
  v_body TEXT;
  v_scheduled_at TIMESTAMPTZ;
  v_followup_id UUID;
BEGIN
  -- Get lead info
  SELECT workspace_id, email, first_name, name
  INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  v_workspace_id := v_lead.workspace_id;
  v_scheduled_at := now() + (p_delay_hours || ' hours')::interval;

  -- Determine template based on followup type
  CASE p_followup_type
    WHEN 'inspection_reminder' THEN
      v_template_key := 'inspection_reminder';
      v_subject := 'Quick reminder: Inspection scheduled';
      v_body := 'Hey {{first_name}}, just wanted to confirm we''re still on for your inspection. Let me know if you need to reschedule!';
    
    WHEN 'quote_followup_1' THEN
      v_template_key := 'quote_followup_1';
      v_subject := 'Quick follow-up on your quote';
      v_body := 'Hey {{first_name}}, wanted to check in on the quote we sent. Any questions before we move forward?';
    
    WHEN 'quote_followup_2' THEN
      v_template_key := 'quote_followup_2';
      v_subject := 'Still interested in your roof?';
      v_body := 'Hey {{first_name}}, wanted to circle back on your quote. If timing isn''t right, no worries — just let me know!';
    
    WHEN 'scheduling_offer' THEN
      v_template_key := 'scheduling_offer';
      v_subject := 'Ready to schedule your install?';
      v_body := 'Great news, {{first_name}}! Want me to schedule the installation? I can get you on the calendar this week.';
    
    WHEN 'install_reminder' THEN
      v_template_key := 'install_reminder';
      v_subject := 'Reminder: Installation tomorrow';
      v_body := 'Hey {{first_name}}, just a reminder that we''ll be there tomorrow for your roof installation. See you then!';
    
    WHEN 'review_request' THEN
      v_template_key := 'review_request';
      v_subject := 'How did we do?';
      v_body := 'Hey {{first_name}}, hope you''re happy with your new roof! If you have a minute, we''d love your feedback.';
    
    WHEN 'referral_request' THEN
      v_template_key := 'referral_request';
      v_subject := 'Know anyone else who needs a roof?';
      v_body := 'Hey {{first_name}}, thanks again for choosing us! If you know anyone else who might need roofing work, we''d love to help them too.';
    
    ELSE
      v_template_key := NULL;
      v_subject := 'Follow-up';
      v_body := 'Hey {{first_name}}, wanted to check in.';
  END CASE;

  -- Insert follow-up
  INSERT INTO public.roofing_pipeline_followups (
    lead_id,
    workspace_id,
    pipeline_stage,
    followup_type,
    scheduled_at,
    template_key,
    subject,
    body,
    status
  )
  VALUES (
    p_lead_id,
    v_workspace_id,
    p_pipeline_stage,
    p_followup_type,
    v_scheduled_at,
    v_template_key,
    v_subject,
    v_body,
    'scheduled'
  )
  RETURNING id INTO v_followup_id;

  RETURN v_followup_id;
END;
$$;

COMMENT ON FUNCTION public.schedule_pipeline_followup IS 'Schedules a follow-up message based on pipeline stage (Block 24260)';

-- ============================================================================
-- STEP 3: TRIGGER — Auto-Schedule Follow-Ups on Stage Change
-- ============================================================================
-- Automatically schedules follow-ups when leads move to specific stages

CREATE OR REPLACE FUNCTION public.trigger_pipeline_followups()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only trigger if stage actually changed
  IF NEW.roofing_pipeline_stage = OLD.roofing_pipeline_stage THEN
    RETURN NEW;
  END IF;

  -- Schedule follow-ups based on new stage
  CASE NEW.roofing_pipeline_stage
    WHEN 'inspection_set' THEN
      -- Reminder 24 hours before inspection (if inspection_scheduled_at is set)
      IF NEW.inspection_scheduled_at IS NOT NULL THEN
        PERFORM public.schedule_pipeline_followup(
          NEW.id,
          'inspection_set',
          'inspection_reminder',
          EXTRACT(EPOCH FROM (NEW.inspection_scheduled_at - now())) / 3600 - 24
        );
      END IF;
    
    WHEN 'quote_sent' THEN
      -- First follow-up after 2 days
      PERFORM public.schedule_pipeline_followup(
        NEW.id,
        'quote_sent',
        'quote_followup_1',
        48 -- 2 days
      );
      
      -- Second follow-up after 7 days (if still in quote_sent)
      PERFORM public.schedule_pipeline_followup(
        NEW.id,
        'quote_sent',
        'quote_followup_2',
        168 -- 7 days
      );
    
    WHEN 'approved' THEN
      -- Offer to schedule immediately
      PERFORM public.schedule_pipeline_followup(
        NEW.id,
        'approved',
        'scheduling_offer',
        0 -- Immediate
      );
    
    WHEN 'scheduled' THEN
      -- Reminder 24 hours before install
      IF NEW.scheduled_at IS NOT NULL THEN
        PERFORM public.schedule_pipeline_followup(
          NEW.id,
          'scheduled',
          'install_reminder',
          EXTRACT(EPOCH FROM (NEW.scheduled_at - now())) / 3600 - 24
        );
      END IF;
    
    WHEN 'installed' THEN
      -- Review request after 3 days
      PERFORM public.schedule_pipeline_followup(
        NEW.id,
        'installed',
        'review_request',
        72 -- 3 days
      );
      
      -- Referral request after 7 days
      PERFORM public.schedule_pipeline_followup(
        NEW.id,
        'installed',
        'referral_request',
        168 -- 7 days
      );
  END CASE;

  RETURN NEW;
END;
$$;

-- Create trigger on leads table
DROP TRIGGER IF EXISTS trg_pipeline_followups ON public.leads;
CREATE TRIGGER trg_pipeline_followups
AFTER UPDATE OF roofing_pipeline_stage ON public.leads
FOR EACH ROW
WHEN (NEW.roofing_pipeline_stage IS DISTINCT FROM OLD.roofing_pipeline_stage)
EXECUTE FUNCTION public.trigger_pipeline_followups();

COMMENT ON TRIGGER trg_pipeline_followups ON public.leads IS 'Automatically schedules follow-ups when pipeline stage changes (Block 24260)';

-- ============================================================================
-- STEP 4: FUNCTION — Send Scheduled Pipeline Follow-Ups
-- ============================================================================
-- Processes and sends scheduled follow-up messages

CREATE OR REPLACE FUNCTION public.send_scheduled_pipeline_followups()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_followup RECORD;
  v_lead RECORD;
  v_sent_count INTEGER := 0;
  v_processed_subject TEXT;
  v_processed_body TEXT;
BEGIN
  -- Get all scheduled follow-ups that are due
  FOR v_followup IN
    SELECT *
    FROM public.roofing_pipeline_followups
    WHERE status = 'scheduled'
      AND scheduled_at <= now()
      AND scheduled_at >= now() - interval '1 hour' -- Don't process very old ones
    ORDER BY scheduled_at ASC
    LIMIT 100 -- Process in batches
  LOOP
    -- Get lead info
    SELECT *
    INTO v_lead
    FROM public.leads
    WHERE id = v_followup.lead_id;

    -- Skip if lead no longer in the stage (follow-up no longer relevant)
    IF v_lead.roofing_pipeline_stage != v_followup.pipeline_stage THEN
      UPDATE public.roofing_pipeline_followups
      SET status = 'cancelled',
          updated_at = now()
      WHERE id = v_followup.id;
      CONTINUE;
    END IF;

    -- Process template variables
    v_processed_subject := v_followup.subject;
    v_processed_body := v_followup.body;
    
    IF v_lead.first_name IS NOT NULL THEN
      v_processed_subject := REPLACE(v_processed_subject, '{{first_name}}', v_lead.first_name);
      v_processed_body := REPLACE(v_processed_body, '{{first_name}}', v_lead.first_name);
    ELSIF v_lead.name IS NOT NULL THEN
      v_processed_subject := REPLACE(v_processed_subject, '{{first_name}}', SPLIT_PART(v_lead.name, ' ', 1));
      v_processed_body := REPLACE(v_processed_body, '{{first_name}}', SPLIT_PART(v_lead.name, ' ', 1));
    ELSE
      v_processed_subject := REPLACE(v_processed_subject, '{{first_name}}', 'there');
      v_processed_body := REPLACE(v_processed_body, '{{first_name}}', 'there');
    END IF;

    -- TODO: Actually send the email via your email service
    -- For now, we'll just mark it as sent
    -- In production, you'd integrate with your email sending service here
    
    UPDATE public.roofing_pipeline_followups
    SET 
      status = 'sent',
      sent_at = now(),
      updated_at = now()
    WHERE id = v_followup.id;

    v_sent_count := v_sent_count + 1;
  END LOOP;

  RETURN v_sent_count;
END;
$$;

COMMENT ON FUNCTION public.send_scheduled_pipeline_followups IS 'Processes and sends scheduled pipeline follow-up messages (Block 24260)';






































