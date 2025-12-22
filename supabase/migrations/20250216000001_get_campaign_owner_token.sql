-- Postgres function to get Gmail access_token for campaign owner
-- Returns access_token from email_accounts for any workspace member associated with the campaign

create or replace function public.get_campaign_owner_token(p_campaign_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_workspace_id uuid;
  v_account jsonb;
begin
  -- Get workspace_id from campaign
  select workspace_id into v_workspace_id
  from public.campaigns
  where id = p_campaign_id;

  if v_workspace_id is null then
    return jsonb_build_object('error', 'Campaign not found or no workspace');
  end if;

  -- Get first active Gmail account from any workspace member
  select jsonb_build_object(
    'access_token', access_token,
    'refresh_token', refresh_token,
    'expires_at', expires_at,
    'user_id', user_id,
    'email', email
  ) into v_account
  from public.email_accounts
  where workspace_id = v_workspace_id
    and provider = 'gmail'
    and is_active = true
    and (expires_at is null or expires_at > now())
  order by created_at asc
  limit 1;

  if v_account is null then
    return jsonb_build_object('error', 'No active Gmail account found for workspace');
  end if;

  return v_account;
end;
$$;

-- Grant execute permission
grant execute on function public.get_campaign_owner_token(uuid) to authenticated;
grant execute on function public.get_campaign_owner_token(uuid) to service_role;

