-- 8231_send_queue_suppression_view.sql
-- Optional SQL-level filtering view for ready-to-send jobs (excluding suppressed)

create or replace view public.v_send_queue_ready as
select sq.*
from public.campaign_send_queue sq
where sq.status in ('pending', 'retry', 'queued', 'scheduled', 'throttled')
  and (sq.scheduled_at is null or sq.scheduled_at <= now())
  and coalesce(sq.attempts, 0) < coalesce(sq.max_attempts, 3)
  and not public.is_suppressed(
    coalesce(sq.workspace_id, (select workspace_id from public.campaigns where id = sq.campaign_id limit 1)),
    sq.to_email
  );

-- Grant access to authenticated users
grant select on public.v_send_queue_ready to authenticated;
grant select on public.v_send_queue_ready to service_role;

-- Add comment
comment on view public.v_send_queue_ready is 
  'Ready-to-send jobs from campaign_send_queue, automatically excluding suppressed emails';

































































