create index if not exists idx_threads_needs
  on public.inbox_threads (needs_reply)
  where needs_reply;

create index if not exists idx_messages_thread_dir_created
  on public.inbox_messages (thread_id, direction, created_at desc);




