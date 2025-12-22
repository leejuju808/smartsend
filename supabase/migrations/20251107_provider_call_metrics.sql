-- Provider call metrics & cooldown support (idempotent)

-- A) Daily per-account provider call counters
create table if not exists public.provider_call_metrics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook')),
  day date not null default current_date,
  calls int not null default 0,
  errors int not null default 0,
  unique (account_id, day)
);

create index if not exists idx_pcm_account_day on public.provider_call_metrics(account_id, day);


-- B) Cooldown tracking on connected accounts
alter table public.connected_accounts
  add column if not exists cooldown_until timestamptz;


-- C) Helper function to bump counters from edge functions
create or replace function public.bump_provider_calls(
  p_account uuid,
  p_provider text,
  p_err boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.provider_call_metrics (account_id, provider, day, calls, errors)
  values (p_account, p_provider, current_date, 1, case when p_err then 1 else 0 end)
  on conflict (account_id, day) do update
    set calls = provider_call_metrics.calls + 1,
        errors = provider_call_metrics.errors + case when p_err then 1 else 0 end;
end;
$$;




