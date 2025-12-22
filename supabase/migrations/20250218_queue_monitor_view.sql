-- Queue Monitor V1: Enhanced view with to_email and from_email
-- This view enriches send_queue with lead email and campaign sender info
-- Works with various send_queue schema variations

drop view if exists public.send_queue_monitor_view;

create or replace view public.send_queue_monitor_view as
select
  sq.id,
  coalesce(sq.workspace_id, (select workspace_id from public.campaigns where id = sq.campaign_id)) as workspace_id,
  sq.campaign_id,
  c.name as campaign_name,
  sq.lead_id,
  coalesce(
    l.email,
    sq.to_email,
    (select email from public.leads where id = sq.lead_id)
  ) as to_email,
  -- Get from_email from various sources
  coalesce(
    sa.email,
    c.from_email,
    (select email from public.sender_accounts 
     where (sq.user_id is not null and user_id = sq.user_id 
            or c.user_id is not null and user_id = c.user_id)
     and is_active = true limit 1),
    'noreply@smartsend.ai'
  ) as from_email,
  sq.status,
  coalesce(sq.attempt, sq.attempts, sq.attempt_count, 0) as attempt,
  coalesce(sq.last_error, sq.error, sq.error_message) as error_message,
  coalesce(sq.updated_at, sq.created_at) as updated_at,
  sq.created_at
from public.send_queue sq
left join public.leads l on l.id = sq.lead_id
left join public.campaigns c on c.id = sq.campaign_id
left join public.sender_accounts sa on sa.id = c.sender_account_id;

grant select on public.send_queue_monitor_view to authenticated;

