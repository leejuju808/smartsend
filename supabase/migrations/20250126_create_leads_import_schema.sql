-- Create or update leads table for CSV import feature
-- This ensures the leads table has all required columns for import

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid,
  email text not null,
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  custom jsonb default '{}'::jsonb,
  status text default 'new' check (status in ('new','queued','replied','unsubscribed','bounced')),
  reply_detected boolean default false,
  reply_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add columns if they don't exist (for existing tables)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'user_id') then
    alter table public.leads add column user_id uuid references auth.users(id) on delete cascade;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'campaign_id') then
    alter table public.leads add column campaign_id uuid;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'email') then
    alter table public.leads add column email text not null;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'first_name') then
    alter table public.leads add column first_name text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'last_name') then
    alter table public.leads add column last_name text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'company') then
    alter table public.leads add column company text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'title') then
    alter table public.leads add column title text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'phone') then
    alter table public.leads add column phone text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'custom') then
    alter table public.leads add column custom jsonb default '{}'::jsonb;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'status') then
    alter table public.leads add column status text default 'new' check (status in ('new','queued','replied','unsubscribed','bounced'));
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'reply_detected') then
    alter table public.leads add column reply_detected boolean default false;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'reply_summary') then
    alter table public.leads add column reply_summary text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'created_at') then
    alter table public.leads add column created_at timestamptz default now();
  end if;
  
  if not exists (select 1 from information_schema.columns where table_name = 'leads' and column_name = 'updated_at') then
    alter table public.leads add column updated_at timestamptz default now();
  end if;
end $$;

-- Create unique constraint on email per user
create unique index if not exists leads_user_email_unique 
  on public.leads (user_id, email);

-- Ensure email is NOT NULL
alter table public.leads alter column email set not null;

-- Index for email lookups
create index if not exists leads_email_idx 
  on public.leads (email);

-- Index for status filtering
create index if not exists leads_status_idx 
  on public.leads (status);

-- Index for campaign lookups
create index if not exists leads_campaign_idx 
  on public.leads (campaign_id) where campaign_id is not null;

-- Enable RLS
alter table public.leads enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Users can manage their own leads" on public.leads;

-- Create RLS policies
create policy "Users can manage their own leads" 
  on public.leads 
  for all 
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Trigger to update updated_at timestamp
create or replace function public.set_leads_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row
  execute function public.set_leads_updated_at();