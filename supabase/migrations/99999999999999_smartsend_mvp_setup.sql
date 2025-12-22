-- SmartSend MVP Test Setup
-- Run this in Supabase SQL Editor to prepare the schema for MVP testing

-- 1) Verify campaigns table exists
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid references auth.users(id),
  status text default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) Verify leads table exists (with proper unique constraint)
drop table if exists public.leads_bak;
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  email text not null,
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  status text default 'new' check (status in ('new','queued','replied','unsubscribed','bounced','failed','retrying')),
  reply_detected boolean default false,
  reply_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ensure unique constraint for upsert hygiene (per campaign + email)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_campaign_email_unique') then
    create unique index leads_campaign_email_unique on public.leads (campaign_id, email) where campaign_id is not null;
  end if;
end $$;

-- Allow duplicates across campaigns (same email can be in multiple campaigns)
create unique index if not exists leads_user_email_unique on public.leads (email) where campaign_id is null;

-- 3) Verify send_queue table exists
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  to_email text not null,
  subject text,
  body_html text,
  status text not null default 'pending' check (status in ('pending','sent','failed','retrying','cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists send_queue_status_idx on public.send_queue(status, created_at);
create index if not exists send_queue_campaign_idx on public.send_queue(campaign_id, status);

-- 4) Verify campaign_logs table exists
create table if not exists public.campaign_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  event_type text not null check (event_type in ('queued','sent','failed','retrying','replied','bounced','opened','clicked')),
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists campaign_logs_campaign_idx on public.campaign_logs(campaign_id, created_at);
create index if not exists campaign_logs_lead_idx on public.campaign_logs(lead_id, created_at);

-- Touch trigger for updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
before update on public.leads
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_send_queue_updated_at on public.send_queue;
create trigger trg_send_queue_updated_at
before update on public.send_queue
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_campaigns_updated_at on public.campaigns;
create trigger trg_campaigns_updated_at
before update on public.campaigns
for each row execute procedure public.set_updated_at();

-- 5) Basic RLS policies (adjust to your auth model)
alter table public.campaigns enable row level security;
alter table public.leads enable row level security;
alter table public.send_queue enable row level security;
alter table public.campaign_logs enable row level security;

-- Example read policies (adjust as needed)
drop policy if exists "campaigns_read" on public.campaigns;
create policy "campaigns_read" on public.campaigns for select using (true);

drop policy if exists "leads_read" on public.leads;
create policy "leads_read" on public.leads for select using (true);

drop policy if exists "send_queue_read" on public.send_queue;
create policy "send_queue_read" on public.send_queue for select using (true);

drop policy if exists "campaign_logs_read" on public.campaign_logs;
create policy "campaign_logs_read" on public.campaign_logs for select using (true);

-- Writes use service role (no policy needed for service role)
