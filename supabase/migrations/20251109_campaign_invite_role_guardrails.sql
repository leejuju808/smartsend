-- Campaign invite role guardrails and helpers
-- Idempotent migration adding role ranking helper, safe invite accept, and ownership protections.

-- H) Role ranking helper (so we can safely "upgrade" roles on accept)
create or replace function public.role_rank(r public.campaign_role)
returns int
language sql
immutable
as $$
  select case r
    when 'owner'  then 3
    when 'editor' then 2
    else 1
  end;
$$;


-- I) Fix accept: upgrade role by rank (do NOT use greatest() on enums)
create or replace function public.accept_campaign_invite(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_user uuid;
begin
  select *
    into v_inv
  from public.campaign_invites
  where token = p_token
    and accepted_at is null
    and canceled_at is null
    and expires_at > now();

  if v_inv is null then
    return false;
  end if;

  v_user := auth.uid();
  if v_user is null then
    return false;
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_inv.campaign_id, v_user, v_inv.role)
  on conflict (campaign_id, user_id) do update
    set role = case
      when public.role_rank(excluded.role) > public.role_rank(public.campaign_members.role)
        then excluded.role
      else public.campaign_members.role
    end;

  update public.campaign_invites
    set accepted_at = now()
  where id = v_inv.id;

  return true;
end;
$$;


-- J) Prevent removing/demoting the last owner of a campaign
create or replace function public.tg_prevent_losing_last_owner()
returns trigger
language plpgsql
as $$
declare
  owners_left int;
begin
  if TG_OP = 'DELETE' then
    if old.role = 'owner' then
      select count(*) into owners_left
      from public.campaign_members
      where campaign_id = old.campaign_id
        and role = 'owner'
        and user_id <> old.user_id;
      if owners_left = 0 then
        raise exception 'cannot remove the last owner';
      end if;
    end if;
    return old;
  elsif TG_OP = 'UPDATE' then
    if old.role = 'owner' and new.role <> 'owner' then
      select count(*) into owners_left
      from public.campaign_members
      where campaign_id = old.campaign_id
        and role = 'owner'
        and user_id <> old.user_id;
      if owners_left = 0 then
        raise exception 'cannot demote the last owner';
      end if;
    end if;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_cmembers_last_owner on public.campaign_members;
create trigger trg_cmembers_last_owner
before update of role or delete on public.campaign_members
for each row execute function public.tg_prevent_losing_last_owner();


-- K) Fast lookup for active invites (optional but helpful)
create index if not exists idx_cinvites_active
  on public.campaign_invites(campaign_id, email)
  where accepted_at is null and canceled_at is null and expires_at > now();




