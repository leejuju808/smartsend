-- Lead status counts RPC for fast header metrics
create or replace function public.lead_status_counts(
  p_workspace uuid,
  p_campaign uuid default null,
  p_from timestamptz default null,
  p_to   timestamptz default null
) returns table (status text, count bigint)
language sql
stable
as $$
  select l.status, count(*)::bigint
  from public.leads l
  where l.workspace_id = p_workspace
    and (p_campaign is null or l.campaign_id = p_campaign)
    and (p_from is null or l.created_at >= p_from)
    and (p_to   is null or l.created_at <= p_to)
  group by l.status
$$;

grant execute on function public.lead_status_counts(uuid,uuid,timestamptz,timestamptz) to anon, authenticated, service_role;


