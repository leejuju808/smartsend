-- Bulk thread operations RPC functions
-- These functions handle bulk operations on inbox_threads with proper permission checks

-- First, update audit_logs to allow new action types if needed
-- Note: The CHECK constraint will be updated to allow these new actions
alter table public.audit_logs 
  drop constraint if exists audit_logs_action_check;

alter table public.audit_logs
  add constraint audit_logs_action_check 
  check (action in (
    'share.add', 'share.update', 'share.remove',
    'invite.create', 'invite.accept', 'invite.expire',
    'user.bulk_close', 'user.bulk_reopen', 'user.bulk_assign',
    'user.bulk_clear_label', 'user.bulk_apply_label'
  ));

-- Ensure thread_id column exists in audit_logs (should already exist from earlier migration)
alter table public.audit_logs
  add column if not exists thread_id uuid references public.inbox_threads(id);

-- Close multiple threads
create or replace function public.bulk_close_threads(p_threads uuid[])
returns int
language plpgsql security definer set search_path=public as $$
declare 
  t uuid; 
  v_campaign uuid; 
  v_ok boolean; 
  v_count int:=0;
begin
  foreach t in array p_threads loop
    select campaign_id into v_campaign from public.inbox_threads where id=t;
    if v_campaign is null then continue; end if;

    select public.can_edit_campaign(v_campaign) into v_ok;
    if not v_ok then continue; end if;

    update public.inbox_threads set status='closed' where id=t;
    insert into public.audit_logs(campaign_id, thread_id, action, meta)
    values (v_campaign, t, 'user.bulk_close', jsonb_build_object('bulk', true));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Reopen multiple threads
create or replace function public.bulk_reopen_threads(p_threads uuid[])
returns int
language plpgsql security definer set search_path=public as $$
declare 
  t uuid; 
  v_campaign uuid; 
  v_ok boolean; 
  v_count int:=0;
begin
  foreach t in array p_threads loop
    select campaign_id into v_campaign from public.inbox_threads where id=t;
    if v_campaign is null then continue; end if;

    select public.can_edit_campaign(v_campaign) into v_ok;
    if not v_ok then continue; end if;

    update public.inbox_threads set status='open' where id=t;
    insert into public.audit_logs(campaign_id, thread_id, action, meta)
    values (v_campaign, t, 'user.bulk_reopen', jsonb_build_object('bulk', true));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Assign multiple to a specific teammate (owner/editor) or unassign (null)
create or replace function public.bulk_assign_threads(p_threads uuid[], p_user uuid)
returns int
language plpgsql security definer set search_path=public as $$
declare 
  t uuid; 
  v_campaign uuid; 
  v_ok boolean; 
  v_count int:=0; 
  v_role text;
begin
  foreach t in array p_threads loop
    select campaign_id into v_campaign from public.inbox_threads where id=t;
    if v_campaign is null then continue; end if;

    select public.can_edit_campaign(v_campaign) into v_ok;
    if not v_ok then continue; end if;

    if p_user is null then
      update public.inbox_threads set assigned_to = null where id=t;
    else
      if exists (select 1 from public.campaigns c where c.id=v_campaign and c.user_id=p_user) then
        v_role := 'owner';
      elsif exists (select 1 from public.campaign_shares s where s.campaign_id=v_campaign and s.user_id=p_user and s.role='editor') then
        v_role := 'editor';
      else
        continue;
      end if;
      update public.inbox_threads set assigned_to = p_user where id=t;
    end if;

    insert into public.audit_logs(campaign_id, thread_id, action, meta)
    values (v_campaign, t, 'user.bulk_assign', jsonb_build_object('assigned_to', p_user));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Clear latest AI label mirror on threads (message-level clear happens per-trigger on next classify)
create or replace function public.bulk_clear_thread_labels(p_threads uuid[])
returns int
language plpgsql security definer set search_path=public as $$
declare 
  t uuid; 
  v_campaign uuid; 
  v_ok boolean; 
  v_count int:=0;
begin
  foreach t in array p_threads loop
    select campaign_id into v_campaign from public.inbox_threads where id=t;
    if v_campaign is null then continue; end if;

    select public.can_edit_campaign(v_campaign) into v_ok;
    if not v_ok then continue; end if;

    update public.inbox_threads set last_ai_label=null where id=t;
    insert into public.audit_logs(campaign_id, thread_id, action, meta)
    values (v_campaign, t, 'user.bulk_clear_label', jsonb_build_object('bulk', true));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Apply a specific label to mirror (e.g., force to 'positive')
create or replace function public.bulk_apply_thread_label(p_threads uuid[], p_label text)
returns int
language plpgsql security definer set search_path=public as $$
declare 
  t uuid; 
  v_campaign uuid; 
  v_ok boolean; 
  v_count int:=0;
begin
  if p_label not in ('positive','neutral','negative','unsubscribe','ooo','bounce','other') then
    raise exception 'invalid label';
  end if;

  foreach t in array p_threads loop
    select campaign_id into v_campaign from public.inbox_threads where id=t;
    if v_campaign is null then continue; end if;

    select public.can_edit_campaign(v_campaign) into v_ok;
    if not v_ok then continue; end if;

    update public.inbox_threads set last_ai_label=p_label where id=t;
    insert into public.audit_logs(campaign_id, thread_id, action, meta)
    values (v_campaign, t, 'user.bulk_apply_label', jsonb_build_object('label', p_label));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

