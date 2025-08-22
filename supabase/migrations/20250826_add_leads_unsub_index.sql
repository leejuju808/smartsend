-- Ensure unsubscribed column exists and add index for owner_email+unsubscribed lookups
alter table if exists public.leads
  add column if not exists unsubscribed boolean not null default false;

create index if not exists idx_leads_owner_email_unsub
  on public.leads(owner_email, unsubscribed);

