-- Campaign collaboration system (idempotent)

-- Ensure role enum exists
do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_role') then
    create type public.campaign_role as enum ('owner', 'editor', 'viewer');
  end if;
end
$$;

-- Members table
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.campaign_role not null default 'viewer',
  unique (campaign_id, user_id)
);

alter table if exists public.campaign_members
  alter column role type public.campaign_role using role::public.campaign_role,
  alter column role set not null,
  alter column role set default 'viewer';

create index if not exists idx_campaign_members_campaign on public.campaign_members(campaign_id);
create index if not exists idx_campaign_members_user on public.campaign_members(user_id);

-- Invites table
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  role public.campaign_role not null default 'viewer',
  token text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  unique (token)
);

alter table if exists public.campaign_invites
  alter column role type public.campaign_role using role::public.campaign_role,
  alter column role set not null,
  alter column role set default 'viewer';

-- Allow inviter_user_id to be nullable if present so service-role calls can insert
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_invites'
      and column_name = 'inviter_user_id'
  ) then
    alter table public.campaign_invites
      alter column inviter_user_id drop not null;
  end if;
end
$$;

create index if not exists idx_campaign_invites_campaign on public.campaign_invites(campaign_id);
create index if not exists idx_campaign_invites_email on public.campaign_invites(email);

-- Helper view for collaborators
create or replace view public.v_campaign_collaborators as
select
  m.campaign_id,
  m.user_id,
  m.role,
  u.email
from public.campaign_members m
left join auth.users u on u.id = m.user_id;

-- Membership helper that supports legacy scopes (project/workspace) and campaigns
create or replace function public.is_member(p_scope uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (
      select true
      from public.project_members pm
      where pm.project_id = p_scope
        and pm.user_id = auth.uid()
      limit 1
    ),
    (
      select true
      from public.workspace_members wm
      where wm.workspace_id = p_scope
        and wm.user_id = auth.uid()
      limit 1
    ),
    (
      select true
      from public.campaign_members cm
      where cm.campaign_id = p_scope
        and cm.user_id = auth.uid()
      limit 1
    ),
    false
  );
$$;

-- Reusable membership policies for campaign-scoped tables
alter table if exists public.inbox_threads enable row level security;
alter table if exists public.inbox_messages enable row level security;
alter table if exists public.followup_tasks enable row level security;
alter table if exists public.nudge_variants enable row level security;
alter table if exists public.classifier_settings enable row level security;

drop policy if exists "threads_read" on public.inbox_threads;
create policy "threads_read" on public.inbox_threads
for select using (public.is_member(campaign_id));

drop policy if exists "threads_write" on public.inbox_threads;
create policy "threads_write" on public.inbox_threads
for update using (public.is_member(campaign_id));

drop policy if exists "msgs_read" on public.inbox_messages;
create policy "msgs_read" on public.inbox_messages
for select using (public.is_member(campaign_id));

drop policy if exists "tasks_rw" on public.followup_tasks;
create policy "tasks_rw" on public.followup_tasks
for select using (public.is_member(campaign_id))
for update using (public.is_member(campaign_id))
for insert with check (public.is_member(campaign_id));

drop policy if exists "variants_rw" on public.nudge_variants;
create policy "variants_rw" on public.nudge_variants
for all using (public.is_member(campaign_id))
with check (public.is_member(campaign_id));

drop policy if exists "settings_rw" on public.classifier_settings;
create policy "settings_rw" on public.classifier_settings
for all using (public.is_member(campaign_id))
with check (public.is_member(campaign_id));

-- RPC to invite collaborator
drop function if exists public.invite_to_campaign(uuid, text, public.campaign_role, integer);
create or replace function public.invite_to_campaign(
  p_campaign uuid,
  p_email text,
  p_role public.campaign_role default 'viewer',
  p_days int default 7
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := encode(gen_random_bytes(18), 'base64');
  v_id uuid;
begin
  insert into public.campaign_invites (campaign_id, email, role, token, expires_at)
  values (p_campaign, lower(trim(p_email)), p_role, v_token, now() + make_interval(days => p_days))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.invite_to_campaign(uuid, text, public.campaign_role, integer) to authenticated, service_role;

-- RPC to accept invite
drop function if exists public.accept_campaign_invite(text);
drop function if exists public.accept_campaign_invite(uuid);
create or replace function public.accept_campaign_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.campaign_invites%rowtype;
  v_user uuid := auth.uid();
  v_member uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select *
    into v_inv
  from public.campaign_invites
  where token = p_token
    and accepted_at is null
    and expires_at > now()
  limit 1;

  if not found then
    raise exception 'Invalid or expired invite';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_inv.campaign_id, v_user, v_inv.role)
  on conflict (campaign_id, user_id) do update
    set role = excluded.role
  returning id into v_member;

  update public.campaign_invites
  set accepted_at = now(),
      accepted_by = v_user
  where id = v_inv.id;

  return v_member;
end;
$$;

grant execute on function public.accept_campaign_invite(text) to authenticated, service_role;







