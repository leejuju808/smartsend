-- AgentCloud Marketplace Integration
-- Allows SmartSend users to publish, buy, and deploy AI outreach agents & templates
-- File: supabase/migrations/20250216000000_agentcloud_marketplace.sql

-- ============================================================================
-- MARKETPLACE AGENTS TABLE
-- ============================================================================
-- Stores AI agents/templates that can be published to the marketplace

create table if not exists public.marketplace_agents (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.profiles(id) on delete set null,
  org_id uuid references public.orgs(id) on delete set null,
  name text not null,
  description text,
  category text not null default 'outreach' check (category in ('outreach', 'follow-up', 'reactivation')),
  template_body text not null,
  price numeric not null default 0 check (price >= 0),
  downloads int not null default 0,
  rating numeric default 0 check (rating >= 0 and rating <= 5),
  rating_count int not null default 0,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_marketplace_agents_creator on public.marketplace_agents(creator_id);
create index if not exists idx_marketplace_agents_org on public.marketplace_agents(org_id);
create index if not exists idx_marketplace_agents_category on public.marketplace_agents(category);
create index if not exists idx_marketplace_agents_visibility on public.marketplace_agents(visibility);
create index if not exists idx_marketplace_agents_rating on public.marketplace_agents(rating desc, rating_count desc);
create index if not exists idx_marketplace_agents_downloads on public.marketplace_agents(downloads desc);

-- Enable RLS
alter table public.marketplace_agents enable row level security;

-- RLS Policies
-- Anyone can view public agents
create policy "marketplace_agents_select_public" on public.marketplace_agents
  for select
  using (visibility = 'public' or creator_id = auth.uid());

-- Only creators can insert their own agents
create policy "marketplace_agents_insert_own" on public.marketplace_agents
  for insert
  with check (creator_id = auth.uid());

-- Only creators can update their own agents
create policy "marketplace_agents_update_own" on public.marketplace_agents
  for update
  using (creator_id = auth.uid());

-- Service role has full access
create policy "marketplace_agents_service_role" on public.marketplace_agents
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- MARKETPLACE AGENT DEPLOYMENTS TABLE
-- ============================================================================
-- Tracks when agents are deployed to user accounts

create table if not exists public.marketplace_agent_deployments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.marketplace_agents(id) on delete cascade,
  deployed_by uuid not null references public.profiles(id) on delete cascade,
  org_id uuid references public.orgs(id) on delete cascade,
  ai_template_id uuid references public.ai_templates(id) on delete set null,
  deployed_at timestamptz default now(),
  unique(agent_id, deployed_by, org_id) -- Prevent duplicate deployments
);

create index if not exists idx_marketplace_deployments_agent on public.marketplace_agent_deployments(agent_id);
create index if not exists idx_marketplace_deployments_user on public.marketplace_agent_deployments(deployed_by);
create index if not exists idx_marketplace_deployments_org on public.marketplace_agent_deployments(org_id);

-- Enable RLS
alter table public.marketplace_agent_deployments enable row level security;

-- Users can view their own deployments
create policy "marketplace_deployments_select_own" on public.marketplace_agent_deployments
  for select
  using (deployed_by = auth.uid());

-- Users can insert their own deployments
create policy "marketplace_deployments_insert_own" on public.marketplace_agent_deployments
  for insert
  with check (deployed_by = auth.uid());

-- Service role has full access
create policy "marketplace_deployments_service_role" on public.marketplace_agent_deployments
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- MARKETPLACE PURCHASES TABLE (for paid agents)
-- ============================================================================
-- Tracks purchases of paid agents (if implementing payment)

create table if not exists public.marketplace_purchases (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.marketplace_agents(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  org_id uuid references public.orgs(id) on delete cascade,
  amount_paid numeric not null,
  stripe_payment_intent_id text,
  created_at timestamptz default now(),
  unique(agent_id, buyer_id, org_id) -- Prevent duplicate purchases
);

create index if not exists idx_marketplace_purchases_agent on public.marketplace_purchases(agent_id);
create index if not exists idx_marketplace_purchases_buyer on public.marketplace_purchases(buyer_id);
create index if not exists idx_marketplace_purchases_stripe on public.marketplace_purchases(stripe_payment_intent_id);

-- Enable RLS
alter table public.marketplace_purchases enable row level security;

-- Users can view their own purchases
create policy "marketplace_purchases_select_own" on public.marketplace_purchases
  for select
  using (buyer_id = auth.uid());

-- Users can insert their own purchases
create policy "marketplace_purchases_insert_own" on public.marketplace_purchases
  for insert
  with check (buyer_id = auth.uid());

-- Service role has full access
create policy "marketplace_purchases_service_role" on public.marketplace_purchases
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Update download count when agent is deployed
create or replace function update_agent_downloads()
returns trigger as $$
begin
  update public.marketplace_agents
  set downloads = downloads + 1
  where id = NEW.agent_id;
  return NEW;
end;
$$ language plpgsql security definer;

-- Trigger to auto-update downloads
drop trigger if exists trigger_update_agent_downloads on public.marketplace_agent_deployments;
create trigger trigger_update_agent_downloads
  after insert on public.marketplace_agent_deployments
  for each row
  execute function update_agent_downloads();

-- Update updated_at timestamp
create or replace function update_marketplace_agents_updated_at()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

-- Trigger for updated_at
drop trigger if exists trigger_marketplace_agents_updated_at on public.marketplace_agents;
create trigger trigger_marketplace_agents_updated_at
  before update on public.marketplace_agents
  for each row
  execute function update_marketplace_agents_updated_at();

-- ============================================================================
-- GRANTS
-- ============================================================================

grant select, insert, update on public.marketplace_agents to authenticated;
grant select, insert on public.marketplace_agent_deployments to authenticated;
grant select, insert on public.marketplace_purchases to authenticated;

comment on table public.marketplace_agents is 'AgentCloud marketplace: AI agents & templates that can be published, bought, and deployed';
comment on table public.marketplace_agent_deployments is 'Tracks agent deployments to user accounts';
comment on table public.marketplace_purchases is 'Tracks purchases of paid agents';

