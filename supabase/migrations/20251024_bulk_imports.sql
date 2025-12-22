create table if not exists public.email_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  template_id uuid references public.templates(id) on delete set null,
  filename text not null,
  total_rows int not null default 0,
  enqueued_rows int not null default 0,
  failed_rows int not null default 0,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.email_import_failures (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.email_imports(id) on delete cascade,
  row_number int not null,
  to_email text,
  subject text,
  vars jsonb,
  error text not null,
  created_at timestamptz not null default now()
);

alter table public.email_imports enable row level security;
alter table public.email_import_failures enable row level security;

create policy "service role full imports" on public.email_imports
as permissive for all to service_role using (true) with check (true);
create policy "service role full import_failures" on public.email_import_failures
as permissive for all to service_role using (true) with check (true);

create policy "users read own imports" on public.email_imports
for select to authenticated using (workspace_id = auth.uid());
create policy "users read own import_failures" on public.email_import_failures
for select to authenticated using (
  exists (select 1 from public.email_imports i where i.id = email_import_failures.import_id and i.workspace_id = auth.uid())
);