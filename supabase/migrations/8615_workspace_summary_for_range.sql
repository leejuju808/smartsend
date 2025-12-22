-- 8615_workspace_summary_for_range.sql
-- Block 8615 — Date-Range Summary on Workspace Dashboard (Last 7 / 30 / 90 days / All)
-- This function aggregates metrics for a workspace over a given time range

create or replace function public.get_workspace_summary_for_range(
  p_workspace_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_sent bigint := 0;
  v_delivered bigint := 0;
  v_opens bigint := 0;
  v_clicks bigint := 0;
  v_bounces bigint := 0;
  v_replies bigint := 0;
begin
  -- Email events with optional date filter
  select
    count(*) filter (where e.event_type = 'sent'),
    count(*) filter (where e.event_type = 'delivered'),
    count(distinct e.recipient_email) filter (where e.event_type = 'open'),
    count(distinct e.recipient_email) filter (where e.event_type = 'click'),
    count(*) filter (where e.event_type = 'bounce')
  into v_sent, v_delivered, v_opens, v_clicks, v_bounces
  from public.email_events e
  where e.workspace_id = p_workspace_id
    and (p_from is null or e.created_at >= p_from)
    and (p_to   is null or e.created_at <  p_to);

  -- Replies with optional date filter via inbound_messages
  select
    count(distinct im.from_email)
  into v_replies
  from public.inbound_messages im
  where im.workspace_id = p_workspace_id
    and (p_from is null or im.created_at >= p_from)
    and (p_to   is null or im.created_at <  p_to);

  return jsonb_build_object(
    'total_sent', v_sent,
    'total_delivered', v_delivered,
    'unique_opens', v_opens,
    'unique_clicks', v_clicks,
    'total_bounces', v_bounces,
    'unique_replies', v_replies
  );
end;
$$;

grant execute on function public.get_workspace_summary_for_range(uuid, timestamptz, timestamptz)
  to authenticated;
































































