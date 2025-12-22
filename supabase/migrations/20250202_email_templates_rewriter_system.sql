-- Email Templates Rewriter System
-- Tables for org-scoped templates, AI variants, and rewrite logs

-- Email templates (org-scoped)
create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  body_md text not null,              -- markdown w/ variables like {{first_name}}
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Saved AI variants
create table if not exists template_variants (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references email_templates(id) on delete cascade,
  label text,                          -- e.g., "Punchy / Short"
  body_md text not null,
  meta jsonb default '{}'::jsonb,      -- {tone, length, reading_grade, seed}
  created_at timestamptz default now()
);

-- Logs for analytics/limits
create table if not exists rewrite_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  input_chars int,
  output_chars int,
  meta jsonb,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_email_templates_org on email_templates(org_id);
create index if not exists idx_template_variants_template on template_variants(template_id);
create index if not exists idx_rewrite_logs_org_created on rewrite_logs(org_id, created_at desc);

-- RLS
alter table email_templates enable row level security;
alter table template_variants enable row level security;
alter table rewrite_logs enable row level security;

-- RLS Policies
create policy "templates: org read" on email_templates
  for select using (is_org_member(org_id));

create policy "templates: org write" on email_templates
  for insert with check (is_org_member(org_id));

create policy "templates: org update" on email_templates
  for update using (is_org_member(org_id));

create policy "variants: org read" on template_variants
  for select using (
    exists (select 1 from email_templates t where t.id = template_id and is_org_member(t.org_id))
  );

create policy "variants: org write" on template_variants
  for insert with check (
    exists (select 1 from email_templates t where t.id = template_id and is_org_member(t.org_id))
  );

create policy "logs: org read" on rewrite_logs
  for select using (is_org_member(org_id));

create policy "logs: org write" on rewrite_logs
  for insert with check (is_org_member(org_id));

