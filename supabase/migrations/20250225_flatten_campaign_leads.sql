-- Flatten campaign_leads table to store lead data directly
-- Based on beta user CSV import requirements

-- Add required columns to campaign_leads if they don't exist
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'campaign_leads' and column_name = 'user_id') then
    alter table public.campaign_leads add column user_id uuid references auth.users(id) on delete cascade;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'campaign_leads' and column_name = 'email') then
    alter table public.campaign_leads add column email text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'campaign_leads' and column_name = 'first_name') then
    alter table public.campaign_leads add column first_name text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'campaign_leads' and column_name = 'company') then
    alter table public.campaign_leads add column company text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'campaign_leads' and column_name = 'title') then
    alter table public.campaign_leads add column title text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'campaign_leads' and column_name = 'subject_token') then
    alter table public.campaign_leads add column subject_token text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'campaign_leads' and column_name = 'replied') then
    alter table public.campaign_leads add column replied boolean not null default false;
  end if;
end $$;

-- Drop old unique constraint if it exists and create new one
drop index if exists campaign_leads_campaign_id_lead_id_key;

-- Handle nullable columns for existing data
do $$
begin
  -- If email or user_id have nulls, we need to handle them
  -- For backward compatibility, only set NOT NULL if no nulls exist
  if not exists (select 1 from public.campaign_leads where email is null) then
    alter table public.campaign_leads alter column email set not null;
  end if;
  
  if not exists (select 1 from public.campaign_leads where user_id is null) then
    alter table public.campaign_leads alter column user_id set not null;
  end if;
end $$;

-- Create unique index only if we have email data
create unique index if not exists campaign_leads_campaign_email_unique on public.campaign_leads (campaign_id, email) where email is not null;

-- Add RLS policies if they don't exist
alter table public.campaign_leads enable row level security;

drop policy if exists "read own leads" on public.campaign_leads;
drop policy if exists "insert own leads" on public.campaign_leads;
drop policy if exists "update own leads" on public.campaign_leads;

create policy "read own leads"
on public.campaign_leads for select
using (auth.uid() = user_id);

create policy "insert own leads"
on public.campaign_leads for insert
with check (auth.uid() = user_id);

create policy "update own leads"
on public.campaign_leads for update
using (auth.uid() = user_id) with check (auth.uid() = user_id);

