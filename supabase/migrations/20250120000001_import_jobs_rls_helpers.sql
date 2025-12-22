-- Unique row number per job (prevents duplicate staging)

do $$ begin
  if not exists (select 1 from pg_constraint where conname='uq_import_rows_job_row') then
    alter table public.import_rows add constraint uq_import_rows_job_row unique (job_id, row_no);
  end if;
end $$;

-- Speed up common lookups

create index if not exists idx_import_jobs_user on public.import_jobs(user_id);
create index if not exists idx_import_rows_job_row on public.import_rows(job_id, row_no);

-- RLS write policies (owner-only)

drop policy if exists ins_jobs on public.import_jobs;
create policy ins_jobs on public.import_jobs
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists upd_jobs on public.import_jobs;
create policy upd_jobs on public.import_jobs
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists del_jobs on public.import_jobs;
create policy del_jobs on public.import_jobs
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists ins_rows on public.import_rows;
create policy ins_rows on public.import_rows
for insert to authenticated
with check (
  job_id in (select id from public.import_jobs j where j.user_id = auth.uid())
);

drop policy if exists upd_rows on public.import_rows;
create policy upd_rows on public.import_rows
for update to authenticated
using (
  job_id in (select id from public.import_jobs j where j.user_id = auth.uid())
)
with check (
  job_id in (select id from public.import_jobs j where j.user_id = auth.uid())
);

drop policy if exists del_rows on public.import_rows;
create policy del_rows on public.import_rows
for delete to authenticated
using (
  job_id in (select id from public.import_jobs j where j.user_id = auth.uid())
);

-- Optional: quick reset/cleanup helpers

create or replace function public.reset_import_job(p_job uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  -- only owner
  if not exists (select 1 from public.import_jobs where id=p_job and user_id=p_user) then
    raise exception 'not found';
  end if;

  delete from public.import_rows where job_id=p_job;
  update public.import_jobs
     set status='staged', total_rows=0, valid_rows=0, invalid_rows=0, deduped_rows=0, error=null
   where id=p_job;
end$$;

create or replace function public.delete_import_job(p_job uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists (select 1 from public.import_jobs where id=p_job and user_id=p_user) then
    raise exception 'not found';
  end if;
  delete from public.import_jobs where id=p_job;
end$$;



