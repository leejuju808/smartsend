-- Campaigns schema for simple campaign -> leads -> send_queue flow
-- Based on user spec for campaigns, campaign_leads, and send_queue

-- Ensure campaigns table has the necessary columns
-- Add missing columns if they don't exist
do $$
begin
  -- Add sender_profile_id if it doesn't exist (optional connected inbox)
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'sender_profile_id') then
    alter table public.campaigns add column sender_profile_id uuid;
  end if;
  
  -- Add schedule_at if it doesn't exist (first send time in UTC)
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'schedule_at') then
    alter table public.campaigns add column schedule_at timestamptz;
  end if;
  
  -- Add daily_limit if it doesn't exist
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'daily_limit') then
    alter table public.campaigns add column daily_limit int default 200;
  end if;
end $$;

-- Join selected leads to the campaign
create table if not exists public.campaign_leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, lead_id)
);

-- Index for faster lookups
create index if not exists idx_campaign_leads_campaign on public.campaign_leads(campaign_id);
create index if not exists idx_campaign_leads_lead on public.campaign_leads(lead_id);

-- Ensure send_queue table exists with required columns
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body_html text not null,
  status text not null default 'queued', -- queued | sending | sent | failed
  attempt int not null default 0,
  scheduled_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Add missing columns to send_queue if they don't exist
do $$
begin
  -- Add to_email if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'to_email') then
    alter table public.send_queue add column to_email text not null default '';
  end if;
  
  -- Add subject if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'subject') then
    alter table public.send_queue add column subject text not null default '';
  end if;
  
  -- Add body_html if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'body_html') then
    alter table public.send_queue add column body_html text not null default '';
  end if;
  
  -- Add attempt if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'attempt') then
    alter table public.send_queue add column attempt int not null default 0;
  end if;
  
  -- Add scheduled_at if missing
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'scheduled_at') then
    alter table public.send_queue add column scheduled_at timestamptz not null default now();
  end if;
end $$;

-- Indexes for send_queue
create index if not exists idx_send_queue_status_scheduled on public.send_queue(status, scheduled_at);
create index if not exists idx_send_queue_campaign on public.send_queue(campaign_id);
create index if not exists idx_send_queue_lead on public.send_queue(lead_id);

-- Minimal RLS (tighten later)
alter table public.campaign_leads enable row level security;
alter table public.send_queue enable row level security;

-- Drop existing policies if they exist
drop policy if exists "campaign_leads_owner" on public.campaign_leads;
drop policy if exists "send_queue_owner" on public.send_queue;

-- Campaign leads policies - users can only access leads for their own campaigns
create policy "campaign_leads_owner" on public.campaign_leads
  for all using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()));

-- Send queue policies - users can only view their own queue items
create policy "send_queue_owner" on public.send_queue
  for select using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()));

-- Add insert, update, delete policies for send_queue if needed
drop policy if exists "send_queue_owner_all" on public.send_queue;
create policy "send_queue_owner_all" on public.send_queue
  for all using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()));

