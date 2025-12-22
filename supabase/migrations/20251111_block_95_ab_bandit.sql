-- Block 95 — A/B Routing + Auto-Pick Winner
-- Schema for experiments, variants, assignments, metrics view, and RLS policies

-- Reset legacy artifacts (safe to rerun)
drop view if exists public.v_ab_metrics;
drop table if exists public.ab_assignments cascade;
drop table if exists public.ab_variants cascade;
drop table if exists public.ab_experiments cascade;

-- 1) Experiment header
create table if not exists public.ab_experiments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active','paused','completed')),
  objective text not null default 'reply',                     -- 'reply'|'open'|'click' (reply default)
  min_sample int not null default 50,                          -- minimum sends before early decisions
  stop_threshold numeric not null default 0.95,                -- posterior prob winner
  explore_floor numeric not null default 0.1,                  -- min traffic share per arm
  notes text
);

create index if not exists idx_abx_acct on public.ab_experiments(account_id, status);

create or replace function public.touch_ab_experiments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ab_experiments_touch on public.ab_experiments;
create trigger trg_ab_experiments_touch
  before update on public.ab_experiments
  for each row
  execute function public.touch_ab_experiments_updated_at();

-- 2) Variants
create table if not exists public.ab_variants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  experiment_id uuid not null references public.ab_experiments(id) on delete cascade,
  label text not null,                                         -- 'A', 'B', 'C'...
  template_text text not null,                                 -- frozen body used for send
  is_winner boolean not null default false
);

create index if not exists idx_abv_exp on public.ab_variants(experiment_id);

-- 3) Assignments (who saw which)
create table if not exists public.ab_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  experiment_id uuid not null references public.ab_experiments(id) on delete cascade,
  variant_id uuid not null references public.ab_variants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  thread_id uuid,
  send_message_id uuid,                                        -- outbound message id once sent
  unique (experiment_id, lead_id)
);

create index if not exists idx_ab_assign_lead on public.ab_assignments(lead_id);

-- 4) Metrics (rollup view fed by send_outcomes)
create or replace view public.v_ab_metrics as
select
  a.experiment_id,
  a.variant_id,
  count(*) filter (where o.outcome in ('sent','delivered','opened','clicked','replied')) as sent,
  count(*) filter (where o.outcome = 'opened') as opened,
  count(*) filter (where o.outcome = 'clicked') as clicked,
  count(*) filter (where o.outcome = 'replied') as replied
from public.ab_assignments a
join public.send_outcomes o on o.lead_id = a.lead_id
group by 1,2;

-- 5) RLS
alter table public.ab_experiments enable row level security;
alter table public.ab_variants    enable row level security;
alter table public.ab_assignments enable row level security;

create policy if not exists abx_iso on public.ab_experiments
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

create policy if not exists abv_iso on public.ab_variants
  using (exists (
    select 1
    from public.ab_experiments e
    where e.id = experiment_id
      and e.account_id = auth.uid()
  ))
  with check (exists (
    select 1
    from public.ab_experiments e
    where e.id = experiment_id
      and e.account_id = auth.uid()
  ));

create policy if not exists aba_iso on public.ab_assignments
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

