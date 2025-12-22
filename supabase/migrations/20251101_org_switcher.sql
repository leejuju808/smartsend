-- Block 20: Multi-Workspace & Org Switcher
-- Adds user_org_context for current org tracking and RPC functions for org switching

-- ============================================================================
-- 1. USER ORG CONTEXT TABLE
-- ============================================================================

-- Stores the current org_id per user (replaces cookie-based approach)
create table if not exists public.user_org_context (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_org_id uuid references public.orgs(id) on delete set null,
  updated_at timestamptz default now()
);

create index if not exists idx_user_org_context_user on public.user_org_context(user_id);
create index if not exists idx_user_org_context_org on public.user_org_context(current_org_id);

-- RLS: Users can only read/update their own context
alter table public.user_org_context enable row level security;

drop policy if exists "users_read_own_context" on public.user_org_context;
create policy "users_read_own_context" on public.user_org_context
  for select using (user_id = auth.uid());

drop policy if exists "users_update_own_context" on public.user_org_context;
create policy "users_update_own_context" on public.user_org_context
  for update using (user_id = auth.uid());

drop policy if exists "users_insert_own_context" on public.user_org_context;
create policy "users_insert_own_context" on public.user_org_context
  for insert with check (user_id = auth.uid());

-- ============================================================================
-- 2. VIEW: MY ORGS
-- ============================================================================

-- View that lists all orgs the current user is a member of
create or replace view public.view_my_orgs as
select 
  o.id,
  o.name,
  om.role,
  o.created_at
from public.orgs o
join public.org_members om on om.org_id = o.id
where om.user_id = auth.uid()
order by o.created_at desc;

grant select on public.view_my_orgs to authenticated;

-- ============================================================================
-- 3. RPC FUNCTIONS
-- ============================================================================

-- Get current org for authenticated user
create or replace function public.fn_current_org()
returns uuid
language plpgsql
security definer
stable
as $$
declare
  v_org_id uuid;
begin
  -- First check user_org_context
  select current_org_id into v_org_id
  from public.user_org_context
  where user_id = auth.uid();
  
  -- If found, validate user is still a member
  if v_org_id is not null then
    if exists (
      select 1 from public.org_members
      where org_id = v_org_id and user_id = auth.uid()
    ) then
      return v_org_id;
    end if;
  end if;
  
  -- Fallback: get first org user is a member of
  select om.org_id into v_org_id
  from public.org_members om
  where om.user_id = auth.uid()
  order by om.created_at asc
  limit 1;
  
  -- Auto-set if found (first time use)
  if v_org_id is not null then
    insert into public.user_org_context (user_id, current_org_id)
    values (auth.uid(), v_org_id)
    on conflict (user_id) do update set current_org_id = v_org_id, updated_at = now();
  end if;
  
  return v_org_id;
end;
$$;

grant execute on function public.fn_current_org() to authenticated;

-- List all orgs current user is a member of
create or replace function public.fn_list_my_orgs()
returns table(id uuid, name text, role text, is_current boolean)
language plpgsql
security definer
stable
as $$
declare
  v_current uuid;
begin
  v_current := public.fn_current_org();
  
  return query
  select 
    o.id,
    o.name,
    om.role::text,
    (o.id = v_current) as is_current
  from public.orgs o
  join public.org_members om on om.org_id = o.id
  where om.user_id = auth.uid()
  order by 
    (o.id = v_current) desc, -- current org first
    o.created_at desc;
end;
$$;

grant execute on function public.fn_list_my_orgs() to authenticated;

-- Set current org (switch org)
create or replace function public.fn_set_current_org(p_org_id uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  -- Verify user is a member of the org
  if not exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid()
  ) then
    raise exception 'User is not a member of this organization';
  end if;
  
  -- Update or insert context
  insert into public.user_org_context (user_id, current_org_id, updated_at)
  values (auth.uid(), p_org_id, now())
  on conflict (user_id) do update 
    set current_org_id = p_org_id, updated_at = now();
  
  return true;
end;
$$;

grant execute on function public.fn_set_current_org(uuid) to authenticated;

-- Create new org
create or replace function public.fn_create_org(p_name text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_has_owner_id boolean;
begin
  -- Check if owner_id column exists
  select exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'orgs' 
    and column_name = 'owner_id'
  ) into v_has_owner_id;
  
  -- Create org (with or without owner_id depending on schema)
  if v_has_owner_id then
    insert into public.orgs (name, owner_id)
    values (p_name, auth.uid())
    returning id into v_org_id;
  else
    insert into public.orgs (name)
    values (p_name)
    returning id into v_org_id;
  end if;
  
  -- Add creator as owner member
  insert into public.org_members (org_id, user_id, role)
  values (v_org_id, auth.uid(), 'owner')
  on conflict (org_id, user_id) do nothing;
  
  -- Set as current org
  insert into public.user_org_context (user_id, current_org_id)
  values (auth.uid(), v_org_id)
  on conflict (user_id) do update set current_org_id = v_org_id, updated_at = now();
  
  return v_org_id;
end;
$$;

grant execute on function public.fn_create_org(text) to authenticated;

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

comment on table public.user_org_context is 'Stores the current org_id for each user (replaces cookie-based switching)';
comment on view public.view_my_orgs is 'Lists all orgs the current user is a member of';
comment on function public.fn_current_org() is 'Returns current org_id for authenticated user, auto-sets first org if none';
comment on function public.fn_list_my_orgs() is 'Returns all orgs user is member of with current org flag';
comment on function public.fn_set_current_org(uuid) is 'Switches current org for authenticated user';
comment on function public.fn_create_org(text) is 'Creates a new org and sets it as current';

