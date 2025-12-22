-- Block 298 — Sequence Permissions Layer
-- SQL helper: get_campaign_role function
-- Returns the role of a user for a campaign: 'owner', 'editor', 'viewer', or null

create or replace function get_campaign_role(
  campaign_id_input uuid,
  user_id_input uuid
)
returns text
language sql
security definer
as $$
  select
    case
      -- owner/admin on workspace always override collaborator roles
      when exists (
        select 1
        from campaigns c
        join team_members tm
          on tm.workspace_id = c.workspace_id
          and tm.user_id = user_id_input
        where c.id = campaign_id_input
        and tm.role in ('owner', 'admin')
      )
        then 'owner'

      else (
        select role::text
        from campaign_members
        where campaign_id = campaign_id_input
        and user_id = user_id_input
      )
    end as role;
$$;

-- Grant execute permission to authenticated users
grant execute on function get_campaign_role(uuid, uuid) to authenticated;

