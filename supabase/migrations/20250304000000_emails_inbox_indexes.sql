-- 002_emails_inbox_indexes.sql

create index if not exists emails_user_status_updated_idx
  on public.emails (user_id, status, updated_at desc);

