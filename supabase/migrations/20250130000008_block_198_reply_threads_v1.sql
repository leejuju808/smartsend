-- Block 198 — Replies Inbox v1
-- Thread-level view of a conversation with a lead
-- Clean v1 implementation with workspace_id

create table if not exists public.reply_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  subject text,
  last_message_at timestamptz not null default now(),
  last_direction text not null check (last_direction in ('inbound', 'outbound')),
  ai_label text, -- 'positive' | 'meeting' | 'neutral' | 'oos' | 'unsubscribe' | 'bounce' | etc.
  unread boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists reply_threads_workspace_id_idx
on public.reply_threads (workspace_id);

create index if not exists reply_threads_last_message_at_idx
on public.reply_threads (workspace_id, last_message_at desc);

create index if not exists reply_threads_ai_label_idx
on public.reply_threads (workspace_id, ai_label);

-- Message-level detail for each thread
create table if not exists public.reply_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.reply_threads(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider_message_id text,
  sender_email text,
  recipient_email text,
  snippet text,
  body text,
  ai_label text,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists reply_messages_thread_id_idx
on public.reply_messages (thread_id);

create index if not exists reply_messages_workspace_id_idx
on public.reply_messages (workspace_id);

-- RLS
alter table public.reply_threads enable row level security;
alter table public.reply_messages enable row level security;

create policy "reply_threads_select"
on public.reply_threads
for select
to authenticated
using (workspace_id = (auth.jwt()->>'workspace_id')::uuid);

create policy "reply_threads_update"
on public.reply_threads
for update
to authenticated
using (workspace_id = (auth.jwt()->>'workspace_id')::uuid)
with check (workspace_id = (auth.jwt()->>'workspace_id')::uuid);

create policy "reply_messages_select"
on public.reply_messages
for select
to authenticated
using (workspace_id = (auth.jwt()->>'workspace_id')::uuid);

