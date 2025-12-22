-- Threads: archive + read status + owner

alter table public.inbox_threads
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists archived_at timestamptz,
  add column if not exists unread boolean default true;

create index if not exists idx_threads_user on public.inbox_threads(user_id);
create index if not exists idx_threads_unread on public.inbox_threads(user_id, unread) where archived_at is null;
create index if not exists idx_threads_label on public.inbox_threads(user_id, last_ai_label) where archived_at is null;

-- Messages: fast lookups for latest per thread
-- Ensure received_at and snippet exist for inbox_messages
alter table public.inbox_messages
  add column if not exists received_at timestamptz,
  add column if not exists snippet text;

create index if not exists idx_messages_thread_time on public.inbox_messages(thread_id, received_at desc nulls last);

-- Backfill received_at from sent_at if needed
update public.inbox_messages
set received_at = sent_at
where received_at is null and sent_at is not null;

-- RLS: owner-only
alter table public.inbox_threads enable row level security;

drop policy if exists sel_threads on public.inbox_threads;
create policy sel_threads on public.inbox_threads
  for select to authenticated using (user_id = auth.uid());

drop policy if exists upd_threads on public.inbox_threads;
create policy upd_threads on public.inbox_threads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- (If you write threads from server jobs, keep RPCs as security definer to bypass RLS)

