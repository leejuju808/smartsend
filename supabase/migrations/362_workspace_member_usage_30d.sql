-- Block 362 — Per-Seat Send Usage v1
-- Per-member send usage in last 30 days
-- Aggregates sends per team member over last 30 days

create or replace view workspace_member_usage_30d as
select
  tm.workspace_id,
  tm.user_id,
  tm.email,
  tm.role,
  coalesce(count(sl.*), 0)::integer as sends_30d
from team_members tm
left join send_logs sl
  on sl.sent_at >= (now() - interval '30 days')
  and sl.status = 'sent'
  and (
    -- Use workspace_id from send_logs if it exists
    (sl.workspace_id = tm.workspace_id)
    -- Otherwise get it through campaigns
    or exists (
      select 1 from campaigns c
      where c.id = sl.campaign_id
      and c.workspace_id = tm.workspace_id
    )
  )
left join send_queue sq
  on sq.id = sl.queue_id
  and sq.user_id = tm.user_id
where tm.status = 'active'
group by
  tm.workspace_id,
  tm.user_id,
  tm.email,
  tm.role;

-- Grant access
grant select on workspace_member_usage_30d to service_role;
grant select on workspace_member_usage_30d to authenticated;

