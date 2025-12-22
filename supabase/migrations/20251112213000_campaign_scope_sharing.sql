-- Campaign-scoped sharing, invites, and role/seat enforcement refresh
-- Implements membership, invite, RLS, and RPC logic per Block 24 alignment

create extension if not exists citext with schema public;
create extension if not exists pgcrypto;

-- Ensure campaign role enum exists with expected values
do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_role') then
    create type public.campaign_role as enum ('owner','editor','viewer');
  end if;
end
$$;

-- ======================================================================
-- A) Campaign members table shape (composite PK, role constraints)
-- ======================================================================

create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.campaign_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

-- Drop legacy surrogate id column if present
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_members'
      and column_name = 'id'
  ) then
    alter table public.campaign_members drop column id;
  end if;
exception
  when undefined_column then null;
end
$$;

alter table public.campaign_members
  alter column role type public.campaign_role using role::public.campaign_role,
  alter column role set default 'viewer';

create index if not exists idx_campaign_members_campaign on public.campaign_members(campaign_id);
create index if not exists idx_campaign_members_user on public.campaign_members(user_id);

-- ======================================================================
-- B) Campaign invites table (email tokens with seat guard)
-- ======================================================================

create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  invited_email citext not null,
  role public.campaign_role not null default 'viewer',
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz
);

alter table public.campaign_invites
  alter column invited_email type citext using lower(invited_email)::citext,
  alter column role type public.campaign_role using role::public.campaign_role,
  alter column role set default 'viewer',
  alter column token set not null,
  alter column expires_at set default (now() + interval '7 days');

-- Restrict invite roles to viewer/editor
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_invites'::regclass
      and conname = 'campaign_invites_role_check'
  ) then
    alter table public.campaign_invites
      add constraint campaign_invites_role_check
      check (role in ('viewer','editor'));
  end if;
end
$$;

create index if not exists idx_campaign_invites_campaign on public.campaign_invites(campaign_id);
create index if not exists idx_campaign_invites_email on public.campaign_invites(invited_email);

-- ======================================================================
-- C) Seat availability helper (reuses account_subscriptions + account_seat_usage)
-- ======================================================================

drop function if exists public.ensure_seat_available(uuid);
create or replace function public.ensure_seat_available(p_account uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  mode text;
  limit_seats int;
  used int;
begin
  select enforcement_mode, plan_seat_limit
    into mode, limit_seats
  from public.account_subscriptions
  where account_id = p_account;

  select seats_used
    into used
  from public.account_seat_usage
  where account_id = p_account;

  if mode = 'hard' and limit_seats is not null and coalesce(used, 0) >= limit_seats then
    return false;
  end if;

  return true;
end
$$;

grant execute on function public.ensure_seat_available(uuid) to authenticated;

-- ======================================================================
-- D) Helper view for current user's account roles
-- ======================================================================

create or replace view public.my_account_roles as
select
  tm.account_id,
  tm.user_id,
  tm.role as user_role
from public.team_members tm
where tm.user_id = auth.uid();

-- ======================================================================
-- E) Row level security policies for campaign members and invites
-- ======================================================================

alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;

-- Drop legacy policies if they exist
drop policy if exists "members_ro" on public.campaign_members;
drop policy if exists "members_rw" on public.campaign_members;
drop policy if exists "cmembers_select_member" on public.campaign_members;
drop policy if exists "cmembers_modify_owner" on public.campaign_members;
drop policy if exists "cmembers_delete_owner" on public.campaign_members;

drop policy if exists "invites_ro" on public.campaign_invites;
drop policy if exists "invites_create" on public.campaign_invites;
drop policy if exists "invites_update_accept" on public.campaign_invites;
drop policy if exists "cinv_select_owner_or_me" on public.campaign_invites;
drop policy if exists "cinv_insert_owner" on public.campaign_invites;
drop policy if exists "cinv_delete_owner" on public.campaign_invites;

create policy "cmembers_select_member"
on public.campaign_members
for select
using (
  exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = campaign_members.campaign_id
      and me.user_id = auth.uid()
  )
);

create policy "cmembers_insert_owner"
on public.campaign_members
for insert
with check (
  exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = campaign_members.campaign_id
      and me.user_id = auth.uid()
      and me.role = 'owner'
  )
  or exists (
    select 1
    from public.campaigns c
    join public.team_members tm
      on tm.account_id = c.account_id
    where c.id = campaign_members.campaign_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
);

create policy "cmembers_update_owner"
on public.campaign_members
for update
using (
  exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = campaign_members.campaign_id
      and me.user_id = auth.uid()
      and me.role = 'owner'
  )
  or exists (
    select 1
    from public.campaigns c
    join public.team_members tm
      on tm.account_id = c.account_id
    where c.id = campaign_members.campaign_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
)
with check (
  exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = campaign_members.campaign_id
      and me.user_id = auth.uid()
      and me.role = 'owner'
  )
  or exists (
    select 1
    from public.campaigns c
    join public.team_members tm
      on tm.account_id = c.account_id
    where c.id = campaign_members.campaign_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
);

create policy "cmembers_delete_owner"
on public.campaign_members
for delete
using (
  exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = campaign_members.campaign_id
      and me.user_id = auth.uid()
      and me.role = 'owner'
  )
  or exists (
    select 1
    from public.campaigns c
    join public.team_members tm
      on tm.account_id = c.account_id
    where c.id = campaign_members.campaign_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
);

create policy "cinv_select_owner_or_me"
on public.campaign_invites
for select
using (
  exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = campaign_invites.campaign_id
      and me.user_id = auth.uid()
      and me.role in ('owner','editor')
  )
  or exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = lower(campaign_invites.invited_email::text)
  )
);

create policy "cinv_insert_owner"
on public.campaign_invites
for insert
with check (
  exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = campaign_invites.campaign_id
      and me.user_id = auth.uid()
      and me.role = 'owner'
  )
);

create policy "cinv_delete_owner"
on public.campaign_invites
for delete
using (
  exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = campaign_invites.campaign_id
      and me.user_id = auth.uid()
      and me.role = 'owner'
  )
);

-- ======================================================================
-- F) Campaign-scoped table RLS patterns (read/write gates)
-- ======================================================================

do $$
begin
  -- Leads ---------------------------------------------------------------
  if to_regclass('public.leads') is not null then
    execute 'alter table public.leads enable row level security';
    execute 'drop policy if exists "leads_read_campaign_member" on public.leads';
    execute 'drop policy if exists "leads_write_editor" on public.leads';
    execute 'drop policy if exists "leads_update_editor" on public.leads';
    execute 'drop policy if exists "leads_delete_owner" on public.leads';

    execute $p$
      create policy "leads_read_campaign_member"
      on public.leads
      for select
      using (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = leads.campaign_id
            and cm.user_id = auth.uid()
        )
      );
    $p$;

    execute $p$
      create policy "leads_write_editor"
      on public.leads
      for insert
      with check (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = leads.campaign_id
            and cm.user_id = auth.uid()
            and cm.role in ('editor','owner')
        )
      );
    $p$;

    execute $p$
      create policy "leads_update_editor"
      on public.leads
      for update
      using (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = leads.campaign_id
            and cm.user_id = auth.uid()
            and cm.role in ('editor','owner')
        )
      );
    $p$;

    execute $p$
      create policy "leads_delete_owner"
      on public.leads
      for delete
      using (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = leads.campaign_id
            and cm.user_id = auth.uid()
            and cm.role = 'owner'
        )
      );
    $p$;
  end if;

  -- Campaign steps ------------------------------------------------------
  if to_regclass('public.campaign_steps') is not null then
    execute 'alter table public.campaign_steps enable row level security';
    execute 'drop policy if exists "campaign_steps_read_campaign_member" on public.campaign_steps';
    execute 'drop policy if exists "campaign_steps_write_editor" on public.campaign_steps';
    execute 'drop policy if exists "campaign_steps_update_editor" on public.campaign_steps';
    execute 'drop policy if exists "campaign_steps_delete_owner" on public.campaign_steps';

    execute $p$
      create policy "campaign_steps_read_campaign_member"
      on public.campaign_steps
      for select
      using (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = campaign_steps.campaign_id
            and cm.user_id = auth.uid()
        )
      );
    $p$;

    execute $p$
      create policy "campaign_steps_write_editor"
      on public.campaign_steps
      for insert
      with check (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = campaign_steps.campaign_id
            and cm.user_id = auth.uid()
            and cm.role in ('editor','owner')
        )
      );
    $p$;

    execute $p$
      create policy "campaign_steps_update_editor"
      on public.campaign_steps
      for update
      using (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = campaign_steps.campaign_id
            and cm.user_id = auth.uid()
            and cm.role in ('editor','owner')
        )
      );
    $p$;

    execute $p$
      create policy "campaign_steps_delete_owner"
      on public.campaign_steps
      for delete
      using (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = campaign_steps.campaign_id
            and cm.user_id = auth.uid()
            and cm.role = 'owner'
        )
      );
    $p$;
  end if;

  -- Step variants -------------------------------------------------------
  if to_regclass('public.step_variants') is not null then
    execute 'alter table public.step_variants enable row level security';
    execute 'drop policy if exists "step_variants_read_campaign_member" on public.step_variants';
    execute 'drop policy if exists "step_variants_write_editor" on public.step_variants';
    execute 'drop policy if exists "step_variants_update_editor" on public.step_variants';
    execute 'drop policy if exists "step_variants_delete_owner" on public.step_variants';

    execute $p$
      create policy "step_variants_read_campaign_member"
      on public.step_variants
      for select
      using (
        exists (
          select 1
          from public.campaign_steps cs
          join public.campaign_members cm
            on cm.campaign_id = cs.campaign_id
          where cs.id = step_variants.step_id
            and cm.user_id = auth.uid()
        )
      );
    $p$;

    execute $p$
      create policy "step_variants_write_editor"
      on public.step_variants
      for insert
      with check (
        exists (
          select 1
          from public.campaign_steps cs
          join public.campaign_members cm
            on cm.campaign_id = cs.campaign_id
          where cs.id = step_variants.step_id
            and cm.user_id = auth.uid()
            and cm.role in ('editor','owner')
        )
      );
    $p$;

    execute $p$
      create policy "step_variants_update_editor"
      on public.step_variants
      for update
      using (
        exists (
          select 1
          from public.campaign_steps cs
          join public.campaign_members cm
            on cm.campaign_id = cs.campaign_id
          where cs.id = step_variants.step_id
            and cm.user_id = auth.uid()
            and cm.role in ('editor','owner')
        )
      );
    $p$;

    execute $p$
      create policy "step_variants_delete_owner"
      on public.step_variants
      for delete
      using (
        exists (
          select 1
          from public.campaign_steps cs
          join public.campaign_members cm
            on cm.campaign_id = cs.campaign_id
          where cs.id = step_variants.step_id
            and cm.user_id = auth.uid()
            and cm.role = 'owner'
        )
      );
    $p$;
  end if;

  -- Reply events --------------------------------------------------------
  if to_regclass('public.reply_events') is not null then
    execute 'alter table public.reply_events enable row level security';
    execute 'drop policy if exists "reply_events_read_campaign_member" on public.reply_events';
    execute 'drop policy if exists "reply_events_write_editor" on public.reply_events';

    execute $p$
      create policy "reply_events_read_campaign_member"
      on public.reply_events
      for select
      using (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = reply_events.campaign_id
            and cm.user_id = auth.uid()
        )
      );
    $p$;

    execute $p$
      create policy "reply_events_write_editor"
      on public.reply_events
      for insert
      with check (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = reply_events.campaign_id
            and cm.user_id = auth.uid()
            and cm.role in ('editor','owner')
        )
      );
    $p$;
  end if;

  -- Send queue ----------------------------------------------------------
  if to_regclass('public.send_queue') is not null then
    execute 'alter table public.send_queue enable row level security';
    execute 'drop policy if exists "send_queue_read_campaign_member" on public.send_queue';
    execute 'drop policy if exists "send_queue_write_editor" on public.send_queue';
    execute 'drop policy if exists "send_queue_update_editor" on public.send_queue';

    execute $p$
      create policy "send_queue_read_campaign_member"
      on public.send_queue
      for select
      using (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = send_queue.campaign_id
            and cm.user_id = auth.uid()
        )
      );
    $p$;

    execute $p$
      create policy "send_queue_write_editor"
      on public.send_queue
      for insert
      with check (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = send_queue.campaign_id
            and cm.user_id = auth.uid()
            and cm.role in ('editor','owner')
        )
      );
    $p$;

    execute $p$
      create policy "send_queue_update_editor"
      on public.send_queue
      for update
      using (
        exists (
          select 1
          from public.campaign_members cm
          where cm.campaign_id = send_queue.campaign_id
            and cm.user_id = auth.uid()
            and cm.role in ('editor','owner')
        )
      );
    $p$;
  end if;
end
$$;

-- ======================================================================
-- G) RPC helpers (generate token, create invite, accept invite)
-- ======================================================================

create or replace function public.gen_token(n int default 20)
returns text
language sql
immutable
as $$
  select encode(gen_random_bytes(n), 'base64url');
$$;

drop function if exists public.create_campaign_invite(uuid, citext, text);
drop function if exists public.create_campaign_invite(uuid, text, text);

create or replace function public.create_campaign_invite(
  p_campaign uuid,
  p_email citext,
  p_role text default 'viewer'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_id uuid;
  v_role public.campaign_role;
  v_account uuid;
  v_attempts int := 0;
begin
  if p_role not in ('viewer','editor') then
    raise exception 'Invalid role';
  end if;

  select account_id
    into v_account
  from public.campaigns
  where id = p_campaign;

  if v_account is null then
    raise exception 'Campaign not found';
  end if;

  if not exists (
    select 1
    from public.campaign_members me
    where me.campaign_id = p_campaign
      and me.user_id = auth.uid()
      and me.role = 'owner'
  ) and not exists (
    select 1
    from public.campaigns c
    join public.team_members tm
      on tm.account_id = c.account_id
    where c.id = p_campaign
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  ) then
    raise exception 'Not authorized';
  end if;

  v_role := p_role::public.campaign_role;

  loop
    v_attempts := v_attempts + 1;
    v_token := public.gen_token(16);

    begin
      insert into public.campaign_invites (campaign_id, invited_email, role, token)
      values (p_campaign, lower(p_email)::citext, v_role, v_token)
      on conflict (campaign_id, invited_email) do update
        set role = excluded.role,
            token = excluded.token,
            created_at = now(),
            expires_at = now() + interval '7 days',
            accepted_by = null,
            accepted_at = null
      returning id into v_id;

      exit;
    exception
      when unique_violation then
        if v_attempts >= 5 then
          raise exception 'Failed to generate unique invite token';
        end if;
        -- retry
    end;
  end loop;

  return v_id;
end
$$;

grant execute on function public.create_campaign_invite(uuid, citext, text) to authenticated;

drop function if exists public.accept_campaign_invite(text);

create or replace function public.accept_campaign_invite(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_user record;
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select i.*, c.account_id
    into v_inv
  from public.campaign_invites i
  join public.campaigns c
    on c.id = i.campaign_id
  where i.token = p_token
    and i.expires_at > now()
    and i.accepted_at is null
  for update;

  if not found then
    raise exception 'Invite invalid or expired';
  end if;

  select id, email
    into v_user
  from auth.users
  where id = auth.uid();

  if v_user.id is null then
    raise exception 'User not found';
  end if;

  if lower(coalesce(v_user.email, '')) <> lower(v_inv.invited_email::text) then
    raise exception 'Invite email mismatch';
  end if;

  v_ok := public.ensure_seat_available(v_inv.account_id);
  if not v_ok then
    raise exception 'No available seats. Contact owner to upgrade seats.'
      using errcode = '23514';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_inv.campaign_id, v_user.id, v_inv.role)
  on conflict (campaign_id, user_id) do update
    set role = excluded.role,
        created_at = least(campaign_members.created_at, now());

  update public.campaign_invites
     set accepted_by = v_user.id,
         accepted_at = now()
   where id = v_inv.id;

  return true;
end
$$;

grant execute on function public.accept_campaign_invite(text) to authenticated;

-- Clean up legacy RPCs if present
drop function if exists public.invite_member(uuid, text, public.campaign_role);
drop function if exists public.invite_member(uuid, text, text);
drop function if exists public.invite_member(uuid, citext, text);
drop function if exists public.accept_invite(text);





