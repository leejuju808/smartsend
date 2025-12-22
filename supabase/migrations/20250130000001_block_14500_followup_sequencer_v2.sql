-- =========================================================
-- Block 14500 — SmartSend Follow-Up Sequencer v2
-- (The Behavior-Based Follow-Up Engine That Adjusts Timing, Messaging & Intensity Automatically)
-- =========================================================

-- ============================================================================
-- 1. CREATE followup_schedule TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.followup_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Scheduling
  next_followup_at timestamptz NOT NULL,
  followup_step integer NOT NULL DEFAULT 1, -- Which step in sequence (1, 2, 3, etc.)
  
  -- Template & Tone
  template_id uuid, -- References followup_templates table
  template_type text NOT NULL CHECK (template_type IN (
    'light', 'direct', 'urgent', 'storm', 'insurance', 'repair', 'homeowner_objection'
  )),
  tone text NOT NULL DEFAULT 'friendly' CHECK (tone IN ('urgent', 'friendly', 'soft', 'storm', 'insurance')),
  
  -- Context
  reason text NOT NULL, -- Why this follow-up is scheduled (e.g., 'no_reply_2_days', 'warm_reply', 'hot_lead')
  lead_score integer, -- Lead score at time of scheduling
  message_intelligence jsonb DEFAULT '{}'::jsonb, -- Latest message intelligence data
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'paused', 'stopped')),
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One pending follow-up per contact
  UNIQUE(contact_id) WHERE status = 'pending'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_followup_schedule_next_followup 
  ON public.followup_schedule(next_followup_at) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_followup_schedule_workspace_status 
  ON public.followup_schedule(workspace_id, status) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_followup_schedule_contact 
  ON public.followup_schedule(contact_id);

CREATE INDEX IF NOT EXISTS idx_followup_schedule_template_type 
  ON public.followup_schedule(template_type);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_followup_schedule_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_followup_schedule_updated_at ON public.followup_schedule;
CREATE TRIGGER trg_set_followup_schedule_updated_at
BEFORE UPDATE ON public.followup_schedule
FOR EACH ROW
EXECUTE FUNCTION public.set_followup_schedule_updated_at();

-- RLS Policies
ALTER TABLE public.followup_schedule ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'followup_schedule'
      AND policyname = 'Users can view followup schedules for their workspace contacts'
  ) THEN
    CREATE POLICY "Users can view followup schedules for their workspace contacts"
      ON public.followup_schedule
      FOR SELECT
      USING (
        workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'followup_schedule'
      AND policyname = 'Service role can manage followup schedules'
  ) THEN
    CREATE POLICY "Service role can manage followup schedules"
      ON public.followup_schedule
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.followup_schedule IS 'Follow-up scheduling table for behavior-based follow-up sequencer (Block 14500)';
COMMENT ON COLUMN public.followup_schedule.template_type IS 'Type of follow-up template: light, direct, urgent, storm, insurance, repair, homeowner_objection';
COMMENT ON COLUMN public.followup_schedule.reason IS 'Why this follow-up was scheduled: no_reply_X_days, warm_reply, hot_lead, storm_indicator, insurance_indicator, etc.';

-- ============================================================================
-- 2. CREATE followup_templates TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.followup_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Template identification
  template_type text NOT NULL CHECK (template_type IN (
    'light', 'direct', 'urgent', 'storm', 'insurance', 'repair', 'homeowner_objection'
  )),
  name text NOT NULL,
  
  -- Content
  subject text NOT NULL,
  body text NOT NULL,
  
  -- Metadata
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One default template per type per workspace
  UNIQUE(workspace_id, template_type) WHERE is_default = true
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_followup_templates_workspace_type 
  ON public.followup_templates(workspace_id, template_type) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_followup_templates_type 
  ON public.followup_templates(template_type) 
  WHERE is_default = true AND is_active = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_followup_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_followup_templates_updated_at ON public.followup_templates;
CREATE TRIGGER trg_set_followup_templates_updated_at
BEFORE UPDATE ON public.followup_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_followup_templates_updated_at();

-- RLS Policies
ALTER TABLE public.followup_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'followup_templates'
      AND policyname = 'Users can view templates for their workspace'
  ) THEN
    CREATE POLICY "Users can view templates for their workspace"
      ON public.followup_templates
      FOR SELECT
      USING (
        workspace_id IS NULL OR workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'followup_templates'
      AND policyname = 'Service role can manage templates'
  ) THEN
    CREATE POLICY "Service role can manage templates"
      ON public.followup_templates
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- 3. INSERT DEFAULT FOLLOW-UP TEMPLATES
-- ============================================================================

-- Insert default templates (workspace_id = NULL means global defaults)
INSERT INTO public.followup_templates (workspace_id, template_type, name, subject, body, is_default, is_active)
VALUES
  -- Follow-Up 1 (Light)
  (NULL, 'light', 'Follow-Up 1 (Light)', 'Quick check-in', 
   'Hey {{first_name}}, circling back real quick — want me to take a look at the roof?', 
   true, true),
  
  -- Follow-Up 2 (Direct)
  (NULL, 'direct', 'Follow-Up 2 (Direct)', 'Still interested?', 
   'Still want me to check your roof or should I close this out?', 
   true, true),
  
  -- Follow-Up 3 (Urgent)
  (NULL, 'urgent', 'Follow-Up 3 (Urgent)', 'Last follow-up', 
   'Last follow-up from me — want me to stop by this week?', 
   true, true),
  
  -- Follow-Up 4 (Storm)
  (NULL, 'storm', 'Follow-Up 4 (Storm)', 'Storm damage check', 
   'With the recent storm in {{city}}, any damage you want checked?', 
   true, true),
  
  -- Follow-Up 5 (Insurance)
  (NULL, 'insurance', 'Follow-Up 5 (Insurance)', 'Insurance claim help', 
   'If you''re doing a claim, I can check the roof before the adjuster comes by.', 
   true, true),
  
  -- Follow-Up 6 (Repair)
  (NULL, 'repair', 'Follow-Up 6 (Repair)', 'Repair check', 
   'Any leaking or missing shingles since we last talked?', 
   true, true),
  
  -- Follow-Up 7 (Homeowner Objection)
  (NULL, 'homeowner_objection', 'Follow-Up 7 (Homeowner Objection)', 'No pressure', 
   'No worries—happy to help whenever you''re ready.', 
   true, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. FUNCTION: Calculate Next Follow-Up Date (Dynamic Timing Engine)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_next_followup_date(
  p_contact_id uuid,
  p_lead_score integer DEFAULT NULL,
  p_message_intelligence jsonb DEFAULT '{}'::jsonb,
  p_last_message_at timestamptz DEFAULT NULL,
  p_current_step integer DEFAULT 1
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_base_date timestamptz;
  v_days_to_add integer;
  v_lead_score integer;
  v_has_storm_indicator boolean;
  v_has_insurance_indicator boolean;
  v_categories jsonb;
BEGIN
  -- Use current time if no last message
  v_base_date := COALESCE(p_last_message_at, now());
  
  -- Get lead score if not provided
  IF p_lead_score IS NULL THEN
    SELECT COALESCE(lead_score, 0) INTO v_lead_score
    FROM public.contacts
    WHERE id = p_contact_id;
  ELSE
    v_lead_score := p_lead_score;
  END IF;
  
  -- Extract message intelligence categories
  v_categories := COALESCE(p_message_intelligence->'categories', '[]'::jsonb);
  v_has_storm_indicator := (
    v_categories ? 'storm_damage' OR
    EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_categories) WHERE value = 'storm_damage')
  );
  v_has_insurance_indicator := (
    v_categories ? 'insurance_interest' OR
    EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_categories) WHERE value = 'insurance_interest')
  );
  
  -- =========================================================
  -- DYNAMIC TIMING RULES BASED ON LEAD STATUS
  -- =========================================================
  
  -- HOT leads (70+): Fast sequence
  IF v_lead_score >= 70 THEN
    CASE p_current_step
      WHEN 1 THEN v_days_to_add := 1;  -- Next day
      WHEN 2 THEN v_days_to_add := 2;  -- Then 2 days later
      WHEN 3 THEN v_days_to_add := 3;  -- Then 3 days
      WHEN 4 THEN v_days_to_add := 5;  -- Then 5 days
      ELSE v_days_to_add := 7; -- Default for steps beyond 4
    END CASE;
  
  -- WARM leads (30-69): Moderate sequence
  ELSIF v_lead_score >= 30 THEN
    CASE p_current_step
      WHEN 1 THEN v_days_to_add := 3;  -- After 3 days
      WHEN 2 THEN v_days_to_add := 5;  -- Then 5 days
      WHEN 3 THEN v_days_to_add := 7;  -- Then 7 days
      ELSE v_days_to_add := 10; -- Default for steps beyond 3
    END CASE;
  
  -- COLD leads (0-29): Slow sequence
  ELSE
    CASE p_current_step
      WHEN 1 THEN v_days_to_add := 5;  -- After 5 days
      WHEN 2 THEN v_days_to_add := 10; -- Then 10 days
      ELSE v_days_to_add := 14; -- Default for steps beyond 2
    END CASE;
  END IF;
  
  -- =========================================================
  -- PRIORITY OVERRIDES: Insurance & Storm Leads
  -- =========================================================
  
  -- Insurance Leads: High urgency
  IF v_has_insurance_indicator THEN
    CASE p_current_step
      WHEN 1 THEN v_days_to_add := 1;  -- Tomorrow
      WHEN 2 THEN v_days_to_add := 2;  -- Then 2 days
      WHEN 3 THEN v_days_to_add := 4;  -- Then 4 days
      ELSE v_days_to_add := 7;
    END CASE;
  END IF;
  
  -- Storm Damage Leads: Fast response needed
  IF v_has_storm_indicator THEN
    CASE p_current_step
      WHEN 1 THEN v_days_to_add := 1;  -- 24-48 hours
      WHEN 2 THEN v_days_to_add := 3;  -- Then 3 days
      WHEN 3 THEN v_days_to_add := 5;  -- Then 5 days
      ELSE v_days_to_add := 7;
    END CASE;
  END IF;
  
  RETURN v_base_date + (v_days_to_add || ' days')::interval;
END;
$$;

COMMENT ON FUNCTION public.calculate_next_followup_date IS 'Calculates next follow-up date based on lead score, message intelligence, and step number (Block 14500)';

-- ============================================================================
-- 5. FUNCTION: Determine Follow-Up Template Type & Tone
-- ============================================================================

CREATE OR REPLACE FUNCTION public.determine_followup_template(
  p_contact_id uuid,
  p_lead_score integer DEFAULT NULL,
  p_message_intelligence jsonb DEFAULT '{}'::jsonb,
  p_current_step integer DEFAULT 1,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_template_type text;
  v_tone text;
  v_lead_score integer;
  v_categories jsonb;
  v_has_storm boolean;
  v_has_insurance boolean;
  v_has_repair boolean;
BEGIN
  -- Get lead score if not provided
  IF p_lead_score IS NULL THEN
    SELECT COALESCE(lead_score, 0) INTO v_lead_score
    FROM public.contacts
    WHERE id = p_contact_id;
  ELSE
    v_lead_score := p_lead_score;
  END IF;
  
  -- Extract message intelligence
  v_categories := COALESCE(p_message_intelligence->'categories', '[]'::jsonb);
  v_has_storm := (
    v_categories ? 'storm_damage' OR
    EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_categories) WHERE value = 'storm_damage')
  );
  v_has_insurance := (
    v_categories ? 'insurance_interest' OR
    EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_categories) WHERE value = 'insurance_interest')
  );
  v_has_repair := (
    v_categories ? 'leak_repair' OR
    EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_categories) WHERE value = 'leak_repair')
  );
  
  -- =========================================================
  -- TEMPLATE SELECTION LOGIC
  -- =========================================================
  
  -- Priority: Storm > Insurance > Repair > Step-based > Score-based
  
  IF v_has_storm THEN
    v_template_type := 'storm';
    v_tone := 'storm';
  ELSIF v_has_insurance THEN
    v_template_type := 'insurance';
    v_tone := 'insurance';
  ELSIF v_has_repair THEN
    v_template_type := 'repair';
    v_tone := 'friendly';
  ELSIF p_reason LIKE '%not_interested%' OR p_reason LIKE '%objection%' THEN
    v_template_type := 'homeowner_objection';
    v_tone := 'soft';
  ELSIF p_current_step = 1 THEN
    v_template_type := 'light';
    v_tone := CASE 
      WHEN v_lead_score >= 70 THEN 'urgent'
      WHEN v_lead_score >= 30 THEN 'friendly'
      ELSE 'soft'
    END;
  ELSIF p_current_step = 2 THEN
    v_template_type := 'direct';
    v_tone := CASE 
      WHEN v_lead_score >= 70 THEN 'urgent'
      ELSE 'friendly'
    END;
  ELSIF p_current_step >= 3 THEN
    v_template_type := 'urgent';
    v_tone := 'urgent';
  ELSE
    -- Default fallback
    v_template_type := 'light';
    v_tone := 'friendly';
  END IF;
  
  RETURN jsonb_build_object(
    'template_type', v_template_type,
    'tone', v_tone
  );
END;
$$;

COMMENT ON FUNCTION public.determine_followup_template IS 'Determines which template type and tone to use based on lead score, message intelligence, and step number (Block 14500)';

-- ============================================================================
-- 6. FUNCTION: Check Safe-Stop Conditions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.should_stop_followups(
  p_contact_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_contact_record record;
  v_has_recent_reply boolean;
  v_is_suppressed boolean;
  v_is_unsubscribed boolean;
  v_has_bounce boolean;
  v_has_complaint boolean;
BEGIN
  -- Get contact info
  SELECT 
    id,
    lead_score,
    lead_status,
    pipeline_stage
  INTO v_contact_record
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN true; -- Contact doesn't exist, stop
  END IF;
  
  -- Check if status moved to HOT (should stop auto-follow-ups, roofer should handle)
  IF v_contact_record.lead_status = 'hot' OR v_contact_record.pipeline_stage = 'HOT' THEN
    RETURN true;
  END IF;
  
  -- Check if status moved to NOT INTERESTED
  IF v_contact_record.lead_status = 'not_interested' OR 
     v_contact_record.pipeline_stage = 'NOT INTERESTED' THEN
    RETURN true;
  END IF;
  
  -- Check for recent reply (within last 24 hours)
  SELECT EXISTS (
    SELECT 1 FROM public.inbox_messages
    WHERE contact_id = p_contact_id
      AND direction = 'in'
      AND received_at > now() - interval '24 hours'
  ) INTO v_has_recent_reply;
  
  IF v_has_recent_reply THEN
    RETURN true; -- Homeowner replied, stop auto-follow-ups
  END IF;
  
  -- Check if suppressed
  SELECT EXISTS (
    SELECT 1 FROM public.suppressions
    WHERE email = (SELECT email FROM public.contacts WHERE id = p_contact_id)
      AND workspace_id = (SELECT workspace_id FROM public.contacts WHERE id = p_contact_id)
  ) INTO v_is_suppressed;
  
  IF v_is_suppressed THEN
    RETURN true;
  END IF;
  
  -- Check if unsubscribed
  SELECT EXISTS (
    SELECT 1 FROM public.unsubscribes
    WHERE email = (SELECT email FROM public.contacts WHERE id = p_contact_id)
      AND workspace_id = (SELECT workspace_id FROM public.contacts WHERE id = p_contact_id)
  ) INTO v_is_unsubscribed;
  
  IF v_is_unsubscribed THEN
    RETURN true;
  END IF;
  
  -- Check for bounce (if bounce tracking exists)
  -- This is a placeholder - adjust based on your bounce tracking table
  -- SELECT EXISTS (...) INTO v_has_bounce;
  
  -- Check for complaint (if complaint tracking exists)
  -- This is a placeholder - adjust based on your complaint tracking table
  -- SELECT EXISTS (...) INTO v_has_complaint;
  
  RETURN false; -- Safe to continue follow-ups
END;
$$;

COMMENT ON FUNCTION public.should_stop_followups IS 'Checks if follow-ups should stop based on safe-stop conditions (Block 14500)';

-- ============================================================================
-- 7. FUNCTION: Calculate Next Follow-Up (Main Sequencer Logic)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_next_followup(
  p_contact_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_record record;
  v_workspace_id uuid;
  v_lead_score integer;
  v_message_intelligence jsonb;
  v_last_message_at timestamptz;
  v_current_step integer;
  v_next_followup_at timestamptz;
  v_template_info jsonb;
  v_template_id uuid;
  v_reason text;
  v_result jsonb;
BEGIN
  -- Get contact info
  SELECT 
    id,
    workspace_id,
    lead_score,
    lead_status,
    pipeline_stage,
    tags
  INTO v_contact_record
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Contact not found');
  END IF;
  
  v_workspace_id := v_contact_record.workspace_id;
  v_lead_score := COALESCE(v_contact_record.lead_score, 0);
  
  -- Check safe-stop conditions
  IF public.should_stop_followups(p_contact_id) THEN
    RETURN jsonb_build_object(
      'should_schedule', false,
      'reason', 'safe_stop_condition_met'
    );
  END IF;
  
  -- Get latest message intelligence
  SELECT 
    categories,
    detection_results
  INTO v_message_intelligence
  FROM public.message_insights
  WHERE contact_id = p_contact_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_message_intelligence IS NULL THEN
    v_message_intelligence := '{}'::jsonb;
  ELSE
    v_message_intelligence := jsonb_build_object(
      'categories', v_message_intelligence->'categories',
      'detection_results', v_message_intelligence->'detection_results'
    );
  END IF;
  
  -- Get last message timestamp
  SELECT MAX(received_at)
  INTO v_last_message_at
  FROM public.inbox_messages
  WHERE contact_id = p_contact_id
    AND direction = 'in';
  
  -- Get current step (from existing schedule or default to 1)
  SELECT followup_step + 1
  INTO v_current_step
  FROM public.followup_schedule
  WHERE contact_id = p_contact_id
    AND status = 'sent'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_current_step IS NULL THEN
    v_current_step := 1;
  END IF;
  
  -- Determine reason for follow-up
  IF v_last_message_at IS NULL THEN
    v_reason := 'no_reply_initial';
  ELSIF now() - v_last_message_at > interval '2 days' THEN
    v_reason := 'no_reply_2_days';
  ELSIF v_message_intelligence->'categories' ? 'price_interest' OR
        v_message_intelligence->'categories' ? 'availability_question' THEN
    v_reason := 'warm_reply';
  ELSIF v_lead_score >= 70 THEN
    v_reason := 'hot_lead';
  ELSIF v_message_intelligence->'categories' ? 'storm_damage' THEN
    v_reason := 'storm_indicator';
  ELSIF v_message_intelligence->'categories' ? 'insurance_interest' THEN
    v_reason := 'insurance_indicator';
  ELSE
    v_reason := 'routine_followup';
  END IF;
  
  -- Calculate next follow-up date
  v_next_followup_at := public.calculate_next_followup_date(
    p_contact_id,
    v_lead_score,
    v_message_intelligence,
    v_last_message_at,
    v_current_step
  );
  
  -- Determine template type and tone
  v_template_info := public.determine_followup_template(
    p_contact_id,
    v_lead_score,
    v_message_intelligence,
    v_current_step,
    v_reason
  );
  
  -- Get template ID
  SELECT id INTO v_template_id
  FROM public.followup_templates
  WHERE template_type = v_template_info->>'template_type'
    AND (workspace_id = v_workspace_id OR (workspace_id IS NULL AND is_default = true))
    AND is_active = true
  ORDER BY workspace_id NULLS LAST, is_default DESC
  LIMIT 1;
  
  -- Build result
  v_result := jsonb_build_object(
    'should_schedule', true,
    'contact_id', p_contact_id,
    'workspace_id', v_workspace_id,
    'next_followup_at', v_next_followup_at,
    'followup_step', v_current_step,
    'template_id', v_template_id,
    'template_type', v_template_info->>'template_type',
    'tone', v_template_info->>'tone',
    'reason', v_reason,
    'lead_score', v_lead_score,
    'message_intelligence', v_message_intelligence
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calculate_next_followup IS 'Main sequencer function that calculates next follow-up for a contact (Block 14500)';

-- ============================================================================
-- 8. FUNCTION: Schedule Follow-Up
-- ============================================================================

CREATE OR REPLACE FUNCTION public.schedule_followup(
  p_contact_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_calculation jsonb;
  v_schedule_id uuid;
BEGIN
  -- Calculate next follow-up
  v_calculation := public.calculate_next_followup(p_contact_id);
  
  IF NOT (v_calculation->>'should_schedule')::boolean THEN
    RAISE EXCEPTION 'Follow-up should not be scheduled: %', v_calculation->>'reason';
  END IF;
  
  -- Cancel any existing pending follow-ups for this contact
  UPDATE public.followup_schedule
  SET status = 'cancelled'
  WHERE contact_id = p_contact_id
    AND status = 'pending';
  
  -- Insert new schedule
  INSERT INTO public.followup_schedule (
    contact_id,
    workspace_id,
    next_followup_at,
    followup_step,
    template_id,
    template_type,
    tone,
    reason,
    lead_score,
    message_intelligence,
    status
  ) VALUES (
    p_contact_id,
    (v_calculation->>'workspace_id')::uuid,
    (v_calculation->>'next_followup_at')::timestamptz,
    (v_calculation->>'followup_step')::integer,
    (v_calculation->>'template_id')::uuid,
    v_calculation->>'template_type',
    v_calculation->>'tone',
    v_calculation->>'reason',
    (v_calculation->>'lead_score')::integer,
    v_calculation->'message_intelligence',
    'pending'
  )
  RETURNING id INTO v_schedule_id;
  
  RETURN v_schedule_id;
END;
$$;

COMMENT ON FUNCTION public.schedule_followup IS 'Schedules a follow-up for a contact (Block 14500)';

-- ============================================================================
-- 9. FUNCTION: Send Follow-Up (Process Due Follow-Ups)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.send_followup(
  p_schedule_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_schedule_record record;
  v_template_record record;
  v_contact_record record;
  v_result jsonb;
BEGIN
  -- Get schedule record
  SELECT * INTO v_schedule_record
  FROM public.followup_schedule
  WHERE id = p_schedule_id
    AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Schedule not found or not pending');
  END IF;
  
  -- Check safe-stop conditions again (double-check before sending)
  IF public.should_stop_followups(v_schedule_record.contact_id) THEN
    UPDATE public.followup_schedule
    SET status = 'stopped'
    WHERE id = p_schedule_id;
    
    RETURN jsonb_build_object(
      'sent', false,
      'reason', 'safe_stop_condition_met'
    );
  END IF;
  
  -- Get template
  SELECT * INTO v_template_record
  FROM public.followup_templates
  WHERE id = v_schedule_record.template_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Template not found');
  END IF;
  
  -- Get contact info
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = v_schedule_record.contact_id;
  
  -- TODO: Actually send the email via your email sending service
  -- This is a placeholder - integrate with your email sending infrastructure
  -- Recommended approach:
  -- 1. Replace template variables ({{first_name}}, {{city}}, etc.) in subject and body
  -- 2. Call your email sending service (e.g., Resend, SMTP, Gmail API, etc.)
  -- 3. Log the sent email in your email_messages or inbox_messages table
  -- 4. Handle errors appropriately (mark as failed, retry, etc.)
  -- 
  -- Example integration points:
  -- - src/lib/mailer.ts (sendMail function)
  -- - src/server/email.ts (sendEmail function)
  -- - src/app/api/send/route.ts (POST endpoint)
  -- 
  -- For now, we'll just mark it as sent (you should implement actual sending)
  
  -- Mark as sent
  UPDATE public.followup_schedule
  SET 
    status = 'sent',
    updated_at = now()
  WHERE id = p_schedule_id;
  
  -- Schedule next follow-up if needed
  -- (This will be handled by the sequencer on next run)
  
  RETURN jsonb_build_object(
    'sent', true,
    'schedule_id', p_schedule_id,
    'contact_id', v_schedule_record.contact_id,
    'template_type', v_schedule_record.template_type
  );
END;
$$;

COMMENT ON FUNCTION public.send_followup IS 'Sends a scheduled follow-up email (Block 14500)';

-- ============================================================================
-- 10. FUNCTION: Run Behavior Sequencer (Process All Due Follow-Ups)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_behavior_sequencer()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_due_schedules record;
  v_sent_count integer := 0;
  v_stopped_count integer := 0;
  v_error_count integer := 0;
  v_result jsonb;
BEGIN
  -- Find all due follow-ups
  FOR v_due_schedules IN
    SELECT id, contact_id
    FROM public.followup_schedule
    WHERE status = 'pending'
      AND next_followup_at <= now()
    ORDER BY next_followup_at ASC
    LIMIT 100 -- Process in batches
  LOOP
    BEGIN
      -- Try to send follow-up
      PERFORM public.send_followup(v_due_schedules.id);
      v_sent_count := v_sent_count + 1;
      
      -- Schedule next follow-up for this contact
      BEGIN
        PERFORM public.schedule_followup(v_due_schedules.contact_id);
      EXCEPTION WHEN OTHERS THEN
        -- Next follow-up might not be needed (safe-stop condition), that's OK
        NULL;
      END;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue processing
      v_error_count := v_error_count + 1;
      
      -- Mark as stopped if it's a safe-stop condition
      IF SQLERRM LIKE '%safe_stop%' THEN
        UPDATE public.followup_schedule
        SET status = 'stopped'
        WHERE id = v_due_schedules.id;
        v_stopped_count := v_stopped_count + 1;
      END IF;
    END;
  END LOOP;
  
  v_result := jsonb_build_object(
    'sent', v_sent_count,
    'stopped', v_stopped_count,
    'errors', v_error_count,
    'processed_at', now()
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.run_behavior_sequencer IS 'Runs the behavior sequencer to process all due follow-ups (Block 14500)';

-- ============================================================================
-- 11. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.followup_schedule TO authenticated;
GRANT SELECT ON public.followup_templates TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_next_followup_date(uuid, integer, jsonb, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.determine_followup_template(uuid, integer, jsonb, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.should_stop_followups(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_next_followup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_followup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_followup(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_behavior_sequencer() TO service_role;

