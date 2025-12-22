-- 02_messages_flags.sql
-- Add flags for OOO/Bounce detection and external headers for audit

alter table messages add column if not exists is_out_of_office boolean not null default false;
alter table messages add column if not exists is_bounce boolean not null default false;
alter table messages add column if not exists is_actionable boolean not null default true; -- false if OOO/bounce
alter table messages add column if not exists external_headers jsonb; -- raw Gmail headers for audit

-- Add gmail_thread_id to threads table if missing
alter table threads add column if not exists gmail_thread_id text;

-- Thread helper indexes
create index if not exists idx_messages_ext_id on messages(external_id);
create index if not exists idx_threads_gmail_thread on threads(gmail_thread_id);

