-- Block 296: Global Workspace Limits
-- Max 10k leads, max 100 campaigns, max 5 active sequences per workspace

-- View: workspace_limits_usage
-- Shows current usage and hard limits for each workspace
create or replace view workspace_limits_usage as
select
  w.id as workspace_id,

  -- counts
  (select count(*) from public.leads l where l.workspace_id = w.id) as leads_count,
  (select count(*) from public.campaigns c where c.workspace_id = w.id) as campaigns_count,
  (select count(*) from public.sequences s where s.workspace_id = w.id and s.status = 'active') as active_sequences_count,

  -- hard limits (GLOBAL)
  10000::integer as leads_limit,
  100::integer as campaigns_limit,
  5::integer as active_sequences_limit

from public.workspaces w;

-- Function: check_workspace_limit
-- Returns status ('ok' or 'blocked') and reason if blocked
create or replace function check_workspace_limit(
  workspace_id_input uuid,
  kind text,
  delta integer
)
returns json
language plpgsql
as $$
declare
  usage_row workspace_limits_usage;
  status text;
  reason text;
begin
  select * into usage_row
  from workspace_limits_usage
  where workspace_id = workspace_id_input;

  if kind = 'leads' then
    if usage_row.leads_count + delta > usage_row.leads_limit then
      status := 'blocked';
      reason := 'leads_limit';
    else
      status := 'ok';
      reason := null;
    end if;
  elsif kind = 'campaigns' then
    if usage_row.campaigns_count + delta > usage_row.campaigns_limit then
      status := 'blocked';
      reason := 'campaigns_limit';
    else
      status := 'ok';
      reason := null;
    end if;
  elsif kind = 'sequences' then
    if usage_row.active_sequences_count + delta > usage_row.active_sequences_limit then
      status := 'blocked';
      reason := 'sequences_limit';
    else
      status := 'ok';
      reason := null;
    end if;
  else
    status := 'error';
    reason := 'unknown_kind';
  end if;

  return json_build_object(
    'status', status,
    'reason', reason,
    'usage', row_to_json(usage_row)
  );
end;
$$;

