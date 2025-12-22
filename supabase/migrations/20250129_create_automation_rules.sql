-- Create automation rules system
-- This migration adds the core automation rules engine tables

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  is_enabled boolean default true,
  trigger_type text not null check (trigger_type in ('event', 'score', 'time')),
  event_type text check (event_type in ('open', 'click', 'reply', 'bounce')),
  condition_json jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.automation_actions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.automation_rules(id) on delete cascade,
  action_type text not null check (action_type in ('tag', 'assign', 'enroll_sequence', 'suppress', 'pause_campaign')),
  action_payload jsonb default '{}',
  created_at timestamptz default now()
);

-- Add indexes for performance
create index if not exists ar_enabled_idx on public.automation_rules(is_enabled, trigger_type, event_type);
create index if not exists ar_workspace_idx on public.automation_rules(workspace_id);
create index if not exists aa_rule_idx on public.automation_actions(rule_id);

-- Enable RLS
alter table public.automation_rules enable row level security;
alter table public.automation_actions enable row level security;

-- Create policies for automation_rules
create policy "Users can view automation rules for their workspace" on public.automation_rules
  for select using (
    exists (
      select 1 from public.workspaces w 
      where w.id = automation_rules.workspace_id 
      and w.id in (
        select workspace_id from public.workspace_members 
        where user_id = auth.uid()
      )
    )
  );

create policy "Users can manage automation rules for their workspace" on public.automation_rules
  for all using (
    exists (
      select 1 from public.workspaces w 
      where w.id = automation_rules.workspace_id 
      and w.id in (
        select workspace_id from public.workspace_members 
        where user_id = auth.uid()
      )
    )
  );

-- Create policies for automation_actions
create policy "Users can view automation actions for their workspace" on public.automation_actions
  for select using (
    exists (
      select 1 from public.automation_rules ar
      join public.workspaces w on w.id = ar.workspace_id
      join public.workspace_members wm on wm.workspace_id = w.id
      where ar.id = automation_actions.rule_id 
      and wm.user_id = auth.uid()
    )
  );

create policy "Users can manage automation actions for their workspace" on public.automation_actions
  for all using (
    exists (
      select 1 from public.automation_rules ar
      join public.workspaces w on w.id = ar.workspace_id
      join public.workspace_members wm on wm.workspace_id = w.id
      where ar.id = automation_actions.rule_id 
      and wm.user_id = auth.uid()
    )
  );

-- Add function to get workspace_id from campaign_id
create or replace function public.get_campaign_workspace(p_campaign_id uuid)
returns uuid as $$
begin
  return (
    select workspace_id 
    from public.campaigns 
    where id = p_campaign_id
  );
end;
$$ language plpgsql security definer;

-- Add function to get workspace_id from email
create or replace function public.get_email_workspace(p_email text)
returns uuid as $$
begin
  return (
    select workspace_id 
    from public.contacts 
    where lower(email) = lower(p_email)
    limit 1
  );
end;
$$ language plpgsql security definer; 