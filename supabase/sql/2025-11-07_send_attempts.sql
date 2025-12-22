-- Send attempts idempotency table and indexes

-- A) Track deduped send attempts
create table if not exists public.send_attempts (
  idempotency_key text primary key,
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  thread_id uuid references public.inbox_threads(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  provider text,
  provider_message_id text,
  status text not null default 'pending' check (status in ('pending','sent','skipped','error')),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_sendattempts_thread on public.send_attempts(thread_id);
create index if not exists idx_sendattempts_status on public.send_attempts(status);

-- B) Ensure send_logs link cleanly for analytics
alter table public.send_logs
  add column if not exists idempotency_key text unique;




