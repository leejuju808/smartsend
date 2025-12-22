-- Create messages table for thread-based messaging
-- thread_id references campaign_logs.id (your "thread")

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.campaign_logs(id) on delete cascade,
  direction text check (direction in ('incoming','outgoing')) not null,
  subject text,
  body_text text,
  body_html text,
  from_email text,
  to_email text,
  external_id text,                            -- Gmail/Outlook message id
  sent_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists messages_thread_idx on public.messages(thread_id, sent_at);

alter table public.messages enable row level security;

-- Simple RLS example (adapt to your org model)
drop policy if exists "read messages by org" on public.messages;
create policy "read messages by org"
on public.messages for select using (true);

drop policy if exists "insert messages by org" on public.messages;
create policy "insert messages by org"
on public.messages for insert with check (true);

-- Ensure campaign_logs has last_message_at column for thread ordering
alter table public.campaign_logs
  add column if not exists last_message_at timestamptz;

