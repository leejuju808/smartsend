-- =========================================================
-- Block 10600 — SmartSend Auto-Follow-Up Brain v1
-- (The Behavior Engine That Keeps Roof Leads Alive Until They Convert)
-- =========================================================

-- 1) FOLLOWUP_STATES TABLE
-- Tracks follow-up sequence state for each lead
CREATE TABLE IF NOT EXISTS public.followup_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  campaign_id uuid,
  
  -- Sequence tracking
  step int NOT NULL DEFAULT 0, -- Current step in sequence (0 = initial, 1 = day 2, 2 = day 4, etc.)
  next_action_at timestamptz, -- When next follow-up should be sent
  last_action timestamptz, -- When last action was taken
  last_message_sent_at timestamptz, -- When last message was sent
  
  -- Status tracking
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped', 'suppressed', 'completed')),
  classification text CHECK (classification IN ('hot', 'warm', 'cold', 'not_interested')),
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One follow-up state per lead
  UNIQUE(lead_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_followup_states_workspace_status 
  ON public.followup_states(workspace_id, status) 
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_followup_states_next_action 
  ON public.followup_states(next_action_at) 
  WHERE status = 'active' AND next_action_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_followup_states_classification 
  ON public.followup_states(classification) 
  WHERE classification IN ('hot', 'warm');

CREATE INDEX IF NOT EXISTS idx_followup_states_lead 
  ON public.followup_states(lead_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_followup_states_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_followup_states_updated_at ON public.followup_states;
CREATE TRIGGER trg_set_followup_states_updated_at
  BEFORE UPDATE ON public.followup_states
  FOR EACH ROW
  EXECUTE FUNCTION public.set_followup_states_updated_at();

-- 2) FOLLOWUP_MESSAGES TABLE
-- Stores follow-up messages sent to leads
CREATE TABLE IF NOT EXISTS public.followup_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_state_id uuid NOT NULL REFERENCES public.followup_states(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  
  -- Message details
  message_type text NOT NULL CHECK (message_type IN ('no_reply', 'warm_nurture', 'hot_confirmation', 'slow_nudge', 'silence_breaker')),
  step int NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  sent_at timestamptz,
  error_message text,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_messages_lead 
  ON public.followup_messages(lead_id);

CREATE INDEX IF NOT EXISTS idx_followup_messages_status 
  ON public.followup_messages(status) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_followup_messages_followup_state 
  ON public.followup_messages(followup_state_id);

-- 3) FOLLOWUP_MESSAGE_TEMPLATES TABLE
-- Pre-defined roofing-optimized follow-up messages
CREATE TABLE IF NOT EXISTS public.followup_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  message_type text NOT NULL CHECK (message_type IN ('warm_nurture', 'hot_confirmation', 'slow_nudge', 'silence_breaker')),
  step int, -- For no_reply sequence (0, 1, 2)
  subject text NOT NULL,
  body text NOT NULL,
  is_default boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default roofing-optimized templates
INSERT INTO public.followup_message_templates (message_type, step, subject, body, is_default, active) VALUES
  -- Warm Lead Follow-Up
  ('warm_nurture', NULL, 'Quick question about your roof', 
   'Got it — happy to help.\n\nDo you need a repair, leak fix, or a full inspection?\n\nI can get you a quick estimate.', 
   true, true),
  
  -- Hot Lead Confirmation
  ('hot_confirmation', NULL, 'We can take a look', 
   'No problem — we can take a look.\n\nWhat''s the best time for someone to swing by?', 
   true, true),
  
  -- Slow Lead Nudge (2-3 days after warm)
  ('slow_nudge', NULL, 'Still want me to check on that roof issue?', 
   'Still want me to check on that roof issue for you?\n\nWe''ve got a slot open this week.', 
   true, true),
  
  -- Silence Breaker (v1)
  ('silence_breaker', NULL, 'Before I close this out', 
   'Before I close this out — want someone to take a look at the roof? Just reply ''yes''.', 
   true, true),
  
  -- No Reply Sequence - Day 0 (initial)
  ('no_reply', 0, 'Quick question about your roof', 
   'Hi {{first_name}},\n\nI wanted to follow up on my previous message about your roof.\n\nAre you still interested in getting an estimate?', 
   true, true),
  
  -- No Reply Sequence - Day 2
  ('no_reply', 1, 'Still interested in a roof estimate?', 
   'Hi {{first_name}},\n\nI know you''re busy, but I wanted to check in one more time.\n\nWe''ve got availability this week if you want someone to take a look. Just reply and let me know.', 
   true, true),
  
  -- No Reply Sequence - Day 4
  ('no_reply', 2, 'Last chance for a free roof estimate', 
   'Hi {{first_name}},\n\nBefore I close this out — want someone to take a look at the roof? Just reply ''yes''.\n\nThis is my last follow-up, so let me know if you''re interested.', 
   true, true)
ON CONFLICT DO NOTHING;

-- 4) HELPER FUNCTION: Get last message timestamp for a lead
CREATE OR REPLACE FUNCTION public.get_lead_last_message_time(p_lead_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_message timestamptz;
BEGIN
  -- Check outbound messages
  SELECT MAX(created_at) INTO v_last_message
  FROM public.outbound_messages
  WHERE lead_id = p_lead_id;
  
  -- Check email_messages
  SELECT GREATEST(
    COALESCE(v_last_message, '1970-01-01'::timestamptz),
    COALESCE(MAX(created_at), '1970-01-01'::timestamptz)
  ) INTO v_last_message
  FROM public.email_messages
  WHERE lead_id = p_lead_id;
  
  -- Check send_logs
  SELECT GREATEST(
    COALESCE(v_last_message, '1970-01-01'::timestamptz),
    COALESCE(MAX(created_at), '1970-01-01'::timestamptz)
  ) INTO v_last_message
  FROM public.send_logs
  WHERE lead_id = p_lead_id;
  
  RETURN COALESCE(v_last_message, now());
END;
$$;

-- 5) HELPER FUNCTION: Check if lead is suppressed
CREATE OR REPLACE FUNCTION public.is_lead_suppressed(p_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_suppressed boolean := false;
  v_email text;
  v_workspace_id uuid;
BEGIN
  -- Get lead email and workspace_id
  SELECT email, workspace_id INTO v_email, v_workspace_id
  FROM public.leads
  WHERE id = p_lead_id;
  
  IF v_email IS NULL THEN
    RETURN true; -- Can't find lead, treat as suppressed
  END IF;
  
  -- Check leads.unsubscribed flag first (fastest check)
  SELECT COALESCE(unsubscribed, false) INTO v_suppressed
  FROM public.leads
  WHERE id = p_lead_id;
  
  IF v_suppressed THEN
    RETURN true;
  END IF;
  
  -- Check suppression_list (workspace-scoped if workspace_id available)
  IF v_workspace_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.suppression_list
      WHERE email = lower(v_email)
        AND (workspace_id = v_workspace_id OR workspace_id IS NULL)
    ) INTO v_suppressed;
    
    IF v_suppressed THEN
      RETURN true;
    END IF;
    
    -- Check email_suppressions (workspace-scoped)
    SELECT EXISTS(
      SELECT 1 FROM public.email_suppressions
      WHERE email = lower(v_email)
        AND workspace_id = v_workspace_id
    ) INTO v_suppressed;
    
    IF v_suppressed THEN
      RETURN true;
    END IF;
  ELSE
    -- Fallback: check any suppression (less efficient)
    SELECT EXISTS(
      SELECT 1 FROM public.suppression_list
      WHERE email = lower(v_email)
    ) INTO v_suppressed;
    
    IF v_suppressed THEN
      RETURN true;
    END IF;
    
    SELECT EXISTS(
      SELECT 1 FROM public.email_suppressions
      WHERE email = lower(v_email)
    ) INTO v_suppressed;
  END IF;
  
  RETURN v_suppressed;
END;
$$;

-- 6) HELPER FUNCTION: Get lead classification
CREATE OR REPLACE FUNCTION public.get_lead_classification(p_lead_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_classification text;
BEGIN
  SELECT classification INTO v_classification
  FROM public.leads
  WHERE id = p_lead_id;
  
  RETURN COALESCE(v_classification, 'cold');
END;
$$;

-- 7) RLS POLICIES
ALTER TABLE public.followup_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_message_templates ENABLE ROW LEVEL SECURITY;

-- Follow-up states: workspace members can read/write
CREATE POLICY "followup_states_workspace_access"
  ON public.followup_states
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Follow-up messages: workspace members can read/write
CREATE POLICY "followup_messages_workspace_access"
  ON public.followup_messages
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Templates: workspace members can read, workspace owners can write
CREATE POLICY "followup_templates_read"
  ON public.followup_message_templates
  FOR SELECT
  USING (
    workspace_id IS NULL OR -- Default templates
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "followup_templates_write"
  ON public.followup_message_templates
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Comments
COMMENT ON TABLE public.followup_states IS 'Tracks follow-up sequence state for each lead - the core of Block 10600';
COMMENT ON COLUMN public.followup_states.step IS 'Current step in sequence: 0=initial, 1=day 2, 2=day 4, etc.';
COMMENT ON COLUMN public.followup_states.next_action_at IS 'When next follow-up should be sent (checked hourly by engine)';
COMMENT ON COLUMN public.followup_states.status IS 'active=pending follow-ups, paused=hot lead, stopped=completed, suppressed=negative signal';

COMMENT ON TABLE public.followup_messages IS 'Log of all follow-up messages sent to leads';
COMMENT ON TABLE public.followup_message_templates IS 'Pre-defined roofing-optimized follow-up message templates';

-- 8) FUNCTION: Initialize follow-up state for a lead
CREATE OR REPLACE FUNCTION public.init_followup_state(
  p_lead_id uuid,
  p_workspace_id uuid,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state_id uuid;
  v_next_action timestamptz;
BEGIN
  -- Check if state already exists
  SELECT id INTO v_state_id
  FROM public.followup_states
  WHERE lead_id = p_lead_id;
  
  IF v_state_id IS NOT NULL THEN
    RETURN v_state_id;
  END IF;
  
  -- Set next action to 2 days from now (Day 2 follow-up)
  v_next_action := now() + interval '2 days';
  
  -- Create new follow-up state
  INSERT INTO public.followup_states (
    lead_id,
    workspace_id,
    campaign_id,
    step,
    next_action_at,
    status
  ) VALUES (
    p_lead_id,
    p_workspace_id,
    p_campaign_id,
    0,
    v_next_action,
    'active'
  )
  RETURNING id INTO v_state_id;
  
  RETURN v_state_id;
END;
$$;

-- 9) FUNCTION: Sync classification to follow-up state
CREATE OR REPLACE FUNCTION public.sync_lead_classification_to_followup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state_id uuid;
BEGIN
  -- Only process if classification changed
  IF NEW.classification IS NOT DISTINCT FROM OLD.classification THEN
    RETURN NEW;
  END IF;
  
  -- Get or create follow-up state
  SELECT id INTO v_state_id
  FROM public.followup_states
  WHERE lead_id = NEW.id;
  
  IF v_state_id IS NULL THEN
    -- Initialize if doesn't exist
    SELECT public.init_followup_state(NEW.id, NEW.workspace_id, NEW.campaign_id)
    INTO v_state_id;
  END IF;
  
  -- Update classification in follow-up state
  UPDATE public.followup_states
  SET 
    classification = NEW.classification,
    updated_at = now()
  WHERE id = v_state_id;
  
  -- Handle hot leads: pause follow-ups
  IF NEW.classification = 'hot' THEN
    UPDATE public.followup_states
    SET 
      status = 'paused',
      last_action = now()
    WHERE id = v_state_id;
  END IF;
  
  -- Handle negative signals: suppress
  IF NEW.classification = 'not_interested' THEN
    UPDATE public.followup_states
    SET 
      status = 'suppressed',
      last_action = now()
    WHERE id = v_state_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to sync classification changes
DROP TRIGGER IF EXISTS trg_sync_classification_to_followup ON public.leads;
CREATE TRIGGER trg_sync_classification_to_followup
  AFTER UPDATE OF classification ON public.leads
  FOR EACH ROW
  WHEN (NEW.classification IS DISTINCT FROM OLD.classification)
  EXECUTE FUNCTION public.sync_lead_classification_to_followup();

-- 10) FUNCTION: Initialize follow-up state when message is sent
CREATE OR REPLACE FUNCTION public.init_followup_on_message_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_campaign_id uuid;
BEGIN
  -- Get workspace_id from lead
  SELECT workspace_id, campaign_id INTO v_workspace_id, v_campaign_id
  FROM public.leads
  WHERE id = NEW.lead_id;
  
  IF v_workspace_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Initialize follow-up state if doesn't exist
  PERFORM public.init_followup_state(NEW.lead_id, v_workspace_id, v_campaign_id);
  
  RETURN NEW;
END;
$$;

-- Trigger on outbound messages (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'outbound_messages') THEN
    DROP TRIGGER IF EXISTS trg_init_followup_on_message ON public.outbound_messages;
    CREATE TRIGGER trg_init_followup_on_message
      AFTER INSERT ON public.outbound_messages
      FOR EACH ROW
      EXECUTE FUNCTION public.init_followup_on_message_sent();
  END IF;
END $$;

