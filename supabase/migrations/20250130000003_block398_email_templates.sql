-- Block 398 — Workspace Template Library v1
-- Email templates table with workspace scoping, owner + team visibility

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  owner_user_id uuid references auth.users (id),
  name text not null,
  subject text not null,
  body text not null,
  visibility text not null default 'team', -- 'team' | 'private'
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_templates_workspace
  on public.email_templates (workspace_id);

create index if not exists idx_email_templates_owner
  on public.email_templates (owner_user_id);

create index if not exists idx_email_templates_visibility
  on public.email_templates (visibility);

create index if not exists idx_email_templates_favorite
  on public.email_templates (is_favorite);

-- Add constraint for visibility values
alter table public.email_templates
  add constraint email_templates_visibility_check
  check (visibility in ('team', 'private'));

-- Enable RLS
alter table public.email_templates enable row level security;

-- RLS Policy: Users can view templates in their workspace
-- - Team templates (visibility='team') are visible to all workspace members
-- - Private templates (visibility='private') are only visible to the owner
create policy "email_templates_select_workspace"
  on public.email_templates
  for select
  using (
    workspace_id in (
      select workspace_id from public.team_members where user_id = auth.uid()
    )
    and (
      visibility = 'team'
      or owner_user_id = auth.uid()
    )
  );

-- RLS Policy: Users can create templates in their workspace
create policy "email_templates_insert_workspace"
  on public.email_templates
  for insert
  with check (
    workspace_id in (
      select workspace_id from public.team_members where user_id = auth.uid()
    )
    and owner_user_id = auth.uid()
  );

-- RLS Policy: Only owners can update their templates
create policy "email_templates_update_owner"
  on public.email_templates
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- RLS Policy: Only owners can delete their templates
create policy "email_templates_delete_owner"
  on public.email_templates
  for delete
  using (owner_user_id = auth.uid());

-- Trigger to update updated_at timestamp
create or replace function update_email_templates_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_email_templates_updated_at
  before update on public.email_templates
  for each row
  execute function update_email_templates_updated_at();




