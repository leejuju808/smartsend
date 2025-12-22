-- Email templates
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  subject_tpl text not null,
  html_tpl text not null,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_workspace_idx on public.templates(workspace_id);

-- RLS
alter table public.templates enable row level security;

create policy "service role full on templates"
on public.templates
as permissive
for all
to service_role
using (true)
with check (true);

create policy "users read their templates"
on public.templates
for select
to authenticated
using (workspace_id = auth.uid());

create policy "users insert their templates"
on public.templates
for insert
to authenticated
with check (workspace_id = auth.uid());

create policy "users update their templates"
on public.templates
for update
to authenticated
using (workspace_id = auth.uid())
with check (workspace_id = auth.uid());

create policy "users delete their templates"
on public.templates
for delete
to authenticated
using (workspace_id = auth.uid());

-- Link templates to jobs + store render vars (for audit)
alter table public.email_jobs
  add column if not exists template_id uuid references public.templates(id) on delete set null,
  add column if not exists render_vars jsonb;

create index if not exists email_jobs_template_idx on public.email_jobs(template_id);

-- Keep views as security invoker (already set earlier)