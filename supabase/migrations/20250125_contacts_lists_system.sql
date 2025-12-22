-- Contacts, Lists, and Memberships System
-- Creates tables for contacts, lists, list_members with RLS policies
-- Compatible with existing email_jobs table

-- 1. Update contacts table to match specification (if not already exists)
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  company text,
  custom jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(user_id, email)
);

-- Enable RLS on contacts
alter table contacts enable row level security;

-- Create policy for contacts
create policy "own contacts" on contacts
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Create index for performance
create index if not exists contacts_user_email_idx on contacts(user_id, email);

-- 2. Create lists table
create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

-- Enable RLS on lists
alter table lists enable row level security;

-- Create policy for lists
create policy "own lists" on lists
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Create list_members table (junction table)
create table if not exists list_members (
  list_id uuid not null references lists(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, contact_id)
);

-- Enable RLS on list_members
alter table list_members enable row level security;

-- Create policy for list_members
create policy "own list_members" on list_members
for all using (
  exists(select 1 from lists l where l.id = list_members.list_id and l.user_id = auth.uid())
) with check (
  exists(select 1 from lists l where l.id = list_members.list_id and l.user_id = auth.uid())
);

-- 4. Create convenience view: contacts in a list that are NOT suppressed
-- Note: This assumes there's a suppressions table - adjust if needed
create or replace view v_list_active_contacts as
  select lm.list_id, c.*
  from list_members lm
  join contacts c on c.id = lm.contact_id
  where not exists (
    select 1 from suppressions s
    where s.user_id = c.user_id and s.value_lower = lower(c.email)
  );

-- 5. Add missing fields to email_jobs if they don't exist
-- These fields are needed for the bulk scheduling functionality
alter table public.email_jobs 
  add column if not exists campaign_id uuid,
  add column if not exists from_email text,
  add column if not exists unsub_token text,
  add column if not exists tracking_token text;

-- Create indexes for the new fields
create index if not exists email_jobs_campaign_idx on public.email_jobs(campaign_id);
create index if not exists email_jobs_tracking_token_idx on public.email_jobs(tracking_token);