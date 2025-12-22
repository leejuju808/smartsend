-- Templates and Template Versions System
-- Supports team-scoped email templates with version history

-- 1) Templates table
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  purpose text check (purpose in ('cold','followup','bump','other')) default 'cold',
  variables text[] default ARRAY['first_name','company','title']::text[],
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Template versions table
create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  template_id uuid not null references public.templates(id) on delete cascade,
  subject text not null,
  body_html text,
  body_text text,
  tone text check (tone in ('casual','neutral','professional','playful','direct')) default 'neutral',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Create indexes
create index if not exists idx_templates_team on public.templates(team_id);
create index if not exists idx_templates_created_by on public.templates(created_by);
create index if not exists idx_template_versions_team on public.template_versions(team_id);
create index if not exists idx_template_versions_template on public.template_versions(template_id);
create index if not exists idx_template_versions_created_at on public.template_versions(created_at desc);

-- 3) Enable RLS
alter table public.templates enable row level security;
alter table public.template_versions enable row level security;

-- 4) RLS Policies
-- Templates: members can read/write templates in their teams
create policy "templates in my teams" on public.templates
  for all using (is_member_of(team_id)) with check (is_member_of(team_id));

-- Template versions: members can read/write versions in their teams
create policy "template_versions in my teams" on public.template_versions
  for all using (is_member_of(team_id)) with check (is_member_of(team_id));

-- Grant service role access
grant all on public.templates to service_role;
grant all on public.template_versions to service_role;

