-- Campaign members & invites schema / policies / RPCs
-- Idempotent so it can be rerun safely in Supabase SQL editor.

-- A) Role enum (if not already present)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_role') then
    create type public.campaign_role as enum ('viewer','editor','owner');
  end if;
end$$;


-- B) Members table
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.campaign_role not null default 'viewer',
  unique (campaign_id, user_id)
);

create index if not exists idx_cmembers_campaign on public.campaign_members(campaign_id);
create index if not exists idx_cmembers_user on public.campaign_members(user_id);


-- C) Invites table
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  role public.campaign_role not null default 'viewer',
  token text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  canceled_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days')
);

create index if not exists idx_cinvites_campaign on public.campaign_invites(campaign_id);
create index if not exists idx_cinvites_email on public.campaign_invites(email);


-- D) Row level security
alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;

drop policy if exists "cm_read" on public.campaign_members;
create policy "cm_read" on public.campaign_members
  for select to authenticated
  using (public.is_campaign_viewer(campaign_id));

drop policy if exists "cm_write" on public.campaign_members;
create policy "cm_write" on public.campaign_members
  for insert to authenticated
  with check (
    public.is_campaign_owner(campaign_id)
    or public.is_campaign_editor(campaign_id)
  );

drop policy if exists "cm_update" on public.campaign_members;
create policy "cm_update" on public.campaign_members
  for update to authenticated
  using (public.is_campaign_owner(campaign_id))
  with check (public.is_campaign_owner(campaign_id));

drop policy if exists "cm_delete" on public.campaign_members;
create policy "cm_delete" on public.campaign_members
  for delete to authenticated
  using (public.is_campaign_owner(campaign_id));

drop policy if exists "ci_read" on public.campaign_invites;
create policy "ci_read" on public.campaign_invites
  for select to authenticated
  using (
    public.is_campaign_viewer(campaign_id)
    or (email = auth.jwt()->>'email')
  );

drop policy if exists "ci_insert" on public.campaign_invites;
create policy "ci_insert" on public.campaign_invites
  for insert to authenticated
  with check (
    public.is_campaign_owner(campaign_id)
    or public.is_campaign_editor(campaign_id)
  );

drop policy if exists "ci_update" on public.campaign_invites;
create policy "ci_update" on public.campaign_invites
  for update to authenticated
  using (
    public.is_campaign_owner(campaign_id)
    or public.is_campaign_editor(campaign_id)
  )
  with check (
    public.is_campaign_owner(campaign_id)
    or public.is_campaign_editor(campaign_id)
  );


-- E) Guardrail helper: cap active pending invites
create or replace function public.can_create_invite(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select (
    select count(*)
    from public.campaign_invites
    where campaign_id = p_campaign
      and accepted_at is null
      and canceled_at is null
      and expires_at > now()
  ) < 50;
$$;


-- F) RPC: accept invite
create or replace function public.accept_campaign_invite(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_user uuid;
  v_before_role public.campaign_role;
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

  select role
    into v_before_role
    from public.campaign_members
   where campaign_id = v_inv.campaign_id
     and user_id = v_user;

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

  perform public.log_campaign_event(
    v_inv.campaign_id,
    'invite_accepted',
    v_user,
    v_inv.id,
    jsonb_build_object(
      'prev_role', coalesce(v_before_role::text, 'none'),
      'accepted_role', v_inv.role::text,
      'email', v_inv.email
    )
  );

  return true;
end;
$$;


-- G) RPC: create invite
create or replace function public.create_campaign_invite(
  p_campaign uuid,
  p_email text,
  p_role public.campaign_role
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_tok text;
begin
  if not (
    public.is_campaign_owner(p_campaign)
    or public.is_campaign_editor(p_campaign)
  ) then
    raise exception 'not authorized';
  end if;

  if not public.can_create_invite(p_campaign) then
    raise exception 'too_many_pending_invites';
  end if;

  v_tok := encode(gen_random_bytes(24), 'hex');

  insert into public.campaign_invites (campaign_id, email, role, token, invited_by)
  values (p_campaign, trim(lower(p_email)), p_role, v_tok, auth.uid())
  returning id into v_id;

  perform public.log_campaign_event(
    p_campaign,
    'invite_created',
    null,
    v_id,
    jsonb_build_object('email', trim(lower(p_email)), 'role', p_role::text)
  );

  return v_id;
end;
$$;


-- H) RPC: cancel invite
create or replace function public.cancel_campaign_invite(p_invite uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
begin
  select campaign_id
    into v_campaign
    from public.campaign_invites
   where id = p_invite;

  if v_campaign is null then
    return false;
  end if;

  if not (
    public.is_campaign_owner(v_campaign)
    or public.is_campaign_editor(v_campaign)
  ) then
    return false;
  end if;

  update public.campaign_invites
     set canceled_at = now()
   where id = p_invite;

  perform public.log_campaign_event(
    v_campaign,
    'invite_canceled',
    null,
    p_invite,
    '{}'::jsonb
  );

  return true;
end;
$$;


