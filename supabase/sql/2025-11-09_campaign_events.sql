-- Campaign events log, guardrails, and logging RPCs (idempotent)

-- A) Event type enum ----------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_event_type') then
    create type public.campaign_event_type as enum (
      'invite_created',
      'invite_canceled',
      'invite_accepted',
      'member_role_changed',
      'member_removed'
    );
  end if;
end$$;


-- B) Events table -------------------------------------------------------------
create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  type public.campaign_event_type not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  invite_id uuid references public.campaign_invites(id) on delete set null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_ce_campaign_created on public.campaign_events (campaign_id, created_at desc);
create index if not exists idx_ce_type on public.campaign_events (type);


-- C) Row level security -------------------------------------------------------
alter table public.campaign_events enable row level security;

drop policy if exists "ce_read" on public.campaign_events;
create policy "ce_read" on public.campaign_events
  for select to authenticated
  using (public.is_campaign_viewer(campaign_id));


-- D) Logging RPC --------------------------------------------------------------
create or replace function public.log_campaign_event(
  p_campaign uuid,
  p_type public.campaign_event_type,
  p_target_user uuid default null,
  p_invite uuid default null,
  p_meta jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (public.is_campaign_owner(p_campaign) or public.is_campaign_editor(p_campaign)) then
    raise exception 'not authorized';
  end if;

  insert into public.campaign_events (campaign_id, type, actor_user_id, target_user_id, invite_id, meta)
  values (
    p_campaign,
    p_type,
    auth.uid(),
    p_target_user,
    p_invite,
    coalesce(p_meta, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;


-- E) Pending invite guardrail -------------------------------------------------
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


-- F) Invite RPC updates -------------------------------------------------------
create or replace function public.create_campaign_invite(
  p_campaign uuid,
  p_email text,
  p_role public.campaign_role
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_tok text;
begin
  if not (public.is_campaign_owner(p_campaign) or public.is_campaign_editor(p_campaign)) then
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

  if not (public.is_campaign_owner(v_campaign) or public.is_campaign_editor(v_campaign)) then
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






