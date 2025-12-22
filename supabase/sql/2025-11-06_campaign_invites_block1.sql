-- Campaign invite helpers (idempotent rebuild)
-- Run inside Supabase SQL editor or as part of migration tooling.

-- A) Base table -----------------------------------------------------------------
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  role text not null check (role in ('editor','viewer','owner')) default 'viewer',
  token text not null,
  status text not null check (status in ('pending','accepted','revoked','expired')) default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  meta jsonb not null default '{}'::jsonb,
  unique (campaign_id, email)
);

-- Ensure inviter_user_id column exists and is populated from legacy columns
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_invites'
      and column_name = 'inviter_user_id'
  ) then
    alter table public.campaign_invites add column inviter_user_id uuid;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_invites'
      and column_name = 'invited_by'
  ) then
    update public.campaign_invites
       set inviter_user_id = coalesce(inviter_user_id, invited_by)
     where inviter_user_id is null;
  end if;
end$$;

alter table public.campaign_invites
  add column if not exists created_at timestamptz not null default now();

alter table public.campaign_invites
  add column if not exists campaign_id uuid not null references public.campaigns(id) on delete cascade;

alter table public.campaign_invites
  add column if not exists email citext not null;

alter table public.campaign_invites
  add column if not exists role text not null default 'viewer';

alter table public.campaign_invites
  add column if not exists token text not null;

alter table public.campaign_invites
  add column if not exists status text not null default 'pending';

alter table public.campaign_invites
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days');

alter table public.campaign_invites
  add column if not exists meta jsonb not null default '{}'::jsonb;

alter table public.campaign_invites
  alter column inviter_user_id set not null;

alter table public.campaign_invites
  drop constraint if exists campaign_invites_role_check;

alter table public.campaign_invites
  add constraint campaign_invites_role_check check (role in ('editor','viewer','owner'));

alter table public.campaign_invites
  drop constraint if exists campaign_invites_status_check;

alter table public.campaign_invites
  add constraint campaign_invites_status_check check (status in ('pending','accepted','revoked','expired'));

alter table public.campaign_invites
  drop constraint if exists campaign_invites_campaign_id_email_key;

with dupes as (
  select id
  from (
    select id,
           row_number() over (
             partition by campaign_id, email
             order by (status = 'pending') desc, created_at desc
           ) as rn
    from public.campaign_invites
  ) ranked
  where ranked.rn > 1
)
delete from public.campaign_invites
where id in (select id from dupes);

alter table public.campaign_invites
  add constraint campaign_invites_campaign_id_email_key unique (campaign_id, email);

alter table public.campaign_invites
  drop constraint if exists campaign_invites_inviter_user_id_fkey;

alter table public.campaign_invites
  add constraint campaign_invites_inviter_user_id_fkey
    foreign key (inviter_user_id) references auth.users(id) on delete cascade;

create index if not exists idx_invites_campaign on public.campaign_invites(campaign_id);
create index if not exists idx_invites_email on public.campaign_invites(email);

-- B) RLS ------------------------------------------------------------------------
alter table public.campaign_invites enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_invites'
  loop
    execute format('drop policy if exists %I on public.campaign_invites', r.policyname);
  end loop;
end$$;

create policy campaign_invites_read
on public.campaign_invites
for select
to authenticated
using (
  exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = campaign_invites.campaign_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner','editor')
  )
  or exists (
    select 1
    from public.campaigns c
    where c.id = campaign_invites.campaign_id
      and c.user_id = auth.uid()
  )
);

-- Writes are handled by service key only (no additional policies)

-- C) RPC helpers ----------------------------------------------------------------
drop function if exists public.create_campaign_invite(uuid, text, text);
drop function if exists public.create_campaign_invite(uuid, text, text, text);

create or replace function public.create_campaign_invite(
  p_campaign uuid,
  p_email text,
  p_role text default 'viewer'
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := encode(gen_random_bytes(24), 'base64');
  v_inviter uuid := auth.uid();
  v_role text := lower(p_role);
begin
  if v_inviter is null then
    raise exception 'authentication required';
  end if;

  if v_role not in ('owner','editor','viewer') then
    raise exception 'invalid role';
  end if;

  if not exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign
      and cm.user_id = v_inviter
      and cm.role in ('owner','editor')
  ) and not exists (
    select 1
    from public.campaigns c
    where c.id = p_campaign
      and c.user_id = v_inviter
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.campaign_invites(
    campaign_id,
    inviter_user_id,
    email,
    role,
    token,
    status,
    expires_at,
    meta
  )
  values (
    p_campaign,
    v_inviter,
    p_email,
    v_role,
    v_token,
    'pending',
    now() + interval '7 days',
    '{}'::jsonb
  )
  on conflict (campaign_id, email) do update
    set role = excluded.role,
        token = excluded.token,
        inviter_user_id = excluded.inviter_user_id,
        status = 'pending',
        expires_at = excluded.expires_at,
        meta = excluded.meta;

  return v_token;
end;
$$;

revoke all on function public.create_campaign_invite(uuid, text, text) from public;
grant execute on function public.create_campaign_invite(uuid, text, text) to authenticated, service_role;

drop function if exists public.accept_campaign_invite(text);

create or replace function public.accept_campaign_invite(
  p_token text
) returns table(campaign_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_campaign uuid;
  v_role text;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  select campaign_invites.campaign_id, campaign_invites.role
    into v_campaign, v_role
  from public.campaign_invites
  where token = p_token
    and status = 'pending'
    and now() < expires_at
  limit 1;

  if v_campaign is null then
    raise exception 'invalid_or_expired';
  end if;

  insert into public.campaign_members(campaign_id, user_id, role)
  values (v_campaign, v_user, v_role)
  on conflict (campaign_id, user_id)
  do update set role = excluded.role;

  update public.campaign_invites
     set status = 'accepted'
   where token = p_token;

  return query
    select v_campaign, v_role;
end;
$$;

revoke all on function public.accept_campaign_invite(text) from public;
grant execute on function public.accept_campaign_invite(text) to authenticated, service_role;

-- Optional: schedule a nightly job to expire invites
-- update public.campaign_invites set status = 'expired'
-- where status = 'pending' and now() > expires_at;

