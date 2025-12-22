-- Block 188: Internal Notes Table
-- Creates internal_notes table for team collaboration notes

create table if not exists public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  thread_id uuid not null references public.reply_threads(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null
);

-- Indexes for fast lookups
create index if not exists idx_internal_notes_thread on public.internal_notes(thread_id, created_at desc);
create index if not exists idx_internal_notes_author on public.internal_notes(author_id);

-- RLS
alter table public.internal_notes enable row level security;

-- Policy: Authenticated users can read notes for threads they have access to
create policy "internal_notes_read" on public.internal_notes
  for select using (
    exists (
      select 1 from public.reply_threads rt
      where rt.id = internal_notes.thread_id
      and auth.role() = 'authenticated'
    )
  );

-- Policy: Authenticated users can insert notes
create policy "internal_notes_insert" on public.internal_notes
  for insert with check (auth.role() = 'authenticated' and auth.uid() = author_id);

-- Policy: Service role can manage notes
create policy "internal_notes_service_role" on public.internal_notes
  for all to service_role
  using (true) with check (true);

-- Comments
comment on table public.internal_notes is 'Internal team notes for reply threads - not sent to leads';
comment on column public.internal_notes.body is 'Note content - can include @mentions';












