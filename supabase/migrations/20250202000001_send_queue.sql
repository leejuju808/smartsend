-- 01_send_queue.sql
-- Create send_queue table for managing email send jobs with retry logic

create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null,
  campaign_id uuid not null,
  to_email text not null,
  subject text not null,
  html text,
  text text,
  thread_id text,                  -- optional (for follow-ups)
  status text not null default 'queued', -- queued|processing|sent|failed|retrying|paused
  attempt_count int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for efficient job claiming
create index if not exists idx_send_queue_ready
  on public.send_queue (next_attempt_at asc) where status in ('queued','retrying');

create index if not exists idx_send_queue_user_ready
  on public.send_queue (user_id, next_attempt_at asc) where status in ('queued','retrying');

-- RLS (owner-only)
alter table public.send_queue enable row level security;

drop policy if exists "owner read own queue" on public.send_queue;
create policy "owner read own queue" on public.send_queue 
  for select using (auth.uid() = user_id);

drop policy if exists "owner insert" on public.send_queue;
create policy "owner insert" on public.send_queue 
  for insert with check (auth.uid() = user_id);

-- Helper function to update updated_at timestamp
create or replace function update_send_queue_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists send_queue_updated_at on public.send_queue;
create trigger send_queue_updated_at
  before update on public.send_queue
  for each row
  execute function update_send_queue_updated_at();

