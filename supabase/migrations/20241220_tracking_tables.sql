-- 04_tracking.sql
alter table email_jobs
  add column if not exists tracking_token text,
  add column if not exists from_email text;

-- ensure unique token per job
create unique index if not exists email_jobs_tracking_token_idx
  on email_jobs(tracking_token);

-- enrich sends for analytics
alter table email_sends
  add column if not exists first_open_at timestamptz,
  add column if not exists first_click_at timestamptz,
  add column if not exists opens int not null default 0,
  add column if not exists clicks int not null default 0;

-- raw event log
create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references email_jobs(id) on delete cascade,
  kind text not null check (kind in ('open','click','bounce','complaint','delivered')),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists email_events_job_idx on email_events(job_id);