-- Thread AI Override Helpers
-- Safe helpers for manual overrides of AI actions on threads

-- =====================================================
-- 1) Ensure inbox_threads has an id column (if using thread_key as PK, add id)
-- =====================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbox_threads' and column_name = 'id'
  ) then
    -- Add id column if it doesn't exist (non-primary if thread_key is PK)
    alter table public.inbox_threads 
      add column id uuid default gen_random_uuid();
    -- Create index for lookups
    create index if not exists idx_inbox_threads_id on public.inbox_threads(id);
  end if;
end $$;

-- =====================================================
-- 2) Ensure audit_logs supports thread_id (may have different schemas)
-- =====================================================
do $$
begin
  -- Ensure thread_id column exists
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'thread_id'
  ) then
    alter table public.audit_logs 
      add column thread_id uuid references public.inbox_threads(id) on delete set null;
  end if;
  
  -- Ensure campaign_id can be null (if it exists and is not null)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' 
      and table_name = 'audit_logs' 
      and column_name = 'campaign_id'
      and is_nullable = 'NO'
  ) then
    -- Make campaign_id nullable if it's currently required
    alter table public.audit_logs 
      alter column campaign_id drop not null;
  end if;
end $$;

-- =====================================================
-- 3) Reopen thread function
-- =====================================================
create or replace function public.reopen_thread(p_thread uuid)
returns void
language sql
security definer
as $$
  update public.inbox_threads 
  set status='open' 
  where id=p_thread;
  
  insert into public.audit_logs(action,thread_id,meta)
  values('user.reopen',p_thread,jsonb_build_object('manual',true));
$$;

-- Grant execute permission
grant execute on function public.reopen_thread(uuid) to authenticated;

-- =====================================================
-- 4) Clear thread AI label function
-- =====================================================
create or replace function public.clear_thread_ai_label(p_thread uuid)
returns void
language plpgsql
security definer
as $$
declare
  msg_id uuid;
begin
  -- Find the latest inbound message with AI label
  select id into msg_id
  from public.inbox_messages
  where thread_id=p_thread 
    and direction='in' 
    and ai_label is not null
  order by sent_at desc 
  limit 1;

  -- Clear AI fields on the message if found
  if msg_id is not null then
    update public.inbox_messages
      set ai_label=null, 
          ai_intent=null, 
          ai_confidence=null, 
          classified_at=null
      where id=msg_id;
  end if;

  -- Clear last_ai_label on thread
  update public.inbox_threads 
  set last_ai_label=null 
  where id=p_thread;

  -- Log the action
  insert into public.audit_logs(action,thread_id,meta)
  values('user.clear_ai_label',p_thread,jsonb_build_object('manual',true));
end
$$;

-- Grant execute permission
grant execute on function public.clear_thread_ai_label(uuid) to authenticated;

