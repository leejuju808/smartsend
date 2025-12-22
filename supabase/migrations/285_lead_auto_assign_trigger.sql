-- Block 267 — Lead & Deal Ownership v1
-- Migration 285: Create trigger function for auto-assigning leads

-- Function to assign lead owner based on assignment rules
CREATE OR REPLACE FUNCTION public.assign_lead_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_rule record;
  v_config jsonb;
  v_selected_user uuid;
  v_round_robin_result uuid;
BEGIN
  -- Only assign if owner_id is NULL
  IF NEW.owner_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Fetch active lead assignment rule for this workspace
  SELECT * INTO v_rule
  FROM public.assignment_rules
  WHERE workspace_id = NEW.workspace_id
    AND target = 'leads'
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no rule found, return NEW unchanged
  IF NOT FOUND THEN
    RETURN NEW;
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
    -- No assignment
    RETURN NEW;
  END IF;

  -- Assign the selected user
  IF v_selected_user IS NOT NULL THEN
    NEW.owner_id := v_selected_user;
    NEW.assigned_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS assign_lead_owner_trigger ON public.leads;
CREATE TRIGGER assign_lead_owner_trigger
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.assign_lead_owner();

COMMENT ON FUNCTION public.assign_lead_owner IS 'Automatically assigns lead owner based on active assignment rules when a new lead is created.';








