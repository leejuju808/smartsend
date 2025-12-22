-- Queue Pick Function
-- Atomically picks and marks emails for sending with rate limiting per inbox

-- Track recent sends per inbox to enforce per-hour rate
create or replace function public.queue_pick(p_batch int, p_per_inbox_per_hour int)
returns table (
  id uuid, 
  campaign_id uuid, 
  lead_id uuid, 
  from_inbox_id uuid,
  subject text, 
  body_html text, 
  body_text text
) 
language plpgsql 
as $$
declare
  picked int := 0;
begin
  -- Move a subset to 'picked' using SKIP LOCKED to avoid race conditions
  return query
  with pending_inboxes as (
    -- Get all unique inbox IDs from pending queue items
    select distinct from_inbox_id as id
    from public.send_queue
    where status = 'pending'
      and scheduled_at <= now()
      and coalesce(next_attempt_at, now()) <= now()
  ),
  cap as (
    -- Calculate remaining capacity per inbox (how many more can be sent this hour)
    select 
      i.id as inbox_id,
      greatest(0, p_per_inbox_per_hour - count(sq.id)) as remaining
    from pending_inboxes i
    left join public.send_queue sq
      on sq.from_inbox_id = i.id
     and sq.sent_at > now() - interval '1 hour'
     and sq.status = 'sent'
    group by i.id
  ),
  candidates as (
    -- Select candidates that can be sent (respecting inbox capacity and campaign pause status)
    select q.*
    from public.send_queue q
    join cap on cap.inbox_id = q.from_inbox_id
      and cap.remaining > 0
    join public.campaigns c on c.id = q.campaign_id 
      and coalesce(c.is_paused, false) = false
    where q.status = 'pending'
      and q.scheduled_at <= now()
      and coalesce(q.next_attempt_at, now()) <= now()
    order by q.priority asc, q.scheduled_at asc
    limit p_batch
    for update skip locked
  ),
  mark as (
    -- Atomically mark selected items as 'picked' and increment attempt_count
    update public.send_queue s
       set status = 'picked',
           attempt_count = s.attempt_count + 1,
           updated_at = now()
     where s.id in (select id from candidates)
     returning s.*
  )
  -- Return the picked items
  select 
    id, 
    campaign_id, 
    lead_id, 
    from_inbox_id, 
    subject, 
    body_html, 
    body_text
  from mark;
end $$;

