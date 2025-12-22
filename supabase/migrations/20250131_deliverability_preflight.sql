-- Deliverability Preflight System
-- Creates campaign_preflight and sender_domain_status tables

-- 1) Campaign preflight snapshots
create table if not exists campaign_preflight (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  severity text not null check (severity in ('LOW','MEDIUM','HIGH')),
  issues jsonb not null, -- [{code, message, hint, severity}]
  metrics jsonb not null, -- {subject_len, exclamations, links, uppercase_ratio, reading_grade, ...}
  created_at timestamptz default now()
);

create index if not exists idx_preflight_campaign on campaign_preflight(campaign_id);
create index if not exists idx_preflight_org on campaign_preflight(org_id);
create index if not exists idx_preflight_created on campaign_preflight(created_at desc);

alter table campaign_preflight enable row level security;

create policy "org read preflight" on campaign_preflight 
  for select using (is_org_member(org_id));

create policy "org write preflight" on campaign_preflight 
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- 2) Sender domain cache (update via provider API or manual verify)
create table if not exists sender_domain_status (
  org_id uuid not null references organizations(id) on delete cascade,
  domain text not null,
  spf boolean default null,
  dkim boolean default null,
  dmarc boolean default null,
  last_checked_at timestamptz default now(),
  primary key (org_id, domain)
);

create index if not exists idx_domain_status_org on sender_domain_status(org_id);

alter table sender_domain_status enable row level security;

create policy "org read/write domain status" on sender_domain_status 
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

