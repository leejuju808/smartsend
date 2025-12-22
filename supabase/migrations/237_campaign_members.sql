-- Block 223 — Team Campaign Sharing v1
-- Campaign members table and owner_id migration

-- 1. Ensure campaign_members table exists (it may already exist from previous migrations)
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor', -- viewer | editor | owner
  created_at timestamptz not null default now()
);

-- Handle case where table exists with composite PK (drop id column if composite PK exists)
do $$
begin
  -- Check if composite primary key exists
  if exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'campaign_members'
      and tc.constraint_type = 'PRIMARY KEY'
      and (
        select count(*) from information_schema.key_column_usage
        where constraint_name = tc.constraint_name
        and table_schema = 'public'
        and table_name = 'campaign_members'
      ) > 1
  ) then
    -- Composite PK exists, drop id column if it exists
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'campaign_members'
        and column_name = 'id'
    ) then
      alter table public.campaign_members drop column id;
    end if;
  else
    -- No composite PK, ensure id column exists and add unique constraint
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'campaign_members'
        and column_name = 'id'
    ) then
      alter table public.campaign_members add column id uuid primary key default gen_random_uuid();
    end if;
    
    -- Add unique constraint on (campaign_id, user_id) if it doesn't exist
    if not exists (
      select 1 from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'campaign_members'
        and constraint_name = 'campaign_members_campaign_user_unique'
    ) then
      create unique index if not exists campaign_members_campaign_user_unique
        on public.campaign_members(campaign_id, user_id);
    end if;
  end if;
end $$;

-- Ensure role column has correct default
alter table public.campaign_members
  alter column role set default 'editor';

-- Create indexes
create index if not exists idx_campaign_members_campaign on public.campaign_members(campaign_id);
create index if not exists idx_campaign_members_user on public.campaign_members(user_id);

-- 2. Add owner_id to campaigns table
alter table public.campaigns
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- 3. Set owner_id for existing campaigns
-- First try created_by, then user_id, then workspace owner
update public.campaigns
set owner_id = coalesce(
  (select created_by from (select id, created_by from public.campaigns) c2 where c2.id = campaigns.id),
  user_id,
  (select user_id from public.workspace_members wm 
   where wm.workspace_id = campaigns.workspace_id 
   and wm.role = 'owner' 
   limit 1)
)
where owner_id is null;

-- Ensure RLS is enabled
alter table public.campaign_members enable row level security;

-- Basic RLS policies for campaign_members (read by members, write by owners)
drop policy if exists "campaign_members_select" on public.campaign_members;
create policy "campaign_members_select" on public.campaign_members
  for select
  using (
    -- Can see members if you're a member of the campaign
    exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = campaign_members.campaign_id
      and cm.user_id = auth.uid()
    )
    -- Or if you're the campaign owner
    or exists (
      select 1 from public.campaigns c
      where c.id = campaign_members.campaign_id
      and c.owner_id = auth.uid()
    )
  );

drop policy if exists "campaign_members_insert" on public.campaign_members;
create policy "campaign_members_insert" on public.campaign_members
  for insert
  with check (
    -- Only owners can add members
    exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = campaign_members.campaign_id
      and cm.user_id = auth.uid()
      and cm.role = 'owner'
    )
    or exists (
      select 1 from public.campaigns c
      where c.id = campaign_members.campaign_id
      and c.owner_id = auth.uid()
    )
  );

drop policy if exists "campaign_members_delete" on public.campaign_members;
create policy "campaign_members_delete" on public.campaign_members
  for delete
  using (
    -- Only owners can remove members
    exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = campaign_members.campaign_id
      and cm.user_id = auth.uid()
      and cm.role = 'owner'
    )
    or exists (
      select 1 from public.campaigns c
      where c.id = campaign_members.campaign_id
      and c.owner_id = auth.uid()
    )
  );










