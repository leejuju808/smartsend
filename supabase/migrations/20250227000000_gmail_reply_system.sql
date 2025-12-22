-- Gmail Reply System Migration
-- Creates sent_messages and gmail_accounts tables with RLS
-- Extends replies table with thread_id and message_id for Gmail threading

-- 1. Create sent_messages table
create table if not exists public.sent_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reply_id uuid not null references public.replies(id) on delete cascade,
  gmail_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists sent_messages_user_idx on public.sent_messages(user_id);
create index if not exists sent_messages_reply_idx on public.sent_messages(reply_id);
create index if not exists sent_messages_gmail_msg_idx on public.sent_messages(gmail_message_id);

alter table public.sent_messages enable row level security;

create policy "Users read own sent_messages"
on public.sent_messages for select
using (auth.uid() = user_id);

create policy "Users insert own sent_messages"
on public.sent_messages for insert
with check (auth.uid() = user_id);

-- 2. Create gmail_accounts table
create table if not exists public.gmail_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email_address text not null,
  access_token text not null,
  refresh_token text not null,
  expiry timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists gmail_accounts_user_idx on public.gmail_accounts(user_id);
create index if not exists gmail_accounts_email_idx on public.gmail_accounts(email_address);

alter table public.gmail_accounts enable row level security;

create policy "Users read own gmail account"
on public.gmail_accounts for select
using (auth.uid() = user_id);

create policy "Users insert own gmail account"
on public.gmail_accounts for insert
with check (auth.uid() = user_id);

create policy "Users update own gmail account"
on public.gmail_accounts for update
using (auth.uid() = user_id);

-- 3. Extend replies table with thread_id and message_id if not exists
alter table public.replies
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists thread_id text,
  add column if not exists message_id text;

create index if not exists replies_thread_idx on public.replies(thread_id);
create index if not exists replies_message_idx on public.replies(message_id);
create index if not exists replies_user_idx on public.replies(user_id);












