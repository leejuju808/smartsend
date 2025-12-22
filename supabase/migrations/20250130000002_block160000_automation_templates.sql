-- =========================================================
-- Block 160000 — Pre-Built Roofing Automation Templates
-- =========================================================
-- 
-- These are the default automation workflows that ship with SmartSend.
-- Roofers can enable/disable them or use them as templates.
-- =========================================================

-- Helper function to create automation with trigger, conditions, and actions
CREATE OR REPLACE FUNCTION create_automation_template(
  p_company_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_trigger_event TEXT,
  p_conditions JSONB DEFAULT '[]'::jsonb,
  p_actions JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_automation_id UUID;
  v_condition JSONB;
  v_action JSONB;
BEGIN
  -- Create automation
  INSERT INTO public.automations (company_id, name, description, is_active)
  VALUES (p_company_id, p_name, p_description, true)
  RETURNING id INTO v_automation_id;

  -- Create trigger
  INSERT INTO public.automation_triggers (automation_id, event_key)
  VALUES (v_automation_id, p_trigger_event);

  -- Create conditions
  FOR v_condition IN SELECT * FROM jsonb_array_elements(p_conditions)
  LOOP
    INSERT INTO public.automation_conditions (automation_id, field, operator, value)
    VALUES (
      v_automation_id,
      v_condition->>'field',
      v_condition->>'operator',
      v_condition->>'value'
    );
  END LOOP;

  -- Create actions
  FOR v_action IN SELECT * FROM jsonb_array_elements(p_actions)
  LOOP
    INSERT INTO public.automation_actions (automation_id, action_key, payload, action_order)
    VALUES (
      v_automation_id,
      v_action->>'action_key',
      COALESCE(v_action->'payload', '{}'::jsonb),
      COALESCE((v_action->>'action_order')::int, 0)
    );
  END LOOP;

  RETURN v_automation_id;
END;
$$;

-- ============================================================================
-- TEMPLATE #1 — Hot Lead Fastlane
-- ============================================================================
-- Trigger: lead.hot
-- Actions:
--   - Send SMS immediately: "We can come today or tomorrow — what works?"
--   - Notify the owner
--   - Assign to sales rep
-- ============================================================================

-- This template will be created per company when they first set up automations
-- We'll create a function that can be called to seed templates for a company

CREATE OR REPLACE FUNCTION seed_automation_templates_for_company(p_company_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Template 1: Hot Lead Fastlane
  PERFORM create_automation_template(
    p_company_id,
    'Hot Lead Fastlane',
    'Automatically respond to hot leads with immediate SMS and assign to sales rep',
    'lead.hot',
    '[]'::jsonb, -- No conditions, triggers on any hot lead
    '[
      {
        "action_key": "send_sms",
        "payload": {"message": "We can come today or tomorrow — what works?"},
        "action_order": 0
      },
      {
        "action_key": "notify_owner",
        "payload": {"title": "Hot Lead Alert", "message": "A hot lead just came in and was automatically contacted."},
        "action_order": 1
      },
      {
        "action_key": "assign_to_user",
        "payload": {"user_id": null},
        "action_order": 2
      }
    ]'::jsonb
  );

  -- Template 2: No Response Follow-Up
  PERFORM create_automation_template(
    p_company_id,
    'No Response Follow-Up',
    'Automatically follow up with leads who haven''t responded in 48 hours',
    'lead.no_response_48h',
    '[]'::jsonb,
    '[
      {
        "action_key": "send_sms",
        "payload": {"message": "Still need help with your roof?"},
        "action_order": 0
      },
      {
        "action_key": "move_to_stage",
        "payload": {"stage_name": "Follow-Up Needed"},
        "action_order": 1
      }
    ]'::jsonb
  );

  -- Template 3: Website Lead → SMS First Touch
  PERFORM create_automation_template(
    p_company_id,
    'Website Lead → SMS First Touch',
    'Immediately SMS leads who come from the website widget',
    'lead.created',
    '[{"field": "source", "operator": "=", "value": "website-widget"}]'::jsonb,
    '[
      {
        "action_key": "send_sms",
        "payload": {"message": "Hey, got your request from the website — what''s the full address?"},
        "action_order": 0
      }
    ]'::jsonb
  );

  -- Template 4: Missed Call → Text Back
  PERFORM create_automation_template(
    p_company_id,
    'Missed Call → Text Back',
    'Automatically text back when a call is missed',
    'call.missed',
    '[]'::jsonb,
    '[
      {
        "action_key": "send_sms",
        "payload": {"message": "Sorry we missed you! Want to schedule a roofing estimate?"},
        "action_order": 0
      }
    ]'::jsonb
  );

  -- Template 5: Job Won → Assign Crew
  PERFORM create_automation_template(
    p_company_id,
    'Job Won → Assign Crew',
    'Automatically create crew assignment and notify production manager when job is won',
    'job.won',
    '[]'::jsonb,
    '[
      {
        "action_key": "notify_owner",
        "payload": {"title": "Job Won", "message": "A new job was won and needs crew assignment."},
        "action_order": 0
      }
    ]'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION seed_automation_templates_for_company IS 'Seeds the 5 default roofing automation templates for a company';


























