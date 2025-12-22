-- Thread/provider wiring & reply lane support

-- A) Ensure provider linkage on threads/messages
alter table public.inbox_threads
  add column if not exists provider text,
  add column if not exists provider_thread_id text,
  add column if not exists provider_conversation_id text,
  add column if not exists account_id uuid references public.connected_accounts(id) on delete set null;

alter table public.inbox_messages
  add column if not exists provider_message_id text,
  add column if not exists headers jsonb default '{}'::jsonb;

create index if not exists idx_threads_provider on public.inbox_threads(provider, provider_thread_id);
create index if not exists idx_msgs_provider on public.inbox_messages(provider_message_id);

-- B) Queue helper lane for replies (step_no = 0 is reserved for manual reply)
alter table public.send_queue
  add column if not exists payload jsonb default '{}'::jsonb;

-- C) Delivery events (ensure we can log provider result)
create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  queue_id uuid references public.send_queue(id) on delete set null,
  send_log_id uuid references public.send_logs(id) on delete set null,
  provider text,
  provider_status text,
  provider_message_id text,
  provider_thread_id text,
  meta jsonb
);











