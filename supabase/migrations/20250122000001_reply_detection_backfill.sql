-- Optional Backfill: Cancel all future pending sends for threads that already received replies
-- Run this after the main migration if you have active campaigns with existing replies

-- Cancel all future pending sends for threads that have replied
with target as (
  select distinct t.id, t.campaign_id, t.lead_id
  from public.inbox_threads t
  join public.inbox_messages m on m.thread_id = t.id
  where t.replied_at is not null
     or exists (
       select 1 from public.inbox_messages m2
       where m2.thread_id = t.id
         and m2.direction = 'in'
         and m2.sent_at < now()
     )
)
update public.send_queue q
   set status = 'canceled',
       updated_at = now(),
       error = coalesce(error, '') || ' [backfill cancel]'
from target x
where q.campaign_id = x.campaign_id
  and q.lead_id = x.lead_id
  and q.status in ('pending', 'queued', 'scheduled')
  and q.scheduled_at > now();

-- Mark threads that have inbound messages as replied
update public.inbox_threads t
   set replied_at = (
     select min(m.sent_at)
     from public.inbox_messages m
     where m.thread_id = t.id
       and m.direction = 'in'
   ),
   stopped_by_reply = true
where replied_at is null
  and exists (
    select 1 from public.inbox_messages m
    where m.thread_id = t.id
      and m.direction = 'in'
  );





