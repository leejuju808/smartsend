-- Block 91 — Domain Reputation Guard
-- Creates domain reputation table, outcomes ledger, rolling counters, and RLS policies

begin;

-- 1) Reputation table (per sender domain + optional mailbox)
create table if not exists public.domain_reputation (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  domain text not null,
  mailbox text,
  warmup_band int not null default 1,
  rep_score numeric not null default 0.75,
  hourly_cap int not null default 25,
  daily_cap int not null default 200,
  last_backoff_until timestamptz,
  notes text
);

create unique index if not exists domain_reputation_account_domain_mailbox_idx
  on public.domain_reputation(account_id, domain, coalesce(mailbox, '*'));

-- Keep updated_at current
create or replace trigger trg_domain_reputation_updated_at
before update on public.domain_reputation
for each row
execute function public.set_updated_at();

-- 2) Send outcomes ledger (for rolling metrics)
create table if not exists public.send_outcomes (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  thread_id uuid,
  mailbox text,
  domain text not null,
  outcome text not null check (outcome in ('sent','delivered','opened','clicked','replied','bounced','spam','blocked','temp_fail')),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_send_outcomes_domain_time on public.send_outcomes(account_id, domain, created_at);
create index if not exists idx_send_outcomes_outcome on public.send_outcomes(outcome);

-- 3) Rolling counters for enforcement
create materialized view if not exists public.mv_domain_send_counters as
select
  account_id,
  domain,
  date_trunc('hour', created_at) as bucket_hour,
  count(*) filter (where outcome in ('sent','delivered','replied','opened','clicked')) as sends_hour,
  count(*) filter (where outcome = 'bounced') as bounces_hour,
  count(*) filter (where outcome = 'spam') as spam_hour
from public.send_outcomes
where created_at > now() - interval '48 hours'
group by 1, 2, 3;

create index if not exists idx_mv_counters on public.mv_domain_send_counters(account_id, domain, bucket_hour);

-- 4) RLS
alter table public.domain_reputation enable row level security;
create policy if not exists domrep_iso on public.domain_reputation
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

alter table public.send_outcomes enable row level security;
create policy if not exists outcomes_iso on public.send_outcomes
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

commit;
