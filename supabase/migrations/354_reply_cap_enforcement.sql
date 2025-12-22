-- Block 354: Reply Volume Cap Enforcement v1
-- Update billing_usage_events to support reply_cap_reached event type

-- Drop existing check constraint if it exists
alter table billing_usage_events
  drop constraint if exists billing_usage_events_event_type_check;

-- Add updated check constraint with reply_cap_reached
alter table billing_usage_events
  add constraint billing_usage_events_event_type_check
  check (event_type in ('daily_cap_reached', 'daily_cap_warning', 'reply_cap_reached'));





