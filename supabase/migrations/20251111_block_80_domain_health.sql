-- Block 80: Recipient domain health metrics, throttle rules, counters, and policies.
-- This script is designed to be idempotent. Safe to re-run.

-- 1) Domain metrics table (rolling windows)
create table if not exists public.domain_metrics (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  domain text not null,
  window text not null default '7d' check (window in ('1d','7d','30d')),
  sends bigint not null default 0,
  opens bigint not null default 0,
  clicks bigint not null default 0,
  replies bigint not null default 0,
  bounces bigint not null default 0,
  complaints bigint not null default 0,
  unique (account_id, domain, window)
);

create index if not exists idx_domain_metrics_acct_dom on public.domain_metrics(account_id, domain);

-- 2) Per-domain throttle overrides
create table if not exists public.domain_throttle_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  domain text not null,                                -- '*' for global default
  max_daily_sends integer,                             -- hard cap (per account → domain)
  bounce_rate_ceiling numeric check (bounce_rate_ceiling between 0 and 1),
  complaint_rate_ceiling numeric check (complaint_rate_ceiling between 0 and 1),
  warmup boolean not null default true,
  unique (account_id, domain)
);

create index if not exists idx_domain_throttle_rules_account on public.domain_throttle_rules(account_id);

-- Seed a global default rule for each account (idempotent)
insert into public.domain_throttle_rules (account_id, domain, max_daily_sends, bounce_rate_ceiling, complaint_rate_ceiling, warmup)
select a.id, '*', 300, 0.05, 0.005, true
from public.accounts a
on conflict (account_id, domain) do nothing;

-- 3) Daily counters (UTC day key)
create table if not exists public.domain_send_counters (
  id bigserial primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  domain text not null,
  day date not null default (now() at time zone 'utc')::date,
  sent_count integer not null default 0,
  unique (account_id, domain, day)
);

create index if not exists idx_domain_send_counters_day on public.domain_send_counters(account_id, day);

-- 4) Helper view for health snapshot
create or replace view public.v_domain_health as
select
  dm.account_id,
  lower(dm.domain) as domain,
  dm.window,
  dm.sends,
  dm.opens,
  dm.clicks,
  dm.replies,
  dm.bounces,
  dm.complaints,
  case when dm.sends > 0 then dm.bounces::numeric / dm.sends else 0 end as bounce_rate,
  case when dm.sends > 0 then dm.complaints::numeric / dm.sends else 0 end as complaint_rate
from public.domain_metrics dm;

alter view public.v_domain_health set (security_barrier = off);

-- 5) Row level security aligned with account isolation.
alter table public.domain_metrics enable row level security;
drop policy if exists domain_metrics_isolation on public.domain_metrics;
create policy domain_metrics_isolation
  on public.domain_metrics
  using (account_id = auth.uid());

alter table public.domain_throttle_rules enable row level security;
drop policy if exists domain_throttle_rules_isolation on public.domain_throttle_rules;
create policy domain_throttle_rules_isolation
  on public.domain_throttle_rules
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

alter table public.domain_send_counters enable row level security;
drop policy if exists domain_send_counters_isolation on public.domain_send_counters;
create policy domain_send_counters_isolation
  on public.domain_send_counters
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

