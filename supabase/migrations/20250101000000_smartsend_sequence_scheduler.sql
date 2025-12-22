-- SmartSend Sequence Scheduler Schema
-- This creates the new email_sequences, sequence_steps, and sequence_jobs tables
-- as specified in the requirements, separate from the existing sequences system

-- enums
do $$ begin
  create type sequence_status as enum ('draft','active','paused');
exception when duplicate_object then null; end $$;

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- sequences
create table if not exists public.email_sequences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  status sequence_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- steps (delay after previous step, in minutes)
create table if not exists public.sequence_steps_new (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.email_sequences(id) on delete cascade,
  step_no int not null,
  template_subject text not null,
  template_body text not null,
  delay_minutes int not null default 0,
  created_at timestamptz not null default now(),
  unique(sequence_id, step_no)
);

-- jobs (one job per contact × step)
create table if not exists public.sequence_jobs (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.email_sequences(id) on delete cascade,
  step_id uuid not null references public.sequence_steps_new(id) on delete cascade,
  contact_email text not null,
  run_at timestamptz not null,
  status text not null default 'queued', -- queued | sent | failed | canceled
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists sequence_jobs_due_idx on public.sequence_jobs (status, run_at);
create index if not exists sequence_jobs_seq_idx on public.sequence_jobs (sequence_id);

-- RLS: user isolation (UI uses auth), worker uses Service Role
alter table public.email_sequences enable row level security;
alter table public.sequence_steps_new enable row level security;
alter table public.sequence_jobs enable row level security;

-- policies for owners (UI)
do $$ begin
  create policy "owner can read sequences" on public.email_sequences
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner can write sequences" on public.email_sequences
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner can update sequences" on public.email_sequences
    for update using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner can read steps" on public.sequence_steps_new
    for select using (
      exists (select 1 from public.email_sequences s where s.id = sequence_id and s.user_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner can write steps" on public.sequence_steps_new
    for insert with check (
      exists (select 1 from public.email_sequences s where s.id = sequence_id and s.user_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner can read jobs" on public.sequence_jobs
    for select using (
      exists (
        select 1 from public.email_sequences s
        where s.id = sequence_id and s.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;

-- NOTE: No insert/update policies on jobs for anon users; jobs are created by server API using Service Role.