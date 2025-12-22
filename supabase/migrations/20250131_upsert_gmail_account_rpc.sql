-- RPC function to upsert Gmail account credentials
create or replace function public.upsert_gmail_account(
  p_user_id uuid,
  p_email text,
  p_access_token text,
  p_refresh_token text,
  p_expires_in_seconds bigint
) returns uuid as $$
declare
  v_workspace_id uuid;
  v_account_id uuid;
  v_expires_at timestamptz;
begin
  -- Get user's workspace_id
  select workspace_id into v_workspace_id
  from public.workspace_members
  where user_id = p_user_id
  order by created_at asc
  limit 1;

  -- If user has no workspace, create one
  if v_workspace_id is null then
    insert into public.workspaces(name, owner_id)
    values (coalesce((select email from auth.users where id = p_user_id), 'Personal') || ' Workspace', p_user_id)
    returning id into v_workspace_id;

    -- Add user to workspace as owner
    insert into public.workspace_members(workspace_id, user_id, role)
    values (v_workspace_id, p_user_id, 'owner');
  end if;

  -- Calculate expiration time
  v_expires_at := now() + (p_expires_in_seconds || ' seconds')::interval;

  -- Upsert email_accounts
  insert into public.email_accounts (
    workspace_id,
    user_id,
    provider,
    email,
    access_token,
    refresh_token,
    expires_at,
    updated_at
  )
  values (
    v_workspace_id,
    p_user_id,
    'gmail',
    lower(p_email),
    p_access_token,
    p_refresh_token,
    v_expires_at,
    now()
  )
  on conflict (workspace_id, email)
  do update set
    provider = 'gmail',
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at = excluded.expires_at,
    is_active = true,
    updated_at = now()
  returning id into v_account_id;

  return v_account_id;
end;
$$ language plpgsql security definer;

-- Grant execute permission to authenticated users
grant execute on function public.upsert_gmail_account(uuid, text, text, text, bigint) to authenticated;
