-- Sequences (optionally tied to a campaign)
create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name text not null,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sequences_workspace_idx on public.sequences(workspace_id);

-- Steps within a sequence
create table if not exists public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  position int not null,                                -- 1..N ordering
  template_id uuid references public.templates(id) on delete set null,
  subject_override text,                                -- optional; if null use template subject
  html_override text,                                   -- optional
  wait_seconds int not null default 0,                  -- delay from enrollment or from previous step
  advance_rule text not null default 'always' check (
    advance_rule in ('always','if_no_open','if_no_click','if_open','if_click')
  ),
  created_at timestamptz not null default now()
);
create unique index if not exists sequence_steps_order_idx on public.sequence_steps(sequence_id, position);

-- Per recipient enrollment/state
create table if not exists public.sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  to_email text not null,
  vars jsonb,                                           -- personalization vars
  status text not null default 'active' check (status in ('active','paused','completed','stopped')),
  current_position int not null default 0,              -- 0 = before first
  last_job_id uuid references public.email_jobs(id) on delete set null,
  last_event text,                                      -- 'delivered','opened','clicked','bounced'
  next_scheduled_at timestamptz,                        -- when the next step becomes eligible
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_id, to_email)                        -- avoid dup enrollment
);
create index if not exists seq_enroll_ws_time_idx on public.sequence_enrollments(workspace_id, next_scheduled_at);

-- RLS
alter table public.sequences enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.sequence_enrollments enable row level security;

create policy "service role full sequences" on public.sequences as permissive for all to service_role using (true) with check (true);
create policy "service role full steps"      on public.sequence_steps as permissive for all to service_role using (true) with check (true);
create policy "service role full enroll"     on public.sequence_enrollments as permissive for all to service_role using (true) with check (true);

create policy "users sequences select" on public.sequences for select to authenticated using (workspace_id = auth.uid());
create policy "users sequences write"  on public.sequences for all     to authenticated using (workspace_id = auth.uid()) with check (workspace_id = auth.uid());

create policy "users steps select" on public.sequence_steps for select to authenticated using (
  exists (select 1 from public.sequences s where s.id = sequence_steps.sequence_id and s.workspace_id = auth.uid())
);
create policy "users steps write" on public.sequence_steps for all to authenticated using (
  exists (select 1 from public.sequences s where s.id = sequence_steps.sequence_id and s.workspace_id = auth.uid())
) with check (
  exists (select 1 from public.sequences s where s.id = sequence_steps.sequence_id and s.workspace_id = auth.uid())
);

create policy "users enroll select" on public.sequence_enrollments for select to authenticated using (workspace_id = auth.uid());
create policy "users enroll write"  on public.sequence_enrollments for all     to authenticated using (workspace_id = auth.uid()) with check (workspace_id = auth.uid());