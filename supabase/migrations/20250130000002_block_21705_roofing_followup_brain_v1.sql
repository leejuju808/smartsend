-- =========================================================
-- Block 21705 — SmartSend Roofing Follow-Up Brain v1
-- (The Core Logic That Makes SmartSend Feel Alive to Roofers)
-- =========================================================
-- 
-- This implements the 8 core rules:
-- 1. 48 hours → Follow-Up #1 (soft, friendly)
-- 2. 4 days → Follow-Up #2 (authority, value-driven)
-- 3. 7 days → Follow-Up #3 (short, direct)
-- 4. 14 days → Archive + Mark "Cold Lead"
-- 5. If homeowner replies → Stop follow-ups immediately
-- 6. If reply intent = "Warm Lead" → Auto-send thank you + booking link
-- 7. If reply intent = "Hot Lead" → Trigger priority status
-- 8. If reply intent = "Not Interested" → Move to "Unqualified" bucket

-- ============================================================================
-- 1. CREATE roofing_followup_states TABLE
-- ============================================================================
-- Tracks follow-up sequence state for each campaign contact

CREATE TABLE IF NOT EXISTS public.roofing_followup_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_contact_id uuid NOT NULL, -- References campaign_contacts
  workspace_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  contact_id uuid, -- References contacts table
  
  -- Sequence tracking
  initial_email_sent_at timestamptz NOT NULL, -- When first email was sent
  followup_step int NOT NULL DEFAULT 0, -- 0 = initial, 1 = 48hr, 2 = 4day, 3 = 7day
  next_followup_at timestamptz, -- When next follow-up should be sent
  last_followup_sent_at timestamptz, -- When last follow-up was sent
  
  -- Status tracking
  status text NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',      -- Follow-ups are active
    'paused',     -- Paused (hot lead, manual pause)
    'stopped',    -- Stopped (replied, not interested, archived)
    'cold_lead',   -- Marked as cold lead after 14 days
    'suppressed'   -- Suppressed (unsubscribed, bounced)
  )),
  
  -- Reply tracking
  has_replied boolean NOT NULL DEFAULT false,
  last_reply_at timestamptz,
  reply_intent text CHECK (reply_intent IN ('hot', 'warm', 'not_interested', 'neutral')),
  
  -- Lead classification
  cold_lead boolean NOT NULL DEFAULT false,
  next_action text, -- 'none', 'followup_1', 'followup_2', 'followup_3', 'archive'
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One follow-up state per campaign contact
  UNIQUE(campaign_contact_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_roofing_followup_states_workspace_status 
  ON public.roofing_followup_states(workspace_id, status) 
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_roofing_followup_states_next_followup 
  ON public.roofing_followup_states(next_followup_at) 
  WHERE status = 'active' AND next_followup_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_roofing_followup_states_campaign_contact 
  ON public.roofing_followup_states(campaign_contact_id);

CREATE INDEX IF NOT EXISTS idx_roofing_followup_states_cold_lead 
  ON public.roofing_followup_states(cold_lead) 
  WHERE cold_lead = true;

CREATE INDEX IF NOT EXISTS idx_roofing_followup_states_reply_intent 
  ON public.roofing_followup_states(reply_intent) 
  WHERE reply_intent IN ('hot', 'warm');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_roofing_followup_states_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_roofing_followup_states_updated_at ON public.roofing_followup_states;
CREATE TRIGGER trg_set_roofing_followup_states_updated_at
  BEFORE UPDATE ON public.roofing_followup_states
  FOR EACH ROW
  EXECUTE FUNCTION public.set_roofing_followup_states_updated_at();

-- ============================================================================
-- 2. CREATE roofing_followup_templates TABLE
-- ============================================================================
-- Pre-defined roofing-optimized follow-up email templates

CREATE TABLE IF NOT EXISTS public.roofing_followup_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid, -- NULL = global default
  
  -- Template identification
  followup_step int NOT NULL CHECK (followup_step IN (1, 2, 3)), -- 1 = 48hr, 2 = 4day, 3 = 7day
  template_name text NOT NULL,
  
  -- Content
  subject text NOT NULL,
  body text NOT NULL,
  
  -- Metadata
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One default template per step per workspace
  UNIQUE(workspace_id, followup_step) WHERE is_default = true
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_roofing_followup_templates_workspace_step 
  ON public.roofing_followup_templates(workspace_id, followup_step) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_roofing_followup_templates_default 
  ON public.roofing_followup_templates(followup_step) 
  WHERE is_default = true AND is_active = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_roofing_followup_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_roofing_followup_templates_updated_at ON public.roofing_followup_templates;
CREATE TRIGGER trg_set_roofing_followup_templates_updated_at
  BEFORE UPDATE ON public.roofing_followup_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_roofing_followup_templates_updated_at();

-- Insert default roofing-optimized templates
INSERT INTO public.roofing_followup_templates (followup_step, template_name, subject, body, is_default, is_active) VALUES
  -- Follow-Up #1 (48 hours) - Soft, friendly, helpful
  (1, 'Follow-Up #1 - 48 Hours', 
   'Quick check-in about your roof',
   'Hey {{first_name}},

Just wanted to follow up on my message from a couple days ago.

I''m here if you need a free estimate or have any questions about your roof. No pressure — just want to make sure you have what you need.

Let me know if you''d like me to swing by!',
   true, true),
  
  -- Follow-Up #2 (4 days) - Authority, value-driven
  (2, 'Follow-Up #2 - 4 Days', 
   'Protecting your roof before storm season',
   'Hey {{first_name}},

I know you''re busy, but I wanted to check in one more time.

With storm season coming up, it''s worth getting your roof inspected. Small leaks can turn into big problems fast — and insurance claims can be a headache.

I can get you a free estimate this week if you''re interested. Just reply and let me know.',
   true, true),
  
  -- Follow-Up #3 (7 days) - Short, direct
  (3, 'Follow-Up #3 - 7 Days', 
   'Should I close your file?',
   'Hey {{first_name}},

Last follow-up — should I close your file, or do you want me to come take a look?

Just reply "yes" if you want an estimate, or let me know if you''re all set.',
   true, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. CREATE roofing_followup_messages TABLE
-- ============================================================================
-- Logs all follow-up messages sent

CREATE TABLE IF NOT EXISTS public.roofing_followup_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_state_id uuid NOT NULL REFERENCES public.roofing_followup_states(id) ON DELETE CASCADE,
  campaign_contact_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  
  -- Message details
  followup_step int NOT NULL, -- 1, 2, or 3
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

CREATE INDEX IF NOT EXISTS idx_roofing_followup_messages_followup_state 
  ON public.roofing_followup_messages(followup_state_id);

CREATE INDEX IF NOT EXISTS idx_roofing_followup_messages_status 
  ON public.roofing_followup_messages(status) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_roofing_followup_messages_campaign_contact 
  ON public.roofing_followup_messages(campaign_contact_id);

-- ============================================================================
-- 4. HELPER FUNCTION: Initialize follow-up state for a campaign contact
-- ============================================================================

CREATE OR REPLACE FUNCTION public.init_roofing_followup_state(
  p_campaign_contact_id uuid,
  p_workspace_id uuid,
  p_campaign_id uuid,
  p_contact_id uuid DEFAULT NULL,
  p_initial_email_sent_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state_id uuid;
  v_next_followup timestamptz;
BEGIN
  -- Check if state already exists
  SELECT id INTO v_state_id
  FROM public.roofing_followup_states
  WHERE campaign_contact_id = p_campaign_contact_id;
  
  IF v_state_id IS NOT NULL THEN
    RETURN v_state_id;
  END IF;
  
  -- Set next follow-up to 48 hours from initial email
  v_next_followup := p_initial_email_sent_at + interval '48 hours';
  
  -- Create new follow-up state
  INSERT INTO public.roofing_followup_states (
    campaign_contact_id,
    workspace_id,
    campaign_id,
    contact_id,
    initial_email_sent_at,
    followup_step,
    next_followup_at,
    status,
    next_action
  ) VALUES (
    p_campaign_contact_id,
    p_workspace_id,
    p_campaign_id,
    p_contact_id,
    p_initial_email_sent_at,
    0,
    v_next_followup,
    'active',
    'followup_1'
  )
  RETURNING id INTO v_state_id;
  
  RETURN v_state_id;
END;
$$;

-- ============================================================================
-- 5. HELPER FUNCTION: Check if contact has replied
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_contact_replied(p_campaign_contact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_replied boolean := false;
BEGIN
  -- Check email_replies table
  SELECT EXISTS(
    SELECT 1 FROM public.email_replies
    WHERE campaign_contact_id = p_campaign_contact_id
  ) INTO v_has_replied;
  
  IF v_has_replied THEN
    RETURN true;
  END IF;
  
  -- Check replies table
  SELECT EXISTS(
    SELECT 1 FROM public.replies r
    JOIN public.campaign_contacts cc ON cc.contact_id = r.lead_id
    WHERE cc.id = p_campaign_contact_id
  ) INTO v_has_replied;
  
  RETURN v_has_replied;
END;
$$;

-- ============================================================================
-- 6. HELPER FUNCTION: Get reply intent for contact
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_contact_reply_intent(p_campaign_contact_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_intent text;
  v_contact_id uuid;
BEGIN
  -- Get contact_id from campaign_contacts
  SELECT contact_id INTO v_contact_id
  FROM public.campaign_contacts
  WHERE id = p_campaign_contact_id;
  
  IF v_contact_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check reply_intents table (latest)
  SELECT intent INTO v_intent
  FROM public.reply_intents
  WHERE lead_id = v_contact_id
  ORDER BY classified_at DESC
  LIMIT 1;
  
  -- Map intent values to our system
  -- 'hot' -> 'hot'
  -- 'warm' -> 'warm'
  -- 'not_interested' -> 'not_interested'
  -- everything else -> 'neutral'
  
  IF v_intent IN ('hot', 'warm', 'not_interested') THEN
    RETURN v_intent;
  END IF;
  
  RETURN 'neutral';
END;
$$;

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================

ALTER TABLE public.roofing_followup_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_followup_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_followup_messages ENABLE ROW LEVEL SECURITY;

-- Follow-up states: workspace members can read/write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'roofing_followup_states'
      AND policyname = 'roofing_followup_states_workspace_access'
  ) THEN
    CREATE POLICY "roofing_followup_states_workspace_access"
      ON public.roofing_followup_states
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
  END IF;
END $$;

-- Service role can manage all
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'roofing_followup_states'
      AND policyname = 'roofing_followup_states_service_role'
  ) THEN
    CREATE POLICY "roofing_followup_states_service_role"
      ON public.roofing_followup_states
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Templates: workspace members can read, service role can write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'roofing_followup_templates'
      AND policyname = 'roofing_followup_templates_read'
  ) THEN
    CREATE POLICY "roofing_followup_templates_read"
      ON public.roofing_followup_templates
      FOR SELECT
      USING (
        workspace_id IS NULL OR -- Default templates
        workspace_id IN (
          SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'roofing_followup_templates'
      AND policyname = 'roofing_followup_templates_service_role'
  ) THEN
    CREATE POLICY "roofing_followup_templates_service_role"
      ON public.roofing_followup_templates
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Messages: workspace members can read, service role can write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'roofing_followup_messages'
      AND policyname = 'roofing_followup_messages_workspace_access'
  ) THEN
    CREATE POLICY "roofing_followup_messages_workspace_access"
      ON public.roofing_followup_messages
      FOR SELECT
      USING (
        workspace_id IN (
          SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'roofing_followup_messages'
      AND policyname = 'roofing_followup_messages_service_role'
  ) THEN
    CREATE POLICY "roofing_followup_messages_service_role"
      ON public.roofing_followup_messages
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Comments
COMMENT ON TABLE public.roofing_followup_states IS 'Tracks follow-up sequence state for each campaign contact - Block 21705';
COMMENT ON COLUMN public.roofing_followup_states.followup_step IS 'Current step: 0=initial, 1=48hr, 2=4day, 3=7day';
COMMENT ON COLUMN public.roofing_followup_states.next_followup_at IS 'When next follow-up should be sent (checked hourly by engine)';
COMMENT ON COLUMN public.roofing_followup_states.cold_lead IS 'Marked as cold lead after 14 days with no reply';
COMMENT ON COLUMN public.roofing_followup_states.reply_intent IS 'Intent from reply: hot, warm, not_interested, neutral';

COMMENT ON TABLE public.roofing_followup_templates IS 'Pre-defined roofing-optimized follow-up email templates';
COMMENT ON TABLE public.roofing_followup_messages IS 'Log of all follow-up messages sent to campaign contacts';

-- ============================================================================
-- 8. TRIGGER: Initialize follow-up state when email is sent to campaign contact
-- ============================================================================

CREATE OR REPLACE FUNCTION public.init_roofing_followup_on_email_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign_contact_id uuid;
  v_workspace_id uuid;
  v_campaign_id uuid;
  v_contact_id uuid;
BEGIN
  -- Try to get campaign_contact_id from various email log tables
  -- This depends on your schema - adjust based on your email logging structure
  
  -- Check if this is a campaign email (adjust table/column names as needed)
  IF TG_TABLE_NAME = 'email_logs' THEN
    -- Get campaign_contact_id from email_logs if it has_campaign_contact_id
    SELECT campaign_contact_id, workspace_id INTO v_campaign_contact_id, v_workspace_id
    FROM public.email_logs
    WHERE id = NEW.id;
    
    IF v_campaign_contact_id IS NOT NULL THEN
      -- Get campaign_id and contact_id from campaign_contacts
      SELECT campaign_id, contact_id INTO v_campaign_id, v_contact_id
      FROM public.campaign_contacts
      WHERE id = v_campaign_contact_id;
      
      IF v_campaign_id IS NOT NULL AND v_workspace_id IS NOT NULL THEN
        -- Initialize follow-up state
        PERFORM public.init_roofing_followup_state(
          v_campaign_contact_id,
          v_workspace_id,
          v_campaign_id,
          v_contact_id,
          COALESCE(NEW.sent_at, NEW.created_at, now())
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on email_logs if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_logs') THEN
    DROP TRIGGER IF EXISTS trg_init_roofing_followup_on_email_sent ON public.email_logs;
    CREATE TRIGGER trg_init_roofing_followup_on_email_sent
      AFTER INSERT ON public.email_logs
      FOR EACH ROW
      WHEN (NEW.status = 'sent' AND NEW.campaign_contact_id IS NOT NULL)
      EXECUTE FUNCTION public.init_roofing_followup_on_email_sent();
  END IF;
END $$;

-- Also create trigger on campaign_contacts when sent_at is set
CREATE OR REPLACE FUNCTION public.init_roofing_followup_on_campaign_contact_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Only trigger when sent_at is first set (not on updates)
  IF NEW.sent_at IS NOT NULL AND (OLD.sent_at IS NULL OR OLD.sent_at IS DISTINCT FROM NEW.sent_at) THEN
    -- Get workspace_id from campaign
    SELECT workspace_id INTO v_workspace_id
    FROM public.campaigns
    WHERE id = NEW.campaign_id;
    
    IF v_workspace_id IS NOT NULL THEN
      -- Initialize follow-up state
      PERFORM public.init_roofing_followup_state(
        NEW.id,
        v_workspace_id,
        NEW.campaign_id,
        NEW.contact_id,
        NEW.sent_at
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on campaign_contacts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'campaign_contacts') THEN
    DROP TRIGGER IF EXISTS trg_init_roofing_followup_on_campaign_contact_sent ON public.campaign_contacts;
    CREATE TRIGGER trg_init_roofing_followup_on_campaign_contact_sent
      AFTER UPDATE OF sent_at ON public.campaign_contacts
      FOR EACH ROW
      WHEN (NEW.sent_at IS NOT NULL)
      EXECUTE FUNCTION public.init_roofing_followup_on_campaign_contact_sent();
  END IF;
END $$;

