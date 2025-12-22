-- Campaign membership & invite system refresh (idempotent)

-- A) Role enum (noop if present)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_role') then
    create type public.campaign_role as enum ('owner','editor','viewer');
  end if;
end$$;


-- B) Members table (ensure schema & constraints)
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.campaign_role not null default 'viewer',
  unique (campaign_id, user_id)
);

-- Ensure columns align with expectations
alter table public.campaign_members
  alter column role type public.campaign_role using role::public.campaign_role,
  alter column role set default 'viewer',
  alter column role set not null;

create index if not exists idx_members_campaign on public.campaign_members(campaign_id);
create index if not exists idx_members_user on public.campaign_members(user_id);

alter table public.campaign_members enable row level security;


-- C) Membership RLS policies
drop policy if exists "m_read" on public.campaign_members;
create policy "m_read" on public.campaign_members
  for select to authenticated
  using (
    exists (
      select 1
      from public.campaign_members m
      where m.campaign_id = campaign_members.campaign_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "m_insert" on public.campaign_members;
create policy "m_insert" on public.campaign_members
  for insert to authenticated
  with check (public.is_campaign_owner(campaign_id));

drop policy if exists "m_update" on public.campaign_members;
create policy "m_update" on public.campaign_members
  for update to authenticated
  using (public.is_campaign_owner(campaign_id))
  with check (
    public.is_campaign_owner(campaign_id)
    and case when role = 'owner' then true else true end
  );

drop policy if exists "m_delete" on public.campaign_members;
create policy "m_delete" on public.campaign_members
  for delete to authenticated
  using (public.is_campaign_owner(campaign_id) or user_id = auth.uid());


-- D) Invites table (ensure schema & constraints)
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  role public.campaign_role not null default 'viewer',
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  unique (campaign_id, email)
);

-- Backfill / align optional legacy columns
alter table public.campaign_invites
  alter column role type public.campaign_role using role::public.campaign_role,
  alter column role set default 'viewer',
  alter column role set not null;

alter table public.campaign_invites
  add column if not exists inviter_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists accepted_by uuid references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz;

-- Ensure unique constraint on (campaign_id, email)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.campaign_invites'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.campaign_invites'::regclass and attname = 'campaign_id'),
        (select attnum from pg_attribute where attrelid = 'public.campaign_invites'::regclass and attname = 'email')
      ]
  ) then
    alter table public.campaign_invites
      add constraint campaign_invites_campaign_id_email_key unique (campaign_id, email);
  end if;
end$$;

-- Migrate legacy invited_by column if present
do $$
begin
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

-- Ensure inviter_user_id not null going forward
alter table public.campaign_invites
  alter column inviter_user_id set not null;

create index if not exists idx_cinv_campaign on public.campaign_invites(campaign_id);
create index if not exists idx_cinv_email on public.campaign_invites(email);

alter table public.campaign_invites enable row level security;


-- E) Helper to normalize email (JWT-safe)
create or replace function public.auth_email()
returns text
language sql
stable
as $$
  select lower(nullif(current_setting('request.jwt.claims', true)::jsonb->>'email',''));
$$;


-- F) Invite RLS policies
drop policy if exists "ci_read" on public.campaign_invites;
create policy "ci_read" on public.campaign_invites
  for select to authenticated
  using (
    public.is_campaign_viewer(campaign_id)
    or (accepted_by = auth.uid())
    or (lower(email) = lower(coalesce(public.auth_email(), '')))
  );

drop policy if exists "ci_insert" on public.campaign_invites;
create policy "ci_insert" on public.campaign_invites
  for insert to authenticated
  with check (public.is_campaign_owner(campaign_id));

drop policy if exists "ci_update" on public.campaign_invites;
create policy "ci_update" on public.campaign_invites
  for update to authenticated
  using (public.is_campaign_owner(campaign_id));

drop policy if exists "ci_delete" on public.campaign_invites;
create policy "ci_delete" on public.campaign_invites
  for delete to authenticated
  using (public.is_campaign_owner(campaign_id));


-- G) RPC: create invite (returns masked payload + token)
drop function if exists public.create_campaign_invite(uuid, text, public.campaign_role);
create or replace function public.create_campaign_invite(
  p_campaign uuid,
  p_email text,
  p_role public.campaign_role default 'viewer'
)
returns table(id uuid, token text, email text, role public.campaign_role, expires_at timestamptz)
language plpgsql
security invoker
as $$
declare
  v_token text := encode(gen_random_bytes(24), 'base64');
begin
  if not public.is_campaign_owner(p_campaign) then
    raise exception 'not_owner';
  end if;

  insert into public.campaign_invites (campaign_id, email, role, inviter_user_id, token)
  values (p_campaign, lower(trim(p_email)), p_role, auth.uid(), v_token)
  on conflict (campaign_id, email) do update
    set role = excluded.role,
        inviter_user_id = excluded.inviter_user_id,
        token = excluded.token,
        created_at = now(),
        expires_at = now() + interval '7 days',
        accepted_by = null,
        accepted_at = null
  returning id, token, email, role, expires_at
  into id, token, email, role, expires_at;
end;
$$;

grant execute on function public.create_campaign_invite(uuid, text, public.campaign_role) to authenticated;


-- H) RPC: accept invite (idempotent)
drop function if exists public.accept_campaign_invite(text);
create or replace function public.accept_campaign_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.campaign_invites%rowtype;
  v_exists boolean;
begin
  select *
    into v_inv
    from public.campaign_invites
   where token = p_token
     and now() < expires_at
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;

  if v_inv.email is not null and auth_email() is not null and lower(v_inv.email) <> auth_email() then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  select exists(
    select 1
      from public.campaign_members
     where campaign_id = v_inv.campaign_id
       and user_id = auth.uid()
  ) into v_exists;

  if not v_exists then
    insert into public.campaign_members (campaign_id, user_id, role)
    values (v_inv.campaign_id, auth.uid(), v_inv.role)
    on conflict (campaign_id, user_id) do update
      set role = excluded.role;
  end if;

  update public.campaign_invites
     set accepted_by = auth.uid(),
         accepted_at = now()
   where id = v_inv.id;

  return jsonb_build_object('ok', true, 'campaign_id', v_inv.campaign_id, 'role', v_inv.role);
end;
$$;

grant execute on function public.accept_campaign_invite(text) to authenticated;


