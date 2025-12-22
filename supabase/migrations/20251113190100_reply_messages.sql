-- Block 184: Reply Messages Table
-- Creates reply_messages table for individual messages within threads

create table if not exists public.reply_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  thread_id uuid not null references public.reply_threads(id) on delete cascade,

  direction text not null check (direction in ('inbound','outbound')),
  body text not null,
  raw jsonb default '{}'::jsonb
);

-- Indexes
create index if not exists idx_reply_message_thread on reply_messages(thread_id);
create index if not exists idx_reply_message_direction on reply_messages(direction);
create index if not exists idx_reply_message_created on reply_messages(created_at desc);

-- RLS
alter table public.reply_messages enable row level security;

-- Policy: Users can read messages for threads they have access to
create policy "reply_messages_read" on public.reply_messages
  for select using (
    exists (
      select 1 from public.reply_threads rt
      join public.accounts a on a.id = rt.account_id
      where rt.id = reply_messages.thread_id
      and exists (
        select 1 from public.org_memberships om
        where om.org_id = a.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
      )
    )
  );

-- Policy: Service role can insert/update/delete (for automated events)
create policy "reply_messages_service_role" on public.reply_messages
  for all to service_role
  using (true) with check (true);

-- Comment
comment on table public.reply_messages is 'Individual messages within reply threads';
comment on column public.reply_messages.direction is 'Message direction: inbound (from lead) or outbound (to lead)';
comment on column public.reply_messages.raw is 'Raw message data (headers, metadata, etc.)';












