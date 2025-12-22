-- Messages table hardening for delivery state
alter table public.messages
  add column if not exists provider_message_id text,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text,
  add column if not exists sent_at timestamptz,
  add column if not exists locked_at timestamptz;

create index if not exists idx_messages_queue
  on public.messages(profile_id, status, created_at);

create index if not exists idx_messages_locked
  on public.messages(status, locked_at);

-- Simple delivery log (optional, nice for debugging)
create table if not exists public.delivery_logs (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references public.profiles(id) on delete cascade not null,
  message_id uuid references public.messages(id) on delete cascade not null,
  sender_id uuid references public.senders(id) on delete set null,
  to_email text not null,
  event text not null, -- enqueued|attempt|sent|failed|skipped
  detail text,
  created_at timestamptz not null default now()
);

alter table public.delivery_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public'
      and tablename='delivery_logs' and policyname='own delivery logs'
  ) then
    create policy "own delivery logs" on public.delivery_logs
      for all using (auth.uid() = profile_id);
  end if;
end$$;
