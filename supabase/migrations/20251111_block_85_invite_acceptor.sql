-- Block 85 — RPC to accept saved view invites

create or replace function public.rpc_accept_saved_view_invites(
  p_account_id uuid,
  p_user_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.saved_view_memberships (account_id, view_id, user_id, role)
  select account_id, view_id, p_user_id, role
  from public.saved_view_invites
  where account_id = p_account_id
    and lower(email) = lower(p_email)
    and accepted_at is null
  on conflict (view_id, user_id) do nothing;

  update public.saved_view_invites
  set accepted_at = now()
  where account_id = p_account_id
    and lower(email) = lower(p_email)
    and accepted_at is null;
end;
$$;

grant execute on function public.rpc_accept_saved_view_invites(uuid, uuid, text) to authenticated;

