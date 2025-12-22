-- Cache the final, provider-ready HTML we send (post-link-rewrite, with pixel)
alter table public.email_jobs
  add column if not exists rendered_html text,
  add column if not exists rendered_at timestamptz,
  add column if not exists tracking_pixel_token text unique,
  add column if not exists first_opened_at timestamptz;

create index if not exists email_jobs_rendered_at_idx on public.email_jobs(rendered_at);
create index if not exists email_jobs_first_open_idx on public.email_jobs(first_opened_at);

-- Per-open log from our first-party pixel endpoint
create table if not exists public.email_open_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.email_jobs(id) on delete cascade,
  workspace_id uuid not null,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists email_open_events_job_idx on public.email_open_events(job_id);
create index if not exists email_open_events_ws_idx  on public.email_open_events(workspace_id);

alter table public.email_open_events enable row level security;

create policy "service role full opens" on public.email_open_events
as permissive for all to service_role using (true) with check (true);

create policy "users read opens" on public.email_open_events
for select to authenticated using (workspace_id = auth.uid());