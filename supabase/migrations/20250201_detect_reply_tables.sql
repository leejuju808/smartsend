-- Migration for detect-reply function
-- Creates campaign_logs and replies tables for thread-based reply detection

-- Ensure leads table has status and replied_at columns
alter table public.leads
  add column if not exists status text not null default 'New',
  add column if not exists replied_at timestamptz;

-- Campaign logs table to track email sends with thread_id
create table if not exists public.campaign_logs (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  thread_id text not null,
  message_id text,
  subject text,
  sent_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists campaign_logs_thread_idx on public.campaign_logs(thread_id);
create index if not exists campaign_logs_lead_idx on public.campaign_logs(lead_id);

-- Enable RLS
alter table public.campaign_logs enable row level security;

-- Replies table to store inbound replies
create table if not exists public.replies (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  from_email text,
  subject text,
  snippet text,
  created_at timestamptz default now()
);

create index if not exists replies_lead_idx on public.replies(lead_id);
create index if not exists replies_created_at_idx on public.replies(created_at desc);

-- Enable RLS
alter table public.replies enable row level security;

-- RLS Policies for campaign_logs
create policy "Users can view campaign_logs in their workspace" on public.campaign_logs
  for select using (
    exists (
      select 1 from public.leads l
      where l.id = campaign_logs.lead_id
    )
  );

create policy "Service role can manage campaign_logs" on public.campaign_logs
  for all using (true) with check (true);

-- RLS Policies for replies
create policy "Users can view replies for their leads" on public.replies
  for select using (
    exists (
      select 1 from public.leads l
      where l.id = replies.lead_id
    )
  );

create policy "Service role can manage replies" on public.replies
  for all using (true) with check (true);