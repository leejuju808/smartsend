-- Block 267 — Lead & Deal Ownership v1
-- Migration 286: Helper function for deal assignment based on rules

-- Function to get deal owner based on assignment rules
CREATE OR REPLACE FUNCTION public.get_deal_owner_from_rules(
  p_workspace_id uuid,
  p_lead_owner_id uuid DEFAULT NULL,
  p_campaign_owner_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_rule record;
  v_config jsonb;
  v_selected_user uuid;
BEGIN
  -- Priority 1: Use lead owner if available
  IF p_lead_owner_id IS NOT NULL THEN
    RETURN p_lead_owner_id;
  END IF;

  -- Priority 2: Check deal assignment rule
  SELECT * INTO v_rule
  FROM public.assignment_rules
  WHERE workspace_id = p_workspace_id
    AND target = 'deals'
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no rule found, fall back to campaign owner
  IF NOT FOUND THEN
    RETURN p_campaign_owner_id;
  END IF;

  v_config := v_rule.config;

  -- Handle different rule types
  IF v_rule.type = 'round_robin' THEN
    -- Use round robin function
    v_selected_user := public.pick_round_robin_user(v_config);
    
    -- Update last_assigned_user_id in config
    IF v_selected_user IS NOT NULL THEN
      v_config := jsonb_set(v_config, '{last_assigned_user_id}', to_jsonb(v_selected_user::text));
      
      -- Update the rule's config (for next assignment)
      UPDATE public.assignment_rules
      SET config = v_config
      WHERE id = v_rule.id;
    END IF;
    
  ELSIF v_rule.type = 'single_owner' THEN
    -- Get user_id from config
    v_selected_user := (v_config->>'user_id')::uuid;
    
  ELSIF v_rule.type = 'none' THEN
    -- No assignment, fall back to campaign owner
    RETURN p_campaign_owner_id;
  END IF;

  -- Return selected user or fall back to campaign owner
  RETURN COALESCE(v_selected_user, p_campaign_owner_id);
END;
$$;

COMMENT ON FUNCTION public.get_deal_owner_from_rules IS 'Determines deal owner based on assignment rules. Priority: lead owner > deal rule > campaign owner.';

-- Update auto_create_deal_from_intent to use assignment rules
CREATE OR REPLACE FUNCTION public.auto_create_deal_from_intent(
  p_lead_id uuid,
  p_intent_primary text,
  p_workspace_id uuid DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_deal_id uuid;
  v_workspace_id uuid;
  v_owner_id uuid;
  v_lead_workspace_id uuid;
  v_lead_owner_id uuid;
  v_lead_first_name text;
  v_lead_last_name text;
  v_lead_company text;
  v_lead_campaign_id uuid;
  v_campaign_owner_id uuid;
  v_stage text;
  v_probability int;
  v_title text;
  v_old_stage text;
BEGIN
  -- Get lead info
  SELECT workspace_id, owner_id, first_name, last_name, company, campaign_id
  INTO v_lead_workspace_id, v_lead_owner_id, v_lead_first_name, v_lead_last_name, v_lead_company, v_lead_campaign_id
  FROM public.leads
  WHERE id = p_lead_id;

  IF v_lead_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found or has no workspace_id';
  END IF;

  -- Use provided workspace_id or fall back to lead's workspace_id
  v_workspace_id := COALESCE(p_workspace_id, v_lead_workspace_id);
  
  -- Get campaign owner if lead has campaign_id
  IF v_lead_campaign_id IS NOT NULL THEN
    SELECT owner_id INTO v_campaign_owner_id
    FROM public.campaigns
    WHERE id = v_lead_campaign_id
    LIMIT 1;
  END IF;

  -- Determine owner: provided > lead owner > deal rule > campaign owner
  IF p_owner_id IS NOT NULL THEN
    v_owner_id := p_owner_id;
  ELSIF v_lead_owner_id IS NOT NULL THEN
    v_owner_id := v_lead_owner_id;
  ELSE
    -- Use assignment rule helper
    v_owner_id := public.get_deal_owner_from_rules(
      v_workspace_id,
      v_lead_owner_id,
      v_campaign_owner_id
    );
  END IF;

  -- Check if deal already exists for this lead
  SELECT id INTO v_deal_id
  FROM public.deals
  WHERE lead_id = p_lead_id
  LIMIT 1;

  -- Determine stage and probability based on intent
  IF p_intent_primary = 'meeting_intent' THEN
    v_stage := 'meeting';
    v_probability := 50;
  ELSIF p_intent_primary = 'interested' THEN
    v_stage := 'working';
    v_probability := 20;
  ELSE
    v_stage := 'new';
    v_probability := 10;
  END IF;

  -- Generate title
  v_title := COALESCE(
    TRIM(v_lead_first_name || ' ' || v_lead_last_name),
    v_lead_company,
    'Deal'
  ) || ' — Deal';

  IF v_deal_id IS NOT NULL THEN
    -- Update existing deal stage if intent is higher priority
    IF (p_intent_primary = 'meeting_intent' AND (SELECT stage FROM public.deals WHERE id = v_deal_id) != 'meeting') OR
       (p_intent_primary = 'interested' AND (SELECT stage FROM public.deals WHERE id = v_deal_id) NOT IN ('meeting', 'proposal')) THEN
      -- Get old stage before update
      SELECT stage INTO v_old_stage FROM public.deals WHERE id = v_deal_id;
      
      UPDATE public.deals
      SET stage = v_stage,
          probability = GREATEST(probability, v_probability),
          updated_at = now()
      WHERE id = v_deal_id;

      -- Log stage change activity
      INSERT INTO public.deal_activity (deal_id, type, body, metadata)
      VALUES (
        v_deal_id,
        'stage_change',
        format('Deal moved to %s (auto-updated from %s intent)', v_stage, p_intent_primary),
        jsonb_build_object('intent', p_intent_primary, 'old_stage', v_old_stage, 'new_stage', v_stage)
      );
    END IF;

    RETURN v_deal_id;
  ELSE
    -- Create new deal
    INSERT INTO public.deals (
      workspace_id,
      lead_id,
      owner_id,
      title,
      stage,
      probability
    )
    VALUES (
      v_workspace_id,
      p_lead_id,
      v_owner_id,
      v_title,
      v_stage,
      v_probability
    )
    RETURNING id INTO v_deal_id;

    -- Log deal creation activity
    INSERT INTO public.deal_activity (deal_id, type, body, metadata)
    VALUES (
      v_deal_id,
      'note',
      format('Deal auto-created from %s intent', p_intent_primary),
      jsonb_build_object('intent', p_intent_primary, 'auto_created', true)
    );

    RETURN v_deal_id;
  END IF;
END;
$$;

