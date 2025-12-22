-- Block 295 — Admin Workspace Health View
-- Unified view for workspace billing health, usage, and credits

create or replace view admin_workspace_health as
select
  g.workspace_id,
  g.plan,
  g.seats_used,
  g.seat_limit,
  g.sends_today,
  g.daily_send_cap,
  g.replies_today,
  g.daily_reply_cap,
  g.credits,
  (g.sends_today >= g.daily_send_cap) as send_cap_hit,
  (g.replies_today >= g.daily_reply_cap) as reply_cap_hit,
  g.credits_empty
from billing_global_guard g;

-- Grant access to authenticated users (admin will be checked in middleware)
grant select on admin_workspace_health to authenticated;

