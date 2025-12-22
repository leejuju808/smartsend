-- A) Invites table
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  role text not null check (role in ('editor','viewer')),
  token text not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);

create index if not exists idx_cinv_campaign on public.campaign_invites(campaign_id);
create index if not exists idx_cinv_email on public.campaign_invites(email);
create unique index if not exists uq_cinv_token on public.campaign_invites(token);

alter table public.campaign_invites enable row level security;

-- Owners can list invites for their campaign
drop policy if exists inv_view on public.campaign_invites;
create policy inv_view on public.campaign_invites
for select using ( public.is_campaign_owner(campaign_id) );

-- Owners can create and revoke
drop policy if exists inv_manage on public.campaign_invites;
create policy inv_manage on public.campaign_invites
for insert with check ( public.is_campaign_owner(campaign_id) )
, for delete using ( public.is_campaign_owner(campaign_id) );

-- B) Helper: create invite (generates token)
create or replace function public.create_campaign_invite(
  p_campaign uuid,
  p_email citext,
  p_role text default 'viewer',
  p_ttl interval default interval '7 days'
) returns table(id uuid, token text)
language plpgsql
security definer
set search_path = public
as $$
declare 
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_id uuid;
begin
  if not public.is_campaign_owner(p_campaign) then
    raise exception 'not owner';
  end if;

  insert into public.campaign_invites(campaign_id, inviter_id, email, role, token, expires_at)
  values (p_campaign, auth.uid(), p_email, p_role, v_token, now() + p_ttl)
  returning campaign_invites.id into v_id;
  
  return query select v_id, v_token;
end;
$$;

-- C) Helper: accept invite by token (idempotent)
create or replace function public.accept_campaign_invite(p_token text)
returns uuid  -- returns campaign_id
language plpgsql
security definer
set search_path = public
as $$
declare v_inv public.campaign_invites%rowtype;
begin
  select * into v_inv from public.campaign_invites
   where token = p_token and accepted_at is null and expires_at > now()
   limit 1;

  if not found then
    raise exception 'invalid_or_expired';
  end if;

  -- Upsert membership for current user to invited role
  insert into public.campaign_members(campaign_id, user_id, role)
  values (v_inv.campaign_id, auth.uid(), v_inv.role)
  on conflict (campaign_id, user_id) do update
    set role = excluded.role;

  update public.campaign_invites
     set accepted_at = now()
   where id = v_inv.id;

  return v_inv.campaign_id;
end;
$$;

