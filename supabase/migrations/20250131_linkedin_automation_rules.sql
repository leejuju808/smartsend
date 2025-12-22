-- Add sample automation rule for LinkedIn replies
-- This migration adds a default automation rule that tags leads when they reply via LinkedIn

-- Note: This is a sample rule. Users can create their own rules via the UI.
-- The actual rule creation should be done per workspace, so this is just an example.

-- Function to insert automation rule for a specific workspace
create or replace function public.create_linkedin_reply_automation(p_workspace_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_rule_id uuid;
begin
  -- Check if rule already exists
  select id into v_rule_id
  from public.automation_rules
  where workspace_id = p_workspace_id
    and event_type = 'reply_linkedin'
    and name = 'Tag Warm LinkedIn Lead'
  limit 1;

  if v_rule_id is null then
    -- Create the rule
    insert into public.automation_rules (
      workspace_id,
      name,
      is_enabled,
      trigger_type,
      event_type,
      condition_json
    )
    values (
      p_workspace_id,
      'Tag Warm LinkedIn Lead',
      true,
      'event',
      'reply_linkedin',
      '{}'::jsonb
    )
    returning id into v_rule_id;

    -- Create the action
    insert into public.automation_actions (
      rule_id,
      action_type,
      action_payload
    )
    values (
      v_rule_id,
      'tag',
      '{"tag": "Warm LinkedIn Lead"}'::jsonb
    );
  end if;

  return v_rule_id;
end;
$$;

