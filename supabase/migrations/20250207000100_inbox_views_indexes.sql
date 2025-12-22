-- Inbox views and supporting indexes

create or replace view public.v_campaign_inbox_counts as
select
  t.campaign_id,
  count(*) filter (where t.needs_reply) as needs_reply,
  count(*) filter (where not t.needs_reply) as replied,
  count(*) filter (where t.last_error is not null) as errors
from public.inbox_threads t
group by 1;

create or replace view public.v_thread_preview as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  (array_agg(nm.preview_clean order by nm.sent_at desc))[1] as last_preview,
  (array_agg(nm.subject order by nm.sent_at desc))[1] as last_subject,
  (array_agg(nm.sent_at order by nm.sent_at desc))[1] as last_at,
  (array_agg(nm.direction order by nm.sent_at desc))[1] as last_dir,
  (array_agg(nm.ai_label order by nm.sent_at desc))[1] as last_label
from public.inbox_threads t
left join public.normalized_messages nm
  on nm.linked_thread_id = t.id
group by 1, 2, 3;

create index if not exists idx_threads_campaign_reply on public.inbox_threads (campaign_id, needs_reply, updated_at desc);
create index if not exists idx_nm_thread_time on public.normalized_messages (linked_thread_id, sent_at desc);
create index if not exists idx_nm_thread_dir on public.normalized_messages (linked_thread_id, direction);



