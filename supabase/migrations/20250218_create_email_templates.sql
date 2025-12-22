-- Email Templates Migration
-- Stores reusable email templates with merge tokens (e.g., {{first_name}}, {{company}})

-- Create email_templates table
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  subject text not null,
  body_html text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create index for workspace lookups
create index if not exists idx_email_templates_workspace on public.email_templates(workspace_id);

-- Enable RLS
alter table public.email_templates enable row level security;

-- Create RLS policies
-- Note: is_member function is defined in 20250140_workspace_security_rls.sql
create policy "tmpl read" on public.email_templates 
  for select 
  using (app.is_member(workspace_id, 'viewer'));

create policy "tmpl write" on public.email_templates 
  for insert 
  with check (app.is_member(workspace_id, 'member'));

create policy "tmpl update" on public.email_templates 
  for update 
  using (app.is_member(workspace_id, 'member'));

-- role_at_least is not found, using app.is_member with admin role
create policy "tmpl delete" on public.email_templates 
  for delete 
  using (app.is_member(workspace_id, 'admin'));

-- Add updated_at trigger
create trigger trg_email_templates_updated_at
  before update on public.email_templates
  for each row
  execute function public.touch_updated_at();
