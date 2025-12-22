-- Complete Campaign Shares RLS System
-- Implements owner > editor > viewer role hierarchy with complete RLS policies

-- ============================================
-- 1) Complete role helper (owner > editor > viewer)
-- ============================================
create or replace function public.user_campaign_role(p_campaign uuid, p_user uuid default auth.uid())
returns text
language sql stable as $$
  with owner as (
    select 'owner'::text as role
    from public.campaigns c
    where c.id = p_campaign and c.user_id = p_user
  ),
  shared as (
    select s.role
    from public.campaign_shares s
    where s.campaign_id = p_campaign and s.user_id = p_user
    limit 1
  )
  select coalesce(
    (select role from owner),
    (select role from shared),
    null
  );
$$;

-- ============================================
-- 2) Convenience booleans for RLS/policies
-- ============================================
create or replace function public.can_view_campaign(p_campaign uuid, p_user uuid default auth.uid())
returns boolean language sql stable as $$
  select
    exists(select 1 from public.campaigns c where c.id = p_campaign and c.user_id = p_user)
    or exists(select 1 from public.campaign_shares s where s.campaign_id = p_campaign and s.user_id = p_user);
$$;

create or replace function public.can_edit_campaign(p_campaign uuid, p_user uuid default auth.uid())
returns boolean language sql stable as $$
  select
    exists(select 1 from public.campaigns c where c.id = p_campaign and c.user_id = p_user)
    or exists(select 1 from public.campaign_shares s where s.campaign_id = p_campaign and s.user_id = p_user and s.role in ('editor'));
$$;

-- ============================================
-- 3) Members view (handy for UI)
-- ============================================
create or replace view public.campaign_members as
select
  c.id as campaign_id,
  c.user_id as member_id,
  'owner'::text as role
from public.campaigns c
union all
select
  s.campaign_id,
  s.user_id,
  s.role
from public.campaign_shares s;

-- Index for performance
create index if not exists idx_campaign_members_campaign on public.campaign_members(campaign_id);

-- ============================================
-- 4) Enable RLS + policies on campaigns
-- ============================================
alter table public.campaigns enable row level security;

-- campaigns: SELECT for owner or shared
drop policy if exists "campaigns.select.owner_or_shared" on public.campaigns;
create policy "campaigns.select.owner_or_shared"
on public.campaigns for select
using (public.can_view_campaign(id));

-- campaigns: INSERT (owner only = creator)
drop policy if exists "campaigns.insert.self_owner" on public.campaigns;
create policy "campaigns.insert.self_owner"
on public.campaigns for insert
to authenticated
with check (auth.uid() = user_id);

-- campaigns: UPDATE (owner or editor)
drop policy if exists "campaigns.update.owner_or_editor" on public.campaigns;
create policy "campaigns.update.owner_or_editor"
on public.campaigns for update
using (public.can_edit_campaign(id))
with check (public.can_edit_campaign(id));

-- campaigns: DELETE (owner only)
drop policy if exists "campaigns.delete.owner_only" on public.campaigns;
create policy "campaigns.delete.owner_only"
on public.campaigns for delete
using (user_id = auth.uid());

-- ============================================
-- 5) Enable RLS + policies on campaign_shares
-- ============================================
alter table public.campaign_shares enable row level security;

-- campaign_shares: SELECT if you can view campaign
drop policy if exists "shares.select.visible_to_members" on public.campaign_shares;
create policy "shares.select.visible_to_members"
on public.campaign_shares for select
using (public.can_view_campaign(campaign_id));

-- INSERT: owner or editor can share with others
drop policy if exists "shares.insert.by_owner_or_editor" on public.campaign_shares;
create policy "shares.insert.by_owner_or_editor"
on public.campaign_shares for insert
with check (public.can_edit_campaign(campaign_id));

-- UPDATE role: owner only (prevent editors from escalating others)
drop policy if exists "shares.update.owner_only" on public.campaign_shares;
create policy "shares.update.owner_only"
on public.campaign_shares for update
using (
  exists(select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
)
with check (
  exists(select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
);

-- DELETE: owner can remove anyone; a member can remove themselves ("leave")
drop policy if exists "shares.delete.owner_or_self" on public.campaign_shares;
create policy "shares.delete.owner_or_self"
on public.campaign_shares for delete
using (
  exists(select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  or user_id = auth.uid()
);

-- ============================================
-- 6) Grant necessary permissions
-- ============================================
-- Ensure authenticated users can select from campaign_shares (RLS will filter)
grant select on public.campaign_shares to authenticated;
grant insert on public.campaign_shares to authenticated;
grant update on public.campaign_shares to authenticated;
grant delete on public.campaign_shares to authenticated;

-- ============================================
-- 7) Optional: Apply RLS to child tables if they exist
-- ============================================
-- This section applies sharing policies to related tables

-- campaign_leads (if exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'campaign_leads') then
    alter table public.campaign_leads enable row level security;
    
    drop policy if exists "campaign_leads.select" on public.campaign_leads;
    create policy "campaign_leads.select"
    on public.campaign_leads for select
    using (public.can_view_campaign(campaign_id));
    
    drop policy if exists "campaign_leads.insert" on public.campaign_leads;
    create policy "campaign_leads.insert"
    on public.campaign_leads for insert
    with check (public.can_edit_campaign(campaign_id));
    
    drop policy if exists "campaign_leads.update" on public.campaign_leads;
    create policy "campaign_leads.update"
    on public.campaign_leads for update
    using (public.can_edit_campaign(campaign_id))
    with check (public.can_edit_campaign(campaign_id));
    
    drop policy if exists "campaign_leads.delete" on public.campaign_leads;
    create policy "campaign_leads.delete"
    on public.campaign_leads for delete
    using (public.can_edit_campaign(campaign_id));
  end if;
end $$;

-- send_queue (if exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'send_queue') then
    alter table public.send_queue enable row level security;
    
    drop policy if exists "send_queue.select" on public.send_queue;
    create policy "send_queue.select"
    on public.send_queue for select
    using (public.can_view_campaign(campaign_id));
    
    drop policy if exists "send_queue.update" on public.send_queue;
    create policy "send_queue.update"
    on public.send_queue for update
    using (public.can_edit_campaign(campaign_id))
    with check (public.can_edit_campaign(campaign_id));
  end if;
end $$;

-- sequences (if exists and has campaign_id)
do $$
begin
  if exists (
    select 1 from information_schema.tables t
    join information_schema.columns c on c.table_name = t.table_name
    where t.table_schema = 'public' and t.table_name = 'sequences' and c.column_name = 'campaign_id'
  ) then
    alter table public.sequences enable row level security;
    
    drop policy if exists "sequences.select" on public.sequences;
    create policy "sequences.select"
    on public.sequences for select
    using (public.can_view_campaign(campaign_id));
    
    drop policy if exists "sequences.insert" on public.sequences;
    create policy "sequences.insert"
    on public.sequences for insert
    with check (public.can_edit_campaign(campaign_id));
    
    drop policy if exists "sequences.update" on public.sequences;
    create policy "sequences.update"
    on public.sequences for update
    using (public.can_edit_campaign(campaign_id))
    with check (public.can_edit_campaign(campaign_id));
    
    drop policy if exists "sequences.delete" on public.sequences;
    create policy "sequences.delete"
    on public.sequences for delete
    using (public.can_edit_campaign(campaign_id));
  end if;
end $$;

-- steps (if exists and has campaign_id)
do $$
begin
  if exists (
    select 1 from information_schema.tables t
    join information_schema.columns c on c.table_name = t.table_name
    where t.table_schema = 'public' and t.table_name = 'steps' and c.column_name = 'campaign_id'
  ) then
    alter table public.steps enable row level security;
    
    drop policy if exists "steps.select" on public.steps;
    create policy "steps.select"
    on public.steps for select
    using (public.can_view_campaign(campaign_id));
    
    drop policy if exists "steps.insert" on public.steps;
    create policy "steps.insert"
    on public.steps for insert
    with check (public.can_edit_campaign(campaign_id));
    
    drop policy if exists "steps.update" on public.steps;
    create policy "steps.update"
    on public.steps for update
    using (public.can_edit_campaign(campaign_id))
    with check (public.can_edit_campaign(campaign_id));
    
    drop policy if exists "steps.delete" on public.steps;
    create policy "steps.delete"
    on public.steps for delete
    using (public.can_edit_campaign(campaign_id));
  end if;
end $$;

-- templates (if exists and has campaign_id)
do $$
begin
  if exists (
    select 1 from information_schema.tables t
    join information_schema.columns c on c.table_name = t.table_name
    where t.table_schema = 'public' and t.table_name = 'templates' and c.column_name = 'campaign_id'
  ) then
    alter table public.templates enable row level security;
    
    drop policy if exists "templates.select" on public.templates;
    create policy "templates.select"
    on public.templates for select
    using (public.can_view_campaign(campaign_id));
    
    drop policy if exists "templates.insert" on public.templates;
    create policy "templates.insert"
    on public.templates for insert
    with check (public.can_edit_campaign(campaign_id));
    
    drop policy if exists "templates.update" on public.templates;
    create policy "templates.update"
    on public.templates for update
    using (public.can_edit_campaign(campaign_id))
    with check (public.can_edit_campaign(campaign_id));
    
    drop policy if exists "templates.delete" on public.templates;
    create policy "templates.delete"
    on public.templates for delete
    using (public.can_edit_campaign(campaign_id));
  end if;
end $$;

