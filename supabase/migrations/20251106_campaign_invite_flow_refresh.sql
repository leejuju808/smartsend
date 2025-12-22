-- Campaign invite flow refresh (idempotent)
-- Aligns campaign invite schema, helpers, policies, and RPCs

-- A) Ensure campaign_members base table exists (matches earlier migrations)
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

-- B) Membership helper with explicit user/role controls
create or replace function public.is_campaign_member(
  p_campaign uuid,
  p_user uuid,
  p_roles text[] default array['owner','editor','viewer']
) returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign
      and cm.user_id = p_user
      and cm.role = any(p_roles)
  );
$$;

-- Backwards-compatible overload that defaults to auth.uid()
create or replace function public.is_campaign_member(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select public.is_campaign_member(p_campaign, auth.uid(), array['owner','editor','viewer']);
$$;

-- C) Campaign invites table adjustments
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  email citext not null,
  role text not null check (role in ('editor','viewer')),
  token text not null,
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '72 hours'),
  accepted_at timestamptz,
  unique (campaign_id, email, status)
);

-- If the table already existed with legacy columns, align them
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_invites'
      and column_name = 'inviter_id'
  ) then
    alter table public.campaign_invites
      rename column inviter_id to invited_by;
  end if;
end$$;

alter table public.campaign_invites
  drop constraint if exists campaign_invites_campaign_id_email_key;

alter table public.campaign_invites
  alter column invited_by drop not null;

alter table public.campaign_invites
  drop constraint if exists campaign_invites_inviter_id_fkey;

alter table public.campaign_invites
  drop constraint if exists campaign_invites_invited_by_fkey;

alter table public.campaign_invites
  add constraint campaign_invites_invited_by_fkey
    foreign key (invited_by) references auth.users(id) on delete set null;

alter table public.campaign_invites
  add column if not exists updated_at timestamptz not null default now();

alter table public.campaign_invites
  add column if not exists status text not null default 'pending';

alter table public.campaign_invites
  add column if not exists expires_at timestamptz not null default (now() + interval '72 hours');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaign_invites_status_check'
      and conrelid = 'public.campaign_invites'::regclass
  ) then
    alter table public.campaign_invites
      add constraint campaign_invites_status_check
        check (status in ('pending','accepted','revoked','expired'));
  end if;
end$$;

-- Update legacy records with new defaults
update public.campaign_invites
set
  status = case
    when status in ('pending','accepted','revoked','expired') then status
    when accepted_at is not null then 'accepted'
    else 'pending'
  end,
  expires_at = coalesce(expires_at, created_at + interval '72 hours'),
  updated_at = coalesce(updated_at, now())
where status is null
   or expires_at is null
   or updated_at is null;

update public.campaign_invites
set status = 'accepted'
where accepted_at is not null
  and status <> 'accepted';

create unique index if not exists ux_invites_active
  on public.campaign_invites(campaign_id, email)
  where status = 'pending';

create index if not exists idx_invites_token on public.campaign_invites(token);
create index if not exists idx_invites_campaign on public.campaign_invites(campaign_id);

-- D) Row Level Security for invites
alter table public.campaign_invites enable row level security;

drop policy if exists invites_select_member on public.campaign_invites;
create policy invites_select_member on public.campaign_invites
  for select using (
    public.is_campaign_member(campaign_id, auth.uid(), array['owner','editor','viewer'])
  );

drop policy if exists invites_insert_editor on public.campaign_invites;
create policy invites_insert_editor on public.campaign_invites
  for insert with check (
    public.is_campaign_member(campaign_id, auth.uid(), array['owner','editor'])
  );

drop policy if exists invites_update_editor on public.campaign_invites;
create policy invites_update_editor on public.campaign_invites
  for update using (
    public.is_campaign_member(campaign_id, auth.uid(), array['owner','editor'])
  );

drop policy if exists invites_delete_owner on public.campaign_invites;
create policy invites_delete_owner on public.campaign_invites
  for delete using (
    public.is_campaign_member(campaign_id, auth.uid(), array['owner'])
  );

-- Optional campaign select policy for members (create only if absent)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'campaigns'
      and policyname = 'campaigns_select_member'
  ) then
    create policy campaigns_select_member on public.campaigns
      for select using (
        public.is_campaign_member(id, auth.uid(), array['owner','editor','viewer'])
        or user_id = auth.uid()
      );
  end if;
end$$;

-- E) RPC helpers --------------------------------------------------------------
drop function if exists public.create_campaign_invite(uuid, citext, text);
drop function if exists public.create_campaign_invite(uuid, citext, text, interval);
drop function if exists public.create_campaign_invite(uuid, text, text);
drop function if exists public.create_campaign_invite(uuid, text, text, interval);
drop function if exists public.accept_invite(text);
drop function if exists public.invite_member(uuid, citext, text);
drop function if exists public.invite_member(uuid, text, text);
drop function if exists public.accept_campaign_invite(text);
drop function if exists public.set_member_role(uuid, uuid, text);
drop function if exists public.remove_member(uuid, uuid);

create or replace function public.create_campaign_invite(
  p_campaign uuid,
  p_email text,
  p_role text  -- 'editor' | 'viewer'
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_inviter uuid := auth.uid();
  v_role text := lower(p_role);
begin
  if v_inviter is null then
    raise exception 'auth required';
  end if;

  if v_role not in ('editor','viewer') then
    raise exception 'invalid role';
  end if;

  if not public.is_campaign_member(p_campaign, v_inviter, array['owner','editor']) then
    raise exception 'not allowed';
  end if;

  insert into public.campaign_invites(
    campaign_id,
    invited_by,
    email,
    role,
    token,
    status,
    expires_at,
    updated_at
  )
  values (
    p_campaign,
    v_inviter,
    lower(p_email),
    v_role,
    v_token,
    'pending',
    now() + interval '72 hours',
    now()
  )
  on conflict (campaign_id, email) where (status = 'pending')
  do update set
    token = excluded.token,
    role = excluded.role,
    invited_by = excluded.invited_by,
    status = 'pending',
    expires_at = excluded.expires_at,
    updated_at = now();

  return v_token;
end;
$$;

revoke all on function public.create_campaign_invite(uuid,text,text) from public;
grant execute on function public.create_campaign_invite(uuid,text,text) to authenticated, service_role;

create or replace function public.accept_campaign_invite(
  p_token text
) returns uuid  -- campaign_id
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.campaign_invites%rowtype;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'auth required';
  end if;

  select *
  into v_inv
  from public.campaign_invites
  where token = p_token
    and status = 'pending'
    and now() < expires_at
  limit 1;

  if not found then
    raise exception 'invalid or expired token';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_inv.campaign_id, v_user, v_inv.role)
  on conflict (campaign_id, user_id) do update
    set role = excluded.role;

  update public.campaign_invites
     set status = 'accepted',
         updated_at = now()
   where id = v_inv.id;

  return v_inv.campaign_id;
end;
$$;

revoke all on function public.accept_campaign_invite(text) from public;
grant execute on function public.accept_campaign_invite(text) to authenticated, service_role;

create or replace function public.set_campaign_member_role(
  p_campaign uuid,
  p_user uuid,
  p_role text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := lower(p_role);
begin
  if v_actor is null then
    raise exception 'auth required';
  end if;

  if v_role not in ('owner','editor','viewer') then
    raise exception 'invalid role';
  end if;

  if v_role = 'owner' then
    if not public.is_campaign_member(p_campaign, v_actor, array['owner']) then
      raise exception 'only owner can assign owner';
    end if;
  else
    if not public.is_campaign_member(p_campaign, v_actor, array['owner','editor']) then
      raise exception 'not allowed';
    end if;
  end if;

  update public.campaign_members
     set role = v_role
   where campaign_id = p_campaign
     and user_id = p_user;
end;
$$;

revoke all on function public.set_campaign_member_role(uuid,uuid,text) from public;
grant execute on function public.set_campaign_member_role(uuid,uuid,text) to authenticated, service_role;

create or replace function public.remove_campaign_member(
  p_campaign uuid,
  p_user uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_campaign_member(p_campaign, auth.uid(), array['owner','editor']) then
    raise exception 'not allowed';
  end if;

  delete from public.campaign_members
   where campaign_id = p_campaign
     and user_id = p_user
     and role <> 'owner';
end;
$$;

revoke all on function public.remove_campaign_member(uuid,uuid) from public;
grant execute on function public.remove_campaign_member(uuid,uuid) to authenticated, service_role;











