-- Thread flags view and supporting indexes
-- Provides snooze/nudge metadata for inbox list rendering

create or replace view public.v_thread_flags as
select
  t.id as thread_id,
  t.campaign_id,
  (t.snoozed_until is not null and t.snoozed_until > now()) as is_snoozed,
  (
    select max(m.sent_at)
    from public.normalized_messages m
    where m.linked_thread_id = t.id
      and m.direction = 'outbound'
  ) as last_outbound_at,
  exists (
    select 1
    from public.send_queue q
    where q.thread_id = t.id
      and q.status = 'draft'
      and coalesce(q.meta->>'source', '') = 'nudge'
  ) as is_nudged
from public.inbox_threads t;

-- convenience indexes to keep lookups fast
create index if not exists idx_v_thread_flags_campaign on public.v_thread_flags(campaign_id);
create index if not exists idx_send_queue_thread_draft on public.send_queue(thread_id) where status = 'draft';


