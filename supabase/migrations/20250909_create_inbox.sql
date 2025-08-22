-- Inbox schema: threads and messages
create table if not exists public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id),
  subject text,
  last_message_at timestamptz default now(),
  status text check (status in ('open','snoozed','closed')) default 'open',
  assigned_to uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_inbox_threads_ws on public.inbox_threads(workspace_id);
create index if not exists idx_inbox_threads_contact on public.inbox_threads(contact_id);
create index if not exists idx_inbox_threads_status on public.inbox_threads(status);
create index if not exists idx_inbox_threads_assigned on public.inbox_threads(assigned_to);
create unique index if not exists uniq_inbox_thread_key on public.inbox_threads(workspace_id, contact_id, subject);

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.inbox_threads(id) on delete cascade,
  sender text not null,
  body text not null,
  sent_at timestamptz default now(),
  is_incoming boolean default true
);

create index if not exists idx_inbox_messages_thread on public.inbox_messages(thread_id);
create index if not exists idx_inbox_messages_sent_at on public.inbox_messages(sent_at);

-- RLS
alter table if exists public.inbox_threads enable row level security;
alter table if exists public.inbox_messages enable row level security;

-- Workspace membership can view/mutate their workspace threads
drop policy if exists "inbox_threads_member" on public.inbox_threads;
create policy "inbox_threads_member" on public.inbox_threads
  for all using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = inbox_threads.workspace_id and m.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = inbox_threads.workspace_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "inbox_messages_member" on public.inbox_messages;
create policy "inbox_messages_member" on public.inbox_messages
  for all using (
    exists (
      select 1 from public.inbox_threads t
      join public.workspace_members m on m.workspace_id = t.workspace_id
      where t.id = inbox_messages.thread_id and m.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.inbox_threads t
      join public.workspace_members m on m.workspace_id = t.workspace_id
      where t.id = inbox_messages.thread_id and m.user_id = auth.uid()
    )
  );

