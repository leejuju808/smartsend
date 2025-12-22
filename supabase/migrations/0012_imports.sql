-- Imports master

create table if not exists public.imports (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  filename text not null,
  status text not null default 'pending', -- pending | processing | done | error
  total_rows int default 0,
  valid_rows int default 0,
  invalid_rows int default 0,
  dedup_skipped int default 0,
  inserted_leads int default 0,
  created_threads int default 0,
  error_text text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Staging rows (normalized)

create table if not exists public.import_rows (
  id uuid primary key default uuid_generate_v4(),
  import_id uuid not null references public.imports(id) on delete cascade,
  row_num int not null,
  email text,
  name text,
  company text,
  raw jsonb,
  is_valid boolean default null,
  invalid_reason text,
  deduped boolean default false
);

create index if not exists import_rows_import_idx on public.import_rows (import_id);
create index if not exists import_rows_email_idx on public.import_rows (email);

alter table public.imports enable row level security;
alter table public.import_rows enable row level security;

-- RLS: members of project can see/modify

create policy "members read imports" on public.imports
  for select using (is_member(project_id));
create policy "members write imports" on public.imports
  for insert with check (is_member(project_id));
create policy "members update imports" on public.imports
  for update using (is_member(project_id));

create policy "members read import_rows" on public.import_rows
  for select using (exists (select 1 from public.imports i where i.id = import_rows.import_id and is_member(i.project_id)));
create policy "members write import_rows" on public.import_rows
  for insert with check (exists (select 1 from public.imports i where i.id = import_rows.import_id and is_member(i.project_id)));
create policy "members update import_rows" on public.import_rows
  for update using (exists (select 1 from public.imports i where i.id = import_rows.import_id and is_member(i.project_id)));

-- email validator (basic)

create or replace function public.is_valid_email(p text)
returns boolean language sql immutable as $$
  select p ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
$$;

-- PROCESSOR: validate, de-dup, upsert leads, create threads, summarize

create or replace function public.process_import(p_import uuid)
returns void
language plpgsql
security definer
set search_path=public as
$$
declare
  v_project uuid;
  v_total int := 0;
  v_valid int := 0;
  v_invalid int := 0;
  v_dedup int := 0;
  v_inserted int := 0;
  v_threads int := 0;
begin
  update public.imports set status='processing' where id=p_import;

  select project_id into v_project from public.imports where id=p_import;

  -- 1) validate rows
  update public.import_rows
     set is_valid = (email is not null and public.is_valid_email(email)),
         invalid_reason = case when email is null then 'missing_email'
                               when not public.is_valid_email(email) then 'invalid_email'
                               else null end
   where import_id = p_import;

  -- 2) compute basic counts
  select count(*) into v_total from public.import_rows where import_id=p_import;
  select count(*) into v_valid from public.import_rows where import_id=p_import and is_valid is true;
  select count(*) into v_invalid from public.import_rows where import_id=p_import and is_valid is false;

  -- 3) de-dup against existing leads for this project
  with existing as (
    select r.id
    from public.import_rows r
    join public.leads l on l.project_id=v_project and lower(l.email)=lower(r.email)
    where r.import_id=p_import and r.is_valid is true
  )
  update public.import_rows r
     set deduped = true
    from existing e
   where r.id=e.id;

  select count(*) into v_dedup from public.import_rows where import_id=p_import and deduped is true;

  -- 4) upsert new leads (valid & not deduped)
  with to_upsert as (
    select email, name
    from public.import_rows
    where import_id=p_import and is_valid is true and deduped is false
    group by email, name
  ), ins as (
    insert into public.leads (project_id, email, name)
    select v_project, t.email, nullif(t.name,'')
    from to_upsert t
    on conflict (project_id, email) do update set name = coalesce(excluded.name, public.leads.name)
    returning id
  )
  select count(*) into v_inserted from ins;

  -- 5) ensure a thread exists per (project, lead)
  with lead_ids as (
    select l.id
    from public.leads l
    where l.project_id=v_project
      and exists (
        select 1 from public.import_rows r
        where r.import_id=p_import and r.is_valid is true and lower(r.email)=lower(l.email)
      )
  ), created as (
    insert into public.threads (project_id, lead_id, status)
    select v_project, lid.id, 'open'
    from lead_ids lid
    where not exists (
      select 1 from public.threads t where t.project_id=v_project and t.lead_id=lid.id
    )
    returning id
  )
  select count(*) into v_threads from created;

  -- 6) write summary
  update public.imports
     set status='done',
         total_rows=v_total,
         valid_rows=v_valid,
         invalid_rows=v_invalid,
         dedup_skipped=v_dedup,
         inserted_leads=v_inserted,
         created_threads=v_threads,
         completed_at=now(),
         error_text=null
   where id=p_import;
exception when others then
  update public.imports set status='error', error_text=SQLERRM where id=p_import;
  raise;
end;
$$;

