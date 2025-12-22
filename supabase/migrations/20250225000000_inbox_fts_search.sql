-- FTS columns + indexes (idempotent)
-- This migration adds full-text search capabilities to inbox_messages and optimizes queries

-- 1) Add tsvector on messages for fast search
alter table public.inbox_messages
  add column if not exists fts tsvector;

-- 2) Populate once (only rows where fts is null)
update public.inbox_messages
set fts = setweight(to_tsvector('simple', coalesce(subject,'')), 'A')
        || setweight(to_tsvector('simple', left(coalesce(body,''), 10000)), 'B')
where fts is null;

-- 3) Trigger to keep fts fresh
create or replace function public.tg_msgs_fts()
returns trigger language plpgsql as $$
begin
  new.fts := setweight(to_tsvector('simple', coalesce(new.subject,'')), 'A')
          || setweight(to_tsvector('simple', left(coalesce(new.body,''), 10000)), 'B');
  return new;
end $$;

drop trigger if exists tr_msgs_fts on public.inbox_messages;
create trigger tr_msgs_fts
before insert or update of subject, body on public.inbox_messages
for each row execute function public.tg_msgs_fts();

-- 4) GIN index for fast full-text search
create index if not exists idx_msgs_fts on public.inbox_messages using gin(fts);

-- 5) Helpful thread-level last message cache (optional)
-- Note: last_message_at may already exist from other migrations; this ensures it exists
alter table public.inbox_threads
  add column if not exists last_message_at timestamptz;

-- Update trigger to maintain last_message_at (idempotent - will work alongside other triggers)
create or replace function public.tg_threads_touch_last()
returns trigger language plpgsql as $$
begin
  update public.inbox_threads
     set last_message_at = greatest(coalesce(last_message_at, '-infinity'::timestamptz), new.sent_at)
   where id = new.thread_id;
  return null;
end $$;

drop trigger if exists tr_threads_touch_last on public.inbox_messages;
create trigger tr_threads_touch_last
after insert on public.inbox_messages
for each row execute function public.tg_threads_touch_last();

-- Index for date range filtering
create index if not exists idx_threads_last_message_at on public.inbox_threads(last_message_at);

-- 6) (Optional) attachment flag if you store parts elsewhere
alter table public.inbox_messages
  add column if not exists has_attachments boolean;

-- Composite index for thread queries with direction and time
create index if not exists idx_msgs_thread_dir on public.inbox_messages(thread_id, direction, sent_at);

