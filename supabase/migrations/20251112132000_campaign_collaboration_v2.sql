-- Campaign collaboration & activity system (idempotent)

-- A) Role enum ---------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_role') then
    create type public.campaign_role as enum ('owner','editor','viewer');
  end if;
end
$$;


-- B) Campaign members --------------------------------------------------------
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.campaign_role not null default 'viewer',
  unique (campaign_id, user_id)
);

alter table public.campaign_members
  alter column role type public.campaign_role using role::public.campaign_role,
  alter column role set not null,
  alter column role set default 'viewer';

create index if not exists idx_campaign_members_campaign on public.campaign_members(campaign_id);
create index if not exists idx_campaign_members_user on public.campaign_members(user_id);


-- C) Campaign invites --------------------------------------------------------
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  invited_email text not null,
  role public.campaign_role not null default 'viewer',
  token text not null,
  inviter_id uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  unique (campaign_id, invited_email)
);

-- Rename legacy columns if present
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_invites'
      and column_name = 'email'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_invites'
      and column_name = 'invited_email'
  ) then
    execute 'alter table public.campaign_invites rename column email to invited_email';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_invites'
      and column_name = 'invited_by'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_invites'
      and column_name = 'inviter_id'
  ) then
    execute 'alter table public.campaign_invites rename column invited_by to inviter_id';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_invites'
      and column_name = 'inviter_user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_invites'
      and column_name = 'inviter_id'
  ) then
    execute 'alter table public.campaign_invites rename column inviter_user_id to inviter_id';
  end if;
end
$$;

alter table public.campaign_invites
  add column if not exists invited_email text,
  add column if not exists role public.campaign_role,
  add column if not exists token text,
  add column if not exists inviter_id uuid references auth.users(id) on delete set null,
  add column if not exists accepted_by uuid references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists expires_at timestamptz not null default (now() + interval '14 days');

alter table public.campaign_invites
  alter column invited_email set not null,
  alter column role type public.campaign_role using role::public.campaign_role,
  alter column role set not null,
  alter column role set default 'viewer',
  alter column token set not null,
  alter column expires_at set default (now() + interval '14 days'),
  alter column inviter_id drop not null;

update public.campaign_invites
   set invited_email = lower(trim(invited_email))
 where invited_email is not null
   and invited_email <> lower(trim(invited_email));

-- Ensure unique constraint on (campaign_id, invited_email)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_invites'::regclass
      and contype = 'u'
      and conname = 'campaign_invites_campaign_email_key'
  ) then
    alter table public.campaign_invites
      add constraint campaign_invites_campaign_email_key unique (campaign_id, invited_email);
  end if;
end
$$;

-- Ensure token uniqueness for fast lookup
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_invites'::regclass
      and contype = 'u'
      and conname = 'campaign_invites_token_key'
  ) then
    alter table public.campaign_invites
      add constraint campaign_invites_token_key unique (token);
  end if;
end
$$;

create index if not exists idx_campaign_invites_campaign on public.campaign_invites(campaign_id, created_at desc);
create index if not exists idx_campaign_invites_email on public.campaign_invites(lower(invited_email));


-- D) Thread assignment -------------------------------------------------------
alter table public.inbox_threads
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

create index if not exists idx_threads_assigned on public.inbox_threads(assigned_to);


-- E) Activity events ---------------------------------------------------------
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor uuid references auth.users(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  kind text not null,
  subject_id uuid,
  meta jsonb default '{}'::jsonb
);

alter table public.activity_events
  add column if not exists actor uuid references auth.users(id) on delete set null,
  add column if not exists subject_id uuid,
  add column if not exists meta jsonb default '{}'::jsonb;

alter table public.activity_events
  alter column meta set default '{}'::jsonb,
  alter column created_at set default now();

create index if not exists idx_activity_campaign on public.activity_events(campaign_id, created_at desc);
create index if not exists idx_activity_kind on public.activity_events(kind, created_at desc);


-- F) Row level security ------------------------------------------------------
alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;
alter table public.activity_events  enable row level security;
alter table public.inbox_threads    enable row level security;
alter table public.campaigns        enable row level security;


-- Helper membership function -------------------------------------------------
create or replace function public.is_member(p_scope uuid)
returns boolean
language sql
stable
as $$
  select coalesce((
    select true
    from public.campaign_members cm
    where cm.campaign_id = p_scope
      and cm.user_id = auth.uid()
    limit 1
  ), (
    select true
    from public.project_members pm
    where pm.project_id = p_scope
      and pm.user_id = auth.uid()
    limit 1
  ), (
    select true
    from public.workspace_members wm
    where wm.workspace_id = p_scope
      and wm.user_id = auth.uid()
    limit 1
  ), false);
$$;


-- Policies -------------------------------------------------------------------
drop policy if exists "campaigns_ro_members" on public.campaigns;
create policy "campaigns_ro_members" on public.campaigns
for select
using ( public.is_member(id) );


drop policy if exists "members_ro" on public.campaign_members;
create policy "members_ro" on public.campaign_members
for select
using ( public.is_member(campaign_id) );

drop policy if exists "members_rw" on public.campaign_members;
create policy "members_rw" on public.campaign_members
for all
using (
  exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = campaign_id
      and me.user_id = auth.uid()
      and me.role in ('owner','editor')
  )
)
with check (
  case
    when exists (
      select 1
      from public.campaign_members me
      where me.campaign_id = campaign_id
        and me.user_id = auth.uid()
        and me.role = 'owner'
    ) then true
    else role in ('editor','viewer')
  end
);


drop policy if exists "invites_ro" on public.campaign_invites;
create policy "invites_ro" on public.campaign_invites
for select
using ( public.is_member(campaign_id) );

drop policy if exists "invites_create" on public.campaign_invites;
create policy "invites_create" on public.campaign_invites
for insert
with check (
  exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = campaign_id
      and me.user_id = auth.uid()
      and me.role in ('owner','editor')
  )
);

drop policy if exists "invites_update_accept" on public.campaign_invites;
create policy "invites_update_accept" on public.campaign_invites
for update
using ( true )
with check (
  (accepted_by = auth.uid())
  or exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = campaign_id
      and me.user_id = auth.uid()
      and me.role = 'owner'
  )
);


drop policy if exists "activity_ro" on public.activity_events;
create policy "activity_ro" on public.activity_events
for select
using ( public.is_member(campaign_id) );


drop policy if exists "threads_ro" on public.inbox_threads;
create policy "threads_ro" on public.inbox_threads
for select
using ( public.is_member(campaign_id) );

drop policy if exists "threads_update_assign" on public.inbox_threads;
create policy "threads_update_assign" on public.inbox_threads
for update
using ( public.is_member(campaign_id) )
with check ( public.is_member(campaign_id) );


-- G) Helper functions & RPCs -------------------------------------------------
create or replace function public.rand_token()
returns text
language sql
immutable
as $$
  select encode(gen_random_bytes(16),'hex');
$$;


drop function if exists public.invite_member(uuid, text, public.campaign_role);
create or replace function public.invite_member(
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
  v_email text;
  v_role public.campaign_role;
  v_token text;
  v_id uuid;
begin
  v_email := lower(trim(p_email));
  v_role := coalesce(p_role, 'viewer');

  if not exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = p_campaign
      and me.user_id = auth.uid()
      and me.role in ('owner','editor')
  ) then
    raise exception 'not authorized';
  end if;

  v_token := public.rand_token();

  insert into public.campaign_invites (campaign_id, invited_email, role, token, inviter_id)
  values (p_campaign, v_email, v_role, v_token, auth.uid())
  on conflict (campaign_id, invited_email) do update
    set role = excluded.role,
        token = excluded.token,
        inviter_id = excluded.inviter_id,
        created_at = now(),
        expires_at = now() + interval '14 days',
        accepted_by = null,
        accepted_at = null
  returning id into v_id;

  insert into public.activity_events(actor, campaign_id, kind, subject_id, meta)
  values (auth.uid(), p_campaign, 'invite_sent', v_id, jsonb_build_object('email', v_email, 'role', v_role::text));

  return v_id;
end;
$$;

grant execute on function public.invite_member(uuid, text, public.campaign_role) to service_role;


drop function if exists public.accept_invite(text);
create or replace function public.accept_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.campaign_invites%rowtype;
  v_user uuid := auth.uid();
  v_role public.campaign_role;
begin
  if v_user is null then
    raise exception 'auth required';
  end if;

  select *
    into v_inv
  from public.campaign_invites
  where token = p_token
    and expires_at > now()
  limit 1;

  if not found then
    raise exception 'Invalid or expired invite';
  end if;

  v_role := v_inv.role;

  insert into public.campaign_members(campaign_id, user_id, role)
  values (v_inv.campaign_id, v_user, v_role)
  on conflict (campaign_id, user_id) do update
    set role = (
      case
        when public.campaign_members.role = 'owner' or excluded.role = 'owner' then 'owner'
        when public.campaign_members.role = 'editor' or excluded.role = 'editor' then 'editor'
        else 'viewer'
      end
    )::public.campaign_role;

  update public.campaign_invites
     set accepted_by = v_user,
         accepted_at = now()
   where id = v_inv.id;

  insert into public.activity_events(actor, campaign_id, kind, subject_id, meta)
  values (auth.uid(), v_inv.campaign_id, 'invite_accepted', v_inv.id, jsonb_build_object('email', v_inv.invited_email, 'role', v_role::text));
end;
$$;

grant execute on function public.accept_invite(text) to authenticated, service_role;


drop function if exists public.change_member_role(uuid, uuid, public.campaign_role);
create or replace function public.change_member_role(
  p_campaign uuid,
  p_user uuid,
  p_role public.campaign_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = p_campaign
      and me.user_id = auth.uid()
      and me.role = 'owner'
  ) then
    raise exception 'owner required';
  end if;

  update public.campaign_members
     set role = p_role
   where campaign_id = p_campaign
     and user_id = p_user;

  insert into public.activity_events(actor, campaign_id, kind, subject_id, meta)
  values (auth.uid(), p_campaign, 'role_changed', p_user, jsonb_build_object('role', p_role::text));
end;
$$;

grant execute on function public.change_member_role(uuid, uuid, public.campaign_role) to authenticated, service_role;


drop function if exists public.transfer_ownership(uuid, uuid);
create or replace function public.transfer_ownership(
  p_campaign uuid,
  p_new_owner uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = p_campaign
      and me.user_id = auth.uid()
      and me.role = 'owner'
  ) then
    raise exception 'owner required';
  end if;

  update public.campaign_members
     set role = 'editor'
   where campaign_id = p_campaign
     and user_id = auth.uid();

  update public.campaign_members
     set role = 'owner'
   where campaign_id = p_campaign
     and user_id = p_new_owner;

  insert into public.activity_events(actor, campaign_id, kind, subject_id, meta)
  values (auth.uid(), p_campaign, 'ownership_transferred', p_new_owner, '{}'::jsonb);
end;
$$;

grant execute on function public.transfer_ownership(uuid, uuid) to authenticated, service_role;


drop function if exists public.remove_member(uuid, uuid);
create or replace function public.remove_member(
  p_campaign uuid,
  p_user uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = p_campaign
      and me.user_id = auth.uid()
      and me.role = 'owner'
  ) then
    raise exception 'owner required';
  end if;

  delete from public.campaign_members
   where campaign_id = p_campaign
     and user_id = p_user;

  insert into public.activity_events(actor, campaign_id, kind, subject_id, meta)
  values (auth.uid(), p_campaign, 'role_changed', p_user, jsonb_build_object('removed', true));
end;
$$;

grant execute on function public.remove_member(uuid, uuid) to authenticated, service_role;


drop function if exists public.assign_thread(uuid, uuid);
create or replace function public.assign_thread(
  p_thread uuid,
  p_user uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_actor uuid := auth.uid();
begin
  select campaign_id
    into v_campaign
  from public.inbox_threads
  where id = p_thread;

  if v_campaign is null then
    raise exception 'thread not found';
  end if;

  if not public.is_member(v_campaign) then
    raise exception 'not authorized';
  end if;

  if p_user is not null and not exists (
    select 1
    from public.campaign_members
    where campaign_id = v_campaign
      and user_id = p_user
  ) then
    raise exception 'invalid assignee';
  end if;

  update public.inbox_threads
     set assigned_to = p_user
   where id = p_thread;

  insert into public.activity_events(actor, campaign_id, kind, subject_id, meta)
  values (
    v_actor,
    v_campaign,
    case when p_user is null then 'thread_unassigned' else 'thread_assigned' end,
    p_thread,
    jsonb_build_object('assignee', p_user)
  );
end;
$$;

grant execute on function public.assign_thread(uuid, uuid) to authenticated, service_role;


-- H) Activity notifications ---------------------------------------------------
create or replace function public.notify_activity()
returns trigger
language plpgsql
as $$
begin
  perform pg_notify('activity', row_to_json(new)::text);
  return new;
end;
$$;

drop trigger if exists trg_activity_notify on public.activity_events;
create trigger trg_activity_notify
after insert on public.activity_events
for each row execute function public.notify_activity();


