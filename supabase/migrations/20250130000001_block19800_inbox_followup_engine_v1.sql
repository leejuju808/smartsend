-- =========================================================
-- Block 19800 — Inbox → Follow-Up Engine Integration v1
-- (Behavior-Based Sequences, Reply Triggers, Automatic Re-Engagement, The Start of SmartSend's "Never Lose a Lead" System)
-- =========================================================
--
-- This block creates a system where:
-- - Every reply → triggers follow-up logic
-- - Every "no-response" → triggers re-engagement
-- - Every warm lead → enters a lead-nurture sequence
-- - Every follow-up task → optionally auto-executes
-- - Every hot lead → gets priority fast
--
-- This block turns SmartSend into a never lose a lead machine.
-- =========================================================

-- ============================================================================
-- PART 0 — Schema Enhancements
-- ============================================================================

-- Add thread_id column to tasks_v3 for better inbox integration
ALTER TABLE public.tasks_v3
  ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_v3_thread_id ON public.tasks_v3(thread_id) WHERE thread_id IS NOT NULL;

-- Add direction column to inbox_messages if it doesn't exist (for compatibility)
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS direction text CHECK (direction IN ('inbound', 'outbound', 'in', 'out'));

-- Set default direction for existing messages (inbound = replies from homeowners)
-- This is a best-effort guess - existing messages without direction are assumed inbound
UPDATE public.inbox_messages
SET direction = 'inbound'
WHERE direction IS NULL;

-- ============================================================================
-- PART 1 — Follow-Up Rules Table (Brain of System)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.followup_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'inbox_reply',
    'no_reply_timeout',
    'ai_intent_hot',
    'ai_intent_warm',
    'ai_intent_followup',
    'task_due',
    'task_overdue'
  )),
  inbox_reply boolean DEFAULT false,
  no_reply_timeout integer, -- days (2, 4, 7)
  ai_intent_hot boolean DEFAULT false,
  ai_intent_warm boolean DEFAULT false,
  ai_intent_followup boolean DEFAULT false,
  task_due boolean DEFAULT false,
  task_overdue boolean DEFAULT false,
  conditions jsonb DEFAULT '{}'::jsonb, -- Flexible JSONB for complex conditions
  actions jsonb DEFAULT '[]'::jsonb, -- JSONB array of actions: ['create_task', 'send_nudge', 'highlight_thread', 'activity_feed']
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for followup_rules
CREATE INDEX IF NOT EXISTS idx_followup_rules_trigger_type ON public.followup_rules(trigger_type);
CREATE INDEX IF NOT EXISTS idx_followup_rules_created_at ON public.followup_rules(created_at DESC);

-- Enable RLS
ALTER TABLE public.followup_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only service role can manage rules (system defaults)
DROP POLICY IF EXISTS "followup_rules_service_role" ON public.followup_rules;
CREATE POLICY "followup_rules_service_role"
  ON public.followup_rules
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Insert SmartSend Default Rules (v1 - baked-in, not user-editable yet)
INSERT INTO public.followup_rules (trigger_type, no_reply_timeout, actions, conditions)
VALUES
  -- Trigger 1: No Reply After 2 Days
  ('no_reply_timeout', 2, 
   '["create_task", "activity_feed"]'::jsonb,
   '{"task_title": "Follow-Up Needed - No Reply After 2 Days", "task_priority": "medium", "task_due_hours": 0}'::jsonb
  ),
  -- Trigger 2: No Reply After 4 Days
  ('no_reply_timeout', 4,
   '["create_task", "activity_feed", "send_nudge"]'::jsonb,
   '{"task_title": "Follow-Up Needed - No Reply After 4 Days", "task_priority": "high", "task_due_hours": 0}'::jsonb
  ),
  -- Trigger 3: No Reply After 7 Days
  ('no_reply_timeout', 7,
   '["create_task", "activity_feed", "send_nudge", "highlight_thread"]'::jsonb,
   '{"task_title": "Follow-Up Needed - No Reply After 7 Days", "task_priority": "high", "task_due_hours": 0}'::jsonb
  ),
  -- Trigger 4: Warm Lead → Gentle Nurture
  ('ai_intent_warm', NULL,
   '["create_task_sequence"]'::jsonb,
   '{"sequence_type": "warm_lead_nurture", "task_1_due_hours": 24, "task_2_due_hours": 72, "task_3_due_hours": 240}'::jsonb
  ),
  -- Trigger 5: Follow-Up Required (Owner Must Respond)
  ('ai_intent_followup', NULL,
   '["create_task", "highlight_thread", "send_nudge", "activity_feed"]'::jsonb,
   '{"task_title": "Follow-Up Required - Question Asked", "task_priority": "high", "task_due_hours": 2, "quiet_hour_aware": true}'::jsonb
  ),
  -- Trigger 6: Hot Lead → Immediate Priority
  ('ai_intent_hot', NULL,
   '["create_task", "push_notification", "desktop_ping", "activity_feed", "highlight_thread"]'::jsonb,
   '{"task_title": "🔥 Hot Lead Needs Attention", "task_priority": "critical", "task_due_hours": 1, "move_to_hot_priority": true}'::jsonb
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 2 — Follow-Up Sequences Table (Behavior-Based Sequences)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.followup_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_type text NOT NULL CHECK (sequence_type IN (
    'no_reply_sequence',
    'warm_lead_sequence',
    'hot_lead_rapid_fire'
  )),
  step_number integer NOT NULL,
  step_title text NOT NULL,
  step_description text,
  suggested_action text, -- e.g., "Send pricing or scheduling info", "Call homeowner to re-engage"
  delay_days integer, -- Days after previous step (or start)
  delay_hours integer DEFAULT 0, -- Hours after previous step
  task_type text, -- Maps to task_type_v3
  priority text DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for followup_sequences
CREATE INDEX IF NOT EXISTS idx_followup_sequences_type ON public.followup_sequences(sequence_type, step_number);

-- Insert SmartSend Default Sequences
INSERT INTO public.followup_sequences (sequence_type, step_number, step_title, step_description, suggested_action, delay_days, delay_hours, task_type, priority)
VALUES
  -- Sequence Type 1: No Reply Sequence
  ('no_reply_sequence', 1, 'Step 1 (2 days)', 'Initial follow-up check-in', 'Just checking in — happy to swing by for a quick roof check.', 2, 0, 'lead_no_reply', 'medium'),
  ('no_reply_sequence', 2, 'Step 2 (4 days)', 'Second follow-up', 'Wanted to make sure you didn''t miss my last email.', 4, 0, 'lead_no_reply', 'high'),
  ('no_reply_sequence', 3, 'Step 3 (7 days)', 'Final re-engagement attempt', 'Call homeowner to re-engage.', 7, 0, 'lead_no_reply', 'high'),
  
  -- Sequence Type 2: Warm Lead Sequence
  ('warm_lead_sequence', 1, 'Step 1 (24 hours)', 'Initial warm follow-up', 'Send pricing or scheduling info.', 0, 24, 'pipeline_warm_followup', 'medium'),
  ('warm_lead_sequence', 2, 'Step 2 (3 days)', 'Second warm follow-up', 'Follow up in 2 days.', 3, 0, 'pipeline_warm_followup', 'medium'),
  ('warm_lead_sequence', 3, 'Step 3 (10 days)', 'Final warm follow-up', 'Call if still no response.', 10, 0, 'lead_follow_up', 'high'),
  
  -- Sequence Type 3: Hot Lead "Rapid Fire"
  ('hot_lead_rapid_fire', 1, 'Step 1 (Immediate)', 'Call now', 'Call homeowner immediately.', 0, 0, 'lead_booking_intent', 'critical'),
  ('hot_lead_rapid_fire', 2, 'Step 2 (1 hour)', 'Send estimate', 'Send estimate if call not answered.', 0, 1, 'quote_sent', 'critical'),
  ('hot_lead_rapid_fire', 3, 'Step 3 (2 hours)', 'Appointment prompt', 'Follow up with appointment scheduling.', 0, 2, 'appointment_booked', 'high')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 3 — Follow-Up Timeline Table (Tracking Follow-Up History)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.followup_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  sequence_type text,
  step_number integer,
  task_id uuid REFERENCES public.tasks_v3(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'task_created',
    'sequence_step_started',
    'sequence_step_completed',
    'nudge_sent',
    'reply_received',
    'owner_action_taken'
  )),
  action_description text,
  ai_predicted_next_step text, -- AI suggestion for next action
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for followup_timeline
CREATE INDEX IF NOT EXISTS idx_followup_timeline_thread ON public.followup_timeline(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_timeline_contact ON public.followup_timeline(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_timeline_lead ON public.followup_timeline(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_timeline_action ON public.followup_timeline(action_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.followup_timeline ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view timeline for threads they can access
DROP POLICY IF EXISTS "followup_timeline_select" ON public.followup_timeline;
CREATE POLICY "followup_timeline_select"
  ON public.followup_timeline
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inbox_threads it
      WHERE it.id = followup_timeline.thread_id
        AND public.can_view_campaign(it.campaign_id)
    )
  );

-- ============================================================================
-- PART 4 — Smart Nudges Table (AI-driven Notifications)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.followup_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  nudge_type text NOT NULL CHECK (nudge_type IN (
    'lead_stalled',
    'hot_lead_untouched',
    'followup_task_due',
    'question_unanswered',
    'warm_lead_trending_cold'
  )),
  nudge_message text NOT NULL,
  priority text DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  show_in_activity_feed boolean DEFAULT true,
  send_push_notification boolean DEFAULT false,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for followup_nudges
CREATE INDEX IF NOT EXISTS idx_followup_nudges_workspace ON public.followup_nudges(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_nudges_thread ON public.followup_nudges(thread_id);
CREATE INDEX IF NOT EXISTS idx_followup_nudges_unacknowledged ON public.followup_nudges(workspace_id, acknowledged_at) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_followup_nudges_type ON public.followup_nudges(nudge_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.followup_nudges ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view nudges for their workspace
DROP POLICY IF EXISTS "followup_nudges_select" ON public.followup_nudges;
CREATE POLICY "followup_nudges_select"
  ON public.followup_nudges
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 5 — Follow-Up Priority Score Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_followup_priority_score(
  p_thread_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread RECORD;
  v_message RECORD;
  v_contact RECORD;
  v_lead RECORD;
  v_ai_intent_weight numeric := 0;
  v_overdue_time_multiplier numeric := 0;
  v_job_value_weight numeric := 0;
  v_decay_factor numeric := 0;
  v_hours_since_owner_response numeric;
  v_hours_since_last_message numeric;
  v_total_score numeric := 0;
  v_intent_priority integer;
BEGIN
  -- Get thread details
  SELECT * INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get latest message
  SELECT * INTO v_message
  FROM public.inbox_messages
  WHERE thread_id = p_thread_id
  ORDER BY received_at DESC
  LIMIT 1;
  
  -- Get contact/lead info
  IF v_thread.contact_id IS NOT NULL THEN
    SELECT * INTO v_contact
    FROM public.contacts
    WHERE id = v_thread.contact_id;
  END IF;
  
  IF v_thread.lead_id IS NOT NULL THEN
    SELECT * INTO v_lead
    FROM public.leads
    WHERE id = v_thread.lead_id;
  END IF;
  
  -- 1. AI Intent Weight (0-40 points)
  IF v_thread.ai_overall_intent IS NOT NULL THEN
    CASE v_thread.ai_overall_intent::text
      WHEN 'hot' THEN
        v_ai_intent_weight := 40;
      WHEN 'warm' THEN
        v_ai_intent_weight := 25;
      WHEN 'follow_up' THEN
        v_ai_intent_weight := 30;
      WHEN 'cold' THEN
        v_ai_intent_weight := 10;
      WHEN 'dead' THEN
        v_ai_intent_weight := 0;
      ELSE
        v_ai_intent_weight := 15;
    END CASE;
  END IF;
  
  -- 2. Overdue Time Multiplier (0-30 points)
  -- Calculate hours since last homeowner message
  SELECT EXTRACT(EPOCH FROM (now() - MAX(received_at))) / 3600 INTO v_hours_since_last_message
  FROM public.inbox_messages
  WHERE thread_id = p_thread_id
    AND direction = 'inbound';
  
  IF v_hours_since_last_message IS NOT NULL THEN
    IF v_hours_since_last_message >= 168 THEN -- 7 days
      v_overdue_time_multiplier := 30;
    ELSIF v_hours_since_last_message >= 96 THEN -- 4 days
      v_overdue_time_multiplier := 20;
    ELSIF v_hours_since_last_message >= 48 THEN -- 2 days
      v_overdue_time_multiplier := 15;
    ELSIF v_hours_since_last_message >= 24 THEN -- 1 day
      v_overdue_time_multiplier := 10;
    ELSE
      v_overdue_time_multiplier := 5;
    END IF;
  END IF;
  
  -- 3. Estimated Job Value Weight (0-20 points)
  IF v_contact IS NOT NULL AND v_contact.job_value IS NOT NULL THEN
    v_job_value_weight := LEAST(20, (v_contact.job_value / 10000) * 20);
  ELSIF v_lead IS NOT NULL THEN
    -- Use lead score as proxy for value
    IF v_lead.score IS NOT NULL THEN
      v_job_value_weight := LEAST(20, (v_lead.score::numeric / 100) * 20);
    END IF;
  END IF;
  
  -- 4. Hours Since Owner Last Responded × Decay Factor (0-10 points, subtracted)
  SELECT EXTRACT(EPOCH FROM (now() - MAX(received_at))) / 3600 INTO v_hours_since_owner_response
  FROM public.inbox_messages
  WHERE thread_id = p_thread_id
    AND direction = 'outbound';
  
  IF v_hours_since_owner_response IS NOT NULL THEN
    -- Decay: older owner responses = higher decay (subtract more)
    IF v_hours_since_owner_response >= 72 THEN -- 3+ days
      v_decay_factor := 10;
    ELSIF v_hours_since_owner_response >= 48 THEN -- 2+ days
      v_decay_factor := 7;
    ELSIF v_hours_since_owner_response >= 24 THEN -- 1+ day
      v_decay_factor := 5;
    ELSE
      v_decay_factor := 2;
    END IF;
  END IF;
  
  -- Calculate total score
  v_total_score := 
    v_ai_intent_weight +
    v_overdue_time_multiplier +
    v_job_value_weight -
    v_decay_factor;
  
  -- Ensure score is between 0 and 100
  v_total_score := GREATEST(0, LEAST(100, v_total_score));
  
  RETURN v_total_score;
END;
$$;

-- ============================================================================
-- PART 6 — Core Follow-Up Trigger Functions
-- ============================================================================

-- Function: Trigger 1 — No Reply After X Days
CREATE OR REPLACE FUNCTION public.trigger_no_reply_followup(
  p_thread_id uuid,
  p_days integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread RECORD;
  v_contact RECORD;
  v_workspace_id uuid;
  v_task_id uuid;
  v_rule RECORD;
  v_task_title text;
BEGIN
  -- Get thread details
  SELECT it.*, c.workspace_id INTO v_thread, v_workspace_id
  FROM public.inbox_threads it
  LEFT JOIN public.contacts c ON c.id = it.contact_id
  WHERE it.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Check if homeowner has replied in last X days
  IF EXISTS (
    SELECT 1 FROM public.inbox_messages
    WHERE thread_id = p_thread_id
      AND direction = 'inbound'
      AND received_at > now() - (p_days || ' days')::interval
  ) THEN
    -- Homeowner replied, no need for follow-up
    RETURN NULL;
  END IF;
  
  -- Get rule for this timeout
  SELECT * INTO v_rule
  FROM public.followup_rules
  WHERE trigger_type = 'no_reply_timeout'
    AND no_reply_timeout = p_days
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Create task if action includes 'create_task'
  IF v_rule.actions ? 'create_task' THEN
    v_task_title := COALESCE(v_rule.conditions->>'task_title', format('Follow-Up Needed - No Reply After %s Days', p_days));
    
    INSERT INTO public.tasks_v3 (
      workspace_id,
      contact_id,
      lead_id,
      thread_id,
      task_type,
      priority,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_source,
      metadata
    )
    SELECT
      v_workspace_id,
      v_thread.contact_id,
      v_thread.lead_id,
      p_thread_id,
      'lead_no_reply',
      COALESCE((v_rule.conditions->>'task_priority')::text, 'medium')::task_priority_level,
      'open',
      v_task_title,
      format('Homeowner has not replied in %s days. Time to re-engage.', p_days),
      now() + COALESCE((v_rule.conditions->>'task_due_hours')::integer, 0) * interval '1 hour',
      true,
      'followup_engine',
      jsonb_build_object(
        'thread_id', p_thread_id,
        'followup_type', 'no_reply_timeout',
        'days_without_reply', p_days
      )
    RETURNING id INTO v_task_id;
    
    -- Log to timeline
    INSERT INTO public.followup_timeline (
      thread_id,
      contact_id,
      lead_id,
      task_id,
      action_type,
      action_description,
      metadata
    )
    VALUES (
      p_thread_id,
      v_thread.contact_id,
      v_thread.lead_id,
      v_task_id,
      'task_created',
      format('Follow-up task created: No reply after %s days', p_days),
      jsonb_build_object('days', p_days, 'rule_id', v_rule.id)
    );
  END IF;
  
  RETURN v_task_id;
END;
$$;

-- Function: Trigger 2 — Warm Lead → Gentle Nurture
CREATE OR REPLACE FUNCTION public.trigger_warm_lead_nurture(
  p_thread_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread RECORD;
  v_workspace_id uuid;
  v_sequence_steps RECORD;
  v_task_id uuid;
  v_due_at timestamptz;
BEGIN
  -- Get thread details
  SELECT it.*, c.workspace_id INTO v_thread, v_workspace_id
  FROM public.inbox_threads it
  LEFT JOIN public.contacts c ON c.id = it.contact_id
  WHERE it.id = p_thread_id
    AND it.ai_overall_intent = 'warm';
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Check if sequence already started
  IF EXISTS (
    SELECT 1 FROM public.followup_timeline
    WHERE thread_id = p_thread_id
      AND sequence_type = 'warm_lead_sequence'
  ) THEN
    RETURN;
  END IF;
  
  -- Get sequence steps
  FOR v_sequence_steps IN
    SELECT * FROM public.followup_sequences
    WHERE sequence_type = 'warm_lead_sequence'
    ORDER BY step_number
  LOOP
    -- Calculate due date
    v_due_at := now() + (v_sequence_steps.delay_days || ' days')::interval + (v_sequence_steps.delay_hours || ' hours')::interval;
    
    -- Create task
    INSERT INTO public.tasks_v3 (
      workspace_id,
      contact_id,
      lead_id,
      thread_id,
      task_type,
      priority,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_source,
      metadata
    )
    VALUES (
      v_workspace_id,
      v_thread.contact_id,
      v_thread.lead_id,
      p_thread_id,
      v_sequence_steps.task_type::task_type_v3,
      v_sequence_steps.priority::task_priority_level,
      'open',
      v_sequence_steps.step_title,
      v_sequence_steps.suggested_action,
      v_due_at,
      true,
      'followup_engine',
      jsonb_build_object(
        'thread_id', p_thread_id,
        'sequence_type', 'warm_lead_sequence',
        'step_number', v_sequence_steps.step_number
      )
    )
    RETURNING id INTO v_task_id;
    
    -- Log to timeline
    INSERT INTO public.followup_timeline (
      thread_id,
      contact_id,
      lead_id,
      task_id,
      sequence_type,
      step_number,
      action_type,
      action_description
    )
    VALUES (
      p_thread_id,
      v_thread.contact_id,
      v_thread.lead_id,
      v_task_id,
      'warm_lead_sequence',
      v_sequence_steps.step_number,
      'sequence_step_started',
      v_sequence_steps.step_description
    );
  END LOOP;
END;
$$;

-- Function: Trigger 3 — Follow-Up Required (Owner Must Respond)
CREATE OR REPLACE FUNCTION public.trigger_followup_required(
  p_message_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message RECORD;
  v_thread RECORD;
  v_workspace_id uuid;
  v_task_id uuid;
  v_rule RECORD;
  v_quiet_hour_start integer := 22; -- 10 PM
  v_quiet_hour_end integer := 7; -- 7 AM
  v_current_hour integer;
BEGIN
  -- Get message details
  SELECT im.*, it.*, c.workspace_id INTO v_message, v_thread, v_workspace_id
  FROM public.inbox_messages im
  JOIN public.inbox_threads it ON it.id = im.thread_id
  LEFT JOIN public.contacts c ON c.id = it.contact_id
  WHERE im.id = p_message_id
    AND im.ai_intent = 'follow_up';
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get rule
  SELECT * INTO v_rule
  FROM public.followup_rules
  WHERE trigger_type = 'ai_intent_followup'
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Create task
  IF v_rule.actions ? 'create_task' THEN
    INSERT INTO public.tasks_v3 (
      workspace_id,
      contact_id,
      lead_id,
      thread_id,
      task_type,
      priority,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_source,
      metadata
    )
    VALUES (
      v_workspace_id,
      v_thread.contact_id,
      v_thread.lead_id,
      v_thread.id,
      'lead_question_asked',
      COALESCE((v_rule.conditions->>'task_priority')::text, 'high')::task_priority_level,
      'open',
      COALESCE(v_rule.conditions->>'task_title', 'Follow-Up Required - Question Asked'),
      format('Homeowner asked a question or needs clarification. Thread: %s', COALESCE(v_thread.subject, 'No subject')),
      now() + COALESCE((v_rule.conditions->>'task_due_hours')::integer, 2) * interval '1 hour',
      true,
      'followup_engine',
      jsonb_build_object(
        'thread_id', v_thread.id,
        'message_id', p_message_id,
        'followup_type', 'question_asked'
      )
    )
    RETURNING id INTO v_task_id;
    
    -- Log to timeline
    INSERT INTO public.followup_timeline (
      thread_id,
      contact_id,
      lead_id,
      task_id,
      action_type,
      action_description
    )
    VALUES (
      v_thread.id,
      v_thread.contact_id,
      v_thread.lead_id,
      v_task_id,
      'task_created',
      'Follow-up task created: Question asked by homeowner'
    );
    
    -- Create nudge if enabled
    IF v_rule.actions ? 'send_nudge' THEN
      v_current_hour := EXTRACT(HOUR FROM now());
      
      -- Check quiet hours
      IF (v_rule.conditions->>'quiet_hour_aware')::boolean IS NOT TRUE OR
         (v_current_hour >= v_quiet_hour_end AND v_current_hour < v_quiet_hour_start) THEN
        INSERT INTO public.followup_nudges (
          workspace_id,
          thread_id,
          contact_id,
          nudge_type,
          nudge_message,
          priority,
          show_in_activity_feed,
          send_push_notification
        )
        VALUES (
          v_workspace_id,
          v_thread.id,
          v_thread.contact_id,
          'question_unanswered',
          format('%s asked a question yesterday. Answer to keep momentum.', 
            COALESCE((SELECT first_name FROM public.contacts WHERE id = v_thread.contact_id), 'Homeowner')),
          'high',
          true,
          true
        );
      END IF;
    END IF;
  END IF;
  
  RETURN v_task_id;
END;
$$;

-- Function: Trigger 4 — Hot Lead → Immediate Priority
CREATE OR REPLACE FUNCTION public.trigger_hot_lead_priority(
  p_message_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message RECORD;
  v_thread RECORD;
  v_workspace_id uuid;
  v_task_id uuid;
  v_rule RECORD;
BEGIN
  -- Get message details
  SELECT im.*, it.*, c.workspace_id INTO v_message, v_thread, v_workspace_id
  FROM public.inbox_messages im
  JOIN public.inbox_threads it ON it.id = im.thread_id
  LEFT JOIN public.contacts c ON c.id = it.contact_id
  WHERE im.id = p_message_id
    AND im.ai_intent = 'hot';
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get rule
  SELECT * INTO v_rule
  FROM public.followup_rules
  WHERE trigger_type = 'ai_intent_hot'
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Create task
  IF v_rule.actions ? 'create_task' THEN
    INSERT INTO public.tasks_v3 (
      workspace_id,
      contact_id,
      lead_id,
      thread_id,
      task_type,
      priority,
      status,
      title,
      description,
      due_at,
      auto_generated,
      auto_source,
      metadata
    )
    VALUES (
      v_workspace_id,
      v_thread.contact_id,
      v_thread.lead_id,
      v_thread.id,
      'lead_booking_intent',
      'critical',
      'open',
      COALESCE(v_rule.conditions->>'task_title', '🔥 Hot Lead Needs Attention'),
      format('Hot lead detected! Thread: %s', COALESCE(v_thread.subject, 'No subject')),
      now() + COALESCE((v_rule.conditions->>'task_due_hours')::integer, 1) * interval '1 hour',
      true,
      'followup_engine',
      jsonb_build_object(
        'thread_id', v_thread.id,
        'message_id', p_message_id,
        'followup_type', 'hot_lead',
        'move_to_hot_priority', COALESCE((v_rule.conditions->>'move_to_hot_priority')::boolean, true)
      )
    )
    RETURNING id INTO v_task_id;
    
    -- Log to timeline
    INSERT INTO public.followup_timeline (
      thread_id,
      contact_id,
      lead_id,
      task_id,
      action_type,
      action_description
    )
    VALUES (
      v_thread.id,
      v_thread.contact_id,
      v_thread.lead_id,
      v_task_id,
      'task_created',
      'Hot lead task created - immediate priority'
    );
    
    -- Create nudge
    INSERT INTO public.followup_nudges (
      workspace_id,
      thread_id,
      contact_id,
      nudge_type,
      nudge_message,
      priority,
      show_in_activity_feed,
      send_push_notification
    )
    VALUES (
      v_workspace_id,
      v_thread.id,
      v_thread.contact_id,
      'hot_lead_untouched',
      format('🔥 Hot lead needs attention now - %s', COALESCE((SELECT first_name FROM public.contacts WHERE id = v_thread.contact_id), 'Homeowner')),
      'critical',
      true,
      true
    );
  END IF;
  
  RETURN v_task_id;
END;
$$;

-- ============================================================================
-- PART 7 — Smart Nudges Detection Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_followup_nudges(
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread RECORD;
  v_hours_since_last_owner_action numeric;
  v_hours_since_last_message numeric;
BEGIN
  -- Nudge 1: Lead has stalled (no activity in 3+ days)
  FOR v_thread IN
    SELECT it.*, c.workspace_id
    FROM public.inbox_threads it
    JOIN public.contacts c ON c.id = it.contact_id
    WHERE c.workspace_id = p_workspace_id
      AND it.status = 'open'
      AND it.ai_overall_intent IN ('warm', 'hot', 'follow_up')
      AND NOT EXISTS (
        SELECT 1 FROM public.followup_nudges fn
        WHERE fn.thread_id = it.id
          AND fn.nudge_type = 'lead_stalled'
          AND fn.acknowledged_at IS NULL
      )
  LOOP
    SELECT EXTRACT(EPOCH FROM (now() - MAX(received_at))) / 3600 INTO v_hours_since_last_message
    FROM public.inbox_messages
    WHERE thread_id = v_thread.id;
    
    IF v_hours_since_last_message >= 72 THEN -- 3 days
      INSERT INTO public.followup_nudges (
        workspace_id,
        thread_id,
        contact_id,
        nudge_type,
        nudge_message,
        priority,
        show_in_activity_feed
      )
      VALUES (
        p_workspace_id,
        v_thread.id,
        v_thread.contact_id,
        'lead_stalled',
        format('You haven''t followed up with %s yet — recommend replying today.',
          COALESCE((SELECT first_name FROM public.contacts WHERE id = v_thread.contact_id), 'this lead')),
        'medium',
        true
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  
  -- Nudge 2: Hot lead hasn't been touched in 2 hours
  FOR v_thread IN
    SELECT it.*, c.workspace_id
    FROM public.inbox_threads it
    JOIN public.contacts c ON c.id = it.contact_id
    WHERE c.workspace_id = p_workspace_id
      AND it.status = 'open'
      AND it.ai_overall_intent = 'hot'
      AND NOT EXISTS (
        SELECT 1 FROM public.followup_nudges fn
        WHERE fn.thread_id = it.id
          AND fn.nudge_type = 'hot_lead_untouched'
          AND fn.created_at > now() - interval '2 hours'
      )
  LOOP
    SELECT EXTRACT(EPOCH FROM (now() - MAX(received_at))) / 3600 INTO v_hours_since_last_message
    FROM public.inbox_messages
    WHERE thread_id = v_thread.id
      AND direction = 'inbound';
    
    SELECT EXTRACT(EPOCH FROM (now() - MAX(received_at))) / 3600 INTO v_hours_since_last_owner_action
    FROM public.inbox_messages
    WHERE thread_id = v_thread.id
      AND direction = 'outbound';
    
    IF v_hours_since_last_message <= 2 AND (v_hours_since_last_owner_action IS NULL OR v_hours_since_last_owner_action > 2) THEN
      INSERT INTO public.followup_nudges (
        workspace_id,
        thread_id,
        contact_id,
        nudge_type,
        nudge_message,
        priority,
        show_in_activity_feed,
        send_push_notification
      )
      VALUES (
        p_workspace_id,
        v_thread.id,
        v_thread.contact_id,
        'hot_lead_untouched',
        format('This hot lead hasn''t been contacted in 2 hours — recommend calling now.',
          COALESCE((SELECT first_name FROM public.contacts WHERE id = v_thread.contact_id), 'Homeowner')),
        'critical',
        true,
        true
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  
  -- Nudge 3: Warm lead is trending cold (no reply in 5+ days)
  FOR v_thread IN
    SELECT it.*, c.workspace_id
    FROM public.inbox_threads it
    JOIN public.contacts c ON c.id = it.contact_id
    WHERE c.workspace_id = p_workspace_id
      AND it.status = 'open'
      AND it.ai_overall_intent = 'warm'
      AND NOT EXISTS (
        SELECT 1 FROM public.followup_nudges fn
        WHERE fn.thread_id = it.id
          AND fn.nudge_type = 'warm_lead_trending_cold'
          AND fn.acknowledged_at IS NULL
      )
  LOOP
    SELECT EXTRACT(EPOCH FROM (now() - MAX(received_at))) / 3600 INTO v_hours_since_last_message
    FROM public.inbox_messages
    WHERE thread_id = v_thread.id
      AND direction = 'inbound';
    
    IF v_hours_since_last_message >= 120 THEN -- 5 days
      INSERT INTO public.followup_nudges (
        workspace_id,
        thread_id,
        contact_id,
        nudge_type,
        nudge_message,
        priority,
        show_in_activity_feed
      )
      VALUES (
        p_workspace_id,
        v_thread.id,
        v_thread.contact_id,
        'warm_lead_trending_cold',
        format('Warm lead %s hasn''t replied in 5 days — time to re-engage.',
          COALESCE((SELECT first_name FROM public.contacts WHERE id = v_thread.contact_id), 'this lead')),
        'high',
        true
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 8 — Dashboard Counters View
-- ============================================================================

CREATE OR REPLACE VIEW public.followup_dashboard_counters AS
SELECT
  w.id as workspace_id,
  COUNT(DISTINCT CASE 
    WHEN t.due_at::date = CURRENT_DATE AND t.status = 'open' THEN t.id 
  END) as followups_due_today,
  COUNT(DISTINCT CASE 
    WHEN t.due_at < now() AND t.status = 'open' THEN t.id 
  END) as overdue_tasks,
  COUNT(DISTINCT CASE 
    WHEN it.ai_overall_intent IN ('hot', 'warm', 'follow_up')
      AND it.last_message_at < now() - interval '3 days'
      AND it.status = 'open'
    THEN it.id 
  END) as leads_at_risk,
  COUNT(DISTINCT CASE 
    WHEN im.received_at >= CURRENT_DATE - interval '3 days'
      AND im.direction = 'inbound'
      AND NOT EXISTS (
        SELECT 1 FROM public.inbox_messages im2
        WHERE im2.thread_id = im.thread_id
          AND im2.direction = 'outbound'
          AND im2.received_at > im.received_at
      )
    THEN im.thread_id 
  END) as no_response_leads_3days,
  COUNT(DISTINCT CASE 
    WHEN t.status = 'completed' AND t.completed_at::date = CURRENT_DATE THEN t.id 
  END) as tasks_completed_today
FROM public.workspaces w
LEFT JOIN public.tasks_v3 t ON t.workspace_id = w.id
LEFT JOIN public.inbox_threads it ON it.contact_id IN (
  SELECT id FROM public.contacts WHERE workspace_id = w.id
)
LEFT JOIN public.inbox_messages im ON im.thread_id = it.id
GROUP BY w.id;

-- ============================================================================
-- PART 9 — Daily Digest Email Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_followup_digest(
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_digest jsonb;
  v_hot_leads jsonb;
  v_overdue_tasks jsonb;
  v_followups_due_today jsonb;
  v_warm_leads_slipping jsonb;
  v_ai_suggestions jsonb;
BEGIN
  -- Hot leads waiting
  SELECT jsonb_agg(
    jsonb_build_object(
      'thread_id', it.id,
      'contact_name', COALESCE(c.first_name || ' ' || c.last_name, c.email),
      'last_message_at', it.last_message_at,
      'lead_score', it.highest_lead_score
    )
  ) INTO v_hot_leads
  FROM public.inbox_threads it
  JOIN public.contacts c ON c.id = it.contact_id
  WHERE c.workspace_id = p_workspace_id
    AND it.ai_overall_intent = 'hot'
    AND it.status = 'open'
    AND NOT EXISTS (
      SELECT 1 FROM public.inbox_messages im
      WHERE im.thread_id = it.id
        AND im.direction = 'outbound'
        AND im.received_at > it.last_message_at
    )
  ORDER BY it.last_message_at DESC
  LIMIT 10;
  
  -- Overdue tasks
  SELECT jsonb_agg(
    jsonb_build_object(
      'task_id', t.id,
      'title', t.title,
      'due_at', t.due_at,
      'priority', t.priority,
      'contact_name', COALESCE(c.first_name || ' ' || c.last_name, c.email)
    )
  ) INTO v_overdue_tasks
  FROM public.tasks_v3 t
  LEFT JOIN public.contacts c ON c.id = t.contact_id
  WHERE t.workspace_id = p_workspace_id
    AND t.due_at < now()
    AND t.status = 'open'
  ORDER BY t.priority DESC, t.due_at ASC
  LIMIT 20;
  
  -- Follow-ups due today
  SELECT jsonb_agg(
    jsonb_build_object(
      'task_id', t.id,
      'title', t.title,
      'due_at', t.due_at,
      'priority', t.priority,
      'contact_name', COALESCE(c.first_name || ' ' || c.last_name, c.email)
    )
  ) INTO v_followups_due_today
  FROM public.tasks_v3 t
  LEFT JOIN public.contacts c ON c.id = t.contact_id
  WHERE t.workspace_id = p_workspace_id
    AND t.due_at::date = CURRENT_DATE
    AND t.status = 'open'
  ORDER BY t.priority DESC, t.due_at ASC
  LIMIT 20;
  
  -- Warm leads slipping
  SELECT jsonb_agg(
    jsonb_build_object(
      'thread_id', it.id,
      'contact_name', COALESCE(c.first_name || ' ' || c.last_name, c.email),
      'last_message_at', it.last_message_at,
      'days_since_last_message', EXTRACT(EPOCH FROM (now() - it.last_message_at)) / 86400
    )
  ) INTO v_warm_leads_slipping
  FROM public.inbox_threads it
  JOIN public.contacts c ON c.id = it.contact_id
  WHERE c.workspace_id = p_workspace_id
    AND it.ai_overall_intent = 'warm'
    AND it.status = 'open'
    AND it.last_message_at < now() - interval '3 days'
  ORDER BY it.last_message_at ASC
  LIMIT 10;
  
  -- AI suggestions (from nudges)
  SELECT jsonb_agg(
    jsonb_build_object(
      'nudge_id', fn.id,
      'nudge_type', fn.nudge_type,
      'nudge_message', fn.nudge_message,
      'thread_id', fn.thread_id,
      'contact_name', COALESCE(c.first_name || ' ' || c.last_name, c.email)
    )
  ) INTO v_ai_suggestions
  FROM public.followup_nudges fn
  LEFT JOIN public.contacts c ON c.id = fn.contact_id
  WHERE fn.workspace_id = p_workspace_id
    AND fn.acknowledged_at IS NULL
    AND fn.created_at >= CURRENT_DATE
  ORDER BY fn.priority DESC, fn.created_at DESC
  LIMIT 10;
  
  -- Build digest
  v_digest := jsonb_build_object(
    'workspace_id', p_workspace_id,
    'date', CURRENT_DATE,
    'hot_leads_waiting', COALESCE(v_hot_leads, '[]'::jsonb),
    'overdue_tasks', COALESCE(v_overdue_tasks, '[]'::jsonb),
    'followups_due_today', COALESCE(v_followups_due_today, '[]'::jsonb),
    'warm_leads_slipping', COALESCE(v_warm_leads_slipping, '[]'::jsonb),
    'ai_suggestions', COALESCE(v_ai_suggestions, '[]'::jsonb)
  );
  
  RETURN v_digest;
END;
$$;

-- ============================================================================
-- PART 10 — Triggers on Inbox Messages
-- ============================================================================

-- Trigger function: Auto-trigger follow-up logic when message is classified
CREATE OR REPLACE FUNCTION public.auto_trigger_followup_on_classification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Trigger hot lead priority
  IF NEW.ai_intent = 'hot' AND (OLD.ai_intent IS NULL OR OLD.ai_intent != 'hot') THEN
    PERFORM public.trigger_hot_lead_priority(NEW.id);
  END IF;
  
  -- Trigger follow-up required
  IF NEW.ai_intent = 'follow_up' AND (OLD.ai_intent IS NULL OR OLD.ai_intent != 'follow_up') THEN
    PERFORM public.trigger_followup_required(NEW.id);
  END IF;
  
  -- Trigger warm lead nurture
  IF NEW.ai_intent = 'warm' AND (OLD.ai_intent IS NULL OR OLD.ai_intent != 'warm') THEN
    PERFORM public.trigger_warm_lead_nurture(NEW.thread_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_trigger_followup_on_classification ON public.inbox_messages;
CREATE TRIGGER trg_auto_trigger_followup_on_classification
  AFTER UPDATE OF ai_intent ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.ai_intent IS DISTINCT FROM OLD.ai_intent)
  EXECUTE FUNCTION public.auto_trigger_followup_on_classification();

-- ============================================================================
-- PART 11 — Scheduled Function for No-Reply Detection
-- ============================================================================

-- Function to check for no-reply threads and create follow-up tasks
CREATE OR REPLACE FUNCTION public.check_no_reply_threads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread RECORD;
BEGIN
  -- Check for threads with no reply after 2, 4, and 7 days
  FOR v_thread IN
    SELECT DISTINCT it.id, it.contact_id, it.lead_id
    FROM public.inbox_threads it
    WHERE it.status = 'open'
      AND it.ai_overall_intent IN ('warm', 'hot', 'follow_up')
      AND NOT EXISTS (
        -- Check if follow-up task already exists for this timeout
        SELECT 1 FROM public.tasks_v3 t
        WHERE t.thread_id = it.id
          AND t.auto_source = 'followup_engine'
          AND t.metadata->>'followup_type' = 'no_reply_timeout'
          AND t.status = 'open'
      )
  LOOP
    -- Check 2 days
    IF NOT EXISTS (
      SELECT 1 FROM public.inbox_messages
      WHERE thread_id = v_thread.id
        AND direction = 'inbound'
        AND received_at > now() - interval '2 days'
    ) THEN
      PERFORM public.trigger_no_reply_followup(v_thread.id, 2);
    END IF;
    
    -- Check 4 days
    IF NOT EXISTS (
      SELECT 1 FROM public.inbox_messages
      WHERE thread_id = v_thread.id
        AND direction = 'inbound'
        AND received_at > now() - interval '4 days'
    ) THEN
      PERFORM public.trigger_no_reply_followup(v_thread.id, 4);
    END IF;
    
    -- Check 7 days
    IF NOT EXISTS (
      SELECT 1 FROM public.inbox_messages
      WHERE thread_id = v_thread.id
        AND direction = 'inbound'
        AND received_at > now() - interval '7 days'
    ) THEN
      PERFORM public.trigger_no_reply_followup(v_thread.id, 7);
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 12 — Comments
-- ============================================================================

COMMENT ON TABLE public.followup_rules IS 'Follow-up rules table - brain of the follow-up system. Defines triggers and actions for different scenarios.';
COMMENT ON TABLE public.followup_sequences IS 'Behavior-based follow-up sequences. Defines step-by-step follow-up actions for different lead types.';
COMMENT ON TABLE public.followup_timeline IS 'Follow-up timeline tracking. Shows history of all follow-up actions, tasks, and sequence steps for each thread.';
COMMENT ON TABLE public.followup_nudges IS 'Smart nudges - AI-driven notifications to owners about leads needing attention.';
COMMENT ON FUNCTION public.calculate_followup_priority_score IS 'Calculates follow-up priority score (0-100) based on AI intent, overdue time, job value, and decay factor.';
COMMENT ON FUNCTION public.trigger_no_reply_followup IS 'Triggers follow-up task creation when homeowner has not replied after X days.';
COMMENT ON FUNCTION public.trigger_warm_lead_nurture IS 'Triggers warm lead nurture sequence - creates multiple follow-up tasks over time.';
COMMENT ON FUNCTION public.trigger_followup_required IS 'Triggers follow-up task when AI detects question asked or partial answer requiring owner response.';
COMMENT ON FUNCTION public.trigger_hot_lead_priority IS 'Triggers immediate priority task and notifications for hot leads.';
COMMENT ON FUNCTION public.detect_followup_nudges IS 'Detects leads needing nudges: stalled leads, untouched hot leads, warm leads trending cold.';
COMMENT ON FUNCTION public.generate_followup_digest IS 'Generates daily follow-up digest email content with hot leads, overdue tasks, follow-ups due, warm leads slipping, and AI suggestions.';
COMMENT ON FUNCTION public.check_no_reply_threads IS 'Scheduled function to check for threads with no reply and create follow-up tasks. Should run daily.';

