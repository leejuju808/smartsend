-- Block 8800 — SmartSend Lead De-duplication Engine (Global + Per-Campaign)
-- This migration adds global lead indexing and campaign-level deduplication strategies

-- 1) Create Global Lead Index Table
-- Every email that enters SmartSend should be indexed globally
create table if not exists public.smartsend_global_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz default now(),
  unique(user_id, email)
);

-- Create index for fast lookups
create index if not exists idx_smartsend_global_leads_user_email 
  on public.smartsend_global_leads (user_id, email);

-- Create index on email for domain-level deduplication
create index if not exists idx_smartsend_global_leads_email 
  on public.smartsend_global_leads (email);

-- Enable RLS
alter table public.smartsend_global_leads enable row level security;

-- RLS Policies: Users can only see/modify their own global leads
create policy if not exists "users_select_own_global_leads"
  on public.smartsend_global_leads
  for select
  using (auth.uid() = user_id);

create policy if not exists "users_insert_own_global_leads"
  on public.smartsend_global_leads
  for insert
  with check (auth.uid() = user_id);

-- 2) Add Dedupe Strategy Column to Campaigns Table
alter table public.campaigns
  add column if not exists dedupe_strategy text default 'per_campaign'
  check (dedupe_strategy in ('per_campaign', 'global', 'domain', 'none'));

-- Create index for filtering campaigns by dedupe strategy
create index if not exists idx_campaigns_dedupe_strategy 
  on public.campaigns(dedupe_strategy);

-- Done!








