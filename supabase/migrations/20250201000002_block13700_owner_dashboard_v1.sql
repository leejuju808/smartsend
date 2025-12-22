-- Block 13700 — Owner Dashboard v1 (Revenue & Activity Snapshot)
-- Simple Stats View (Last 30 Days) for roofing owners
-- "How many emails went out? How many replied? How many hot leads? How much money could this be?"

-- ============================================================================
-- 1. CREATE dashboard_stats_30d FUNCTION (workspace-scoped)
-- ============================================================================

-- Function that returns dashboard stats for a specific workspace
create or replace function public.get_dashboard_stats_30d(p_workspace_id uuid)
returns table (
  emails_sent bigint,
  replies_received bigint,
  hot_leads bigint,
  warm_leads bigint,
  booked_leads bigint,
  won_leads bigint,
  pipeline_events bigint,
  notes_created bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_time timestamptz := now() - interval '30 days';
begin
  return query
  with
  -- Count outbound emails (sent) in last 30 days for this workspace
  -- Handle multiple schemas: via campaigns, direct workspace_id, or team_id
  outbound_counts as (
    select count(*) as emails_sent
    from public.email_messages em
    left join public.campaigns c on c.id = em.campaign_id
    where em.direction in ('outbound', 'out')
      and em.created_at >= v_start_time
      and (
        em.bounce is not true
        or em.bounce is null
      )  -- exclude bounced emails from sent count
      and (
        c.workspace_id = p_workspace_id
        or (em.workspace_id is not null and em.workspace_id = p_workspace_id)
        or (em.team_id is not null and em.team_id = p_workspace_id)
      )
  ),
  -- Count inbound emails (replies) in last 30 days for this workspace
  inbound_counts as (
    select count(*) as replies_received
    from public.email_messages em
    left join public.campaigns c on c.id = em.campaign_id
    where em.direction in ('inbound', 'in')
      and em.created_at >= v_start_time
      and (
        em.human_reply is true
        or (em.human_reply is null and em.classification_label = 'human')
      )  -- only count actual human replies
      and (
        c.workspace_id = p_workspace_id
        or (em.workspace_id is not null and em.workspace_id = p_workspace_id)
        or (em.team_id is not null and em.team_id = p_workspace_id)
      )
  ),
  -- Count leads by status (all time, not just last 30 days) for this workspace
  lead_counts as (
    select
      count(*) filter (where lead_status = 'hot') as hot_leads,
      count(*) filter (where lead_status = 'warm') as warm_leads,
      count(*) filter (where lead_status = 'booked') as booked_leads,
      count(*) filter (where lead_status = 'won') as won_leads
    from public.contacts
    where workspace_id = p_workspace_id
  ),
  -- Count activity events in last 30 days for this workspace
  activity_counts as (
    select
      count(*) filter (where activity_type = 'pipeline_update') as pipeline_events,
      count(*) filter (where activity_type = 'note') as notes_created
    from public.contact_activity ca
    join public.contacts c on c.id = ca.contact_id
    where ca.created_at >= v_start_time
      and c.workspace_id = p_workspace_id
  )
  select
    coalesce(outbound_counts.emails_sent, 0)::bigint as emails_sent,
    coalesce(inbound_counts.replies_received, 0)::bigint as replies_received,
    coalesce(lead_counts.hot_leads, 0)::bigint as hot_leads,
    coalesce(lead_counts.warm_leads, 0)::bigint as warm_leads,
    coalesce(lead_counts.booked_leads, 0)::bigint as booked_leads,
    coalesce(lead_counts.won_leads, 0)::bigint as won_leads,
    coalesce(activity_counts.pipeline_events, 0)::bigint as pipeline_events,
    coalesce(activity_counts.notes_created, 0)::bigint as notes_created
  from outbound_counts, inbound_counts, lead_counts, activity_counts;
end;
$$;

-- Grant access
grant execute on function public.get_dashboard_stats_30d(uuid) to authenticated;

comment on function public.get_dashboard_stats_30d(uuid) is 'Returns dashboard stats for a workspace: emails sent/received (last 30d), lead counts by status (all time), and activity counts (last 30d)';

