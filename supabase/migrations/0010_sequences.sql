-- Core tables

create table if not exists public.sequences (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sequence_steps (
  id uuid primary key default uuid_generate_v4(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  step_number int not null,                              -- 1,2,3...
  delay_minutes int not null default 0,                  -- after enrollment or after prior send
  subject text,
  body text not null
);

create table if not exists public.sequence_enrollments (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  status text not null default 'active',                 -- active | paused | completed | error
  current_step int not null default 0,                   -- last sent step number
  next_run_at timestamptz,                               -- when to send next
  last_error text,
  created_at timestamptz not null default now(),
  unique (project_id, thread_id, sequence_id)
);

-- RLS

alter table public.sequences enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.sequence_enrollments enable row level security;

create policy "members read sequences" on public.sequences
  for select using (is_member(project_id));
create policy "members write sequences" on public.sequences
  for insert with check (is_member(project_id));

create policy "members read steps" on public.sequence_steps
  for select using (exists (select 1 from public.sequences s where s.id=sequence_steps.sequence_id and is_member(s.project_id)));
create policy "members write steps" on public.sequence_steps
  for insert with check (exists (select 1 from public.sequences s where s.id=sequence_steps.sequence_id and is_member(s.project_id)));

create policy "members read enrollments" on public.sequence_enrollments
  for select using (is_member(project_id));
create policy "members write enrollments" on public.sequence_enrollments
  for insert with check (is_member(project_id));
create policy "members update enrollments" on public.sequence_enrollments
  for update using (is_member(project_id));

-- Helper: compute next_run_at at enrollment (step 1)

create or replace function public.enroll_in_sequence(p_project uuid, p_thread uuid, p_sequence uuid)
returns uuid
language plpgsql security definer set search_path=public as $$
declare first_delay int;
declare eid uuid;
begin
  select delay_minutes into first_delay
  from public.sequence_steps
  where sequence_id=p_sequence and step_number=1;

  insert into public.sequence_enrollments (project_id, thread_id, sequence_id, status, current_step, next_run_at)
  values (p_project, p_thread, p_sequence, 'active', 0,
          case when first_delay is null then now() else now() + (first_delay::text || ' minutes')::interval end)
  returning id into eid;
  return eid;
end $$;
