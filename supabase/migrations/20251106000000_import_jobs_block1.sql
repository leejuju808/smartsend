-- Import jobs + rows staging updates (idempotent)

-- A) Import job state columns

alter table public.import_jobs
  add column if not exists total_rows int default 0,
  add column if not exists bad_rows int default 0,
  add column if not exists good_rows int default 0,
  add column if not exists columns jsonb,
  add column if not exists mapping jsonb,
  add column if not exists meta jsonb default '{}'::jsonb,
  add column if not exists status text,
  add column if not exists error text;

-- ensure defaults + constraint for status column
alter table public.import_jobs
  alter column total_rows set default 0,
  alter column bad_rows set default 0,
  alter column good_rows set default 0,
  alter column status set default 'created';

alter table public.import_jobs
  drop constraint if exists import_jobs_status_check;

alter table public.import_jobs
  add constraint import_jobs_status_check
    check (status in ('created','analyzing','needs_mapping','ready','running','done','error'));

-- B) Staging table for parsed rows

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_no int not null,
  raw jsonb not null,
  normalized jsonb,
  valid boolean,
  error text
);

alter table public.import_rows
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists raw jsonb,
  add column if not exists normalized jsonb,
  add column if not exists valid boolean,
  add column if not exists error text;

alter table public.import_rows
  alter column valid set default null;

create index if not exists idx_import_rows_job on public.import_rows(job_id);

-- C) Email/URL validators

create or replace function public._is_email(s text) returns boolean
language sql immutable as $$ select s ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' $$;

create or replace function public._norm_email(s text) returns text
language sql immutable as $$ select lower(trim(s)) $$;

create or replace function public._norm_domain_from_email(s text) returns text
language sql immutable as $$ select split_part(lower(trim(s)),'@',2) $$;

-- D) Final upsert helper (tenant-scoped)

create or replace function public.upsert_lead_from_json(
  p_user uuid,
  p_campaign uuid,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.leads (user_id, email, first_name, last_name, company, title, domain, meta)
  values (
    p_user,
    p_payload->>'email',
    nullif(p_payload->>'first_name',''),
    nullif(p_payload->>'last_name',''),
    nullif(p_payload->>'company',''),
    nullif(p_payload->>'title',''),
    coalesce(p_payload->>'domain', public._norm_domain_from_email(p_payload->>'email')),
    coalesce(p_payload->'meta','{}'::jsonb)
  )
  on conflict (user_id, email)
  do update set
    first_name = coalesce(excluded.first_name, public.leads.first_name),
    last_name  = coalesce(excluded.last_name, public.leads.last_name),
    company    = coalesce(excluded.company, public.leads.company),
    title      = coalesce(excluded.title, public.leads.title),
    domain     = coalesce(excluded.domain, public.leads.domain),
    meta       = public.leads.meta || excluded.meta
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_lead_from_json(uuid,uuid,jsonb) from anon, authenticated;

-- E) RLS sanity (owner scoped; safe to re-run)

alter table if exists public.import_jobs enable row level security;
alter table if exists public.import_rows enable row level security;

drop policy if exists import_jobs_owner_select on public.import_jobs;
create policy import_jobs_owner_select on public.import_jobs
  for select using (user_id = auth.uid());

drop policy if exists import_jobs_owner_modify on public.import_jobs;
create policy import_jobs_owner_modify on public.import_jobs
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists import_rows_owner_select on public.import_rows;
create policy import_rows_owner_select on public.import_rows
  for select using (
    job_id in (select id from public.import_jobs j where j.user_id = auth.uid())
  );

drop policy if exists import_rows_owner_modify on public.import_rows;
create policy import_rows_owner_modify on public.import_rows
  for all using (
    job_id in (select id from public.import_jobs j where j.user_id = auth.uid())
  )
  with check (
    job_id in (select id from public.import_jobs j where j.user_id = auth.uid())
  );

