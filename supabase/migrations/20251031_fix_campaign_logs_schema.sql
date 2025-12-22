-- Ensure campaign_logs has consistent schema
-- Support both event and event_type columns for backward compatibility
alter table if exists public.campaign_logs
  add column if not exists event text,
  add column if not exists event_type text,
  add column if not exists workspace_id uuid;

-- Copy event_type to event if event is null
update public.campaign_logs
  set event = event_type
  where event is null and event_type is not null;

-- Copy event to event_type if event_type is null  
update public.campaign_logs
  set event_type = event
  where event_type is null and event is not null;

