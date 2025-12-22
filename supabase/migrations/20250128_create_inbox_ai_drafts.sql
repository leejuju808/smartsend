-- Store AI drafts for replies
create table if not exists public.inbox_ai_drafts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.inbox_threads(id) on delete cascade,
  message_id uuid references public.inbox_messages(id) on delete cascade,
  draft text,
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_inbox_ai_drafts_thread on public.inbox_ai_drafts(thread_id);
create index if not exists idx_inbox_ai_drafts_message on public.inbox_ai_drafts(message_id);
create index if not exists idx_inbox_ai_drafts_created on public.inbox_ai_drafts(created_at);

-- RLS
alter table if exists public.inbox_ai_drafts enable row level security;

-- Workspace members can view/mutate AI drafts for their workspace threads
drop policy if exists "inbox_ai_drafts_member" on public.inbox_ai_drafts;
create policy "inbox_ai_drafts_member" on public.inbox_ai_drafts
  for all using (
    exists (
      select 1 from public.inbox_threads t
      join public.workspace_members m on m.workspace_id = t.workspace_id
      where t.id = inbox_ai_drafts.thread_id and m.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.inbox_threads t
      join public.workspace_members m on m.workspace_id = t.workspace_id
      where t.id = inbox_ai_drafts.thread_id and m.user_id = auth.uid()
    )
  ); 