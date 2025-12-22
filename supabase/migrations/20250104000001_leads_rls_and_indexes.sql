-- Leads RLS + Fast Lookups
-- Ensures campaign_leads table exists with proper primary key
-- Adds RLS policies for leads table
-- Creates indexes for fast lookups

-- Create campaign_leads table if it doesn't exist
create table if not exists public.campaign_leads (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, lead_id)
);

-- Create indexes for fast lookups
create index if not exists idx_leads_user_created on public.leads(user_id, created_at desc);
create index if not exists idx_leads_user_name on public.leads(user_id, first_name, last_name);
create index if not exists idx_leads_user_company on public.leads(user_id, company);
create index if not exists idx_leads_user_email_only on public.leads(user_id, email);
create index if not exists idx_leads_user_domain_only on public.leads(user_id, domain);

-- Enable RLS on leads table
alter table public.leads enable row level security;

-- Drop existing policies if they exist
drop policy if exists sel_leads on public.leads;
drop policy if exists ins_leads on public.leads;
drop policy if exists upd_leads on public.leads;
drop policy if exists del_leads on public.leads;

-- RLS policies for leads (owner-scoped)
create policy sel_leads on public.leads
  for select to authenticated
  using (user_id = auth.uid());

create policy ins_leads on public.leads
  for insert to authenticated
  with check (user_id = auth.uid());

create policy upd_leads on public.leads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy del_leads on public.leads
  for delete to authenticated
  using (user_id = auth.uid());

-- Campaign link lookups indexes
create index if not exists idx_campaign_leads_campaign on public.campaign_leads(campaign_id);
create index if not exists idx_campaign_leads_lead on public.campaign_leads(lead_id);



