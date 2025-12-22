-- A) Import jobs

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null check (status in ('pending','preview','committing','done','error')) default 'pending',
  filename text,
  row_count int default 0,
  deduped_count int default 0,
  inserted_count int default 0,
  skipped_count int default 0,
  error text
);

create index if not exists idx_import_jobs_user on public.import_jobs(user_id);

-- B) Staging rows (raw CSV values + parse errors)

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_no int not null,
  data jsonb not null,             -- raw cells by header key
  error text,                       -- parse error message (if any)
  dedupe_key text,                  -- computed later: lower(email)
  will_insert boolean               -- set during preview
);

create index if not exists idx_import_rows_job on public.import_rows(job_id);
create index if not exists idx_import_rows_job_row on public.import_rows(job_id, row_no);

-- C) Minimal leads hardening

alter table public.leads
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists domain citext,
  add column if not exists meta jsonb default '{}'::jsonb;

create index if not exists idx_leads_user_email on public.leads(user_id, email);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='uq_leads_user_email') then
    alter table public.leads add constraint uq_leads_user_email unique (user_id, email);
  end if;
end $$;

-- D) Helpers

create or replace function public.extract_domain(p_email text)
returns text language sql immutable as $$
  select nullif(split_part(lower(coalesce(p_email,'')), '@', 2),'');
$$;

create or replace function public.count_import_errors(p_job uuid)
returns int language sql stable as $$
  select count(*) from public.import_rows where job_id=p_job and (error is not null and error <> '');
$$;

