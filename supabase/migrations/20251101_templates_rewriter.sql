-- 09_templates_rewriter.sql

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_org_id uuid references public.organizations(id) on delete set null,
  name text not null,
  base_text text not null,
  variables jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  label text,
  text text not null,
  settings jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists public.rewrite_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  template_id uuid references public.templates(id),
  input_text text,
  output_text text,
  settings jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_templates_owner on public.templates(owner_id, owner_org_id);
create index if not exists idx_template_versions_template on public.template_versions(template_id, created_at desc);
create index if not exists idx_rewrite_logs_user on public.rewrite_logs(user_id, created_at desc);

