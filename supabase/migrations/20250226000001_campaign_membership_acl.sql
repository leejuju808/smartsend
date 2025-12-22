-- Campaign Membership Model, Helpers, and ACL Views
-- This migration creates the membership system with owner/editor/viewer roles

-- A) Campaign membership table (upgrade existing or create new)
-- First, migrate existing 'sender' role to 'editor' if needed
do $$
begin
  -- Update existing campaign_members to use 'editor' instead of 'sender'
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'campaign_members' and column_name = 'role'
  ) then
    -- Update sender role to editor
    update public.campaign_members set role = 'editor' where role = 'sender';
    -- Drop old constraint if it exists
    alter table public.campaign_members drop constraint if exists campaign_members_role_check;
  end if;
end $$;

-- Create or alter table to ensure correct structure
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  unique (campaign_id, user_id)
);

create index if not exists idx_camp_members_campaign on public.campaign_members(campaign_id);
create index if not exists idx_camp_members_user on public.campaign_members(user_id);

-- B) Ensure campaigns keep single canonical owner row
-- (if campaigns already have campaigns.user_id as owner, mirror it into campaign_members)
insert into public.campaign_members (campaign_id, user_id, role)
select c.id, c.user_id, 'owner'
from public.campaigns c
left join public.campaign_members m on m.campaign_id = c.id and m.role = 'owner'
where m.id is null and c.user_id is not null
on conflict (campaign_id, user_id) do nothing;

-- C) Helpers to check permissions (create functions first, before view)
create or replace function public.role_rank(p_role text) returns int
language sql immutable as $$
  select case p_role
    when 'owner'  then 3
    when 'editor' then 2
    when 'viewer' then 1
    else 0 end;
$$;

-- D) ACL view: one row per (campaign,user) with the highest role
-- Note: We use role_rank function to properly determine highest role
create or replace view public.v_campaign_acl as
select
  cm.campaign_id,
  cm.user_id,
  case 
    when max(public.role_rank(cm.role)) >= 3 then 'owner'
    when max(public.role_rank(cm.role)) >= 2 then 'editor'
    when max(public.role_rank(cm.role)) >= 1 then 'viewer'
    else null
  end as role
from public.campaign_members cm
group by cm.campaign_id, cm.user_id;

create or replace function public.has_campaign_role(p_campaign uuid, p_min_role text)
returns boolean
language sql stable as $$
  select coalesce(max(public.role_rank(cm.role)),0) >= public.role_rank(p_min_role)
  from public.campaign_members cm
  where cm.campaign_id = p_campaign and cm.user_id = auth.uid();
$$;

-- E) Convenience predicates (uses role_rank function from C)
create or replace function public.can_view_campaign(p_campaign uuid)
returns boolean language sql stable as $$
  select public.has_campaign_role(p_campaign, 'viewer');
$$;

create or replace function public.can_edit_campaign(p_campaign uuid)
returns boolean language sql stable as $$
  select public.has_campaign_role(p_campaign, 'editor');
$$;

create or replace function public.is_owner_campaign(p_campaign uuid)
returns boolean language sql stable as $$
  select public.has_campaign_role(p_campaign, 'owner');
$$;

