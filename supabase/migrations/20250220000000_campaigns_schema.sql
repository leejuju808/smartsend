-- Create campaigns table with the exact schema as specified
-- This migration ensures the campaigns table has all required fields

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  subject text not null,
  body_template text not null,
  daily_cap int not null default 50,
  send_start time not null default '09:00',
  status text not null default 'draft', -- draft | active | paused | completed
  created_at timestamptz not null default now()
);

-- Add missing columns if table already exists but is missing fields
do $$
begin
  -- Add title if missing (may exist as 'name' in older migrations)
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'campaigns' and column_name = 'title') then
    if exists (select 1 from information_schema.columns 
               where table_schema = 'public' and table_name = 'campaigns' and column_name = 'name') then
      alter table public.campaigns rename column name to title;
    else
      alter table public.campaigns add column title text not null default '';
    end if;
  end if;

  -- Add subject if missing
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'campaigns' and column_name = 'subject') then
    alter table public.campaigns add column subject text not null default '';
  end if;

  -- Add body_template if missing (may exist as 'body_html' or 'body_text')
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'campaigns' and column_name = 'body_template') then
    if exists (select 1 from information_schema.columns 
               where table_schema = 'public' and table_name = 'campaigns' and column_name = 'body_html') then
      alter table public.campaigns add column body_template text;
      update public.campaigns set body_template = body_html where body_template is null;
      alter table public.campaigns alter column body_template set not null;
    elsif exists (select 1 from information_schema.columns 
                  where table_schema = 'public' and table_name = 'campaigns' and column_name = 'body_text') then
      alter table public.campaigns add column body_template text;
      update public.campaigns set body_template = body_text where body_template is null;
      alter table public.campaigns alter column body_template set not null;
    else
      alter table public.campaigns add column body_template text not null default '';
    end if;
  end if;

  -- Add daily_cap if missing (may exist as 'daily_limit')
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'campaigns' and column_name = 'daily_cap') then
    if exists (select 1 from information_schema.columns 
               where table_schema = 'public' and table_name = 'campaigns' and column_name = 'daily_limit') then
      alter table public.campaigns add column daily_cap int;
      update public.campaigns set daily_cap = daily_limit where daily_cap is null;
      alter table public.campaigns alter column daily_cap set not null;
      alter table public.campaigns alter column daily_cap set default 50;
    else
      alter table public.campaigns add column daily_cap int not null default 50;
    end if;
  end if;

  -- Add send_start if missing
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'campaigns' and column_name = 'send_start') then
    alter table public.campaigns add column send_start time not null default '09:00';
  end if;

  -- Ensure status has the correct default and check constraint
  if exists (select 1 from information_schema.columns 
             where table_schema = 'public' and table_name = 'campaigns' and column_name = 'status') then
    -- Update default if needed
    alter table public.campaigns alter column status set default 'draft';
    -- Ensure not null
    alter table public.campaigns alter column status set not null;
  end if;

  -- Ensure user_id exists and is not null
  if exists (select 1 from information_schema.columns 
             where table_schema = 'public' and table_name = 'campaigns' and column_name = 'user_id') then
    alter table public.campaigns alter column user_id set not null;
  elsif exists (select 1 from information_schema.columns 
                where table_schema = 'public' and table_name = 'campaigns' and column_name = 'workspace_id') then
    -- If workspace_id exists, we need to map it - but this is complex, so we'll just add user_id
    alter table public.campaigns add column user_id uuid references auth.users(id) on delete cascade;
    -- Note: You'll need to populate user_id from workspace_id based on your logic
    alter table public.campaigns alter column user_id set not null;
  else
    alter table public.campaigns add column user_id uuid not null references auth.users(id) on delete cascade;
  end if;

  -- Ensure created_at exists
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'campaigns' and column_name = 'created_at') then
    alter table public.campaigns add column created_at timestamptz not null default now();
  end if;
end $$;

-- Create index on user_id for performance
create index if not exists campaigns_user_id_idx on public.campaigns(user_id);

-- RLS
alter table public.campaigns enable row level security;

-- Drop existing policies if they exist (to recreate with correct ones)
drop policy if exists "campaigns are readable by owner" on public.campaigns;
drop policy if exists "campaigns are insertable by owner" on public.campaigns;
drop policy if exists "campaigns are updatable by owner" on public.campaigns;
drop policy if exists "campaigns_select_own" on public.campaigns;
drop policy if exists "campaigns_insert_own" on public.campaigns;
drop policy if exists "campaigns_update_own" on public.campaigns;
drop policy if exists "users select their campaigns" on public.campaigns;
drop policy if exists "users insert their campaigns" on public.campaigns;
drop policy if exists "users update their campaigns" on public.campaigns;

-- Create RLS policies
create policy "campaigns are readable by owner"
on public.campaigns for select
using (auth.uid() = user_id);

create policy "campaigns are insertable by owner"
on public.campaigns for insert
with check (auth.uid() = user_id);

create policy "campaigns are updatable by owner"
on public.campaigns for update
using (auth.uid() = user_id) with check (auth.uid() = user_id);

