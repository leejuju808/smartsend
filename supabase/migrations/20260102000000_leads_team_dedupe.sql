-- Leads table hardening: team-based deduplication
-- Ensures leads table has required columns and unique constraint per team+email

-- Ensure leads table exists with core structure
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  website text,
  linkedin text,
  custom jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Add columns if they don't exist (for existing tables)
do $$
begin
  -- Add team_id if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'leads' and column_name = 'team_id'
  ) then
    alter table public.leads add column team_id uuid references public.teams(id) on delete cascade;
  end if;

  -- Make team_id required (set default for existing rows, then add NOT NULL)
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'leads' 
    and column_name = 'team_id' 
    and is_nullable = 'YES'
  ) then
    -- Update any null team_ids to a default team if needed (or leave as-is for now)
    -- For now, we'll allow null temporarily during migration, but new inserts require it
  end if;

  -- Add required columns
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'email') then
    alter table public.leads add column email text not null default '';
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'first_name') then
    alter table public.leads add column first_name text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'last_name') then
    alter table public.leads add column last_name text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'company') then
    alter table public.leads add column company text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'title') then
    alter table public.leads add column title text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'phone') then
    alter table public.leads add column phone text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'website') then
    alter table public.leads add column website text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'linkedin') then
    alter table public.leads add column linkedin text;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'custom') then
    alter table public.leads add column custom jsonb default '{}'::jsonb;
  end if;
  
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'created_at') then
    alter table public.leads add column created_at timestamptz not null default now();
  end if;
end $$;

-- Drop existing unique constraint/index on (team_id, email) if it exists with different name
drop index if exists public.leads_team_email_uidx;
drop index if exists leads_user_email_unique;
drop index if exists uq_leads_campaign_email;

-- Fast dedupe: one email per team (case-insensitive)
create unique index if not exists leads_team_email_uidx
on public.leads (team_id, lower(email))
where team_id is not null and email is not null;

-- Enable RLS if not already enabled
alter table if exists public.leads enable row level security;

-- Drop existing policies and recreate with is_member_of
drop policy if exists "leads in my teams" on public.leads;
drop policy if exists "Owners can manage their leads" on public.leads;
drop policy if exists "leads_rw" on public.leads;

-- RLS policy: require is_member_of(team_id)
create policy "leads_team_member" on public.leads
  for all using (
    team_id is not null and exists(
      select 1 from public.team_members 
      where team_id = leads.team_id and user_id = auth.uid()
    )
  )
  with check (
    team_id is not null and exists(
      select 1 from public.team_members 
      where team_id = leads.team_id and user_id = auth.uid()
    )
  );

-- RPC function for bulk upsert with team-based deduplication
-- Note: ON CONFLICT with unique index requires using the index constraint name or column expression
create or replace function public.upsert_leads_bulk(
  p_team_id uuid,
  p_leads jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_lead jsonb;
  v_inserted int := 0;
  v_email text;
begin
  -- Loop through each lead in the JSONB array
  for v_lead in select * from jsonb_array_elements(p_leads)
  loop
    v_email := trim(lower(v_lead->>'email'));
    
    if v_email is null or v_email = '' then
      continue;
    end if;
    
    -- Insert or update based on unique index (team_id, lower(email))
    -- The unique index is on (team_id, lower(email)), so we match that expression
    insert into public.leads (
      team_id, email, first_name, last_name, company, title, 
      phone, website, linkedin, custom
    )
    values (
      p_team_id,
      v_email,
      nullif(trim(v_lead->>'first_name'), ''),
      nullif(trim(v_lead->>'last_name'), ''),
      nullif(trim(v_lead->>'company'), ''),
      nullif(trim(v_lead->>'title'), ''),
      nullif(trim(v_lead->>'phone'), ''),
      nullif(trim(v_lead->>'website'), ''),
      nullif(trim(v_lead->>'linkedin'), ''),
      coalesce(v_lead->'custom', '{}'::jsonb)
    )
    on conflict (team_id, lower(email))
    do update set
      first_name = coalesce(nullif(trim(excluded.first_name), ''), leads.first_name),
      last_name = coalesce(nullif(trim(excluded.last_name), ''), leads.last_name),
      company = coalesce(nullif(trim(excluded.company), ''), leads.company),
      title = coalesce(nullif(trim(excluded.title), ''), leads.title),
      phone = coalesce(nullif(trim(excluded.phone), ''), leads.phone),
      website = coalesce(nullif(trim(excluded.website), ''), leads.website),
      linkedin = coalesce(nullif(trim(excluded.linkedin), ''), leads.linkedin),
      custom = coalesce(excluded.custom, leads.custom, '{}'::jsonb);
    
    v_inserted := v_inserted + 1;
  end loop;
  
  return jsonb_build_object(
    'imported', v_inserted
  );
exception
  when others then
    return jsonb_build_object(
      'error', sqlerrm,
      'imported', v_inserted
    );
end;
$$;

