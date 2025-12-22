-- AI Draft Generation Schema Migration
-- Leads per campaign (skip if you already have a leads table)
create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  campaign_id uuid not null,
  email text not null,
  first_name text,
  last_name text,
  company text,
  title text,
  website text,
  notes text,
  created_at timestamp with time zone default now()
);

-- AI-generated drafts (one per lead, can regenerate)
create table if not exists email_drafts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null references leads(id) on delete cascade,
  subject text not null,
  body_markdown text not null,      -- store as MD; render to HTML on send
  model text default 'gpt-4o-mini',
  tone text default 'concise',
  temperature numeric default 0.7,
  status text default 'draft',      -- draft | approved | rejected
  tokens_estimated int,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Helpful indexes
create index if not exists idx_leads_campaign on leads(campaign_id);
create index if not exists idx_drafts_campaign on email_drafts(campaign_id);
create index if not exists idx_drafts_lead on email_drafts(lead_id);

-- RLS
alter table leads enable row level security;
alter table email_drafts enable row level security;

-- Policies (user owns their rows)
create policy "leads_select_own" on leads
for select using (auth.uid() = user_id);
create policy "leads_ins_own" on leads
for insert with check (auth.uid() = user_id);
create policy "leads_upd_own" on leads
for update using (auth.uid() = user_id);

create policy "drafts_select_own" on email_drafts
for select using (auth.uid() = user_id);
create policy "drafts_ins_own" on email_drafts
for insert with check (auth.uid() = user_id);
create policy "drafts_upd_own" on email_drafts
for update using (auth.uid() = user_id);