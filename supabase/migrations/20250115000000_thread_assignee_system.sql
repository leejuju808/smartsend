-- Thread Assignee System
-- Adds assignment functionality to inbox_threads with secure RPC and audit logging

-- 1) Fast lookups - indexes for assignment queries
create index if not exists idx_inbox_threads_assigned_to on public.inbox_threads(assigned_to);
create index if not exists idx_inbox_threads_campaign on public.inbox_threads(campaign_id);

-- 2) Ensure assigned_to column exists (rename assignee_id if it exists, or add it)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' 
    and table_name = 'inbox_threads' 
    and column_name = 'assigned_to'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' 
      and table_name = 'inbox_threads' 
      and column_name = 'assignee_id'
    ) then
      alter table public.inbox_threads rename column assignee_id to assigned_to;
    else
      alter table public.inbox_threads add column assigned_to uuid references auth.users(id) on delete set null;
    end if;
  end if;
end $$;

-- 3) RPC: set assignee (assign to owner/editor teammate or null)
create or replace function public.set_thread_assignee(p_thread uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_ok boolean;
  v_user_role text;
begin
  -- find campaign of thread
  select campaign_id into v_campaign
  from public.inbox_threads
  where id = p_thread;

  if v_campaign is null then
    raise exception 'thread not found';
  end if;

  -- check permission: caller must be owner or editor of campaign
  select public.can_edit_campaign(v_campaign) into v_ok;
  if not v_ok then
    raise exception 'permission denied';
  end if;

  -- allow unassign (p_user is null)
  if p_user is null then
    update public.inbox_threads set assigned_to = null where id = p_thread;
    insert into public.audit_logs(campaign_id, thread_id, action, meta)
    values (v_campaign, p_thread, 'user.assign', jsonb_build_object('assigned_to', null));
    return;
  end if;

  -- verify target is valid teammate: owner or editor of the campaign
  if exists (select 1 from public.campaigns c where c.id = v_campaign and c.user_id = p_user) then
    v_user_role := 'owner';
  elsif exists (select 1 from public.campaign_shares s where s.campaign_id = v_campaign and s.user_id = p_user and s.role in ('editor')) then
    v_user_role := 'editor';
  else
    raise exception 'assignee must be owner or editor of this campaign';
  end if;

  update public.inbox_threads set assigned_to = p_user where id = p_thread;

  insert into public.audit_logs(campaign_id, thread_id, action, meta)
  values (v_campaign, p_thread, 'user.assign',
          jsonb_build_object('assigned_to', p_user, 'role', v_user_role));
end
$$;

-- Grant execute permission
grant execute on function public.set_thread_assignee(uuid, uuid) to authenticated;
