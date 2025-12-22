-- Prevent dupes per campaign

alter table public.leads
  add constraint if not exists leads_unique_campaign_email unique (campaign_id, email);


-- Helpful indexes

create index if not exists idx_leads_campaign on public.leads(campaign_id);
create index if not exists idx_leads_status on public.leads(status);


-- Query performance for leads list views
create index if not exists idx_leads_campaign_status_created
  on public.leads(campaign_id, status, created_at desc);

create index if not exists idx_leads_created_at
  on public.leads(created_at desc);


