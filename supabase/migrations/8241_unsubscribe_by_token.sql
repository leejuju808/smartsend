-- 8241_unsubscribe_by_token.sql
-- RPC function to handle unsubscribe via token
-- Uses:
--   - public.unsubscribe_tokens
--   - public.global_suppressions
--   - public.is_suppressed (optional, but nice to have)

create or replace function public.unsubscribe_by_token(
  p_token text,
  p_ip inet default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_token_row public.unsubscribe_tokens%rowtype;
  v_already boolean := false;
begin
  -- 1) Look up the token
  select *
  into v_token_row
  from public.unsubscribe_tokens
  where token = p_token
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'error',
      'reason', 'invalid_token'
    );
  end if;

  if v_token_row.unsubscribed_at is not null then
    v_already := true;
  end if;

  -- 2) Ensure global suppression exists for this workspace + email
  insert into public.global_suppressions (
    workspace_id,
    email,
    reason,
    source,
    created_by
  )
  values (
    v_token_row.workspace_id,
    v_token_row.email,
    'User clicked unsubscribe link',
    'manual',
    null
  )
  on conflict (workspace_id, email)
  do update
    set reason = excluded.reason,
        source = excluded.source;

  -- 3) Update token row with unsubscribe metadata
  update public.unsubscribe_tokens
  set
    unsubscribed_at = coalesce(unsubscribed_at, now()),
    unsubscribed_ip = coalesce(unsubscribed_ip, p_ip),
    user_agent = coalesce(user_agent, p_user_agent)
  where id = v_token_row.id;

  -- 4) Return structured info
  return jsonb_build_object(
    'status', 'ok',
    'email', v_token_row.email,
    'workspace_id', v_token_row.workspace_id,
    'already_unsubscribed', v_already
  );
end;
$$;

grant execute on function public.unsubscribe_by_token(text, inet, text)
  to authenticated, anon;

