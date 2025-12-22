-- Block 14600 — Contact Import + List Management v1
-- Upload CSV → Clean Contacts → Simple Lists for Campaigns
-- This is the "get your homeowners into SmartSend fast" block

-- ============================================
-- 1) Lists + Contact Lists Tables
-- ============================================

create table if not exists public.contact_lists (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz default now()
);

create index if not exists idx_contact_lists_workspace on public.contact_lists(workspace_id);
create index if not exists idx_contact_lists_created_at on public.contact_lists(created_at desc);

create table if not exists public.contact_list_members (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  list_id uuid not null references public.contact_lists(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz default now(),
  unique (list_id, contact_id)
);

create index if not exists idx_contact_list_members_list on public.contact_list_members(list_id);
create index if not exists idx_contact_list_members_contact on public.contact_list_members(contact_id);
create index if not exists idx_contact_list_members_workspace on public.contact_list_members(workspace_id);

-- ============================================
-- 2) Contact Imports Table
-- ============================================

create table if not exists public.contact_imports (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  list_id uuid references public.contact_lists(id) on delete set null,
  file_name text,
  total_rows int,
  imported_rows int default 0,
  skipped_rows int default 0,
  status text check (
    status in ('pending', 'processing', 'completed', 'failed')
  ) default 'pending',
  error_message text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_contact_imports_workspace on public.contact_imports(workspace_id);
create index if not exists idx_contact_imports_status on public.contact_imports(status);

-- ============================================
-- 3) Add Missing Columns to Contacts Table
-- ============================================

-- Add workspace_id if not exists
alter table public.contacts
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- Add contact fields
alter table public.contacts
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip text,
  add column if not exists notes text;

-- Update email column if it already exists but is not nullable
do $$
begin
  -- If email column exists but is not nullable, make it nullable (we'll handle validation in app)
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'contacts' 
    and column_name = 'email'
    and is_nullable = 'NO'
  ) then
    alter table public.contacts alter column email drop not null;
  end if;
end $$;

-- Create unique constraint for workspace_id + email if not exists
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'contacts_workspace_email_unique'
  ) then
    alter table public.contacts
      add constraint contacts_workspace_email_unique 
      unique (workspace_id, email);
  end if;
end $$;

-- Create index on email for fast lookups
create index if not exists contacts_email_idx
  on public.contacts (lower(email)) where email is not null;

create index if not exists idx_contacts_workspace on public.contacts(workspace_id) where workspace_id is not null;

-- ============================================
-- 4) Add Audience Columns to Campaigns Table
-- ============================================

alter table public.campaigns
  add column if not exists audience_type text check (
    audience_type in ('all_contacts', 'lists')
  ) default 'lists',
  add column if not exists audience_list_ids uuid[];

create index if not exists idx_campaigns_audience_type on public.campaigns(audience_type);

-- ============================================
-- 5) RLS Policies
-- ============================================

alter table public.contact_lists enable row level security;
alter table public.contact_list_members enable row level security;
alter table public.contact_imports enable row level security;

-- Contact Lists: workspace members can read/write
drop policy if exists "contact_lists_select" on public.contact_lists;
create policy "contact_lists_select" on public.contact_lists
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "contact_lists_insert" on public.contact_lists;
create policy "contact_lists_insert" on public.contact_lists
  for insert with check (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "contact_lists_update" on public.contact_lists;
create policy "contact_lists_update" on public.contact_lists
  for update using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "contact_lists_delete" on public.contact_lists;
create policy "contact_lists_delete" on public.contact_lists
  for delete using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- Contact List Members: workspace members can read/write
drop policy if exists "contact_list_members_select" on public.contact_list_members;
create policy "contact_list_members_select" on public.contact_list_members
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "contact_list_members_insert" on public.contact_list_members;
create policy "contact_list_members_insert" on public.contact_list_members
  for insert with check (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "contact_list_members_delete" on public.contact_list_members;
create policy "contact_list_members_delete" on public.contact_list_members
  for delete using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- Contact Imports: workspace members can read/write
drop policy if exists "contact_imports_select" on public.contact_imports;
create policy "contact_imports_select" on public.contact_imports
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "contact_imports_insert" on public.contact_imports;
create policy "contact_imports_insert" on public.contact_imports
  for insert with check (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "contact_imports_update" on public.contact_imports;
create policy "contact_imports_update" on public.contact_imports
  for update using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- ============================================
-- 6) Comments
-- ============================================

comment on table public.contact_lists is 'Lists of contacts that can be targeted in campaigns';
comment on table public.contact_list_members is 'Mapping of contacts to lists';
comment on table public.contact_imports is 'Tracks CSV import jobs for contacts';
comment on column public.campaigns.audience_type is 'Type of audience: all_contacts or lists';
comment on column public.campaigns.audience_list_ids is 'Array of list IDs when audience_type is lists';



























































