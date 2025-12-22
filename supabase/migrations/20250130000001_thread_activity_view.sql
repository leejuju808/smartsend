-- Thread activity view: show last opened/clicked on thread
create or replace view public.v_thread_activity as
select
  t.id as thread_id,
  max(te.created_at) filter (where te.type='open')  as last_open_at,
  max(te.created_at) filter (where te.type='click') as last_click_at
from public.inbox_threads t
left join public.send_logs sl on sl.thread_id = t.id
left join public.tracking_events te on te.send_log_id = sl.id
group by 1;

