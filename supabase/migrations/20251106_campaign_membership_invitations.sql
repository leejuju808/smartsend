-- Campaign membership & invitations schema, helpers, RLS, and RPCs

-- A) Members (idempotent)
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

-- B) Keep canonical owner row mirrored
insert into public.campaign_members (campaign_id, user_id, role)
select c.id, c.user_id, 'owner'
from public.campaigns c
left join public.campaign_members m
  on m.campaign_id = c.id and m.user_id = c.user_id and m.role = 'owner'
where m.id is null
on conflict do nothing;

-- C) Invitations
create table if not exists public.campaign_invitations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_email citext not null,
  role text not null check (role in ('editor','viewer')),
  token text not null unique,
  accepted_at timestamptz,
  revoked_at timestamptz,
  unique (campaign_id, invitee_email)
);

create index if not exists idx_camp_invite_campaign on public.campaign_invitations(campaign_id);
create index if not exists idx_camp_invite_email on public.campaign_invitations(invitee_email);

-- D) Helpers
create or replace function public.is_campaign_role(p_campaign uuid, p_user uuid, p_roles text[])
returns boolean
language sql
stable
as $$
  select exists(
    select 1 from public.campaign_members
    where campaign_id = p_campaign and user_id = p_user and role = any(p_roles)
  );
$$;

create or replace function public.current_user_can_write_campaign(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select public.is_campaign_role(p_campaign, auth.uid(), array['owner','editor']);
$$;

create or replace function public.current_user_can_read_campaign(p_campaign uuid)
returns boolean
language sql
stable
as $$
  select public.is_campaign_role(p_campaign, auth.uid(), array['owner','editor','viewer']);
$$;

-- 2) RLS — enable on key tables with clean, role-based policies

alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_invitations enable row level security;

alter table public.campaign_steps enable row level security;
alter table public.campaign_step_variants enable row level security;
alter table public.send_queue enable row level security;
alter table public.send_logs enable row level security;
alter table public.campaign_unsubscribes enable row level security;
alter table public.campaign_suppressions enable row level security;
alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;

-- Campaigns
drop policy if exists campaigns_read on public.campaigns;
create policy campaigns_read on public.campaigns
  for select using (public.current_user_can_read_campaign(id));

drop policy if exists campaigns_write on public.campaigns;
create policy campaigns_write on public.campaigns
  for update using (public.current_user_can_write_campaign(id));

-- Members
drop policy if exists members_read on public.campaign_members;
create policy members_read on public.campaign_members
  for select using (public.current_user_can_read_campaign(campaign_id));

drop policy if exists members_insert on public.campaign_members;
create policy members_insert on public.campaign_members
  for insert with check (public.is_campaign_role(campaign_id, auth.uid(), array['owner']));

drop policy if exists members_update on public.campaign_members;
create policy members_update on public.campaign_members
  for update using (public.is_campaign_role(campaign_id, auth.uid(), array['owner']))
  with check (public.is_campaign_role(campaign_id, auth.uid(), array['owner']));

drop policy if exists members_delete on public.campaign_members;
create policy members_delete on public.campaign_members
  for delete using (public.is_campaign_role(campaign_id, auth.uid(), array['owner']));

-- Invitations
drop policy if exists invites_read on public.campaign_invitations;
create policy invites_read on public.campaign_invitations
  for select using (
    public.is_campaign_role(campaign_id, auth.uid(), array['owner'])
    or invitee_email = auth.jwt() ->> 'email'
  );

drop policy if exists invites_insert on public.campaign_invitations;
create policy invites_insert on public.campaign_invitations
  for insert with check (public.is_campaign_role(campaign_id, auth.uid(), array['owner']));

drop policy if exists invites_update on public.campaign_invitations;
create policy invites_update on public.campaign_invitations
  for update using (public.is_campaign_role(campaign_id, auth.uid(), array['owner']));

-- Campaign-scoped tables: read = viewer+, write = editor+

-- Steps
drop policy if exists steps_read on public.campaign_steps;
create policy steps_read on public.campaign_steps
  for select using (public.current_user_can_read_campaign(campaign_id));

drop policy if exists steps_write on public.campaign_steps;
create policy steps_write on public.campaign_steps
  for all using (public.current_user_can_write_campaign(campaign_id))
  with check (public.current_user_can_write_campaign(campaign_id));

-- Variants
drop policy if exists variants_all on public.campaign_step_variants;
create policy variants_all on public.campaign_step_variants
  for all using (public.current_user_can_read_campaign(campaign_id))
  with check (public.current_user_can_write_campaign(campaign_id));

-- Queue
drop policy if exists queue_read on public.send_queue;
create policy queue_read on public.send_queue
  for select using (public.current_user_can_read_campaign(campaign_id));

drop policy if exists queue_write on public.send_queue;
create policy queue_write on public.send_queue
  for all using (public.current_user_can_write_campaign(campaign_id))
  with check (public.current_user_can_write_campaign(campaign_id));

-- Logs
drop policy if exists logs_read on public.send_logs;
create policy logs_read on public.send_logs
  for select using (public.current_user_can_read_campaign(campaign_id));

-- Unsubs/Suppressions
drop policy if exists unsubs_all on public.campaign_unsubscribes;
create policy unsubs_all on public.campaign_unsubscribes
  for all using (public.current_user_can_read_campaign(campaign_id))
  with check (public.current_user_can_write_campaign(campaign_id));

drop policy if exists supp_all on public.campaign_suppressions;
create policy supp_all on public.campaign_suppressions
  for all using (public.current_user_can_read_campaign(campaign_id))
  with check (public.current_user_can_write_campaign(campaign_id));

-- Inbox
drop policy if exists threads_read on public.inbox_threads;
create policy threads_read on public.inbox_threads
  for select using (public.current_user_can_read_campaign(campaign_id));

drop policy if exists messages_read on public.inbox_messages;
create policy messages_read on public.inbox_messages
  for select using (
    public.current_user_can_read_campaign((
      select t.campaign_id from public.inbox_threads t where t.id = thread_id
    ))
  );

-- 3) RPCs — manage members & invitations (security definer)

-- Invite: creates/overwrites an invitation, returns token
drop function if exists public.invite_member(uuid, citext, text);
drop function if exists public.accept_invitation(text);
drop function if exists public.accept_invite(text);
drop function if exists public.update_member_role(uuid, uuid, text);
drop function if exists public.set_member_role(uuid, uuid, text);

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

create index if not exists idx_cinv_campaign on public.campaign_invites(campaign_id);

create or replace function public.invite_member(
  p_campaign uuid,
  p_email citext,
  p_role text
) returns table(id uuid, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_id uuid;
begin
  if p_role not in ('editor','viewer') then
    raise exception 'Invalid role';
  end if;

  if not exists (
    select 1 from public.campaigns c
    where c.id = p_campaign and c.user_id = auth.uid()
  ) then
    raise exception 'Forbidden';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  delete from public.campaign_invites
  where campaign_id = p_campaign
    and email = p_email
    and accepted_at is null;

  insert into public.campaign_invites(campaign_id, inviter_id, email, role, token)
  values (p_campaign, auth.uid(), p_email, p_role, v_token)
  returning id into v_id;

  return query select v_id, v_token;
end;
$$;

create or replace function public.accept_invite(p_token text)
returns table(campaign_id uuid, role text)
language plpgsql
security definer
set search_path = public
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

  return query select v_inv.campaign_id, v_inv.role;
end;
$$;

create or replace function public.set_member_role(p_campaign uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role not in ('editor','viewer') then
    raise exception 'Invalid role';
  end if;

  if not exists (
    select 1 from public.campaigns c
    where c.id = p_campaign and c.user_id = auth.uid()
  ) then
    raise exception 'Forbidden';
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
set search_path = public
as $$
declare
  v_is_owner boolean;
  v_owner_count integer;
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
