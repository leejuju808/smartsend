-- Queue table
create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  to_email text not null check (to_email <> ''),
  subject text not null,
  body_html text not null,
  provider text not null default 'resend',
  status text not null check (status in ('queued','in_progress','sent','failed','retry_wait')) default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 5,
  last_error text,
  scheduled_for timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_jobs_status_scheduled_idx
  on public.email_jobs(status, scheduled_for);

-- Atomic claimer: grabs up to N ready jobs and marks them in_progress
create or replace function public.claim_email_jobs(p_limit int, p_worker_id text)
returns setof public.email_jobs
language plpgsql
as $$
declare
  r public.email_jobs%rowtype;
begin
  for r in
    select * from public.email_jobs
    where status = 'queued'
      and scheduled_for <= now()
    order by created_at
    for update skip locked
    limit p_limit
  loop
    update public.email_jobs
      set status='in_progress',
          locked_by=p_worker_id,
          locked_at=now()
      where id = r.id;
    return next r;
  end loop;
  return;
end;
$$;

-- Minimal RLS: only service role can write; users can read their workspace jobs
alter table public.email_jobs enable row level security;

-- Service role bypass
create policy "service role can do anything on email_jobs"
on public.email_jobs
as permissive
for all
to service_role
using (true)
with check (true);

-- End-user read-only by workspace (adjust to your auth schema)
create policy "users can read their workspace jobs"
on public.email_jobs
for select
to authenticated
using (workspace_id = auth.uid()); -- replace with your workspace ownership check