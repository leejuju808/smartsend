-- RPC Functions for Campaign Membership Management
-- Invite, accept, change role, remove, transfer ownership

-- Invite a user by id (you can map email->id in API layer)
create or replace function public.add_campaign_member(
  p_campaign uuid,
  p_user uuid,
  p_role text
) returns void
language plpgsql
security definer
as $$
begin
  if not public.is_owner_campaign(p_campaign) then
    raise exception 'Only owners can add members';
  end if;
  if p_role not in ('editor','viewer') then
    raise exception 'Invalid role';
  end if;
  insert into public.campaign_members (campaign_id, user_id, role)
  values (p_campaign, p_user, p_role)
  on conflict (campaign_id, user_id) do update set role = excluded.role;
end $$;

-- Change role
create or replace function public.change_campaign_member_role(
  p_campaign uuid,
  p_user uuid,
  p_role text
) returns void
language plpgsql
security definer
as $$
begin
  if not public.is_owner_campaign(p_campaign) then
    raise exception 'Only owners can change roles';
  end if;
  if p_role not in ('editor','viewer') then
    raise exception 'Invalid role';
  end if;
  update public.campaign_members
  set role = p_role
  where campaign_id = p_campaign and user_id = p_user;
end $$;

-- Remove member
create or replace function public.remove_campaign_member(
  p_campaign uuid,
  p_user uuid
) returns void
language plpgsql
security definer
as $$
begin
  if not public.is_owner_campaign(p_campaign) then
    raise exception 'Only owners can remove members';
  end if;
  delete from public.campaign_members
  where campaign_id = p_campaign and user_id = p_user and role <> 'owner';
end $$;

-- Transfer ownership (to an existing member or new user)
create or replace function public.transfer_campaign_ownership(
  p_campaign uuid,
  p_new_owner uuid
) returns void
language plpgsql
security definer
as $$
begin
  if not public.is_owner_campaign(p_campaign) then
    raise exception 'Only current owner can transfer';
  end if;

  -- demote current owner to editor
  update public.campaign_members
  set role = 'editor'
  where campaign_id = p_campaign and role = 'owner' and user_id = auth.uid();

  -- upsert new owner
  insert into public.campaign_members (campaign_id, user_id, role)
  values (p_campaign, p_new_owner, 'owner')
  on conflict (campaign_id, user_id) do update set role = 'owner';

  -- keep campaigns.user_id in sync (optional but nice)
  update public.campaigns set user_id = p_new_owner where id = p_campaign;
end $$;

