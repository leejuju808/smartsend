-- Block 288: Billing Events UI Feed
-- SQL View for billing events with level classification

create or replace view billing_events_feed as
select
  be.id,
  be.workspace_id,
  be.type,
  be.detail,
  be.created_at,
  case
    when be.type = 'near_cap_send' then 'warning'
    when be.type = 'near_cap_reply' then 'warning'
    when be.type = 'seat_over_limit' then 'error'
    when be.type = 'blocked_send_cap' then 'error'
    when be.type = 'blocked_reply_cap' then 'error'
    else 'info'
  end as level
from billing_events be;

-- Grant select on view to authenticated users
grant select on billing_events_feed to authenticated;

