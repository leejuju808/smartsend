-- =========================================================
-- Block 11700 — SmartSend Domain Setup & Safe-Send Verification v1
-- (Domain Connection System for Verified, Trusted, Spam-Resistant Email Sending)
-- =========================================================

-- Create domain_settings table
create table if not exists public.domain_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  
  -- Domain information
  domain text not null,
  sending_email text not null, -- e.g., estimates@roofingcompany.com
  provider text check (provider in ('google_workspace', 'microsoft_365', 'cpanel', 'godaddy', 'namecheap', 'custom')),
  
  -- DNS verification status
  spf_pass boolean default false,
  dkim_pass boolean default false,
  dmarc_pass boolean default false,
  mx_pass boolean default false,
  
  -- DKIM configuration
  dkim_selector text default 'smartsend',
  dkim_public_key text, -- Generated public key for DKIM
  dkim_private_key text, -- Stored securely (encrypted in production)
  
  -- Verification status
  verification_status text not null default 'unverified' 
    check (verification_status in ('unverified', 'partial', 'verified')),
  
  -- Safe mode (critical protection layer)
  safe_mode boolean default true, -- Enabled by default until verified
  
  -- Blacklist and spam checks
  is_blacklisted boolean default false,
  spam_flags jsonb default '[]'::jsonb,
  
  -- Last verification check
  last_verified_at timestamptz,
  verification_errors jsonb default '[]'::jsonb,
  
  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  -- Ensure one domain per org (can be extended later for multi-domain)
  unique(org_id, domain)
);

-- Indexes for performance
create index if not exists idx_domain_settings_org on public.domain_settings(org_id);
create index if not exists idx_domain_settings_domain on public.domain_settings(domain);
create index if not exists idx_domain_settings_verification_status on public.domain_settings(verification_status);
create index if not exists idx_domain_settings_safe_mode on public.domain_settings(safe_mode);

-- Function to update verification status based on DNS checks
create or replace function public.update_domain_verification_status()
returns trigger
language plpgsql
as $$
declare
  checks_passed int := 0;
  total_checks int := 4;
begin
  -- Count passed checks
  if NEW.spf_pass then checks_passed := checks_passed + 1; end if;
  if NEW.dkim_pass then checks_passed := checks_passed + 1; end if;
  if NEW.dmarc_pass then checks_passed := checks_passed + 1; end if;
  if NEW.mx_pass then checks_passed := checks_passed + 1; end if;
  
  -- Determine verification status
  if checks_passed = total_checks then
    NEW.verification_status := 'verified';
    NEW.safe_mode := false; -- Disable safe mode when fully verified
  elsif checks_passed >= 2 then
    NEW.verification_status := 'partial';
    NEW.safe_mode := true; -- Keep safe mode for partial verification
  else
    NEW.verification_status := 'unverified';
    NEW.safe_mode := true; -- Ensure safe mode for unverified
  end if;
  
  -- Update last_verified_at if any check was performed
  if NEW.spf_pass is not null or NEW.dkim_pass is not null or NEW.dmarc_pass is not null or NEW.mx_pass is not null then
    NEW.last_verified_at := now();
  end if;
  
  return NEW;
end;
$$;

-- Trigger to auto-update verification status
drop trigger if exists trg_update_domain_verification_status on public.domain_settings;
create trigger trg_update_domain_verification_status
  before insert or update on public.domain_settings
  for each row
  execute function public.update_domain_verification_status();

-- Function to update updated_at timestamp
create or replace function public.update_domain_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

-- Trigger for updated_at
drop trigger if exists trg_domain_settings_updated_at on public.domain_settings;
create trigger trg_domain_settings_updated_at
  before update on public.domain_settings
  for each row
  execute function public.update_domain_settings_updated_at();

-- RLS Policies
alter table public.domain_settings enable row level security;

-- Policy: Users can view domains for their org
create policy "Users can view domains for their org"
  on public.domain_settings
  for select
  using (
    exists (
      select 1 from public.org_memberships
      where org_id = domain_settings.org_id
      and user_id = auth.uid()
      and status = 'active'
    )
  );

-- Policy: Owners/admins/managers can manage domains
create policy "Owners/admins/managers can manage domains"
  on public.domain_settings
  for all
  using (
    exists (
      select 1 from public.org_memberships
      where org_id = domain_settings.org_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from public.org_memberships
      where org_id = domain_settings.org_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin', 'manager')
    )
  );

-- Comments
comment on table public.domain_settings is 'Domain setup and verification for email sending. Tracks SPF, DKIM, DMARC, and MX records. Safe mode protects unverified domains.';
comment on column public.domain_settings.verification_status is 'unverified: no checks pass, partial: 2-3 checks pass, verified: all checks pass';
comment on column public.domain_settings.safe_mode is 'When true, limits sending to 20/day, enables warmup, slows follow-ups to protect domain reputation';
comment on column public.domain_settings.dkim_public_key is 'Public key for DKIM signing. Displayed to user for DNS record.';
comment on column public.domain_settings.dkim_private_key is 'Private key for DKIM signing. Should be encrypted in production.';





















































