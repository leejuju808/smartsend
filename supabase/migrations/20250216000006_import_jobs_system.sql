-- Import Jobs System
-- Creates import_jobs and import_job_rows tables for tracking CSV imports with validation

-- 1. import_jobs table
create table if not exists import_jobs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  total_rows int default 0,
  imported_rows int default 0,
  status text check (status in ('Pending','Mapping','Processing','Done','Error')) default 'Pending',
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. import_job_rows table
create table if not exists import_job_rows (
  id bigserial primary key,
  job_id uuid references import_jobs(id) on delete cascade,
  row_number int not null,
  raw jsonb not null,
  valid boolean,
  errors text[],
  deduped boolean default false
);

-- 3. Helper indices
create index if not exists idx_import_job_rows_job on import_job_rows(job_id);
create index if not exists idx_import_jobs_team on import_jobs(team_id);
create index if not exists idx_import_jobs_user on import_jobs(user_id);
create index if not exists idx_import_jobs_status on import_jobs(status);

-- 4. RLS Policies for import_jobs
alter table import_jobs enable row level security;

-- Read access: team members can view jobs for their teams
create policy "team_members_read_import_jobs" on import_jobs for select
  using (
    exists (
      select 1 from team_members tm
      where tm.team_id = import_jobs.team_id
      and tm.user_id = auth.uid()
    )
  );

-- Write access: team members can create import jobs
create policy "team_members_create_import_jobs" on import_jobs for insert
  with check (
    exists (
      select 1 from team_members tm
      where tm.team_id = import_jobs.team_id
      and tm.user_id = auth.uid()
    )
    and user_id = auth.uid()
  );

-- Update access: job creator can update their own jobs
create policy "job_creator_update_import_jobs" on import_jobs for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 5. RLS Policies for import_job_rows
alter table import_job_rows enable row level security;

-- Read access: team members can view rows for their team's jobs
create policy "team_members_read_import_rows" on import_job_rows for select
  using (
    exists (
      select 1 from import_jobs ij
      join team_members tm on tm.team_id = ij.team_id
      where ij.id = import_job_rows.job_id
      and tm.user_id = auth.uid()
    )
  );

-- Write access: team members can insert rows for their team's jobs
create policy "team_members_create_import_rows" on import_job_rows for insert
  with check (
    exists (
      select 1 from import_jobs ij
      join team_members tm on tm.team_id = ij.team_id
      where ij.id = import_job_rows.job_id
      and tm.user_id = auth.uid()
    )
  );

-- 6. Trigger for updated_at
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger update_import_jobs_updated_at
before update on import_jobs
for each row execute function update_updated_at_column();

