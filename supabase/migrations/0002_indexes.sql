create index if not exists leads_email_trgm on public.leads using gin (email gin_trgm_ops);

create index if not exists threads_project_updated_idx on public.threads (project_id, updated_at desc);

create index if not exists emails_thread_created_idx on public.emails (thread_id, created_at asc);

create index if not exists emails_project_created_idx on public.emails (project_id, created_at desc);

create index if not exists outbox_status_idx on public.email_outbox (status, queued_at);

