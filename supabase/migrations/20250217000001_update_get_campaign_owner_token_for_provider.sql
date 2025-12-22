-- Update get_campaign_owner_token to support provider filter and use user_connections
-- Returns access_token from user_connections for campaign owner based on provider

create or replace function public.get_campaign_owner_token(
  p_campaign_id uuid,
  p_provider text default 'gmail'
)
returns jsonb language plpgsql security definer as $$
declare
  v_owner_user_id uuid;
  v_conn jsonb;
begin
  -- Get owner user_id from campaign
  select user_id into v_owner_user_id
  from public.campaigns
  where id = p_campaign_id;

  if v_owner_user_id is null then
    -- Fallback: try to get from workspace owner
    select w.owner_id into v_owner_user_id
    from public.campaigns c
    join public.workspaces w on w.id = c.workspace_id
    where c.id = p_campaign_id;
  end if;

  if v_owner_user_id is null then
    return jsonb_build_object('error', 'Campaign not found or no owner');
  end if;

  -- Get connection from user_connections
  select jsonb_build_object(
    'access_token', access_token,
    'refresh_token', refresh_token,
    'token_expires_at', token_expires_at,
    'user_id', user_id,
    'email_address', email_address
  ) into v_conn
  from public.user_connections
  where user_id = v_owner_user_id
    and provider = p_provider
    and (token_expires_at is null or token_expires_at > now())
  order by created_at asc
  limit 1;

  if v_conn is null then
    return jsonb_build_object('error', format('No active %s connection found for campaign owner', p_provider));
  end if;

  return v_conn;
end;
$$;

-- Grant execute permission
grant execute on function public.get_campaign_owner_token(uuid, text) to authenticated;
grant execute on function public.get_campaign_owner_token(uuid, text) to service_role;

