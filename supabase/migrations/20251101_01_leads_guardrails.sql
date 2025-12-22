-- Unique per campaign for leads email and helpful index for lookups

alter table public.leads
  add constraint if not exists leads_campaign_email_unique unique (campaign_id, email);

create index if not exists idx_leads_campaign_email
  on public.leads (campaign_id, email);


