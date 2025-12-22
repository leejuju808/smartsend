-- Block 10600 — Multi-Step Follow-Up Engine (Automatic Behavioral Sequences for Replies & No-Response)
-- Creates follow-up rules and events tables, plus engine functions

-- 1. Create follow_up_rules table
CREATE TABLE IF NOT EXISTS public.follow_up_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, -- organization ID
  
  -- Trigger configuration
  trigger_type text NOT NULL CHECK (trigger_type IN ('no_reply', 'warm_intent', 'hot_intent', 'reply_then_silent')),
  condition_days int, -- days to wait before triggering (e.g., 3 for "no reply after 3 days")
  step_id uuid, -- optional: specific sequence step to reference
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL, -- optional: campaign-specific rule
  
  -- Action configuration
  action_type text NOT NULL CHECK (action_type IN ('send_email_step', 'create_task', 'add_tag', 'stop_sequence')),
  action_value text, -- e.g., step ID for email, tag name, task title
  
  -- Timing
  delay_hours int DEFAULT 0, -- hours to wait before executing action
  
  -- Metadata
  active boolean DEFAULT true,
  name text, -- human-readable rule name
  description text, -- optional description
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_follow_up_rules_org_active ON public.follow_up_rules(org_id, active);
CREATE INDEX IF NOT EXISTS idx_follow_up_rules_trigger ON public.follow_up_rules(trigger_type, active);
CREATE INDEX IF NOT EXISTS idx_follow_up_rules_campaign ON public.follow_up_rules(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_follow_up_rules_step ON public.follow_up_rules(step_id) WHERE step_id IS NOT NULL;

-- 3. Create follow_up_events table (logs rule executions to prevent duplicates)
CREATE TABLE IF NOT EXISTS public.follow_up_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.follow_up_rules(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  reply_thread_id uuid REFERENCES public.reply_threads(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Execution details
  action_type text NOT NULL,
  action_value text,
  executed_at timestamptz DEFAULT now(),
  
  -- Result tracking
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message text,
  result_data jsonb DEFAULT '{}'::jsonb -- e.g., task_id, email_id, etc.
);

-- 4. Create indexes for follow_up_events
CREATE INDEX IF NOT EXISTS idx_follow_up_events_rule ON public.follow_up_events(rule_id, contact_id, reply_thread_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_events_org ON public.follow_up_events(org_id, executed_at);
CREATE INDEX IF NOT EXISTS idx_follow_up_events_contact ON public.follow_up_events(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_follow_up_events_thread ON public.follow_up_events(reply_thread_id) WHERE reply_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_follow_up_events_status ON public.follow_up_events(status, executed_at);

-- Unique constraint: prevent duplicate rule executions per contact/thread
CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_up_events_unique 
  ON public.follow_up_events(rule_id, COALESCE(contact_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(reply_thread_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 5. Create updated_at trigger for follow_up_rules
CREATE OR REPLACE FUNCTION public.set_follow_up_rules_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_up_rules_updated_at ON public.follow_up_rules;
CREATE TRIGGER trg_follow_up_rules_updated_at
BEFORE UPDATE ON public.follow_up_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_follow_up_rules_updated_at();

-- 6. Enable RLS
ALTER TABLE public.follow_up_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_events ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for follow_up_rules
CREATE POLICY "users_see_org_rules"
ON public.follow_up_rules
FOR SELECT
USING (
  org_id IN (
    SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    UNION
    SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid() AND (status IS NULL OR status = 'active')
  )
);

CREATE POLICY "users_manage_org_rules"
ON public.follow_up_rules
FOR ALL
USING (
  org_id IN (
    SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    UNION
    SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid() AND (status IS NULL OR status = 'active')
  )
)
WITH CHECK (
  org_id IN (
    SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    UNION
    SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid() AND (status IS NULL OR status = 'active')
  )
);

-- Service role can manage rules (for CRON execution)
CREATE POLICY "service_role_manage_rules"
ON public.follow_up_rules
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 8. RLS Policies for follow_up_events
CREATE POLICY "users_see_org_events"
ON public.follow_up_events
FOR SELECT
USING (
  org_id IN (
    SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
    UNION
    SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid() AND (status IS NULL OR status = 'active')
  )
);

-- Service role can manage events (for CRON execution)
CREATE POLICY "service_role_manage_events"
ON public.follow_up_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 9. Helper function: Get last send time for a contact/campaign
CREATE OR REPLACE FUNCTION public.get_last_send_time(
  p_contact_id uuid,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_last_send timestamptz;
BEGIN
  -- Check campaign_sends table (uses lead_id)
  SELECT MAX(sent_at) INTO v_last_send
  FROM public.campaign_sends
  WHERE lead_id = p_contact_id
    AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    AND sent_at IS NOT NULL;
  
  -- If no campaign_sends, check send_logs (may use contact_id or lead_id)
  IF v_last_send IS NULL THEN
    SELECT MAX(created_at) INTO v_last_send
    FROM public.send_logs
    WHERE (contact_id = p_contact_id OR lead_id = p_contact_id)
      AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
      AND status = 'sent';
  END IF;
  
  RETURN v_last_send;
END;
$$;

-- 10. Helper function: Get last reply time for a contact/campaign
CREATE OR REPLACE FUNCTION public.get_last_reply_time(
  p_contact_id uuid,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_last_reply timestamptz;
BEGIN
  SELECT MAX(last_message_at) INTO v_last_reply
  FROM public.reply_threads
  WHERE (contact_id = p_contact_id OR lead_id = p_contact_id)
    AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    AND last_message_at IS NOT NULL;
  
  RETURN v_last_reply;
END;
$$;

-- 11. Main engine function: Execute follow-up rules
CREATE OR REPLACE FUNCTION public.execute_follow_up_engine()
RETURNS TABLE(
  rule_id uuid,
  contact_id uuid,
  action_type text,
  status text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule RECORD;
  v_contact RECORD;
  v_event_id uuid;
  v_task_id uuid;
  v_org_id uuid;
  v_assigned_to uuid;
  v_last_send timestamptz;
  v_last_reply timestamptz;
  v_thread_id uuid;
  v_intent text;
  v_should_execute boolean;
BEGIN
  -- Loop through all active rules
  FOR v_rule IN
    SELECT * FROM public.follow_up_rules
    WHERE active = true
    ORDER BY org_id, trigger_type
  LOOP
    -- Process NO_REPLY trigger
    IF v_rule.trigger_type = 'no_reply' THEN
      FOR v_contact IN
        SELECT DISTINCT
          COALESCE(c.id, l.id) as contact_id,
          COALESCE(c.org_id, c.workspace_id::uuid, l.user_id) as org_id,
          se.campaign_id,
          se.id as enrollment_id,
          l.id as lead_id
        FROM public.sequence_enrollments se
        LEFT JOIN public.contacts c ON c.id = se.lead_id OR (se.contact_id IS NOT NULL AND c.id = se.contact_id)
        LEFT JOIN public.leads l ON l.id = se.lead_id
        WHERE se.org_id = v_rule.org_id
          AND (v_rule.campaign_id IS NULL OR se.campaign_id = v_rule.campaign_id)
          AND se.status = 'active'
          AND (c.id IS NOT NULL OR l.id IS NOT NULL)
          -- Check if rule already executed for this contact/lead
          AND NOT EXISTS (
            SELECT 1 FROM public.follow_up_events
            WHERE rule_id = v_rule.id
              AND (contact_id = COALESCE(c.id, l.id) OR contact_id IS NULL)
              AND status IN ('completed', 'pending')
          )
      LOOP
        -- Get last send time (check both contact_id and lead_id)
        v_last_send := public.get_last_send_time(v_contact.contact_id, v_contact.campaign_id);
        
        -- Get last reply time
        v_last_reply := public.get_last_reply_time(v_contact.contact_id, v_contact.campaign_id);
        
        -- Check condition: no reply AND enough days have passed since last send
        IF v_last_reply IS NULL AND v_last_send IS NOT NULL THEN
          IF v_last_send < now() - (COALESCE(v_rule.condition_days, 3))::interval THEN
            v_should_execute := true;
          ELSE
            v_should_execute := false;
          END IF;
        ELSE
          v_should_execute := false;
        END IF;
        
        IF v_should_execute THEN
          -- Execute action
          PERFORM public.execute_follow_up_action(
            v_rule.id,
            v_contact.org_id,
            v_contact.contact_id,
            NULL, -- reply_thread_id
            v_contact.campaign_id,
            v_rule.action_type,
            v_rule.action_value,
            v_rule.delay_hours
          );
          
          RETURN QUERY SELECT v_rule.id, v_contact.contact_id, v_rule.action_type, 'executed'::text, 'No reply rule executed'::text;
        END IF;
      END LOOP;
    
    -- Process WARM_INTENT trigger
    ELSIF v_rule.trigger_type = 'warm_intent' THEN
      FOR v_contact IN
        SELECT DISTINCT
          rt.contact_id,
          rt.id as thread_id,
          rt.campaign_id,
          rt.workspace_id as org_id,
          rt.account_id
        FROM public.reply_threads rt
        WHERE rt.latest_intent = 'warm'
          AND rt.workspace_id = v_rule.org_id
          AND (v_rule.campaign_id IS NULL OR rt.campaign_id = v_rule.campaign_id)
          -- Check if rule already executed for this thread
          AND NOT EXISTS (
            SELECT 1 FROM public.follow_up_events
            WHERE rule_id = v_rule.id
              AND reply_thread_id = rt.id
              AND status IN ('completed', 'pending')
          )
      LOOP
        -- Execute action immediately (warm intent is detected)
        PERFORM public.execute_follow_up_action(
          v_rule.id,
          COALESCE(v_contact.org_id, v_contact.account_id),
          v_contact.contact_id,
          v_contact.thread_id,
          v_contact.campaign_id,
          v_rule.action_type,
          v_rule.action_value,
          v_rule.delay_hours
        );
        
        RETURN QUERY SELECT v_rule.id, v_contact.contact_id, v_rule.action_type, 'executed'::text, 'Warm intent rule executed'::text;
      END LOOP;
    
    -- Process HOT_INTENT trigger
    ELSIF v_rule.trigger_type = 'hot_intent' THEN
      FOR v_contact IN
        SELECT DISTINCT
          rt.contact_id,
          rt.id as thread_id,
          rt.campaign_id,
          rt.workspace_id as org_id,
          rt.account_id
        FROM public.reply_threads rt
        WHERE rt.latest_intent = 'hot'
          AND rt.workspace_id = v_rule.org_id
          AND (v_rule.campaign_id IS NULL OR rt.campaign_id = v_rule.campaign_id)
          -- Check if rule already executed for this thread
          AND NOT EXISTS (
            SELECT 1 FROM public.follow_up_events
            WHERE rule_id = v_rule.id
              AND reply_thread_id = rt.id
              AND status IN ('completed', 'pending')
          )
      LOOP
        -- Execute action immediately (hot intent is detected)
        PERFORM public.execute_follow_up_action(
          v_rule.id,
          COALESCE(v_contact.org_id, v_contact.account_id),
          v_contact.contact_id,
          v_contact.thread_id,
          v_contact.campaign_id,
          v_rule.action_type,
          v_rule.action_value,
          v_rule.delay_hours
        );
        
        RETURN QUERY SELECT v_rule.id, v_contact.contact_id, v_rule.action_type, 'executed'::text, 'Hot intent rule executed'::text;
      END LOOP;
    
    -- Process REPLY_THEN_SILENT trigger
    ELSIF v_rule.trigger_type = 'reply_then_silent' THEN
      FOR v_contact IN
        SELECT DISTINCT
          rt.contact_id,
          rt.id as thread_id,
          rt.campaign_id,
          rt.workspace_id as org_id,
          rt.account_id,
          rt.last_message_at
        FROM public.reply_threads rt
        WHERE rt.workspace_id = v_rule.org_id
          AND (v_rule.campaign_id IS NULL OR rt.campaign_id = v_rule.campaign_id)
          AND rt.last_message_at IS NOT NULL
          AND rt.last_message_at < now() - (v_rule.condition_days || 3)::interval
          -- Check if rule already executed for this thread
          AND NOT EXISTS (
            SELECT 1 FROM public.follow_up_events
            WHERE rule_id = v_rule.id
              AND reply_thread_id = rt.id
              AND status IN ('completed', 'pending')
          )
      LOOP
        -- Execute action
        PERFORM public.execute_follow_up_action(
          v_rule.id,
          COALESCE(v_contact.org_id, v_contact.account_id),
          v_contact.contact_id,
          v_contact.thread_id,
          v_contact.campaign_id,
          v_rule.action_type,
          v_rule.action_value,
          v_rule.delay_hours
        );
        
        RETURN QUERY SELECT v_rule.id, v_contact.contact_id, v_rule.action_type, 'executed'::text, 'Reply then silent rule executed'::text;
      END LOOP;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$;

-- 12. Action execution function
CREATE OR REPLACE FUNCTION public.execute_follow_up_action(
  p_rule_id uuid,
  p_org_id uuid,
  p_contact_id uuid,
  p_reply_thread_id uuid,
  p_campaign_id uuid,
  p_action_type text,
  p_action_value text,
  p_delay_hours int DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_task_id uuid;
  v_assigned_to uuid;
  v_step_id uuid;
  v_email_sent boolean := false;
BEGIN
  -- Create event record
  INSERT INTO public.follow_up_events (
    rule_id,
    org_id,
    contact_id,
    reply_thread_id,
    campaign_id,
    action_type,
    action_value,
    status
  )
  VALUES (
    p_rule_id,
    p_org_id,
    p_contact_id,
    p_reply_thread_id,
    p_campaign_id,
    p_action_type,
    p_action_value,
    'pending'
  )
  RETURNING id INTO v_event_id;
  
  -- Execute action based on type
  IF p_action_type = 'create_task' THEN
    -- Get assigned_to (contact owner or first org member)
    SELECT user_id INTO v_assigned_to
    FROM public.org_members
    WHERE org_id = p_org_id
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF v_assigned_to IS NULL THEN
      SELECT user_id INTO v_assigned_to
      FROM public.org_memberships
      WHERE org_id = p_org_id
      AND (status IS NULL OR status = 'active')
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
    
    -- Create task
    INSERT INTO public.tasks (
      org_id,
      contact_id,
      reply_thread_id,
      assigned_to,
      title,
      notes,
      due_at,
      auto_generated,
      auto_type,
      created_by
    )
    VALUES (
      p_org_id,
      p_contact_id,
      p_reply_thread_id,
      COALESCE(v_assigned_to, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(p_action_value, 'Follow up with homeowner'),
      format('Auto-generated by follow-up rule %s', p_rule_id),
      now() + (p_delay_hours || 0)::interval,
      true,
      'follow_up_rule',
      NULL
    )
    RETURNING id INTO v_task_id;
    
    -- Update event with task_id
    UPDATE public.follow_up_events
    SET status = 'completed',
        result_data = jsonb_build_object('task_id', v_task_id)
    WHERE id = v_event_id;
    
  ELSIF p_action_type = 'add_tag' THEN
    -- Add tag to contact (if contacts table has tags column)
    -- This is a placeholder - actual implementation depends on your tags system
    UPDATE public.follow_up_events
    SET status = 'completed',
        result_data = jsonb_build_object('tag', p_action_value)
    WHERE id = v_event_id;
    
  ELSIF p_action_type = 'stop_sequence' THEN
    -- Stop sequence enrollment (use 'paused_replied' or update status based on your schema)
    UPDATE public.sequence_enrollments
    SET status = 'paused_replied',
        paused_reason = 'Auto-stopped by follow-up rule'
    WHERE (lead_id = p_contact_id OR (p_contact_id IS NOT NULL AND contact_id = p_contact_id))
      AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
      AND status = 'active';
    
    UPDATE public.follow_up_events
    SET status = 'completed',
        result_data = jsonb_build_object('enrollments_stopped', 1)
    WHERE id = v_event_id;
    
  ELSIF p_action_type = 'send_email_step' THEN
    -- Queue email send (this will be handled by the campaign send system)
    -- For now, mark as pending - actual email sending will be handled by existing send queue
    UPDATE public.follow_up_events
    SET status = 'pending',
        result_data = jsonb_build_object('step_id', p_action_value, 'queued', true)
    WHERE id = v_event_id;
    
    -- Note: Actual email sending should be integrated with your campaign send orchestrator
    -- This is a placeholder that marks the event as queued
  END IF;
  
  RETURN v_event_id;
END;
$$;

-- 13. Comments
COMMENT ON TABLE public.follow_up_rules IS 'Follow-up rules engine - defines when and how to follow up with contacts';
COMMENT ON TABLE public.follow_up_events IS 'Logs of follow-up rule executions to prevent duplicates';
COMMENT ON FUNCTION public.execute_follow_up_engine() IS 'Main engine function - runs every hour via CRON to check and execute follow-up rules';
COMMENT ON FUNCTION public.execute_follow_up_action() IS 'Executes a specific follow-up action (task, tag, email, stop sequence)';

