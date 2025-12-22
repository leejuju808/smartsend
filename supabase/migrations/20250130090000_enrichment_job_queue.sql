-- Enrichment job queue, vendor quotas, and telemetry rollups

-- 1) Job status enum ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'job_status'
      and n.nspname = 'public'
  ) then
    execute $$create type public.job_status as enum ('pending','running','succeeded','failed')$$;
  end if;
end;
$$;


-- 2) Enrichment jobs table ------------------------------------------------------
create table if not exists public.enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  source text not null references public.enrichment_sources(key),
  cache_key text not null,
  attempts int not null default 0,
  max_attempts int not null default 6,
  status public.job_status not null default 'pending',
  next_run_at timestamptz not null default now(),
  last_error text,
  unique (lead_id, source, cache_key)
);

create index if not exists idx_enrichment_jobs_due
  on public.enrichment_jobs(next_run_at)
  where status in ('pending','failed');

create index if not exists idx_enrichment_jobs_account
  on public.enrichment_jobs(account_id);

create trigger trg_enrichment_jobs_updated_at
before update on public.enrichment_jobs
for each row
execute function public.set_updated_at();

alter table public.enrichment_jobs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'enrichment_jobs'
      and policyname = 'enrichment_jobs_all'
  ) then
    create policy enrichment_jobs_all
      on public.enrichment_jobs
      for all
      using (public.is_account_member(account_id))
      with check (public.is_account_member(account_id));
  end if;
end;
$$;


-- 3) Vendor quotas --------------------------------------------------------------
create table if not exists public.vendor_quotas (
  source text primary key references public.enrichment_sources(key),
  daily_limit int not null default 5000,
  used_today int not null default 0,
  reset_at timestamptz not null default date_trunc('day', now()) + interval '1 day'
);

insert into public.vendor_quotas(source)
select key
from public.enrichment_sources
on conflict (source) do nothing;


-- 4) Quota helpers --------------------------------------------------------------
create or replace function public.reset_vendor_quotas_if_needed()
returns void
language plpgsql
as $$
declare
  r record;
begin
  for r in select * from public.vendor_quotas loop
    if now() >= r.reset_at then
      update public.vendor_quotas
      set used_today = 0,
          reset_at = date_trunc('day', now()) + interval '1 day'
      where source = r.source;
    end if;
  end loop;
end;
$$;

grant execute on function public.reset_vendor_quotas_if_needed() to authenticated, service_role;

create or replace function public.try_consume_quota(p_source text, p_units int default 1)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean := false;
begin
  perform public.reset_vendor_quotas_if_needed();

  update public.vendor_quotas
     set used_today = used_today + p_units
   where source = p_source
     and used_today + p_units <= daily_limit
  returning true into ok;

  return coalesce(ok, false);
end;
$$;

grant execute on function public.try_consume_quota(text, int) to authenticated, service_role;


-- 5) Telemetry ------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'event_kind'
      and n.nspname = 'public'
  ) then
    begin
      alter type public.event_kind add value if not exists 'enrich_job';
    exception
      when duplicate_object then
        null;
    end;
  end if;
end;
$$;

create or replace view public.enrich_queue_metrics as
select
  date_trunc('hour', created_at) as hour,
  status,
  count(*) as events
from public.event_log
where kind = 'enrich_job'
group by 1, 2;



