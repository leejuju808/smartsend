-- OAuth Connections for Email Providers (Gmail, Outlook, etc.)
-- Stores OAuth tokens for sending replies through native email providers

create table if not exists public.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'outlook')),
  provider_email text not null,
  access_token text not null,
  refresh_token text not null,
  scope text,
  expires_at timestamptz not null,       -- when access_token expires
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create unique index if not exists uidx_oauth_user_provider
  on public.oauth_connections(user_id, provider);

alter table public.oauth_connections enable row level security;

create policy "user can see own oauth row"
  on public.oauth_connections for select to authenticated
  using (auth.uid() = user_id);

create policy "user can insert own oauth row"
  on public.oauth_connections for insert to authenticated
  with check (auth.uid() = user_id);

create policy "user can update own oauth row"
  on public.oauth_connections for update to authenticated
  using (auth.uid() = user_id);

-- Update timestamp trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

create trigger update_oauth_connections_updated_at
  before update on public.oauth_connections
  for each row
  execute function public.handle_updated_at();

