-- BLOCK 3 — SLICE 4: Launch Campaign → Build Queue → Send Tick
-- Database schema for send_queue and send_logs tables

-- public.send_queue
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.campaign_leads(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body text not null,
  scheduled_at timestamptz not null,
  status text not null default 'queued', -- queued | sending | sent | failed
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

-- public.send_logs
create table if not exists public.send_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null,
  queue_id uuid not null references public.send_queue(id) on delete cascade,
  provider_id text,                  -- Gmail messageId, etc.
  sent_at timestamptz not null default now()
);

-- Ensure campaign_leads has subject_token column for tracking
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaign_leads' 
    and column_name = 'subject_token'
  ) then
    alter table public.campaign_leads 
    add column subject_token text;
    
    create index if not exists idx_campaign_leads_subject_token 
    on public.campaign_leads(subject_token) 
    where subject_token is not null;
  end if;
end $$;

-- Indexes for performance
create index if not exists idx_send_queue_status_scheduled on public.send_queue(status, scheduled_at);
create index if not exists idx_send_queue_campaign on public.send_queue(campaign_id);
create index if not exists idx_send_queue_lead on public.send_queue(lead_id);
create index if not exists idx_send_logs_queue on public.send_logs(queue_id);
create index if not exists idx_send_logs_campaign on public.send_logs(campaign_id);

-- Enable RLS
alter table public.send_queue enable row level security;
alter table public.send_logs enable row level security;

-- RLS Policies for send_queue
drop policy if exists "own queue" on public.send_queue;
create policy "own queue" on public.send_queue
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- RLS Policies for send_logs
drop policy if exists "own logs" on public.send_logs;
create policy "own logs" on public.send_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

