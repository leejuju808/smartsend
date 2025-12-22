create table if not exists public.email_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,                              -- auth.uid() owner
  provider text not null check (provider in ('gmail')),
  email_address text,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists ix_email_connections_ws on public.email_connections(workspace_id, provider, status);

alter table public.email_connections enable row level security;

create policy "members can see connections in their workspace"
on public.email_connections
for select using ( public.is_workspace_member(workspace_id) );

create policy "owner/admin can manage connections"
on public.email_connections
for all using ( public.is_workspace_admin(workspace_id) )
with check ( public.is_workspace_admin(workspace_id) );