-- Organizations to Campaigns/Leads Linkage and Extended RLS
-- This migration links campaigns and leads to orgs via project_id
-- and extends RLS policies across all SmartSend data tables

-- ============================================================================
-- 1. ADD org_id TO CAMPAIGNS AND LEADS
-- ============================================================================

-- Add org_id to campaigns if it doesn't exist
alter table if exists public.campaigns add column if not exists org_id uuid references public.organizations(id) on delete cascade;

-- Add org_id to leads if it doesn't exist
alter table if exists public.leads add column if not exists org_id uuid references public.organizations(id) on delete cascade;

-- Create indexes
create index if not exists idx_campaigns_org on public.campaigns(org_id);
create index if not exists idx_leads_org on public.leads(org_id);

-- ============================================================================
-- 2. ENABLE RLS ON CAMPAIGNS AND LEADS
-- ============================================================================

alter table public.campaigns enable row level security;
alter table public.leads enable row level security;

-- ============================================================================
-- 3. RLS POLICIES FOR CAMPAIGNS AND LEADS
-- ============================================================================

-- Helper function to check org membership (reuse from previous migration if exists)
create or replace function public.is_org_member(_org_id uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.org_memberships
    where org_id = _org_id and user_id = auth.uid() and status = 'active'
  );
$$;

-- Helper function to check org admin/owner
create or replace function public.is_org_admin(_org_id uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.org_memberships
    where org_id = _org_id and user_id = auth.uid() and status = 'active' and role in ('owner','admin')
  );
$$;

-- Campaigns: Read by org members
drop policy if exists "campaigns_read" on public.campaigns;
create policy "campaigns_read" on public.campaigns for select using (
  exists(select 1 from public.org_memberships m where m.org_id = campaigns.org_id and m.user_id = auth.uid() and m.status = 'active')
);

-- Campaigns: Write by org admins/members (adjust based on your needs)
drop policy if exists "campaigns_write" on public.campaigns;
create policy "campaigns_write" on public.campaigns for insert with check (
  exists(select 1 from public.org_memberships m where m.org_id = campaigns.org_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','member'))
);

drop policy if exists "campaigns_update" on public.campaigns;
create policy "campaigns_update" on public.campaigns for update using (
  exists(select 1 from public.org_memberships m where m.org_id = campaigns.org_id and m.user_id = auth.uid() and m.status = 'active')
) with check (true);

-- Leads: Read by org members
drop policy if exists "leads_read" on public.leads;
create policy "leads_read" on public.leads for select using (
  exists(select 1 from public.org_memberships m where m.org_id = leads.org_id and m.user_id = auth.uid() and m.status = 'active')
);

-- Leads: Write by org members
drop policy if exists "leads_write" on public.leads;
create policy "leads_write" on public.leads for insert with check (
  exists(select 1 from public.org_memberships m where m.org_id = leads.org_id and m.user_id = auth.uid() and m.status = 'active' and m.role in ('owner','admin','member'))
);

drop policy if exists "leads_update" on public.leads;
create policy "leads_update" on public.leads for update using (
  exists(select 1 from public.org_memberships m where m.org_id = leads.org_id and m.user_id = auth.uid() and m.status = 'active')
) with check (true);

-- ============================================================================
-- 4. BACKFILL org_id FROM EXISTING RELATIONSHIPS
-- ============================================================================

-- If campaigns have workspace_id or user_id, backfill org_id from those
do $$
begin
  -- Try backfilling from workspace pattern if exists
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='workspace_id') then
    -- Backfill campaigns: workspace -> org
    update public.campaigns c set org_id = o.id
    from public.organizations o, public.org_memberships m
    where c.workspace_id is not null
      and m.org_id = o.id
      and m.user_id = c.workspace_id
      and m.status = 'active'
      and c.org_id is null
    limit 1;
  end if;

  -- Try backfilling from user_id pattern if exists
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='user_id') then
    -- Backfill campaigns: user -> org
    update public.campaigns c set org_id = o.id
    from public.organizations o, public.org_memberships m
    where c.user_id is not null
      and m.org_id = o.id
      and m.user_id = c.user_id
      and m.status = 'active'
      and c.org_id is null
    limit 1;
  end if;
end $$;

-- Backfill leads: campaign -> org
update public.leads l set org_id = c.org_id
from public.campaigns c
where l.campaign_id = c.id and l.org_id is null and c.org_id is not null;

-- For leads without campaign, try user -> org
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='user_id') then
    update public.leads l set org_id = o.id
    from public.organizations o, public.org_memberships m
    where l.user_id is not null
      and m.org_id = o.id
      and m.user_id = l.user_id
      and m.status = 'active'
      and l.org_id is null
    limit 1;
  end if;
end $$;

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

comment on function public.is_org_member(uuid) is 'Checks if current user is a member of the org';
comment on function public.is_org_admin(uuid) is 'Checks if current user is an admin/owner of the org';
comment on column public.campaigns.org_id is 'Organization this campaign belongs to';
comment on column public.leads.org_id is 'Organization this lead belongs to';

