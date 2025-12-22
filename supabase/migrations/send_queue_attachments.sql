alter table public.send_queue
  add column if not exists attachments jsonb not null default '[]'::jsonb;

create index if not exists idx_send_queue_has_attachments
  on public.send_queue ((jsonb_array_length(attachments)));


