-- Warm-up per-account configuration and metrics (idempotent)

-- If legacy warmup_logs table exists (session-based), drop it to make room for the account-based variant.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'warmup_logs'
      and column_name = 'session_id'
  ) then
    drop table public.warmup_logs cascade;
  end if;
end $$;

-- Legacy warmup Sessions structure is no longer used; drop if present.
drop table if exists public.warmup_sessions cascade;

-- Warm-up settings per account
create table if not exists public.warmup_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  enabled boolean not null default false,
  daily_limit int not null default 40,
  ramp_days int not null default 14,
  auto_reply boolean not null default true,
  start_date date not null default current_date,
  last_run timestamptz
);

-- Warm-up event logs
create table if not exists public.warmup_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  peer_account_id uuid references public.accounts(id) on delete set null,
  subject text,
  body text,
  status text not null default 'sent' check (status in ('sent','failed','opened','replied')),
  event_at timestamptz
);

create index if not exists idx_warmup_logs_account_created_at on public.warmup_logs(account_id, created_at);

-- Daily aggregates for dashboards
drop view if exists public.v_warmup_metrics;
create or replace view public.v_warmup_metrics as
select
  account_id,
  date_trunc('day', coalesce(event_at, created_at)) as d,
  count(*) filter (where status = 'sent') as sent,
  count(*) filter (where status = 'opened') as opened,
  count(*) filter (where status = 'replied') as replied
from public.warmup_logs
group by 1, 2;



