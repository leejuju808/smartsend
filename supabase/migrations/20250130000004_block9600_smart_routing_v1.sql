-- =========================================================
-- Block 9600 — Smart Routing v1
-- Instant Hot-Lead Alerts + Owner Notifications + Priority Pipeline Updates
-- =========================================================

-- 1. Add priority column to lead_auto_follow_up_stats
ALTER TABLE IF EXISTS public.lead_auto_follow_up_stats
  ADD COLUMN IF NOT EXISTS priority boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lead_auto_follow_up_stats_priority 
  ON public.lead_auto_follow_up_stats (account_id, campaign_id, priority) 
  WHERE priority = true;

COMMENT ON COLUMN public.lead_auto_follow_up_stats.priority IS 'Priority flag for hot/warm leads that need immediate attention';

-- 2. Create routing_events table
CREATE TABLE IF NOT EXISTS public.routing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  message_id uuid,
  type text NOT NULL CHECK (type IN ('hot_alert', 'warm_alert', 'manual_stage', 'priority_set', 'follow_up_stopped')),
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routing_events_account ON public.routing_events(account_id);
CREATE INDEX IF NOT EXISTS idx_routing_events_campaign ON public.routing_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_routing_events_contact ON public.routing_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_routing_events_type ON public.routing_events(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_events_created ON public.routing_events(created_at DESC);

COMMENT ON TABLE public.routing_events IS 'Log of all smart routing events (hot/warm alerts, priority changes, follow-up stops)';
COMMENT ON COLUMN public.routing_events.type IS 'Event type: hot_alert, warm_alert, manual_stage, priority_set, follow_up_stopped';
COMMENT ON COLUMN public.routing_events.details IS 'JSONB with event-specific details (intent, summary, next_action, etc.)';

-- 3. Create function to handle hot lead routing
CREATE OR REPLACE FUNCTION public.handle_hot_lead_routing(
  p_account_id uuid,
  p_campaign_id uuid,
  p_contact_id uuid,
  p_message_id uuid DEFAULT NULL,
  p_summary text DEFAULT NULL,
  p_next_action text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Update lead stats: set status to hot, stage to contacted, priority to true, disable follow-ups
  UPDATE public.lead_auto_follow_up_stats
  SET
    lead_status = 'hot'::lead_status,
    pipeline_stage = CASE 
      WHEN pipeline_stage = 'new'::pipeline_stage THEN 'contacted'::pipeline_stage
      ELSE pipeline_stage
    END,
    priority = true,
    auto_follow_up_disabled = true,
    last_intent = 'hot',
    updated_at = now()
  WHERE account_id = p_account_id
    AND campaign_id = p_campaign_id
    AND contact_id = p_contact_id;

  -- If no row exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.lead_auto_follow_up_stats (
      account_id,
      campaign_id,
      contact_id,
      lead_status,
      pipeline_stage,
      priority,
      auto_follow_up_disabled,
      last_intent
    )
    VALUES (
      p_account_id,
      p_campaign_id,
      p_contact_id,
      'hot'::lead_status,
      'contacted'::pipeline_stage,
      true,
      true,
      'hot'
    );
  END IF;

  -- Log routing event
  INSERT INTO public.routing_events (
    account_id,
    campaign_id,
    contact_id,
    message_id,
    type,
    details
  )
  VALUES (
    p_account_id,
    p_campaign_id,
    p_contact_id,
    p_message_id,
    'hot_alert',
    jsonb_build_object(
      'intent', 'hot',
      'summary', p_summary,
      'next_action', p_next_action,
      'stopped_follow_ups', true
    )
  );

  -- Log follow-up stop event
  INSERT INTO public.follow_up_events (
    account_id,
    campaign_id,
    contact_id,
    message_id,
    event_type,
    details
  )
  VALUES (
    p_account_id,
    p_campaign_id,
    p_contact_id,
    p_message_id,
    'stopped_by_positive_intent'::follow_up_event_type,
    jsonb_build_object(
      'intent', 'hot',
      'reason', 'Hot lead detected - follow-ups disabled'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'lead_status', 'hot',
    'pipeline_stage', 'contacted',
    'priority', true,
    'follow_ups_disabled', true
  );
END;
$$;

-- 4. Create function to handle warm lead routing
CREATE OR REPLACE FUNCTION public.handle_warm_lead_routing(
  p_account_id uuid,
  p_campaign_id uuid,
  p_contact_id uuid,
  p_message_id uuid DEFAULT NULL,
  p_summary text DEFAULT NULL,
  p_next_action text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Update lead stats: set status to warm, stage to contacted, priority to true, disable follow-ups
  UPDATE public.lead_auto_follow_up_stats
  SET
    lead_status = 'warm'::lead_status,
    pipeline_stage = CASE 
      WHEN pipeline_stage = 'new'::pipeline_stage THEN 'contacted'::pipeline_stage
      ELSE pipeline_stage
    END,
    priority = true,
    auto_follow_up_disabled = true,
    last_intent = 'warm',
    updated_at = now()
  WHERE account_id = p_account_id
    AND campaign_id = p_campaign_id
    AND contact_id = p_contact_id;

  -- If no row exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.lead_auto_follow_up_stats (
      account_id,
      campaign_id,
      contact_id,
      lead_status,
      pipeline_stage,
      priority,
      auto_follow_up_disabled,
      last_intent
    )
    VALUES (
      p_account_id,
      p_campaign_id,
      p_contact_id,
      'warm'::lead_status,
      'contacted'::pipeline_stage,
      true,
      true,
      'warm'
    );
  END IF;

  -- Log routing event
  INSERT INTO public.routing_events (
    account_id,
    campaign_id,
    contact_id,
    message_id,
    type,
    details
  )
  VALUES (
    p_account_id,
    p_campaign_id,
    p_contact_id,
    p_message_id,
    'warm_alert',
    jsonb_build_object(
      'intent', 'warm',
      'summary', p_summary,
      'next_action', p_next_action,
      'stopped_follow_ups', true
    )
  );

  -- Log follow-up stop event
  INSERT INTO public.follow_up_events (
    account_id,
    campaign_id,
    contact_id,
    message_id,
    event_type,
    details
  )
  VALUES (
    p_account_id,
    p_campaign_id,
    p_contact_id,
    p_message_id,
    'stopped_by_positive_intent'::follow_up_event_type,
    jsonb_build_object(
      'intent', 'warm',
      'reason', 'Warm lead detected - follow-ups disabled'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'lead_status', 'warm',
    'pipeline_stage', 'contacted',
    'priority', true,
    'follow_ups_disabled', true
  );
END;
$$;

-- 5. Create function to handle manual stage routing
CREATE OR REPLACE FUNCTION public.handle_manual_stage_routing(
  p_account_id uuid,
  p_campaign_id uuid,
  p_contact_id uuid,
  p_pipeline_stage pipeline_stage
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_should_set_priority boolean;
BEGIN
  -- Determine if priority should be set based on stage
  v_should_set_priority := p_pipeline_stage IN ('estimate_scheduled'::pipeline_stage, 'won'::pipeline_stage);

  -- Update lead stats
  UPDATE public.lead_auto_follow_up_stats
  SET
    pipeline_stage = p_pipeline_stage,
    priority = CASE 
      WHEN v_should_set_priority THEN true
      ELSE priority  -- Keep existing priority value
    END,
    updated_at = now()
  WHERE account_id = p_account_id
    AND campaign_id = p_campaign_id
    AND contact_id = p_contact_id;

  -- If no row exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.lead_auto_follow_up_stats (
      account_id,
      campaign_id,
      contact_id,
      pipeline_stage,
      priority
    )
    VALUES (
      p_account_id,
      p_campaign_id,
      p_contact_id,
      p_pipeline_stage,
      v_should_set_priority
    );
  END IF;

  -- Log routing event if priority was set
  IF v_should_set_priority THEN
    INSERT INTO public.routing_events (
      account_id,
      campaign_id,
      contact_id,
      type,
      details
    )
    VALUES (
      p_account_id,
      p_campaign_id,
      p_contact_id,
      'manual_stage',
      jsonb_build_object(
        'pipeline_stage', p_pipeline_stage,
        'priority_set', true
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'pipeline_stage', p_pipeline_stage,
    'priority', v_should_set_priority
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.handle_hot_lead_routing TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_warm_lead_routing TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_manual_stage_routing TO authenticated;
























































