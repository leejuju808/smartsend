-- Campaign members, invites, policies, views, and RPCs (idempotent)

-- A) Members table -----------------------------------------------------------
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

-- Ensure each campaign has an owner member mirrored from campaigns.user_id
create or replace function public.ensure_owner_member()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.campaign_members(campaign_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (campaign_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_campaign_owner_member on public.campaigns;
create trigger trg_campaign_owner_member
after insert on public.campaigns
for each row execute function public.ensure_owner_member();

-- B) Invites table -----------------------------------------------------------
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  role text not null check (role in ('editor','viewer')),
  token text not null,
  accepted_at timestamptz,
  unique (campaign_id, email)
);

create index if not exists idx_invites_campaign on public.campaign_invites(campaign_id);
create index if not exists idx_invites_email on public.campaign_invites(email);

-- C) Row level security ------------------------------------------------------
alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;

-- Clean up legacy policies so new named policies can be created idempotently
drop policy if exists members_select on public.campaign_members;
drop policy if exists members_owner_manage on public.campaign_members;
drop policy if exists members_owner_delete on public.campaign_members;
drop policy if exists members_read on public.campaign_members;
drop policy if exists members_insert on public.campaign_members;
drop policy if exists members_update on public.campaign_members;
drop policy if exists members_delete on public.campaign_members;

drop policy if exists invites_select on public.campaign_invites;
drop policy if exists invites_owner_manage on public.campaign_invites;
drop policy if exists invites_read on public.campaign_invites;
drop policy if exists invites_insert on public.campaign_invites;
drop policy if exists invites_update on public.campaign_invites;
drop policy if exists invites_delete on public.campaign_invites;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'members view by participants'
      and schemaname = 'public'
      and tablename = 'campaign_members'
  ) then
    create policy "members view by participants" on public.campaign_members
      for select using (
        exists (
          select 1
          from public.campaigns c
          where c.id = campaign_members.campaign_id
            and (
              c.user_id = auth.uid()
              or exists (
                select 1
                from public.campaign_members m
                where m.campaign_id = campaign_members.campaign_id
                  and m.user_id = auth.uid()
              )
            )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'members manage by owner'
      and schemaname = 'public'
      and tablename = 'campaign_members'
  ) then
    create policy "members manage by owner" on public.campaign_members
      for insert with check (
        exists (
          select 1 from public.campaigns c
          where c.id = campaign_members.campaign_id
            and c.user_id = auth.uid()
        )
      )
      ,for update using (
        exists (
          select 1 from public.campaigns c
          where c.id = campaign_members.campaign_id
            and c.user_id = auth.uid()
        )
      )
      ,for delete using (
        exists (
          select 1 from public.campaigns c
          where c.id = campaign_members.campaign_id
            and c.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'invites owner select'
      and schemaname = 'public'
      and tablename = 'campaign_invites'
  ) then
    create policy "invites owner select" on public.campaign_invites
      for select using (
        exists (
          select 1 from public.campaigns c
          where c.id = campaign_invites.campaign_id
            and c.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'invites owner insert'
      and schemaname = 'public'
      and tablename = 'campaign_invites'
  ) then
    create policy "invites owner insert" on public.campaign_invites
      for insert with check (
        exists (
          select 1 from public.campaigns c
          where c.id = campaign_invites.campaign_id
            and c.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'invites owner delete'
      and schemaname = 'public'
      and tablename = 'campaign_invites'
  ) then
    create policy "invites owner delete" on public.campaign_invites
      for delete using (
        exists (
          select 1 from public.campaigns c
          where c.id = campaign_invites.campaign_id
            and c.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- D) Views -------------------------------------------------------------------
drop view if exists public.v_campaign_members;
create view public.v_campaign_members as
select
  m.campaign_id,
  m.user_id,
  m.role,
  m.created_at,
  u.email as user_email
from public.campaign_members m
join auth.users u on u.id = m.user_id;

-- E) RPCs --------------------------------------------------------------------
drop function if exists public.create_campaign_invite(uuid, citext, text);
drop function if exists public.invite_member(uuid, citext, text);
drop function if exists public.accept_campaign_invite(text);
drop function if exists public.accept_invite(text);
drop function if exists public.update_member_role(uuid, uuid, text);
drop function if exists public.set_member_role(uuid, uuid, text);

create or replace function public.invite_member(p_campaign uuid, p_email citext, p_role text)
returns table(id uuid, token text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_token text;
  v_id uuid;
begin
  if not exists (
    select 1 from public.campaigns c
    where c.id = p_campaign and c.user_id = auth.uid()
  ) then
    raise exception 'Forbidden';
  end if;

  if p_role not in ('editor','viewer') then
    raise exception 'Invalid role';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  delete from public.campaign_invites
  where campaign_id = p_campaign
    and email = p_email
    and accepted_at is null;

  insert into public.campaign_invites(campaign_id, inviter_id, email, role, token)
  values (p_campaign, auth.uid(), p_email, p_role, v_token)
  returning id into v_id;

  return query
    select v_id, v_token;
end;
$$;

create or replace function public.accept_invite(p_token text)
returns table(campaign_id uuid, role text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_inv record;
begin
  select * into v_inv
  from public.campaign_invites
  where token = p_token
    and accepted_at is null
  limit 1;

  if not found then
    raise exception 'Invalid or used invite';
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.campaign_members(campaign_id, user_id, role)
  values (v_inv.campaign_id, auth.uid(), v_inv.role)
  on conflict (campaign_id, user_id)
  do update set role = excluded.role;

  update public.campaign_invites
  set accepted_at = now()
  where id = v_inv.id;

  return query
    select v_inv.campaign_id, v_inv.role;
end;
$$;

create or replace function public.set_member_role(p_campaign uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists (
    select 1 from public.campaigns c
    where c.id = p_campaign and c.user_id = auth.uid()
  ) then
    raise exception 'Forbidden';
  end if;

  if p_role not in ('editor','viewer') then
    raise exception 'Invalid role';
  end if;

  update public.campaign_members
  set role = p_role
  where campaign_id = p_campaign
    and user_id = p_user;
end;
$$;

create or replace function public.remove_member(p_campaign uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner_count integer;
  v_is_owner boolean;
begin
  if not exists (
    select 1 from public.campaigns c
    where c.id = p_campaign and c.user_id = auth.uid()
  ) then
    raise exception 'Forbidden';
  end if;

  select role = 'owner' into v_is_owner
  from public.campaign_members
  where campaign_id = p_campaign
    and user_id = p_user;

  if v_is_owner then
    select count(*) into v_owner_count
    from public.campaign_members
    where campaign_id = p_campaign
      and role = 'owner';

    if v_owner_count <= 1 then
      raise exception 'Cannot remove the last owner';
    end if;
  end if;

  delete from public.campaign_members
  where campaign_id = p_campaign
    and user_id = p_user;
end;
$$;

