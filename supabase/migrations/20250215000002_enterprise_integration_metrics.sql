-- Enterprise Integration Metrics
-- Tracks adoption and usage of HubSpot, Notion, and Zapier integrations

-- Add enabled column to integrations table
alter table public.integrations 
  add column if not exists enabled boolean default true;

-- Create integration metrics view
create or replace view integration_metrics as
select
  count(distinct org_id) filter (where type = 'hubspot' and enabled = true) as hubspot_orgs,
  count(distinct org_id) filter (where type = 'notion' and enabled = true) as notion_orgs,
  count(distinct org_id) filter (where type = 'zapier' and enabled = true) as zapier_orgs,
  count(distinct org_id) filter (where type = 'hubspot' and enabled = true) + 
  count(distinct org_id) filter (where type = 'notion' and enabled = true) + 
  count(distinct org_id) filter (where type = 'zapier' and enabled = true) as total_integration_orgs
from public.integrations
where enabled = true;

-- Create RPC function to get organization integration adoption
create or replace function get_org_integration_adoption(p_org_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'org_id', p_org_id,
    'hubspot_connected', exists (
      select 1 from public.integrations 
      where org_id = p_org_id 
        and type = 'hubspot' 
        and enabled = true
    ),
    'notion_connected', exists (
      select 1 from public.integrations 
      where org_id = p_org_id 
        and type = 'notion' 
        and enabled = true
    ),
    'zapier_connected', exists (
      select 1 from public.integrations 
      where org_id = p_org_id 
        and type = 'zapier' 
        and enabled = true
    ),
    'total_integrations', (
      select count(*) from public.integrations 
      where org_id = p_org_id 
        and enabled = true
    ),
    'last_synced_at', (
      select max(updated_at) from public.integrations 
      where org_id = p_org_id 
        and enabled = true
    )
  ) into v_result;
  
  return v_result;
end;
$$;

-- Grant permissions
grant select on integration_metrics to authenticated;
grant execute on function get_org_integration_adoption(uuid) to authenticated;

-- Create index for faster lookups
create index if not exists idx_integrations_org_type_enabled 
  on public.integrations(org_id, type, enabled);
