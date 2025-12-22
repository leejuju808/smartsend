-- =========================================================
-- Block 8880 — Auto-Follow-Up Brain v1
-- Behavior-Based Sequences That Keep Roof Leads Alive
-- =========================================================

-- 1. Create follow_up_rule_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'follow_up_rule_type') THEN
    CREATE TYPE follow_up_rule_type AS ENUM (
      'no_reply',
      'positive_intent',
      'negative_intent',
      'pipeline_stage',
      'lead_score'
    );
  END IF;
END$$;

-- 2. Create follow_up_event_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'follow_up_event_type') THEN
    CREATE TYPE follow_up_event_type AS ENUM (
      'scheduled_follow_up',
      'skipped_due_to_cap',
      'skipped_due_to_suppression',
      'stopped_by_positive_intent',
      'stopped_by_negative_intent',
      'stopped_by_pipeline_stage',
      'stopped_by_manual_action'
    );
  END IF;
END$$;

-- 3. Create follow_up_programs table (per campaign)
CREATE TABLE IF NOT EXISTS public.follow_up_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  -- global caps
  max_follow_ups_per_lead int NOT NULL DEFAULT 4,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_follow_up_programs_account ON public.follow_up_programs(account_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_programs_campaign ON public.follow_up_programs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_programs_enabled ON public.follow_up_programs(is_enabled) WHERE is_enabled = true;

-- 4. Create follow_up_rules table
CREATE TABLE IF NOT EXISTS public.follow_up_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.follow_up_programs(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type follow_up_rule_type NOT NULL,
  -- generic toggles
  is_enabled boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 100,
  -- for no_reply
  no_reply_after_days int,  -- e.g. 2, 5, etc.
  follow_up_template_id uuid REFERENCES public.email_templates(id),
  -- for positive/negative intent
  intent_match_any text[], -- e.g. ['hot', 'warm'], ['not_interested','unsubscribe']
  -- for pipeline_stage
  pipeline_stage_from text, -- enum-like in code ('new','quoted','won','lost')
  pipeline_stage_to text,
  -- for lead_score
  min_lead_score int,
  max_lead_score int,
  -- action flags
  stop_all_future boolean NOT NULL DEFAULT false,
  add_to_suppression boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_rules_program ON public.follow_up_rules(program_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_rules_account ON public.follow_up_rules(account_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_rules_type ON public.follow_up_rules(type, is_enabled);
CREATE INDEX IF NOT EXISTS idx_follow_up_rules_priority ON public.follow_up_rules(priority);

-- 5. Create follow_up_events table (internal log of decisions)
CREATE TABLE IF NOT EXISTS public.follow_up_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  message_id uuid, -- outbound that triggered rule (references messages if table exists)
  rule_id uuid REFERENCES public.follow_up_rules(id),
  event_type follow_up_event_type NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_events_account ON public.follow_up_events(account_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_events_campaign ON public.follow_up_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_events_contact ON public.follow_up_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_events_type ON public.follow_up_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_follow_up_events_created ON public.follow_up_events(created_at DESC);

-- 6. Create lead_auto_follow_up_stats table (per lead per campaign)
CREATE TABLE IF NOT EXISTS public.lead_auto_follow_up_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  auto_follow_ups_sent int NOT NULL DEFAULT 0,
  last_auto_follow_up_at timestamptz,
  last_outbound_at timestamptz,
  last_inbound_at timestamptz,
  last_intent text, -- 'hot','warm','neutral','negative'
  current_pipeline_stage text, -- 'new','quoted','won','lost'
  current_lead_score int NOT NULL DEFAULT 0,
  auto_follow_up_disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_auto_follow_up_stats_account ON public.lead_auto_follow_up_stats(account_id);
CREATE INDEX IF NOT EXISTS idx_lead_auto_follow_up_stats_campaign ON public.lead_auto_follow_up_stats(campaign_id);
CREATE INDEX IF NOT EXISTS idx_lead_auto_follow_up_stats_contact ON public.lead_auto_follow_up_stats(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_auto_follow_up_stats_disabled ON public.lead_auto_follow_up_stats(auto_follow_up_disabled) WHERE auto_follow_up_disabled = false;
CREATE INDEX IF NOT EXISTS idx_lead_auto_follow_up_stats_last_outbound ON public.lead_auto_follow_up_stats(last_outbound_at) WHERE last_outbound_at IS NOT NULL;

-- 7. Create updated_at triggers
CREATE OR REPLACE FUNCTION public.set_follow_up_programs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_follow_up_rules_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_lead_auto_follow_up_stats_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_up_programs_updated_at ON public.follow_up_programs;
CREATE TRIGGER trg_follow_up_programs_updated_at
BEFORE UPDATE ON public.follow_up_programs
FOR EACH ROW
EXECUTE FUNCTION public.set_follow_up_programs_updated_at();

DROP TRIGGER IF EXISTS trg_follow_up_rules_updated_at ON public.follow_up_rules;
CREATE TRIGGER trg_follow_up_rules_updated_at
BEFORE UPDATE ON public.follow_up_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_follow_up_rules_updated_at();

DROP TRIGGER IF EXISTS trg_lead_auto_follow_up_stats_updated_at ON public.lead_auto_follow_up_stats;
CREATE TRIGGER trg_lead_auto_follow_up_stats_updated_at
BEFORE UPDATE ON public.lead_auto_follow_up_stats
FOR EACH ROW
EXECUTE FUNCTION public.set_lead_auto_follow_up_stats_updated_at();

-- 8. Enable RLS
ALTER TABLE public.follow_up_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_auto_follow_up_stats ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies for follow_up_programs
CREATE POLICY "follow_up_programs_select_own"
ON public.follow_up_programs
FOR SELECT
USING (account_id = auth.uid());

CREATE POLICY "follow_up_programs_insert_own"
ON public.follow_up_programs
FOR INSERT
WITH CHECK (account_id = auth.uid());

CREATE POLICY "follow_up_programs_update_own"
ON public.follow_up_programs
FOR UPDATE
USING (account_id = auth.uid())
WITH CHECK (account_id = auth.uid());

CREATE POLICY "follow_up_programs_delete_own"
ON public.follow_up_programs
FOR DELETE
USING (account_id = auth.uid());

-- Service role can manage programs (for CRON execution)
CREATE POLICY "follow_up_programs_service_role_all"
ON public.follow_up_programs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 10. RLS Policies for follow_up_rules
CREATE POLICY "follow_up_rules_select_own"
ON public.follow_up_rules
FOR SELECT
USING (account_id = auth.uid());

CREATE POLICY "follow_up_rules_insert_own"
ON public.follow_up_rules
FOR INSERT
WITH CHECK (account_id = auth.uid());

CREATE POLICY "follow_up_rules_update_own"
ON public.follow_up_rules
FOR UPDATE
USING (account_id = auth.uid())
WITH CHECK (account_id = auth.uid());

CREATE POLICY "follow_up_rules_delete_own"
ON public.follow_up_rules
FOR DELETE
USING (account_id = auth.uid());

-- Service role can manage rules (for CRON execution)
CREATE POLICY "follow_up_rules_service_role_all"
ON public.follow_up_rules
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 11. RLS Policies for follow_up_events
CREATE POLICY "follow_up_events_select_own"
ON public.follow_up_events
FOR SELECT
USING (account_id = auth.uid());

CREATE POLICY "follow_up_events_insert_own"
ON public.follow_up_events
FOR INSERT
WITH CHECK (account_id = auth.uid());

-- Service role can manage events (for CRON execution)
CREATE POLICY "follow_up_events_service_role_all"
ON public.follow_up_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 12. RLS Policies for lead_auto_follow_up_stats
CREATE POLICY "lead_auto_follow_up_stats_select_own"
ON public.lead_auto_follow_up_stats
FOR SELECT
USING (account_id = auth.uid());

CREATE POLICY "lead_auto_follow_up_stats_insert_own"
ON public.lead_auto_follow_up_stats
FOR INSERT
WITH CHECK (account_id = auth.uid());

CREATE POLICY "lead_auto_follow_up_stats_update_own"
ON public.lead_auto_follow_up_stats
FOR UPDATE
USING (account_id = auth.uid())
WITH CHECK (account_id = auth.uid());

-- Service role can manage stats (for CRON execution)
CREATE POLICY "lead_auto_follow_up_stats_service_role_all"
ON public.lead_auto_follow_up_stats
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 13. Helper function: Check if contact is suppressed
CREATE OR REPLACE FUNCTION public.is_contact_suppressed(
  p_account_id uuid,
  p_campaign_id uuid,
  p_contact_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_suppressed boolean := false;
  v_email text;
BEGIN
  -- Get contact email
  SELECT email INTO v_email
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF v_email IS NULL THEN
    RETURN true; -- Can't send if no email
  END IF;
  
  -- Check global suppression list (Block 8230)
  SELECT EXISTS (
    SELECT 1
    FROM public.suppression_list
    WHERE account_id = p_account_id
      AND email = lower(v_email)
      AND scope = 'account'
  ) INTO v_suppressed;
  
  IF v_suppressed THEN
    RETURN true;
  END IF;
  
  -- Check campaign-level suppression
  SELECT EXISTS (
    SELECT 1
    FROM public.suppression_list
    WHERE account_id = p_account_id
      AND email = lower(v_email)
      AND scope = 'campaign'
      AND campaign_id = p_campaign_id
  ) INTO v_suppressed;
  
  RETURN v_suppressed;
END;
$$;

-- 14. Helper function: Get last outbound message time for contact/campaign
CREATE OR REPLACE FUNCTION public.get_last_outbound_time(
  p_contact_id uuid,
  p_campaign_id uuid
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_last_outbound timestamptz;
BEGIN
  -- Try to find from outbound_emails table
  SELECT MAX(sent_at) INTO v_last_outbound
  FROM public.outbound_emails
  WHERE contact_id = p_contact_id
    AND campaign_id = p_campaign_id
    AND sent_at IS NOT NULL;
  
  -- Fallback to send_logs if available
  IF v_last_outbound IS NULL THEN
    SELECT MAX(created_at) INTO v_last_outbound
    FROM public.send_logs
    WHERE contact_id = p_contact_id
      AND campaign_id = p_campaign_id
      AND status = 'sent';
  END IF;
  
  -- Fallback to messages table if available (check if table exists)
  IF v_last_outbound IS NULL THEN
    BEGIN
      SELECT MAX(created_at) INTO v_last_outbound
      FROM public.messages
      WHERE contact_id = p_contact_id
        AND campaign_id = p_campaign_id
        AND direction = 'out';
    EXCEPTION
      WHEN undefined_table THEN
        -- messages table doesn't exist, skip
        NULL;
    END;
  END IF;
  
  RETURN v_last_outbound;
END;
$$;

-- 15. Helper function: Get last inbound message time for contact/campaign
CREATE OR REPLACE FUNCTION public.get_last_inbound_time(
  p_contact_id uuid,
  p_campaign_id uuid
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_last_inbound timestamptz;
BEGIN
  -- Try to find from messages table if available
  BEGIN
    SELECT MAX(created_at) INTO v_last_inbound
    FROM public.messages
    WHERE contact_id = p_contact_id
      AND campaign_id = p_campaign_id
      AND direction = 'in';
  EXCEPTION
    WHEN undefined_table THEN
      -- messages table doesn't exist, skip
      NULL;
  END;
  
  -- Fallback to inbound_messages if available
  IF v_last_inbound IS NULL THEN
    BEGIN
      SELECT MAX(created_at) INTO v_last_inbound
      FROM public.inbound_messages
      WHERE contact_id = p_contact_id
        AND campaign_id = p_campaign_id;
    EXCEPTION
      WHEN undefined_table THEN
        -- inbound_messages table doesn't exist, skip
        NULL;
    END;
  END IF;
  
  RETURN v_last_inbound;
END;
$$;

-- 16. Comments
COMMENT ON TABLE public.follow_up_programs IS 'Follow-up programs per campaign - controls auto-follow-up behavior';
COMMENT ON TABLE public.follow_up_rules IS 'Individual follow-up rules (no-reply, positive/negative intent, pipeline, lead score)';
COMMENT ON TABLE public.follow_up_events IS 'Log of all follow-up decisions for dashboard and safety';
COMMENT ON TABLE public.lead_auto_follow_up_stats IS 'Per-lead per-campaign stats for enforcing caps and tracking state';
COMMENT ON FUNCTION public.is_contact_suppressed IS 'Check if a contact is suppressed (global or campaign-level)';
COMMENT ON FUNCTION public.get_last_outbound_time IS 'Get the last outbound message time for a contact/campaign';
COMMENT ON FUNCTION public.get_last_inbound_time IS 'Get the last inbound message time for a contact/campaign';

