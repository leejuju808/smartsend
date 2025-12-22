-- Campaign Members ACL, RLS, and Audit System
-- Fixes ACL view, secures campaign_members, adds audit trail, and RPC functions

-- 1) Role ranking helper function
create or replace function public.role_rank(r text)
returns integer
language sql immutable as $$
  select case r
    when 'owner' then 3
    when 'editor' then 2
    when 'viewer' then 1
    else 0
  end;
$$;

-- 2) Correct ACL view (pick highest-ranked role and expose as text)
-- Includes both campaign_members entries and implicit owners from campaigns.user_id
create or replace view public.v_campaign_acl as
with all_roles as (
  -- Explicit members from campaign_members
  select campaign_id, user_id, role from public.campaign_members
  union all
  -- Implicit owners from campaigns.user_id
  select id as campaign_id, user_id, 'owner'::text as role
  from public.campaigns
  where user_id is not null
),
ranked as (
  select
    campaign_id,
    user_id,
    max(public.role_rank(role)) as rank
  from all_roles
  group by 1,2
)
select
  campaign_id,
  user_id,
  case rank
    when 3 then 'owner'
    when 2 then 'editor'
    when 1 then 'viewer'
    else 'viewer'
  end as role
from ranked;

-- 3) RLS for campaign_members itself
alter table public.campaign_members enable row level security;

-- a) anyone who can view the campaign can see the member list
drop policy if exists cm_view on public.campaign_members;
create policy cm_view on public.campaign_members
for select using (public.can_view_campaign(campaign_id));

-- b) block direct writes (we'll mutate via SECURITY DEFINER RPCs)
-- (optional hard guard: only owners can directly write if someone bypasses your API)
drop policy if exists cm_write_guard on public.campaign_members;
create policy cm_write_guard on public.campaign_members
for insert with check (public.is_owner_campaign(campaign_id))
, for update using (public.is_owner_campaign(campaign_id))
with check (public.is_owner_campaign(campaign_id))
, for delete using (public.is_owner_campaign(campaign_id));

-- 4) Helpful indexes
create index if not exists idx_cm_campaign_role on public.campaign_members(campaign_id, role);
create index if not exists idx_cm_campaign_user_role on public.campaign_members(campaign_id, user_id, role);

-- 5) Lightweight audit trail
create table if not exists public.audit_campaign_members (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor uuid,                              -- auth.uid() at time of change (nullable for service)
  campaign_id uuid not null,
  target_user uuid not null,
  action text not null check (action in ('invite','role_change','remove','transfer')),
  old_role text,
  new_role text
);

create index if not exists idx_acm_campaign_at on public.audit_campaign_members(campaign_id, at desc);

-- 6) Audit helpers your RPCs can call
create or replace function public._audit_member(
  p_campaign uuid, p_target uuid, p_action text, p_old text, p_new text
) returns void
language sql security definer as $$
  insert into public.audit_campaign_members (actor, campaign_id, target_user, action, old_role, new_role)
  values (auth.uid(), p_campaign, p_target, p_action, p_old, p_new);
$$;

-- 7) Patch RPCs to write audit rows
create or replace function public.add_campaign_member(
  p_campaign uuid, p_user uuid, p_role text
) returns void
language plpgsql security definer as $$
declare v_old text;
begin
  if not public.is_owner_campaign(p_campaign) then
    raise exception 'Only owners can add members';
  end if;
  if p_role not in ('editor','viewer') then
    raise exception 'Invalid role';
  end if;

  select role into v_old from public.campaign_members
  where campaign_id = p_campaign and user_id = p_user;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (p_campaign, p_user, p_role)
  on conflict (campaign_id, user_id) do update set role = excluded.role;

  perform public._audit_member(p_campaign, p_user, 'invite', v_old, p_role);
end $$;

create or replace function public.change_campaign_member_role(
  p_campaign uuid, p_user uuid, p_role text
) returns void
language plpgsql security definer as $$
declare v_old text;
begin
  if not public.is_owner_campaign(p_campaign) then
    raise exception 'Only owners can change roles';
  end if;
  if p_role not in ('editor','viewer') then
    raise exception 'Invalid role';
  end if;

  select role into v_old from public.campaign_members
  where campaign_id = p_campaign and user_id = p_user;

  update public.campaign_members
  set role = p_role
  where campaign_id = p_campaign and user_id = p_user;

  perform public._audit_member(p_campaign, p_user, 'role_change', v_old, p_role);
end $$;

create or replace function public.remove_campaign_member(
  p_campaign uuid, p_user uuid
) returns void
language plpgsql security definer as $$
declare v_old text;
begin
  if not public.is_owner_campaign(p_campaign) then
    raise exception 'Only owners can remove members';
  end if;

  select role into v_old from public.campaign_members
  where campaign_id = p_campaign and user_id = p_user;

  delete from public.campaign_members
  where campaign_id = p_campaign and user_id = p_user and role <> 'owner';

  perform public._audit_member(p_campaign, p_user, 'remove', v_old, null);
end $$;

create or replace function public.transfer_campaign_ownership(
  p_campaign uuid, p_new_owner uuid
) returns void
language plpgsql security definer as $$
declare v_old_owner uuid;
begin
  if not public.is_owner_campaign(p_campaign) then
    raise exception 'Only current owner can transfer';
  end if;

  select user_id into v_old_owner from public.campaign_members
  where campaign_id = p_campaign and role = 'owner' limit 1;

  update public.campaign_members
  set role = 'editor'
  where campaign_id = p_campaign and role = 'owner' and user_id = auth.uid();

  insert into public.campaign_members (campaign_id, user_id, role)
  values (p_campaign, p_new_owner, 'owner')
  on conflict (campaign_id, user_id) do update set role = 'owner';

  update public.campaigns set user_id = p_new_owner where id = p_campaign;

  perform public._audit_member(p_campaign, v_old_owner, 'transfer', 'owner', 'editor');
  perform public._audit_member(p_campaign, p_new_owner, 'transfer', 'editor', 'owner');
end $$;

