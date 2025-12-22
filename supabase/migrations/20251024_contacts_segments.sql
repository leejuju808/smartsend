-- Contacts
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  email text not null,
  first_name text,
  last_name text,
  company text,
  tags text[] default '{}',
  attrs jsonb default '{}'::jsonb,          -- arbitrary key/values
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create index if not exists contacts_workspace_email_idx on public.contacts(workspace_id, lower(email));
create index if not exists contacts_attrs_gin on public.contacts using gin (attrs);
create index if not exists contacts_tags_gin on public.contacts using gin (tags);

alter table public.contacts enable row level security;
create policy "service role full contacts"
on public.contacts as permissive for all to service_role using (true) with check (true);
create policy "users read contacts"
on public.contacts for select to authenticated using (workspace_id = auth.uid());
create policy "users write contacts"
on public.contacts for all to authenticated using (workspace_id = auth.uid()) with check (workspace_id = auth.uid());

-- Segments (rule JSON evaluated server-side)
create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  definition jsonb not null default '{}'::jsonb,  -- see rule format below
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

alter table public.segments enable row level security;
create policy "service role full segments"
on public.segments as permissive for all to service_role using (true) with check (true);
create policy "users read segments"
on public.segments for select to authenticated using (workspace_id = auth.uid());
create policy "users write segments"
on public.segments for all to authenticated using (workspace_id = auth.uid()) with check (workspace_id = auth.uid());