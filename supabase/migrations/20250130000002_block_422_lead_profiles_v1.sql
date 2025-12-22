-- Block 422 — Lead Profiles v1
-- CRM-Style Profile: Timeline, Emails, Replies, Events, Attributes, Tags
-- Creates get_lead_timeline function for unified timeline view

-- Create or replace function get_lead_timeline
-- This merges events from email_events, lead_activity, and workspace_activity chronologically
create or replace function get_lead_timeline(lead_id uuid)
returns table (
  ts timestamptz,
  type text,
  subtype text,
  data jsonb
)
language sql
stable
as $$
(
  -- Email events
  select
    created_at as ts,
    'email' as type,
    event_type as subtype,
    jsonb_build_object(
      'campaign_id', campaign_id,
      'step_id', step_id,
      'body_text', body_text,
      'subject', subject,
      'direction', direction,
      'provider_message_id', provider_message_id,
      'provider_thread_id', provider_thread_id,
      'url', url,
      'ua', ua,
      'ip', ip,
      'extra', extra
    ) as data
  from email_events
  where lead_id = get_lead_timeline.lead_id

  union all

  -- Lead activity events (imports, tags, etc.)
  -- Handles lead_activity table with 'type' column (migration 289)
  -- If your table uses 'activity_type' instead, modify this query accordingly
  select
    coalesce(occurred_at, created_at) as created_at,
    'activity' as type,
    type as subtype,
    coalesce(metadata, jsonb_build_object('title', title, 'body', body), '{}'::jsonb) as data
  from lead_activity
  where lead_id = get_lead_timeline.lead_id

  union all

  -- Workspace activity that references this lead
  select
    created_at,
    'workspace' as type,
    event_type as subtype,
    metadata as data
  from workspace_activity
  where workspace_activity.lead_id = get_lead_timeline.lead_id
     or (
       metadata is not null 
       and metadata ? 'lead_id' 
       and (metadata->>'lead_id')::uuid = get_lead_timeline.lead_id
     )
)
order by ts desc;
$$;

-- Grant execute permissions
grant execute on function get_lead_timeline(uuid) to authenticated;
grant execute on function get_lead_timeline(uuid) to service_role;

-- Add comment for documentation
comment on function get_lead_timeline(uuid) is 'Returns unified timeline of all events for a lead, merging email_events, lead_activity, and workspace_activity chronologically';

