-- Block 102 — Step 12: Regression Watchdog + Auto-Rollback

-- 1a) Wilson lower bound helper
create or replace function public.wilson_lower_bound(
  successes int,
  trials int,
  z numeric default 1.96
)
returns numeric
language sql
immutable
as $$
  select case
    when trials <= 0 then 0
    else
      (
        (successes::numeric + (z * z) / 2) / trials
        - z * sqrt(
            (successes::numeric * (trials - successes) / trials)
            + (z * z) / 4
          ) / trials
      ) / (1 + (z * z) / trials)
  end;
$$;

grant execute on function public.wilson_lower_bound(int, int, numeric) to authenticated;
grant execute on function public.wilson_lower_bound(int, int, numeric) to service_role;


-- 1b) Daily KPI rollup table
create table if not exists public.nudge_kpis_daily (
  d date not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  source text not null check (source in ('base','candidate','subject','timing')),
  variant_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  sends int not null default 0,
  successes int not null default 0,
  primary key (d, owner_id, label, source, variant_id)
);

create index if not exists idx_nudge_kpis_daily_owner_date
  on public.nudge_kpis_daily (owner_id, d, label, source);

alter table public.nudge_kpis_daily enable row level security;

create policy if not exists "kpi_rw"
  on public.nudge_kpis_daily
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());


-- 1c) Daily KPI refresh helper
create or replace function public.refresh_nudge_kpis_daily(
  day_in date default (now() at time zone 'utc')::date
)
returns void
language plpgsql
as $$
begin
  -- base vs candidate (prompts)
  insert into public.nudge_kpis_daily (
    d, owner_id, label, source, variant_id, sends, successes
  )
  select
    day_in as d,
    e.owner_id,
    e.label,
    case when pu.candidate_id is not null then 'candidate' else 'base' end as source,
    coalesce(pu.candidate_id, '00000000-0000-0000-0000-000000000000'::uuid) as variant_id,
    count(*) as sends,
    count(*) filter (where o.outcome in ('reply','meeting')) as successes
  from public.nudge_events e
  left join public.nudge_prompt_usage pu on pu.event_id = e.id
  left join public.nudge_outcomes o
    on o.event_id = e.id
   and o.created_at::date = day_in
  where e.used_at::date = day_in
  group by 1,2,3,4,5
  on conflict (d, owner_id, label, source, variant_id)
  do update set
    sends = excluded.sends,
    successes = excluded.successes;

  -- subjects
  insert into public.nudge_kpis_daily (
    d, owner_id, label, source, variant_id, sends, successes
  )
  select
    day_in,
    e.owner_id,
    e.label,
    'subject' as source,
    su.subject_id,
    count(*) as sends,
    count(*) filter (where o.outcome in ('reply','meeting')) as successes
  from public.nudge_events e
  join public.nudge_subject_usage su on su.event_id = e.id
  left join public.nudge_outcomes o
    on o.event_id = e.id
   and o.created_at::date = day_in
  where e.used_at::date = day_in
  group by 1,2,3,4,5
  on conflict (d, owner_id, label, source, variant_id)
  do update set
    sends = excluded.sends,
    successes = excluded.successes;

  -- timing variants
  insert into public.nudge_kpis_daily (
    d, owner_id, label, source, variant_id, sends, successes
  )
  select
    day_in,
    e.owner_id,
    e.label,
    'timing' as source,
    tu.variant_id,
    count(*) as sends,
    count(*) filter (where o.outcome in ('reply','meeting')) as successes
  from public.nudge_events e
  join public.nudge_timing_usage tu on tu.event_id = e.id
  left join public.nudge_outcomes o
    on o.event_id = e.id
   and o.created_at::date = day_in
  where e.used_at::date = day_in
  group by 1,2,3,4,5
  on conflict (d, owner_id, label, source, variant_id)
  do update set
    sends = excluded.sends,
    successes = excluded.successes;
end;
$$;

grant execute on function public.refresh_nudge_kpis_daily(date) to authenticated;
grant execute on function public.refresh_nudge_kpis_daily(date) to service_role;


-- 1d) Experiment registry
create table if not exists public.nudge_experiments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('prompt','subject','timing')),
  variant_id uuid not null,
  status text not null default 'active' check (status in ('active','paused','promoted','ended')),
  min_sends int not null default 50,
  window_days int not null default 14,
  tolerance numeric not null default 0.10,
  z_value numeric not null default 1.96,
  note text
);

create index if not exists idx_nudge_experiments_owner_status
  on public.nudge_experiments (owner_id, status);

alter table public.nudge_experiments enable row level security;

create policy if not exists "exp_rw"
  on public.nudge_experiments
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop trigger if exists trg_nudge_experiments_set_updated_at on public.nudge_experiments;
create trigger trg_nudge_experiments_set_updated_at
before update on public.nudge_experiments
for each row
execute function public.set_updated_at();


-- 1e) Watchdog audit log
create table if not exists public.nudge_watchdog_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  experiment_id uuid not null references public.nudge_experiments(id) on delete cascade,
  action text not null check (action in ('paused','promoted','no_change')),
  details jsonb
);

create index if not exists idx_nudge_watchdog_audit_owner
  on public.nudge_watchdog_audit (owner_id, created_at desc);

alter table public.nudge_watchdog_audit enable row level security;

create policy if not exists "wd_audit_rw"
  on public.nudge_watchdog_audit
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());


-- 2) Watchdog evaluator
create or replace function public.run_watchdog_for_owner(owner uuid)
returns void
language plpgsql
as $$
declare
  exp record;
  since date;
  cand_sends int;
  cand_succ int;
  cand_lcb numeric;
  base_sends int;
  base_succ int;
  base_rate numeric;
  target_rate numeric;
begin
  for exp in
    select *
    from public.nudge_experiments
    where owner_id = owner
      and status = 'active'
  loop
    since := (now() at time zone 'utc')::date - (exp.window_days || ' days')::interval;

    cand_sends := 0;
    cand_succ := 0;
    cand_lcb := 0;
    base_sends := 0;
    base_succ := 0;
    base_rate := 0;
    target_rate := 0;

    if exp.kind = 'prompt' then
      select
        coalesce(sum(sends), 0),
        coalesce(sum(successes), 0)
      into cand_sends, cand_succ
      from public.nudge_kpis_daily
      where owner_id = owner
        and label = exp.label
        and source = 'candidate'
        and variant_id = exp.variant_id
        and d >= since::date;

      cand_lcb := public.wilson_lower_bound(cand_succ, cand_sends, exp.z_value);

      select
        coalesce(sum(sends), 0),
        coalesce(sum(successes), 0)
      into base_sends, base_succ
      from public.nudge_kpis_daily
      where owner_id = owner
        and label = exp.label
        and source = 'base'
        and d >= since::date;

    elsif exp.kind = 'subject' then
      select
        coalesce(sum(sends), 0),
        coalesce(sum(successes), 0)
      into cand_sends, cand_succ
      from public.nudge_kpis_daily
      where owner_id = owner
        and label = exp.label
        and source = 'subject'
        and variant_id = exp.variant_id
        and d >= since::date;

      select
        coalesce(sum(sends), 0),
        coalesce(sum(successes), 0)
      into base_sends, base_succ
      from public.nudge_kpis_daily
      where owner_id = owner
        and label = exp.label
        and source = 'subject'
        and (variant_id is distinct from exp.variant_id)
        and d >= since::date;

      cand_lcb := public.wilson_lower_bound(cand_succ, cand_sends, exp.z_value);

    elsif exp.kind = 'timing' then
      select
        coalesce(sum(sends), 0),
        coalesce(sum(successes), 0)
      into cand_sends, cand_succ
      from public.nudge_kpis_daily
      where owner_id = owner
        and label = exp.label
        and source = 'timing'
        and variant_id = exp.variant_id
        and d >= since::date;

      select
        coalesce(sum(sends), 0),
        coalesce(sum(successes), 0)
      into base_sends, base_succ
      from public.nudge_kpis_daily
      where owner_id = owner
        and label = exp.label
        and source = 'timing'
        and (variant_id is distinct from exp.variant_id)
        and d >= since::date;

      cand_lcb := public.wilson_lower_bound(cand_succ, cand_sends, exp.z_value);
    end if;

    base_rate := case when base_sends > 0
      then base_succ::numeric / base_sends
      else 0
    end;

    target_rate := base_rate * (1 - exp.tolerance);

    if cand_sends >= exp.min_sends then
      if cand_lcb < target_rate then
        update public.nudge_experiments
           set status = 'paused',
               updated_at = now()
         where id = exp.id;

        insert into public.nudge_watchdog_audit (owner_id, experiment_id, action, details)
        values (
          owner,
          exp.id,
          'paused',
          jsonb_build_object(
            'cand_sends', cand_sends,
            'cand_succ', cand_succ,
            'cand_lcb', cand_lcb,
            'base_sends', base_sends,
            'base_succ', base_succ,
            'base_rate', base_rate,
            'target_rate', target_rate
          )
        );
      else
        insert into public.nudge_watchdog_audit (owner_id, experiment_id, action, details)
        values (
          owner,
          exp.id,
          'no_change',
          jsonb_build_object(
            'cand_sends', cand_sends,
            'cand_succ', cand_succ,
            'cand_lcb', cand_lcb,
            'base_sends', base_sends,
            'base_succ', base_succ,
            'base_rate', base_rate
          )
        );
      end if;
    end if;
  end loop;
end;
$$;

grant execute on function public.run_watchdog_for_owner(uuid) to authenticated;
grant execute on function public.run_watchdog_for_owner(uuid) to service_role;



