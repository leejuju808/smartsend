-- Block 163 — Bounce Detection Engine
-- Creates email_bounces table and adds bounced column to leads

-- 1) Create email_bounces table
create table if not exists public.email_bounces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  reason text,
  raw_payload jsonb,
  constraint email_bounces_unique unique (campaign_id, lead_id)
);

create index if not exists idx_email_bounces_lead
  on public.email_bounces (lead_id);

-- 2) Update Leads Table with Bounce Status
alter table public.leads
  add column if not exists bounced boolean default false;

create index if not exists idx_leads_bounced on public.leads(bounced) where bounced = true;

-- 3) Add skip_reason column to send_queue if it doesn't exist
alter table public.send_queue
  add column if not exists skip_reason text;

