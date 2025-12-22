-- Track when a job was actually marked "sent"
alter table public.email_jobs
  add column if not exists sent_at timestamptz;

create index if not exists email_jobs_sent_at_idx
  on public.email_jobs(sent_at);

-- Per-workspace sending limits & warmup
create table if not exists public.workspace_sending_limits (
  workspace_id uuid primary key,
  -- Warmup plan: ramp from base_rpm to max_rpm over warmup_days
  base_rpm int not null default 10,       -- starting sends/min
  max_rpm  int not null default 120,      -- final sends/min
  warmup_days int not null default 14,    -- days to ramp
  warmup_start_date date default now(),   -- ramp start
  -- Daily cap (hard limit; resets at UTC midnight)
  daily_cap int not null default 1500,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_sending_limits enable row level security;

-- service role full
create policy "service role full on workspace_sending_limits"
on public.workspace_sending_limits
as permissive for all to service_role
using (true) with check (true);

-- users can read and upsert their own row
create policy "users select own limits"
on public.workspace_sending_limits
for select to authenticated
using (workspace_id = auth.uid());

create policy "users upsert own limits"
on public.workspace_sending_limits
for insert to authenticated
with check (workspace_id = auth.uid());

create policy "users update own limits"
on public.workspace_sending_limits
for update to authenticated
using (workspace_id = auth.uid())
with check (workspace_id = auth.uid());