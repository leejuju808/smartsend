-- Block 92 — ISP-Aware Pacing
-- Create ISP registry, MX cache, caps, helper view, and RLS policies

-- 1) ISP registry (idempotent)
create table if not exists public.isp_registry (
  key text primary key,
  label text not null,
  mx_patterns text[] not null default '{}',
  domain_patterns text[] not null default '{}'
);

insert into public.isp_registry (key, label, mx_patterns, domain_patterns)
values
  ('gmail', 'Gmail/Google Workspace', array['google.com', 'aspmx.l.google.com', '.googlemail.com'], array['gmail.com', 'googlemail.com']),
  ('outlook', 'Microsoft 365/Outlook', array['protection.outlook.com', '.outlook.com', '.microsoft.com'], array['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'office365.com']),
  ('yahoo', 'Yahoo/AOL', array['yahoodns.net', '.yahoodns.net', '.aol.com'], array['yahoo.com', 'ymail.com', 'aol.com']),
  ('zoho', 'Zoho Mail', array['mx.zoho.com', '.zoho.com'], array['zoho.com']),
  ('other', 'Other/Unknown', '{}', '{}')
on conflict (key) do update set label = excluded.label;

-- 2) MX cache for domains (TTL)
create table if not exists public.mx_cache (
  domain text primary key,
  mx_host text not null,
  fetched_at timestamptz not null default now(),
  isp_key text not null references public.isp_registry (key) on delete restrict
);

create index if not exists idx_mx_cache_fetched on public.mx_cache (fetched_at);

-- 3) Per-ISP pacing config (caps + concurrency + quiet hours)
create table if not exists public.isp_caps (
  id bigserial primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  isp_key text not null references public.isp_registry (key) on delete restrict,
  hourly_cap int not null default 100,
  daily_cap int not null default 1200,
  max_concurrency int not null default 4,
  jitter_ms_min int not null default 800,
  jitter_ms_max int not null default 2500,
  quiet_hours jsonb not null default '{"start":"22:00","end":"06:59","tz":"America/Los_Angeles"}'::jsonb,
  unique (account_id, isp_key)
);

insert into public.isp_caps (account_id, isp_key, hourly_cap, daily_cap, max_concurrency, jitter_ms_min, jitter_ms_max)
select
  a.id,
  r.key,
  case r.key
    when 'gmail' then 80
    when 'outlook' then 60
    when 'yahoo' then 40
    when 'zoho' then 40
    else 50
  end as hourly_cap,
  case r.key
    when 'gmail' then 900
    when 'outlook' then 700
    when 'yahoo' then 500
    when 'zoho' then 500
    else 600
  end as daily_cap,
  3,
  800,
  2500
from public.accounts a
cross join public.isp_registry r
on conflict (account_id, isp_key) do nothing;

-- 4) Helper view: leads with resolved recipient domain
create or replace view public.v_lead_recipient_domain as
select
  id as lead_id,
  lower(split_part(email, '@', 2)) as domain
from public.leads;

-- 5) RLS policies
alter table public.isp_registry enable row level security;
create policy isp_reg_read on public.isp_registry for select using (true);

alter table public.mx_cache enable row level security;
create policy mx_cache_read on public.mx_cache for select using (true);
create policy mx_cache_write on public.mx_cache for insert with check (true);
create policy mx_cache_update on public.mx_cache for update using (true) with check (true);

alter table public.isp_caps enable row level security;
create policy isp_caps_iso
  on public.isp_caps
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

-- 6) Concurrency lock table
create table if not exists public.send_locks (
  id bigserial primary key,
  account_id uuid not null,
  isp_key text not null,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (account_id, isp_key)
);

alter table public.send_locks enable row level security;
create policy send_locks_iso
  on public.send_locks
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

-- 7) Align send outcomes with ISP tracking
alter table public.send_outcomes
  add column if not exists isp_key text references public.isp_registry(key) on delete set null;

create index if not exists idx_send_outcomes_isp_time
  on public.send_outcomes(account_id, isp_key, created_at);

