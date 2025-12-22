-- 8150 - Provider selection + account wiring

-- 🔹 Outbound email accounts (Gmail / Outlook / SMTP)
create table if not exists public.outbound_email_accounts (
  id uuid primary key default gen_random_uuid(),

  -- scope this however you're doing multi-tenancy
  org_id uuid,
  user_id uuid,

  provider text not null check (provider in ('gmail', 'outlook', 'smtp')),
  display_name text,
  from_email text not null,

  status text not null default 'connected'
    check (status in ('connected', 'revoked', 'error')),

  -- basic usage limits (can expand later)
  daily_limit integer,
  used_today integer not null default 0,
  last_reset_at timestamptz,

  -- provider-specific metadata (DO NOT store raw tokens here in prod)
  metadata jsonb not null default '{}'::jsonb,

  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_outbound_accounts_org
  on public.outbound_email_accounts (org_id);

-- 🔹 Wire campaigns to a default provider account
alter table public.campaigns
  add column if not exists provider text
    check (provider in ('gmail', 'outlook', 'smtp')),
  add column if not exists provider_account_id uuid
    references public.outbound_email_accounts(id);

-- 🔹 Ensure queue rows store provider + account snapshot
alter table public.campaign_send_queue
  add column if not exists provider_account_id uuid
    references public.outbound_email_accounts(id),
  add column if not exists from_email text;

create index if not exists idx_campaign_send_queue_provider_account
  on public.campaign_send_queue (provider_account_id);

































































