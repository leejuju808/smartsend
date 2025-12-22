-- Campaign invite + membership helpers refresh (idempotent)
-- Run in Supabase SQL

-- Ensure campaign role enum exists
do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_role') then
    create type public.campaign_role as enum ('owner', 'editor', 'viewer');
  end if;
end$$;


-- A) Invites table -----------------------------------------------------------------
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  role public.campaign_role not null default 'viewer',
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  invited_by uuid not null references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired'))
);

-- Align existing schema to expected columns / types
alter table public.campaign_invites
  alter column role type public.campaign_role using role::public.campaign_role,
  alter column role set default 'viewer',
  alter column role set not null;

alter table public.campaign_invites
  alter column expires_at set default (now() + interval '14 days');

-- Rename inviter column if needed
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_invites'
      and column_name = 'inviter_user_id'
  ) then
    alter table public.campaign_invites
      rename column inviter_user_id to invited_by;
  end if;
end$$;

alter table public.campaign_invites
  add column if not exists invited_by uuid references auth.users(id) on delete set null;

update public.campaign_invites
   set invited_by = coalesce(invited_by, accepted_by)
 where invited_by is null;

alter table public.campaign_invites
  alter column invited_by set not null;

-- Ensure token column uses uuid
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaign_invites'
      and column_name = 'token'
      and data_type <> 'uuid'
  ) then
    alter table public.campaign_invites
      add column if not exists token_uuid uuid;

    update public.campaign_invites
       set token_uuid = case
         when token ~ '^[0-9a-fA-F0-9-]{36}$' then token::uuid
         else gen_random_uuid()
       end
     where token_uuid is null;

    alter table public.campaign_invites drop column token;
    alter table public.campaign_invites rename column token_uuid to token;
  end if;
end$$;

alter table public.campaign_invites
  alter column token set default gen_random_uuid(),
  alter column token set not null;

-- Ensure status column exists & constrained
alter table public.campaign_invites
  add column if not exists status text not null default 'pending';

update public.campaign_invites
   set status = 'pending'
 where status is null;

alter table public.campaign_invites
  drop constraint if exists campaign_invites_status_check;

alter table public.campaign_invites
  add constraint campaign_invites_status_check
  check (status in ('pending','accepted','revoked','expired'));

-- Remove old uniqueness constraint to replace with partial unique index
do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conrelid = 'public.campaign_invites'::regclass
       and contype = 'u'
       and conname = 'campaign_invites_campaign_id_email_key'
  ) then
    alter table public.campaign_invites
      drop constraint campaign_invites_campaign_id_email_key;
  end if;
end$$;

create unique index if not exists uq_campaign_invites_pending
  on public.campaign_invites (campaign_id, email)
  where status = 'pending';

create index if not exists idx_invites_campaign on public.campaign_invites (campaign_id);
create index if not exists idx_invites_email_lower on public.campaign_invites (lower(email));


-- B) Auto-expire helper view -------------------------------------------------------
create or replace view public.v_campaign_invites as
select i.*,
       (now() > i.expires_at) as is_expired
from public.campaign_invites i;

alter view public.v_campaign_invites set (security_invoker = on);


-- C) Security definer accept function ---------------------------------------------
drop function if exists public.accept_campaign_invite(text);
drop function if exists public.accept_campaign_invite(uuid);

create or replace function public.accept_campaign_invite(p_token uuid)
returns table(campaign_id uuid, user_id uuid, role public.campaign_role)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.campaign_invites%rowtype;
  v_user uuid;
begin
  select auth.uid() into v_user;
  if v_user is null then
    raise exception 'auth required';
  end if;

  select *
    into v_inv
    from public.campaign_invites
   where token = p_token
     and status = 'pending'
   limit 1;

  if not found then
    raise exception 'invalid or already used';
  end if;

  if now() > v_inv.expires_at then
    update public.campaign_invites
       set status = 'expired'
     where id = v_inv.id;
    raise exception 'invite expired';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_inv.campaign_id, v_user, v_inv.role)
  on conflict (campaign_id, user_id)
  do update set role = excluded.role;

  update public.campaign_invites
     set status = 'accepted',
         accepted_by = v_user,
         accepted_at = now()
   where id = v_inv.id;

  return query select v_inv.campaign_id, v_user, v_inv.role;
end$$;


-- D) RLS policies -----------------------------------------------------------------
alter table public.campaign_invites enable row level security;
alter table public.campaign_members enable row level security;

drop policy if exists sel_invites on public.campaign_invites;
create policy sel_invites on public.campaign_invites
  for select using (public.is_campaign_viewer(campaign_id));

drop policy if exists ins_invites on public.campaign_invites;
create policy ins_invites on public.campaign_invites
  for insert with check (public.is_campaign_editor(campaign_id));

drop policy if exists upd_invites on public.campaign_invites;
create policy upd_invites on public.campaign_invites
  for update using (public.is_campaign_editor(campaign_id));

drop policy if exists sel_members on public.campaign_members;
create policy sel_members on public.campaign_members
  for select using (public.is_campaign_viewer(campaign_id));

drop policy if exists upd_members on public.campaign_members;
create policy upd_members on public.campaign_members
  for update using (public.is_campaign_owner(campaign_id));

drop policy if exists del_members on public.campaign_members;
create policy del_members on public.campaign_members
  for delete using (
    public.is_campaign_owner(campaign_id) or auth.uid() = user_id
  );




