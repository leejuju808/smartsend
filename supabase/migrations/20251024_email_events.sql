-- Add provider tracking columns
alter table public.email_jobs
  add column if not exists provider_message_id text,
  add column if not exists delivered_at timestamptz,
  add column if not exists bounced_at timestamptz;

create index if not exists email_jobs_provider_msg_idx
  on public.email_jobs(provider_message_id);

-- Event history
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.email_jobs(id) on delete cascade,
  event_type text not null check (event_type in ('queued','in_progress','sent','delivered','bounced','failed','opened','clicked')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.email_events enable row level security;

-- service role can write anything
create policy "service role full on email_events"
on public.email_events
as permissive
for all
to service_role
using (true)
with check (true);

-- users can read their workspace's events
create policy "users read email_events by workspace"
on public.email_events
for select
to authenticated
using (
  exists (
    select 1 from public.email_jobs j
    where j.id = email_events.job_id
      and j.workspace_id = auth.uid() -- adjust to your workspace ownership check
  )
);