-- Block 413 — Domain Health Scanner v1
-- Professional-grade deliverability scanner for domains

-- 1. Domain Health Table
create table if not exists domain_health (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  spf_record text,
  spf_valid boolean,
  dkim_selector text,
  dkim_record text,
  dkim_valid boolean,
  dmarc_record text,
  dmarc_policy text,
  dmarc_valid boolean,
  mx_records jsonb,
  mx_valid boolean,
  domain_age_days int,
  reputation_score int default 50,
  last_scanned_at timestamptz default now(),
  unique(domain)
);

-- Indexes
create index if not exists idx_domain_health_domain
  on domain_health(domain);

create index if not exists idx_domain_health_last_scanned_at
  on domain_health(last_scanned_at desc);

-- Enable RLS
alter table domain_health enable row level security;

-- RLS: Users can read domain health for domains they own
create policy "domain_health_read" on domain_health
  for select using (
    exists (
      select 1 from sender_identities
      where sender_identities.user_id = auth.uid()
      and (
        sender_identities.from_email like '%@' || domain_health.domain
        or sender_identities.domain = domain_health.domain
      )
    )
  );

-- Service role can read/write all domain health records
create policy "service_role_domain_health" on domain_health
  for all to service_role using (true) with check (true);



