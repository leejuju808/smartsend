-- CSV Lead Import Guards
-- Require unique lead email within a campaign
create unique index if not exists leads_campaign_email_uidx
  on public.leads (campaign_id, lower(email))
  where campaign_id is not null;

-- Helpful filter indexes for lead queries
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_campaign_status_idx on public.leads (campaign_id, status);
create index if not exists leads_created_at_idx on public.leads (created_at);

-- Optional: Enforce email lowercasing via trigger (uncomment if needed)
-- create or replace function public.normalize_lead_email() returns trigger as $$
-- begin
--   new.email := lower(trim(new.email));
--   return new;
-- end; $$ language plpgsql security definer;
--
-- drop trigger if exists trg_normalize_lead_email on public.leads;
-- create trigger trg_normalize_lead_email before insert or update on public.leads
-- for each row execute function public.normalize_lead_email();

