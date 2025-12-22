-- User OAuth Connections for Email Providers
-- Stores OAuth tokens for Gmail, Outlook, and SMTP accounts

create table if not exists public.user_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook','smtp')),
  access_token text,
  refresh_token text,
  expires_at timestamptz,         -- when access_token expires
  scope text,
  metadata jsonb,                 -- provider-specific stuff
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists idx_user_connections_user_provider
  on public.user_connections(user_id, provider);

alter table public.user_connections enable row level security;

-- RLS: user can manage their own
create policy "uc_select_own" on public.user_connections for select
  using (auth.uid() = user_id);
create policy "uc_upsert_own" on public.user_connections for
  insert with check (auth.uid() = user_id);
create policy "uc_update_own" on public.user_connections for
  update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Update timestamp trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

create trigger update_user_connections_updated_at
  before update on public.user_connections
  for each row
  execute function public.handle_updated_at();
