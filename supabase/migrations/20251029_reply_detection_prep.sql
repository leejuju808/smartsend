-- 0) Tiny DB prep (once)
-- Track outbound thread/message ids per lead (set these when you send the first email)

alter table public.leads
  add column if not exists outbound_thread_id text,
  add column if not exists outbound_message_id text;

create index if not exists leads_outbound_thread_idx on public.leads (outbound_thread_id);
create index if not exists leads_outbound_message_idx on public.leads (outbound_message_id);

-- Send queue status should allow canceling future sends for a replied lead
-- (Assumes a table like public.send_queue with lead_id, status)
-- status values often include: queued | scheduled | pending | sending | sent | failed | canceled
-- If your queue table is named differently, adjust application logic accordingly.














