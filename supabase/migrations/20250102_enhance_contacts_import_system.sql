-- Enable citext extension if not exists
create extension if not exists citext;

-- Enhanced contacts table with workspace support
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  email citext not null,
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  tags jsonb default '[]'::jsonb,
  last_source text default 'import',
  import_batch_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  -- Composite unique constraint for workspace + email
  unique(workspace_id, email)
);

-- Import batches table for tracking imports
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  filename text not null,
  total_rows integer not null,
  inserted_count integer default 0,
  duplicate_count integer default 0,
  suppressed_count integer default 0,
  error_count integer default 0,
  status text default 'processing',
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Enhanced suppression table with workspace support
create table if not exists public.suppression_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  email citext not null,
  reason text default 'manual',
  source text default 'manual',
  created_at timestamptz default now(),
  
  -- Composite unique constraint for workspace + email
  unique(workspace_id, email)
);

-- Create indexes for performance
create index if not exists idx_contacts_workspace_email on public.contacts(workspace_id, email);
create index if not exists idx_contacts_workspace_created on public.contacts(workspace_id, created_at);
create index if not exists idx_contacts_import_batch on public.contacts(import_batch_id);
create index if not exists idx_import_batches_workspace on public.import_batches(workspace_id);
create index if not exists idx_import_batches_created on public.import_batches(created_at);
create index if not exists idx_suppression_workspace_email on public.suppression_emails(workspace_id, email);

-- Update trigger function
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin 
  new.updated_at = now(); 
  return new; 
end $$;

-- Drop existing triggers if they exist
drop trigger if exists trg_contacts_touch on public.contacts;

-- Create trigger for contacts table
create trigger trg_contacts_touch 
  before update on public.contacts
  for each row execute function public.touch_updated_at();

-- Enable RLS
alter table public.contacts enable row level security;
alter table public.import_batches enable row level security;
alter table public.suppression_emails enable row level security;

-- RLS Policies (using app.set_workspace() shortcut for now)
-- In production, replace with proper workspace membership checks

-- Contacts policies
create policy "Users can view contacts in their workspace" on public.contacts
  for select using (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy "Users can insert contacts in their workspace" on public.contacts
  for insert with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy "Users can update contacts in their workspace" on public.contacts
  for update using (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy "Users can delete contacts in their workspace" on public.contacts
  for delete using (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Import batches policies
create policy "Users can view import batches in their workspace" on public.import_batches
  for select using (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy "Users can insert import batches in their workspace" on public.import_batches
  for insert with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy "Users can update import batches in their workspace" on public.import_batches
  for update using (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Suppression policies
create policy "Users can view suppression in their workspace" on public.suppression_emails
  for select using (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy "Users can insert suppression in their workspace" on public.suppression_emails
  for insert with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy "Users can delete suppression in their workspace" on public.suppression_emails
  for delete using (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Helper function to set workspace context
create or replace function app.set_workspace(workspace_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('app.workspace_id', workspace_id::text, false);
end $$; 