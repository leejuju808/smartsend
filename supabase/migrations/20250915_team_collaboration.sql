-- Team Collaboration Features
-- Add template comments and enhance team member management

-- Create template_comments table
create table if not exists public.template_comments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.email_templates(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  comment text not null,
  created_at timestamptz default now()
);

-- Add workspace_id to email_templates for team sharing
alter table if exists public.email_templates 
  add column if not exists workspace_id uuid references public.workspaces(id);

-- Add approval workflow fields to campaigns
alter table if exists public.campaigns 
  add column if not exists approval_status text default 'draft' check (approval_status in ('draft', 'pending_approval', 'approved', 'rejected')),
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists approved_at timestamptz;

-- Add activity tracking table
create table if not exists public.team_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz default now()
);

-- Create indexes for performance
create index if not exists idx_template_comments_template on public.template_comments(template_id);
create index if not exists idx_template_comments_user on public.template_comments(user_id);
create index if not exists idx_email_templates_workspace on public.email_templates(workspace_id);
create index if not exists idx_team_activities_workspace on public.team_activities(workspace_id);
create index if not exists idx_team_activities_user on public.team_activities(user_id);

-- Enable RLS on new tables
alter table if exists public.template_comments enable row level security;
alter table if exists public.team_activities enable row level security;

-- RLS policies for template_comments
create policy "team_members_can_view_comments" on public.template_comments
  for select using (
    exists (
      select 1 from public.workspace_members m
      join public.email_templates t on t.workspace_id = m.workspace_id
      where m.user_id = auth.uid() 
      and t.id = template_comments.template_id
    )
  );

create policy "team_members_can_add_comments" on public.template_comments
  for insert with check (
    exists (
      select 1 from public.workspace_members m
      join public.email_templates t on t.workspace_id = m.workspace_id
      where m.user_id = auth.uid() 
      and t.id = template_comments.template_id
    )
  );

-- RLS policies for team_activities
create policy "team_members_can_view_activities" on public.team_activities
  for select using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = team_activities.workspace_id 
      and m.user_id = auth.uid()
    )
  );

create policy "team_members_can_add_activities" on public.team_activities
  for insert with check (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = team_activities.workspace_id 
      and m.user_id = auth.uid()
    )
  );

-- Update email_templates RLS to include workspace-based access
drop policy if exists "Users can view own email templates" on public.email_templates;

create policy "team_members_can_view_templates" on public.email_templates
  for select using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = email_templates.workspace_id 
      and m.user_id = auth.uid()
    )
  );

create policy "team_members_can_edit_templates" on public.email_templates
  for all using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = email_templates.workspace_id 
      and m.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = email_templates.workspace_id 
      and m.user_id = auth.uid()
    )
  );

-- Add approval workflow policies for campaigns
create policy "team_members_can_view_campaigns" on public.campaigns
  for select using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = campaigns.workspace_id 
      and m.user_id = auth.uid()
    )
  );

create policy "team_members_can_edit_campaigns" on public.campaigns
  for all using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = campaigns.workspace_id 
      and m.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = campaigns.workspace_id 
      and m.user_id = auth.uid()
    )
  );

-- Backfill: assign existing templates to user's workspace
update public.email_templates 
set workspace_id = (
  select w.id from public.workspaces w
  join public.workspace_members m on m.workspace_id = w.id
  where m.user_id = email_templates.user_id
  limit 1
)
where workspace_id is null;

-- Create function to log team activities
create or replace function public.log_team_activity(
  p_workspace_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_details jsonb default null
)
returns void as $$
begin
  insert into public.team_activities (
    workspace_id, 
    user_id, 
    action, 
    entity_type, 
    entity_id, 
    details
  ) values (
    p_workspace_id,
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_details
  );
end;
$$ language plpgsql security definer; 