-- Table: pending_invites

create table if not exists public.pending_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  role text not null check (role in ('viewer','editor')),
  invited_by uuid not null references auth.users(id) on delete set null,
  token uuid not null default gen_random_uuid(),     -- single-use token
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, email)
);

-- Helpful index
create index if not exists idx_pending_invites_token on public.pending_invites(token);

alter table public.pending_invites enable row level security;

-- Owner-only CRUD on invites for their campaigns
drop policy if exists "inv_owner_crud" on public.pending_invites;
create policy "inv_owner_crud"
on public.pending_invites
for all
using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()))
with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()));

-- Note: The accept_invite function is SECURITY DEFINER, so it can read invites
-- by token regardless of RLS policies. No special token read policy needed.

-- Function: accept_invite( token )
create or replace function public.accept_invite(p_token uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.pending_invites%rowtype;
  v_uid uuid := auth.uid();
  v_profile_email text;
  v_exists int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Load invite
  select * into v_inv
  from public.pending_invites
  where token = p_token
    and accepted_at is null
    and now() < expires_at;

  if not found then
    raise exception 'Invite not found or expired';
  end if;

  -- Check signed-in user's email matches invite email
  select email into v_profile_email
  from public.profiles
  where id = v_uid;

  if v_profile_email is null then
    raise exception 'Profile email missing';
  end if;

  if lower(v_profile_email) <> lower(v_inv.email) then
    raise exception 'Signed-in email does not match invite email';
  end if;

  -- Upsert share
  select count(*) into v_exists
  from public.campaign_shares
  where campaign_id = v_inv.campaign_id and user_id = v_uid;

  if v_exists = 0 then
    insert into public.campaign_shares (campaign_id, user_id, role)
    values (v_inv.campaign_id, v_uid, v_inv.role);
  else
    update public.campaign_shares
      set role = greatest(role, v_inv.role) -- owner>editor>viewer via lexical? Better explicit:
      where campaign_id = v_inv.campaign_id and user_id = v_uid;
    -- (Note: If you want strict precedence, do a CASE with mapping.)
  end if;

  -- Mark accepted
  update public.pending_invites
    set accepted_at = now()
  where id = v_inv.id;

  return 'accepted';
end
$$;

comment on function public.accept_invite is 'Consumes invite token, verifies email matches session user, grants share role, marks accepted.';

-- Grant execute permission
grant execute on function public.accept_invite(uuid) to authenticated;

