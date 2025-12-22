-- Campaign invite acceptance RPC refresh (idempotent)

-- Ensure fast lookup by invite token
create index if not exists idx_invites_token on public.campaign_invites(token);

-- Accept invite via token with email verification
create or replace function public.accept_campaign_invite(p_token text)
returns table (ok boolean, campaign_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_inv record;
  v_uid uuid;
  v_email text;
begin
  -- must be authenticated
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- get current user's email
  select u.email into v_email
  from auth.users u
  where u.id = v_uid;

  if v_email is null then
    raise exception 'user email missing';
  end if;

  -- find invite by token, unaccepted
  select *
  into v_inv
  from public.campaign_invites i
  where i.token = p_token
    and i.accepted_at is null
  limit 1;

  if not found then
    return query select false, null::uuid;
    return;
  end if;

  -- email must match (case insensitive)
  if lower(v_inv.email::text) <> lower(v_email) then
    raise exception 'invite email does not match your account email';
  end if;

  -- upsert membership
  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_inv.campaign_id, v_uid, v_inv.role)
  on conflict (campaign_id, user_id) do update
    set role = excluded.role;

  -- mark accepted
  update public.campaign_invites
  set accepted_at = now(),
      status = 'accepted',
      updated_at = now()
  where id = v_inv.id;

  return query select true, v_inv.campaign_id;
end
$$;

revoke all on function public.accept_campaign_invite(text) from public;
grant execute on function public.accept_campaign_invite(text) to authenticated;



