-- Email Sequence System Implementation
-- Simplified leads, sequence_enrollments, and send_jobs tables

-- leads owned by user
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text,
  created_at timestamptz default now()
);

create unique index if not exists leads_user_email on leads(user_id, email);

-- enroll a lead into a sequence
create table if not exists sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  sequence_id uuid not null references sequences(id) on delete cascade,
  status text not null default 'active', -- active | paused | completed | canceled
  next_step_order int not null default 1,
  next_run_at timestamptz,               -- when the next step should fire
  created_at timestamptz default now()
);
create index if not exists idx_enroll_user_next on sequence_enrollments(user_id, next_run_at);

-- jobs to execute (send email step N)
create table if not exists send_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  enrollment_id uuid not null references sequence_enrollments(id) on delete cascade,
  sequence_id uuid not null references sequences(id) on delete cascade,
  step_id uuid not null references sequence_steps(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body text not null,
  run_at timestamptz not null,           -- when job should run
  status text not null default 'queued',  -- queued | sending | sent | failed
  created_at timestamptz default now(),
  sent_at timestamptz
);
create index if not exists idx_send_jobs_status_time on send_jobs(status, run_at);

-- (optional) VERY SIMPLE RLS: only owner can read/write their rows
alter table leads enable row level security;
alter table sequence_enrollments enable row level security;
alter table send_jobs enable row level security;

create policy "leads owner" on leads
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "enroll owner" on sequence_enrollments
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "jobs owner" on send_jobs
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);