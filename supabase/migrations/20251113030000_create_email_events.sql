-- Block 165: Link Tracking Engine (Open Tracking + Click Tracking Redirector)
-- Creates email_events table for storing opens + clicks with exact schema

-- Create email_events table if it doesn't exist, or alter existing one
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  event_type text not null check (event_type in ('open','click')),
  url text,
  ua text,           -- user agent
  ip text,           -- ip address
  extra jsonb
);

-- Add missing columns if table already exists
do $$
begin
  -- Add event_type if missing (may exist as 'kind')
  if exists (select 1 from information_schema.columns 
             where table_schema = 'public' and table_name = 'email_events' and column_name = 'kind') then
    if not exists (select 1 from information_schema.columns 
                   where table_schema = 'public' and table_name = 'email_events' and column_name = 'event_type') then
      alter table public.email_events add column event_type text;
      update public.email_events set event_type = kind where event_type is null;
      alter table public.email_events alter column event_type set not null;
      alter table public.email_events add constraint email_events_event_type_check check (event_type in ('open','click'));
    end if;
  end if;

  -- Add ua column if missing (may exist as 'user_agent')
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'email_events' and column_name = 'ua') then
    if exists (select 1 from information_schema.columns 
               where table_schema = 'public' and table_name = 'email_events' and column_name = 'user_agent') then
      alter table public.email_events add column ua text;
      update public.email_events set ua = user_agent;
    else
      alter table public.email_events add column ua text;
    end if;
  end if;

  -- Add ip column if missing (may exist as 'ip' with inet type)
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'email_events' and column_name = 'ip') then
    alter table public.email_events add column ip text;
  end if;

  -- Ensure ip is text type (convert from inet if needed)
  if exists (select 1 from information_schema.columns 
             where table_schema = 'public' and table_name = 'email_events' 
             and column_name = 'ip' and data_type = 'inet') then
    alter table public.email_events alter column ip type text using ip::text;
  end if;

  -- Add url column if missing
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'email_events' and column_name = 'url') then
    alter table public.email_events add column url text;
  end if;

  -- Add extra jsonb column if missing (may exist as 'meta')
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'email_events' and column_name = 'extra') then
    if exists (select 1 from information_schema.columns 
               where table_schema = 'public' and table_name = 'email_events' and column_name = 'meta') then
      alter table public.email_events add column extra jsonb;
      update public.email_events set extra = meta where extra is null;
    else
      alter table public.email_events add column extra jsonb;
    end if;
  end if;

  -- Ensure campaign_id and lead_id exist
  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'email_events' and column_name = 'campaign_id') then
    alter table public.email_events add column campaign_id uuid references public.campaigns(id) on delete cascade;
  end if;

  if not exists (select 1 from information_schema.columns 
                 where table_schema = 'public' and table_name = 'email_events' and column_name = 'lead_id') then
    alter table public.email_events add column lead_id uuid references public.leads(id) on delete cascade;
  end if;
end $$;

-- Create indexes
create index if not exists idx_email_events_campaign on public.email_events(campaign_id);
create index if not exists idx_email_events_lead on public.email_events(lead_id);
create index if not exists idx_email_events_event_type on public.email_events(event_type);
create index if not exists idx_email_events_created_at on public.email_events(created_at desc);

-- Add open_rate and click_rate columns to campaigns table
alter table public.campaigns
  add column if not exists open_rate numeric default 0,
  add column if not exists click_rate numeric default 0;

-- Enable RLS if not already enabled
alter table public.email_events enable row level security;

-- RLS policies (allow service role to insert, users to read their own campaign events)
drop policy if exists "service_role_can_insert_email_events" on public.email_events;
create policy "service_role_can_insert_email_events"
  on public.email_events for insert
  with check (auth.role() = 'service_role');

drop policy if exists "users_can_read_own_campaign_events" on public.email_events;
create policy "users_can_read_own_campaign_events"
  on public.email_events for select
  using (
    exists (
      select 1 from public.campaigns
      where campaigns.id = email_events.campaign_id
      and campaigns.workspace_id in (
        select workspace_id from public.workspace_members
        where user_id = auth.uid()
      )
    )
  );












