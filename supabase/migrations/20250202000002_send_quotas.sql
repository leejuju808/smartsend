-- 02_send_quotas.sql
-- Create send_quotas table for managing per-user sending limits (daily and per-minute)

create table if not exists public.send_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'gmail',
  window_starts_at timestamptz not null default date_trunc('day', now()),
  window_limit int not null default 450,         -- safe below Gmail daily caps
  sent_in_window int not null default 0,
  per_minute_limit int not null default 60,      -- burst limit
  sent_in_minute int not null default 0,
  minute_starts_at timestamptz not null default date_trunc('minute', now()),
  updated_at timestamptz not null default now()
);

-- Index for efficient quota lookups
create index if not exists idx_send_quotas_user on public.send_quotas (user_id);

-- RLS (owner-only)
alter table public.send_quotas enable row level security;

drop policy if exists "owner read quotas" on public.send_quotas;
create policy "owner read quotas" on public.send_quotas 
  for select using (auth.uid() = user_id);

-- Note: Updates are done via service role in edge functions

