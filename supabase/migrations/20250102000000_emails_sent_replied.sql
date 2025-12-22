-- 01_emails_sent_replied.sql
-- Create emails_sent table if it doesn't exist, then add replied column

create table if not exists public.emails_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid,
  subject text,
  thread_id text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.emails_sent
  add column if not exists replied boolean not null default false;

-- Create index for user_id lookups
create index if not exists idx_emails_sent_user on public.emails_sent(user_id);

-- Enable RLS
alter table public.emails_sent enable row level security;

-- RLS policies
drop policy if exists "users can view own emails_sent" on public.emails_sent;
create policy "users can view own emails_sent" on public.emails_sent
  for select using (auth.uid() = user_id);

drop policy if exists "service can insert emails_sent" on public.emails_sent;
create policy "service can insert emails_sent" on public.emails_sent
  for insert with check (true);

drop policy if exists "service can update emails_sent" on public.emails_sent;
create policy "service can update emails_sent" on public.emails_sent
  for update using (true);

