-- Reply Messages Cache Table
-- Caches Gmail thread messages for fast retrieval

create table if not exists public.reply_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_thread_id text not null,
  gmail_message_id text not null,
  from_email text not null,
  to_email text,
  subject text,
  body_text text,
  body_html text,
  message_id text,
  in_reply_to text,
  references_ids text,
  internal_ts timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, gmail_message_id)
);

alter table public.reply_messages enable row level security;

create policy "Users read own reply_messages"
on public.reply_messages for select
using (auth.uid() = user_id);

create index if not exists reply_messages_user_thread_idx
  on public.reply_messages (user_id, gmail_thread_id, internal_ts desc);












