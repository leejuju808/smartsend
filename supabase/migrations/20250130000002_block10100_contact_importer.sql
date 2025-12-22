-- Block 10100 — Contact Importer v1
-- Creates contact_imports table for tracking CSV imports

create table if not exists public.contact_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text,
  total_rows int default 0,
  imported_rows int default 0,
  skipped_rows int default 0,
  invalid_rows int default 0,
  duplicate_rows int default 0,
  status text default 'pending' check (status in ('pending', 'validating', 'importing', 'completed', 'failed')),
  error text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_contact_imports_workspace on public.contact_imports(workspace_id);
create index if not exists idx_contact_imports_user on public.contact_imports(user_id);
create index if not exists idx_contact_imports_created on public.contact_imports(created_at desc);

alter table public.contact_imports enable row level security;

-- RLS: Users can only see imports from their workspace
create policy "contact_imports_select_workspace"
  on public.contact_imports for select
  using (
    exists (
      select 1 from public.profiles p 
      where p.id = auth.uid() and p.workspace_id = contact_imports.workspace_id
    )
  );

create policy "contact_imports_insert_workspace"
  on public.contact_imports for insert
  with check (
    exists (
      select 1 from public.profiles p 
      where p.id = auth.uid() and p.workspace_id = contact_imports.workspace_id
    )
    and user_id = auth.uid()
  );

create policy "contact_imports_update_workspace"
  on public.contact_imports for update
  using (
    exists (
      select 1 from public.profiles p 
      where p.id = auth.uid() and p.workspace_id = contact_imports.workspace_id
    )
  );

-- Ensure contacts table has address, city, state, zip columns if not present
alter table public.contacts
  add column if not exists address text;
alter table public.contacts
  add column if not exists city text;
alter table public.contacts
  add column if not exists state text;
alter table public.contacts
  add column if not exists zip text;

-- Ensure tags column exists (should already be jsonb array)
alter table public.contacts
  add column if not exists tags jsonb default '[]'::jsonb;





























































