-- AUREV OS v3 — Autonomous Enterprise
-- Self-configuring workspaces + predictive AI automations

-- ============================================================================
-- 1. AUTONOMOUS ACTIONS TABLE
-- ============================================================================
-- Stores AI-generated suggestions for automations, campaigns, and agents

create table if not exists public.autonomous_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs(id) on delete cascade,
  action text not null check (action in ('trigger_workflow', 'launch_campaign', 'deploy_agent')),
  target text not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  executed boolean default false,
  executed_at timestamptz,
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_autonomous_actions_org on public.autonomous_actions(org_id, created_at desc);
create index if not exists idx_autonomous_actions_executed on public.autonomous_actions(executed, created_at desc);
create index if not exists idx_autonomous_actions_action on public.autonomous_actions(action);

-- Enable RLS
alter table public.autonomous_actions enable row level security;

-- Service role has full access
create policy "autonomous_actions_service_role" on public.autonomous_actions
  for all
  to service_role
  using (true)
  with check (true);

-- Org members can view their org's autonomous actions
create policy "autonomous_actions_select_own_org" on public.autonomous_actions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = autonomous_actions.org_id
      and om.user_id = auth.uid()
    )
  );

-- Org members can execute actions for their org
create policy "autonomous_actions_update_own_org" on public.autonomous_actions
  for update
  to authenticated
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = autonomous_actions.org_id
      and om.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.org_members om
      where om.org_id = autonomous_actions.org_id
      and om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 2. ADD MEMORY COLUMN TO ORG_USAGE_STATS
-- ============================================================================
-- Stores AI context and learning notes per organization

alter table public.org_usage_stats 
  add column if not exists memory jsonb default '{}';

-- Create index for memory queries (GIN index for JSONB)
create index if not exists idx_org_usage_stats_memory 
  on public.org_usage_stats using gin (memory);

-- ============================================================================
-- 3. AGENT INSTANCES TABLE (if it doesn't exist)
-- ============================================================================
-- Tracks deployed agent instances for autonomous execution

create table if not exists public.agent_instances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs(id) on delete cascade,
  template_id uuid references public.marketplace_agents(id) on delete set null,
  name text,
  status text not null default 'running' check (status in ('running', 'paused', 'stopped', 'error')),
  config jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_agent_instances_org on public.agent_instances(org_id, status);
create index if not exists idx_agent_instances_template on public.agent_instances(template_id);

-- Enable RLS
alter table public.agent_instances enable row level security;

-- Service role has full access
create policy "agent_instances_service_role" on public.agent_instances
  for all
  to service_role
  using (true)
  with check (true);

-- Org members can view their org's agent instances
create policy "agent_instances_select_own_org" on public.agent_instances
  for select
  to authenticated
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = agent_instances.org_id
      and om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

comment on table public.autonomous_actions is 'AI-generated suggestions for automations, campaigns, and agents';
comment on column public.org_usage_stats.memory is 'AI context and learning notes for predictive automation';
comment on table public.agent_instances is 'Deployed agent instances for autonomous execution';

