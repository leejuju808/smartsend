-- AUREV SDK Core Setup Migration
-- This migration sets up the unified infrastructure for all AUREV apps

-- 1. Create aurev_users mapping table for unified user-org relationships
create table if not exists public.aurev_users (
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, org_id)
);

create index if not exists idx_aurev_users_user on public.aurev_users(user_id);
create index if not exists idx_aurev_users_org on public.aurev_users(org_id);

comment on table public.aurev_users is 'Unified user-organization mapping for AUREV ecosystem';

-- 2. Update analytics_events table to support org_id
alter table public.analytics_events 
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists event text,
  add column if not exists payload jsonb;

-- If event column doesn't exist but name does, rename it
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'analytics_events' 
    and column_name = 'name'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'analytics_events' 
    and column_name = 'event'
  ) then
    alter table public.analytics_events rename column name to event;
  end if;
end $$;

-- If context exists but payload doesn't, rename it
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'analytics_events' 
    and column_name = 'context'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'analytics_events' 
    and column_name = 'payload'
  ) then
    alter table public.analytics_events rename column context to payload;
  end if;
end $$;

-- Create indexes for analytics_events with org_id
create index if not exists idx_analytics_events_org_time on public.analytics_events (org_id, created_at desc);
create index if not exists idx_analytics_events_event on public.analytics_events (event);

-- 3. Ensure subscriptions table has org_id reference if it exists
-- Note: subscriptions table may already exist, so we'll just ensure compatibility
do $$
begin
  -- Add org_id foreign key constraint if subscriptions table exists and doesn't have the constraint
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'subscriptions') then
    -- Ensure org_id can reference organizations
    if not exists (
      select 1 from information_schema.table_constraints 
      where table_schema = 'public' 
      and table_name = 'subscriptions' 
      and constraint_name like '%org_id%'
      and constraint_type = 'FOREIGN KEY'
    ) then
      -- Try to add foreign key constraint if org_id column exists
      if exists (
        select 1 from information_schema.columns 
        where table_schema = 'public' 
        and table_name = 'subscriptions' 
        and column_name = 'org_id'
      ) then
        alter table public.subscriptions
          add constraint fk_subscriptions_org 
          foreign key (org_id) references public.organizations(id) on delete cascade;
      end if;
    end if;
  end if;
end $$;

comment on table public.subscriptions is 'Unified billing subscriptions for AUREV ecosystem (may be org-scoped or user-scoped)';

-- 4. Backfill aurev_users from existing organization_members
insert into public.aurev_users (user_id, org_id)
select user_id, org_id 
from public.organization_members
where not exists (
  select 1 from public.aurev_users au 
  where au.user_id = organization_members.user_id 
  and au.org_id = organization_members.org_id
)
on conflict do nothing;

-- 5. Row-level security policies

-- Enable RLS
alter table public.aurev_users enable row level security;
alter table public.subscriptions enable row level security;

-- aurev_users policies
drop policy if exists "aurev_users: users can view their own mappings" on public.aurev_users;
create policy "aurev_users: users can view their own mappings"
on public.aurev_users for select
to authenticated
using (user_id = auth.uid() or org_id in (
  select org_id from public.organization_members where user_id = auth.uid()
));

drop policy if exists "aurev_users: users can insert their own mappings" on public.aurev_users;
create policy "aurev_users: users can insert their own mappings"
on public.aurev_users for insert
to authenticated
with check (user_id = auth.uid());

-- subscriptions policies (add org-based policies alongside existing user-based ones)
drop policy if exists "subscriptions: org members can view" on public.subscriptions;
create policy "subscriptions: org members can view"
on public.subscriptions for select
to authenticated
using (
  -- Allow if user_id matches (existing policy compatibility)
  auth.uid() = user_id 
  OR 
  -- Allow if org_id matches and user is member (new org-based access)
  (org_id is not null AND org_id in (
    select org_id from public.organization_members where user_id = auth.uid()
  ))
);

drop policy if exists "subscriptions: org admins can manage" on public.subscriptions;
create policy "subscriptions: org admins can manage"
on public.subscriptions for all
to authenticated
using (
  -- Allow if user_id matches (existing policy compatibility)
  auth.uid() = user_id 
  OR 
  -- Allow if org_id matches and user is admin/owner (new org-based access)
  (org_id is not null AND org_id in (
    select org_id from public.organization_members 
    where user_id = auth.uid() and role in ('owner', 'admin')
  ))
)
with check (
  -- Allow if user_id matches (existing policy compatibility)
  auth.uid() = user_id 
  OR 
  -- Allow if org_id matches and user is admin/owner (new org-based access)
  (org_id is not null AND org_id in (
    select org_id from public.organization_members 
    where user_id = auth.uid() and role in ('owner', 'admin')
  ))
);

