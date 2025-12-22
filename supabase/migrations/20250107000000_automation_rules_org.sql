-- Automation Rules with org_id support
-- This migration adds the core automation rules engine tables with org_id instead of workspace_id

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  trigger_event text not null check (trigger_event in ('reply', 'open', 'click', 'time_delay')),
  condition jsonb default '{}'::jsonb,
  action jsonb not null,
  enabled boolean default true,
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_automation_rules_org on public.automation_rules(org_id);
create index if not exists idx_automation_rules_enabled on public.automation_rules(enabled, trigger_event);

-- Automation queue for follow-ups
create table if not exists public.automation_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  lead_id uuid not null,
  action text not null,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_automation_queue_org on public.automation_queue(org_id);
create index if not exists idx_automation_queue_created on public.automation_queue(created_at);

-- Ensure leads table has tags column
alter table public.leads add column if not exists tags text[] default '{}'::text[];

-- RLS policies
alter table public.automation_rules enable row level security;
alter table public.automation_queue enable row level security;

-- Policies for automation_rules
drop policy if exists "automation_rules_select_org" on public.automation_rules;
create policy "automation_rules_select_org" on public.automation_rules
  for select using (
    org_id in (
      select org_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "automation_rules_all_org" on public.automation_rules;
create policy "automation_rules_all_org" on public.automation_rules
  for all using (
    org_id in (
      select org_id from public.profiles where id = auth.uid()
    )
  );

-- Policies for automation_queue
drop policy if exists "automation_queue_select_org" on public.automation_queue;
create policy "automation_queue_select_org" on public.automation_queue
  for select using (
    org_id in (
      select org_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "automation_queue_all_org" on public.automation_queue;
create policy "automation_queue_all_org" on public.automation_queue
  for all using (
    org_id in (
      select org_id from public.profiles where id = auth.uid()
    )
  );

-- Helper function to add tag to lead
create or replace function public.add_tag_to_lead(lead_id uuid, tag text)
returns void as $$
begin
  update public.leads 
  set tags = array_append(tags, tag) 
  where id = lead_id;
end;
$$ language plpgsql security definer;

