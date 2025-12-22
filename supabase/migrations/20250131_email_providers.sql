-- 06_email_providers.sql
create table if not exists public.user_email_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null,
  provider text not null check (provider in ('gmail','outlook')),
  email text not null,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, provider, email)
);

-- Basic RLS sketch
alter table public.user_email_providers enable row level security;
create policy "owner can read/write own providers"
on public.user_email_providers
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Add indexes for performance
create index if not exists idx_user_email_providers_user_id on public.user_email_providers(user_id);
create index if not exists idx_user_email_providers_workspace_id on public.user_email_providers(workspace_id);
create index if not exists idx_user_email_providers_provider on public.user_email_providers(provider);