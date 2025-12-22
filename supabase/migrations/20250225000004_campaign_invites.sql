-- Campaign Invites System
-- Allows campaign owners to invite users by email with token-based links

-- A) Table
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email citext not null,
  role text not null check (role in ('viewer','editor')),
  token text not null,                                   -- url-safe random
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null,

  -- no duplicate *pending* invites for same campaign+email
  unique (campaign_id, email) where (accepted_at is null)
);

create index if not exists idx_invites_campaign on public.campaign_invites(campaign_id);
create index if not exists idx_invites_token on public.campaign_invites(token);
create index if not exists idx_invites_email on public.campaign_invites(email);

-- B) Small helpers
create or replace function public._urlsafe_token(nbytes int default 24)
returns text
language sql immutable as $$
  select replace(replace(rtrim(encode(gen_random_bytes(nbytes), 'base64'), '='), '+','-'), '/','_');
$$;

create or replace function public.current_user_email()
returns text
language sql stable as $$
  select (auth.jwt() ->> 'email')::text;
$$;

-- C) RLS (viewable by editors/owners of the campaign; writes via RPCs)
alter table public.campaign_invites enable row level security;

drop policy if exists inv_view on public.campaign_invites;
create policy inv_view on public.campaign_invites
for select using (public.can_edit_campaign(campaign_id)); -- editors & owners see invites

-- guard: only owners can directly write (we still prefer RPCs)
drop policy if exists inv_write_guard on public.campaign_invites;
create policy inv_write_guard on public.campaign_invites
for insert with check (public.is_owner_campaign(campaign_id))
, for update using (public.is_owner_campaign(campaign_id))
with check (public.is_owner_campaign(campaign_id))
, for delete using (public.is_owner_campaign(campaign_id));

-- D) RPCs
-- D1) create invite (owner only) -> returns token
create or replace function public.create_campaign_invite(
  p_campaign uuid,
  p_email text,
  p_role text,
  p_expires_at timestamptz default now() + interval '7 days'
) returns text
language plpgsql
security definer
as $$
declare v_token text;
begin
  if not public.is_owner_campaign(p_campaign) then
    raise exception 'Only owners can create invites';
  end if;
  if p_role not in ('viewer','editor') then
    raise exception 'Invalid role';
  end if;

  v_token := public._urlsafe_token(24);

  insert into public.campaign_invites (campaign_id, email, role, token, expires_at)
  values (p_campaign, lower(p_email), p_role, v_token, p_expires_at);

  -- Note: _audit_member expects a user_id, but for invites we don't have one yet
  -- We'll audit when the invite is accepted instead
  return v_token;
end $$;

-- D2) peek invite (no auth requirement) -> for pre-flight UI
create or replace function public.get_invite_by_token(p_token text)
returns table(campaign_id uuid, email text, role text, expires_at timestamptz, accepted boolean)
language sql stable
security definer
as $$
  select campaign_id, email::text, role, expires_at, accepted_at is not null
  from public.campaign_invites
  where token = p_token;
$$;

-- D3) accept invite (must be logged in; email must match; not expired)
create or replace function public.accept_campaign_invite(p_token text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_inv public.campaign_invites%rowtype;
  v_uid uuid := auth.uid();
  v_email text := public.current_user_email();
begin
  if v_uid is null then
    raise exception 'You must be signed in to accept an invite';
  end if;

  select * into v_inv from public.campaign_invites
  where token = p_token
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if v_inv.accepted_at is not null then
    return v_inv.campaign_id; -- already accepted (idempotent)
  end if;

  if v_inv.expires_at < now() then
    raise exception 'Invite has expired';
  end if;

  if v_email is null or lower(v_email) <> lower(v_inv.email::text) then
    raise exception 'This invite was sent to %; you are signed in as %', v_inv.email, coalesce(v_email,'(no email)');
  end if;

  -- add membership via campaign_shares (invite is the authorization)
  -- This bypasses the owner check since the invite itself authorizes the user
  insert into public.campaign_shares (campaign_id, user_id, role)
  values (v_inv.campaign_id, v_uid, v_inv.role)
  on conflict (campaign_id, user_id) do update set role = excluded.role;

  update public.campaign_invites
  set accepted_at = now(), accepted_user_id = v_uid
  where id = v_inv.id;

  -- Audit the acceptance
  perform public._audit_member(v_inv.campaign_id, v_uid, 'invite', null, v_inv.role);

  return v_inv.campaign_id;
end $$;

