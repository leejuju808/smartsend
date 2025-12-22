-- Revenue Autopilot: AI-Driven Pricing & Upsell Engine
-- Creates tables for tracking org usage stats and pricing actions

-- ============================================================================
-- 1. ORG USAGE STATS TABLE (Daily aggregate)
-- ============================================================================
create table if not exists public.org_usage_stats (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  emails_sent int default 0,
  workflows_run int default 0,
  agents_deployed int default 0,
  mrr numeric default 0,
  last_updated timestamptz default now()
);

-- Index for last_updated queries
create index if not exists idx_org_usage_stats_updated 
  on public.org_usage_stats(last_updated);

-- ============================================================================
-- 2. PRICING ACTIONS TABLE (AI-generated pricing suggestions)
-- ============================================================================
create table if not exists public.pricing_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs(id) on delete cascade,
  action text not null check (action in ('keep', 'upgrade', 'discount')),
  reason text,
  new_price numeric,
  created_at timestamptz default now()
);

-- Indexes for common queries
create index if not exists idx_pricing_actions_org_id 
  on public.pricing_actions(org_id, created_at desc);

create index if not exists idx_pricing_actions_action 
  on public.pricing_actions(action, created_at desc);

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on both tables
alter table public.org_usage_stats enable row level security;
alter table public.pricing_actions enable row level security;

-- Service role has full access
create policy "Service role full access org_usage_stats"
  on public.org_usage_stats for all
  to service_role
  using (true)
  with check (true);

create policy "Service role full access pricing_actions"
  on public.pricing_actions for all
  to service_role
  using (true)
  with check (true);

-- Org members can view their org's usage stats
create policy "Org members can view usage stats"
  on public.org_usage_stats for select
  to authenticated
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = org_usage_stats.org_id
      and om.user_id = auth.uid()
    )
  );

-- Org members can view their org's pricing actions
create policy "Org members can view pricing actions"
  on public.pricing_actions for select
  to authenticated
  using (
    exists (
      select 1 from public.org_members om
      where om.org_id = pricing_actions.org_id
      and om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. FUNCTION TO UPDATE ORG USAGE STATS
-- ============================================================================
create or replace function public.update_org_usage_stats(
  p_org_id uuid,
  p_emails_sent int default 0,
  p_workflows_run int default 0,
  p_agents_deployed int default 0,
  p_mrr numeric default 0
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.org_usage_stats (
    org_id,
    emails_sent,
    workflows_run,
    agents_deployed,
    mrr,
    last_updated
  ) values (
    p_org_id,
    p_emails_sent,
    p_workflows_run,
    p_agents_deployed,
    p_mrr,
    now()
  )
  on conflict (org_id) do update
  set
    emails_sent = public.org_usage_stats.emails_sent + p_emails_sent,
    workflows_run = public.org_usage_stats.workflows_run + p_workflows_run,
    agents_deployed = p_agents_deployed, -- Replace, not increment
    mrr = p_mrr, -- Replace with latest MRR
    last_updated = now();
end;
$$;

-- Grant execute to service role
grant execute on function public.update_org_usage_stats(uuid, int, int, int, numeric) to service_role;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================
comment on table public.org_usage_stats is 'Daily aggregate table tracking org usage metrics for AI pricing model';
comment on table public.pricing_actions is 'AI-generated pricing suggestions (keep, upgrade, discount)';
comment on function public.update_org_usage_stats is 'Updates or inserts org usage statistics for revenue autopilot';

