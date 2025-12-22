-- Lead verification system
-- Per-lead verification snapshot

create table if not exists public.lead_verifications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.campaign_leads(id) on delete cascade,
  email text not null,
  status text not null check (status in ('valid','risky','invalid','unknown')),
  reasons text[] not null default '{}',  -- e.g., {'syntax','mx','disposable','role'}
  domain text not null,
  mx_hosts text[] default '{}',
  verified_at timestamptz not null default now(),
  unique (lead_id)
);

create index if not exists lead_verifications_campaign_idx on public.lead_verifications(campaign_id);
create index if not exists lead_verifications_lead_idx on public.lead_verifications(lead_id);
create index if not exists lead_verifications_status_idx on public.lead_verifications(status);

alter table public.lead_verifications enable row level security;

-- Anyone with access to the campaign can read
create policy "lv read by campaign access" on public.lead_verifications
for select using (exists (
  select 1 from public.v_campaign_access v where v.campaign_id = lead_verifications.campaign_id and v.user_id = auth.uid()
));

-- Only sender/admin can insert/update
create policy "lv write by sender/admin" on public.lead_verifications
for all using (exists (
  select 1 from public.v_campaign_access v where v.campaign_id = lead_verifications.campaign_id and v.user_id = auth.uid() and v.role in ('sender','admin')
)) with check (exists (
  select 1 from public.v_campaign_access v where v.campaign_id = lead_verifications.campaign_id and v.user_id = auth.uid() and v.role in ('sender','admin')
));

-- Helpful view to join into lists
create or replace view public.v_campaign_leads_verified as
select l.*, v.status as verify_status, v.reasons as verify_reasons
from public.campaign_leads l
left join public.lead_verifications v on v.lead_id = l.id;

