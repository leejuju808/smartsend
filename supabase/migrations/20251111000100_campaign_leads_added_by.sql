-- Ensure campaign_leads table has composite primary key and added_by column
create table if not exists public.campaign_leads (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  added_by uuid references auth.users(id),
  primary key (campaign_id, lead_id)
);

alter table public.campaign_leads
  add column if not exists added_by uuid references auth.users(id);

create index if not exists idx_campaign_leads_campaign on public.campaign_leads(campaign_id);
create index if not exists idx_campaign_leads_lead on public.campaign_leads(lead_id);



