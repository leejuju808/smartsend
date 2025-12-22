-- Campaign Shares Security Lockdown + Thread Permissions
-- Part A-F: Lock down campaign_shares with RLS and audit trail
-- Part G: Permission-aware replies inbox

-- ============================================
-- PART A: Lock down campaign_shares + visibility
-- ============================================

-- 0) Safety: ensure RLS on
alter table public.campaign_shares enable row level security;

-- 1) Only collaborators can see who has access
drop policy if exists shares_select on public.campaign_shares;
create policy shares_select on public.campaign_shares
  for select using (can_view_campaign(campaign_id));

-- 2) Block direct writes (we'll only write via SECURITY DEFINER RPC)
drop policy if exists "campaign_shares_write" on public.campaign_shares;
drop policy if exists "campaign_shares_update" on public.campaign_shares;
drop policy if exists "campaign_shares_delete" on public.campaign_shares;

revoke all on table public.campaign_shares from anon, authenticated;

-- Re-grant select (reads are gated by RLS policy)
grant select on table public.campaign_shares to authenticated;

-- ============================================
-- PART B: Add "list shares with emails" RPC (SECURITY DEFINER)
-- ============================================

create or replace function public.list_campaign_shares(p_campaign uuid)
returns table (
  user_id uuid,
  email text,
  role text
)
language sql
security definer
set search_path = public, auth
stable
as $$
  -- Only collaborators can see the list
  select s.user_id, u.email, s.role
  from public.campaign_shares s
  join auth.users u on u.id = s.user_id
  where s.campaign_id = p_campaign
    and can_view_campaign(p_campaign);
$$;

revoke all on function public.list_campaign_shares(uuid) from public;
grant execute on function public.list_campaign_shares(uuid) to authenticated;

-- ============================================
-- PART C: Prevent owner tampering + tidy helpers
-- ============================================

-- Utility to raise (Postgres 14+)
create or replace function public.raise_exception(msg text)
returns void language plpgsql as $$
begin
  raise exception '%', msg;
end; $$;

-- (Nice to have) Guard: prevent removing yourself as owner via any RPC mishap
create or replace function public.assert_owner(p_campaign uuid)
returns void language sql stable as $$
  select case when user_campaign_role(p_campaign) = 'owner' then null
              else raise_exception('not authorized') end;
$$;

-- ============================================
-- PART F: Minimal audit trail
-- ============================================

create table if not exists public.share_audit (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null default auth.uid(),
  campaign_id uuid not null,
  target_user uuid not null,
  action text not null check (action in ('add','update','remove')),
  role text,
  created_at timestamptz not null default now()
);

alter table public.share_audit enable row level security;
create policy share_audit_read on public.share_audit
  for select using (can_view_campaign(campaign_id));

revoke all on table public.share_audit from anon, authenticated;
grant select on table public.share_audit to authenticated;

-- Log inside RPCs (update existing share functions)
create or replace function public.share_campaign_with_email(p_campaign uuid, p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target uuid;
  myrole text;
  existed boolean;
begin
  select user_campaign_role(p_campaign) into myrole;
  if myrole is distinct from 'owner' then
    raise exception 'not authorized';
  end if;

  select id into target from auth.users where lower(email) = lower(p_email);
  if target is null then
    raise exception 'no such user: %', p_email;
  end if;

  select exists(
    select 1 from public.campaign_shares where campaign_id = p_campaign and user_id = target
  ) into existed;

  insert into public.campaign_shares(campaign_id, user_id, role)
  values (p_campaign, target, p_role)
  on conflict (campaign_id, user_id) do update set role = excluded.role;

  insert into public.share_audit(campaign_id, target_user, action, role)
  values (p_campaign, target, case when existed then 'update' else 'add' end, p_role);
end;
$$;

create or replace function public.unshare_campaign_with_user(p_campaign uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if user_campaign_role(p_campaign) <> 'owner' then
    raise exception 'not authorized';
  end if;
  delete from public.campaign_shares where campaign_id = p_campaign and user_id = p_user;
  insert into public.share_audit(campaign_id, target_user, action)
  values (p_campaign, p_user, 'remove');
end;
$$;

-- ============================================
-- PART G: Permission-aware Replies Inbox
-- ============================================

-- Find the main threads table (check for email_threads first, fallback to threads)
do $$
begin
  -- Try email_threads first (newer schema)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'email_threads') then
    -- Add campaign_id if missing
    alter table public.email_threads add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
    
    -- Add status/snooze columns if missing
    alter table public.email_threads 
      add column if not exists snooze_until timestamptz;
    
    -- Update status column if missing
    do $$
    begin
      if not exists (
        select 1 from information_schema.columns 
        where table_schema = 'public' and table_name = 'email_threads' and column_name = 'status'
      ) then
        alter table public.email_threads add column status text default 'open';
      end if;
    end $$;
    
    -- Update status constraint (drop old if exists, add new)
    alter table public.email_threads 
      drop constraint if exists email_threads_status_check;
    
    alter table public.email_threads
      add constraint email_threads_status_check check (status in ('open','replied','archive'));
    
    -- Enable RLS
    alter table public.email_threads enable row level security;
    
    -- Scope all inbox queries by can_view_campaign(campaign_id)
    drop policy if exists lead_threads_read on public.email_threads;
    create policy lead_threads_read on public.email_threads 
      for select using (
        campaign_id is null or can_view_campaign(campaign_id)
      );
    
    -- Block direct writes (use RPC only)
    revoke all on table public.email_threads from anon, authenticated;
    grant select on table public.email_threads to authenticated;
    
    -- Create RPC for status updates
    create or replace function public.update_thread_status(
      p_thread uuid, 
      p_status text, 
      p_snooze timestamptz default null
    )
    returns void 
    language plpgsql 
    security definer 
    set search_path=public,auth 
    as $$
    declare 
      c uuid;
    begin
      select campaign_id into c from public.email_threads where id = p_thread;
      if c is not null and not can_edit_campaign(c) then
        raise exception 'not authorized';
      end if;
      update public.email_threads
         set status = p_status,
             snooze_until = p_snooze
       where id = p_thread;
    end; $$;
    
    revoke all on function public.update_thread_status(uuid, text, timestamptz) from public;
    grant execute on function public.update_thread_status(uuid, text, timestamptz) to authenticated;
    
  -- Fallback to threads table (older schema)
  elsif exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'threads') then
    -- Add campaign_id if missing
    alter table public.threads add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
    
    -- Add snooze column if missing
    alter table public.threads add column if not exists snooze_until timestamptz;
    
    -- Ensure status column exists (may already be enum or text)
    do $$
    begin
      if not exists (
        select 1 from information_schema.columns 
        where table_schema = 'public' and table_name = 'threads' and column_name = 'status'
      ) then
        alter table public.threads add column status text default 'open';
      end if;
    end $$;
    
    -- Update status constraint
    alter table public.threads 
      drop constraint if exists threads_status_check;
    alter table public.threads
      add constraint threads_status_check check (status in ('open','replied','archive'));
    
    -- Enable RLS
    alter table public.threads enable row level security;
    
    -- Scope all inbox queries by can_view_campaign(campaign_id)
    drop policy if exists "Users can view threads for their leads" on public.threads;
    create policy lead_threads_read on public.threads 
      for select using (
        campaign_id is null or can_view_campaign(campaign_id)
      );
    
    -- Block direct writes (use RPC only)
    revoke all on table public.threads from anon, authenticated;
    grant select on table public.threads to authenticated;
    
    -- Create RPC for status updates
    create or replace function public.update_thread_status(
      p_thread uuid, 
      p_status text, 
      p_snooze timestamptz default null
    )
    returns void 
    language plpgsql 
    security definer 
    set search_path=public,auth 
    as $$
    declare 
      c uuid;
    begin
      select campaign_id into c from public.threads where id = p_thread;
      if c is not null and not can_edit_campaign(c) then
        raise exception 'not authorized';
      end if;
      update public.threads
         set status = p_status,
             snooze_until = p_snooze
       where id = p_thread;
    end; $$;
    
    revoke all on function public.update_thread_status(uuid, text, timestamptz) from public;
    grant execute on function public.update_thread_status(uuid, text, timestamptz) to authenticated;
  end if;
end $$;

-- Index for performance
create index if not exists idx_threads_campaign_id on public.threads(campaign_id) where campaign_id is not null;
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'email_threads') then
    create index if not exists idx_email_threads_campaign_id on public.email_threads(campaign_id) where campaign_id is not null;
  end if;
end $$;

