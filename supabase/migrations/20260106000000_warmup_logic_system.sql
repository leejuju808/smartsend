-- A) Warmup plan data model (from earlier, if not already)

create table if not exists public.warmup_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique  -- e.g., "default-30d"
);

create table if not exists public.warmup_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.warmup_plans(id) on delete cascade,
  day_no int not null,
  max_sends int not null,  -- cap for that day
  unique(plan_id, day_no)
);

create index if not exists idx_warmup_steps_plan on public.warmup_steps(plan_id);

-- B) Extend connected_accounts if not done

alter table public.connected_accounts
  add column if not exists warmup_plan_id uuid references public.warmup_plans(id),
  add column if not exists warmup_day int default 1,
  add column if not exists warmup_enabled boolean default true,
  add column if not exists warmup_started_at date;

-- C) Helper: compute today's allowed cap

create or replace function public.account_today_cap(p_account uuid)
returns int
language sql
stable
as $$
  select coalesce(
    (select ws.max_sends
     from public.connected_accounts ca
     join public.warmup_steps ws
       on ws.plan_id = ca.warmup_plan_id
      and ws.day_no = ca.warmup_day
     where ca.id = p_account
     limit 1),
    (select coalesce(ca.daily_cap, 40)
     from public.connected_accounts ca where ca.id = p_account)
  );
$$;

grant execute on function public.account_today_cap(uuid) to anon, authenticated, service_role;

-- D) Helper: advance warmup day (1/day)

create or replace function public.advance_warmup_days()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  update public.connected_accounts
     set warmup_day = warmup_day + 1,
         updated_at = now()
   where warmup_enabled = true
     and warmup_started_at is not null
     and current_date > warmup_started_at
     and (warmup_day < (
       select max(day_no) from public.warmup_steps ws where ws.plan_id = connected_accounts.warmup_plan_id
     ))
     and extract(hour from now()) between 5 and 6; -- only once per day (optional)
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

grant execute on function public.advance_warmup_days() to anon, authenticated, service_role;

-- Optional: schedule daily (via pg_cron if available)
-- Note: This may fail if pg_cron extension is not enabled, so we wrap it
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'advance-warmup-daily',
      '0 6 * * *',
      $$select public.advance_warmup_days();$$
    );
  end if;
exception when others then
  -- pg_cron not available, skip scheduling
  null;
end $$;
