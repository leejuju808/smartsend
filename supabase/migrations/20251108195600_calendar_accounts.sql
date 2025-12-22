create table if not exists public.calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','outlook')),
  email text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  connected_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists idx_cal_accounts_user on public.calendar_accounts(user_id);

alter table public.calendar_accounts enable row level security;

drop policy if exists "calacc sel" on public.calendar_accounts;
create policy "calacc sel" on public.calendar_accounts
for select using ( auth.uid() = user_id );

drop policy if exists "calacc ins" on public.calendar_accounts;
create policy "calacc ins" on public.calendar_accounts
for insert with check ( auth.uid() = user_id );

drop policy if exists "calacc upd" on public.calendar_accounts;
create policy "calacc upd" on public.calendar_accounts
for update using ( auth.uid() = user_id )
with check ( auth.uid() = user_id );

create table if not exists public.calendar_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','outlook')),
  next_sync_token text,
  last_synced_at timestamptz
);

alter table public.calendar_sync_state enable row level security;

drop policy if exists "calsync sel" on public.calendar_sync_state;
create policy "calsync sel" on public.calendar_sync_state
for select using ( auth.uid() = user_id );

drop policy if exists "calsync upsert" on public.calendar_sync_state;
create policy "calsync upsert" on public.calendar_sync_state
for insert with check ( auth.uid() = user_id )
for update using ( auth.uid() = user_id ) with check ( auth.uid() = user_id );


