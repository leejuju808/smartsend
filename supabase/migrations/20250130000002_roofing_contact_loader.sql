-- =========================================================
-- Block 10800 — SmartSend Roofing Contact Loader v1
-- (Simple Homeowner Import + Neighborhood Targeting)
-- =========================================================

-- 1. Contacts table
-- Stores homeowner contact information imported by roofers
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  street text,
  city text,
  state text,
  zip text,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint: one contact per email per user
create unique index if not exists idx_contacts_user_email 
  on public.contacts(user_id, lower(email));

-- Indexes for common queries
create index if not exists idx_contacts_user_id on public.contacts(user_id);
create index if not exists idx_contacts_city on public.contacts(city);
create index if not exists idx_contacts_state on public.contacts(state);
create index if not exists idx_contacts_zip on public.contacts(zip);
create index if not exists idx_contacts_tags on public.contacts using gin(tags);
create index if not exists idx_contacts_created_at on public.contacts(created_at desc);

-- Enable RLS
alter table public.contacts enable row level security;

-- RLS Policies
create policy "Users can view their own contacts"
  on public.contacts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own contacts"
  on public.contacts for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own contacts"
  on public.contacts for update
  using (auth.uid() = user_id);

create policy "Users can delete their own contacts"
  on public.contacts for delete
  using (auth.uid() = user_id);

-- 2. Lists table
-- Stores neighborhood/area lists (e.g., "South Hill Homeowners", "Old Quotes")
create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_lists_user_id on public.lists(user_id);
create index if not exists idx_lists_created_at on public.lists(created_at desc);

-- Enable RLS
alter table public.lists enable row level security;

-- RLS Policies
create policy "Users can view their own lists"
  on public.lists for select
  using (auth.uid() = user_id);

create policy "Users can insert their own lists"
  on public.lists for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own lists"
  on public.lists for update
  using (auth.uid() = user_id);

create policy "Users can delete their own lists"
  on public.lists for delete
  using (auth.uid() = user_id);

-- 3. List Contacts join table
-- Links contacts to lists (many-to-many relationship)
create table if not exists public.list_contacts (
  list_id uuid not null references public.lists(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, contact_id)
);

-- Indexes
create index if not exists idx_list_contacts_list_id on public.list_contacts(list_id);
create index if not exists idx_list_contacts_contact_id on public.list_contacts(contact_id);

-- Enable RLS
alter table public.list_contacts enable row level security;

-- RLS Policies (users can only access list_contacts for their own lists/contacts)
create policy "Users can view list_contacts for their own lists"
  on public.list_contacts for select
  using (
    exists (
      select 1 from public.lists
      where lists.id = list_contacts.list_id
      and lists.user_id = auth.uid()
    )
  );

create policy "Users can insert list_contacts for their own lists"
  on public.list_contacts for insert
  with check (
    exists (
      select 1 from public.lists
      where lists.id = list_contacts.list_id
      and lists.user_id = auth.uid()
    )
    and exists (
      select 1 from public.contacts
      where contacts.id = list_contacts.contact_id
      and contacts.user_id = auth.uid()
    )
  );

create policy "Users can delete list_contacts for their own lists"
  on public.list_contacts for delete
  using (
    exists (
      select 1 from public.lists
      where lists.id = list_contacts.list_id
      and lists.user_id = auth.uid()
    )
  );

-- 4. Add list_id to campaigns table for targeting
alter table public.campaigns
  add column if not exists list_id uuid references public.lists(id) on delete set null;

create index if not exists idx_campaigns_list_id on public.campaigns(list_id);

-- Function to update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Triggers for updated_at
drop trigger if exists update_contacts_updated_at on public.contacts;
create trigger update_contacts_updated_at
  before update on public.contacts
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_lists_updated_at on public.lists;
create trigger update_lists_updated_at
  before update on public.lists
  for each row
  execute function public.update_updated_at_column();

-- Comments
comment on table public.contacts is 'Homeowner contacts imported by roofers';
comment on table public.lists is 'Neighborhood/area lists for targeting campaigns';
comment on table public.list_contacts is 'Many-to-many relationship between lists and contacts';
comment on column public.campaigns.list_id is 'Target list for campaign (alternative to segment_id)';























































