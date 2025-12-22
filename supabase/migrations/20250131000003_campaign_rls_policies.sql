-- Step 2: RLS Policies for Campaigns and Related Tables
-- Enforces tenant + campaign membership access control

-- Enable RLS on campaigns (if not already enabled)
alter table public.campaigns enable row level security;

-- Drop existing policies that might conflict
drop policy if exists "campaigns tenant readers" on public.campaigns;
drop policy if exists "campaigns editors" on public.campaigns;
drop policy if exists "campaigns owners" on public.campaigns;
drop policy if exists "campaigns_select" on public.campaigns;
drop policy if exists "campaigns_insert" on public.campaigns;
drop policy if exists "campaigns_update" on public.campaigns;
drop policy if exists "campaigns_delete" on public.campaigns;
drop policy if exists "campaigns are readable by owner" on public.campaigns;
drop policy if exists "campaigns are insertable by owner" on public.campaigns;
drop policy if exists "campaigns are updatable by owner" on public.campaigns;

-- SELECT: Team members can read campaigns in their team
create policy "campaigns tenant readers"
on public.campaigns
for select
using (
  exists (
    select 1 from public.team_members tm
    where tm.team_id = campaigns.team_id
      and tm.user_id = auth.uid()
  )
);

-- INSERT: Users can create campaigns (will need to set team_id appropriately)
create policy "campaigns insert"
on public.campaigns
for insert
with check (
  auth.uid() is not null
  -- Optionally check team membership:
  -- and exists (
  --   select 1 from public.team_members tm
  --   where tm.team_id = campaigns.team_id
  --   and tm.user_id = auth.uid()
  -- )
);

-- UPDATE: Team owners/admins OR campaign editors can update
create policy "campaigns editors"
on public.campaigns
for update using (
  exists (
    select 1 from public.team_members tm
    where tm.team_id = campaigns.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
  or exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = campaigns.id
      and cm.user_id = auth.uid()
      and cm.role = 'editor'
  )
)
with check (
  exists (
    select 1 from public.team_members tm
    where tm.team_id = campaigns.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
  or exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = campaigns.id
      and cm.user_id = auth.uid()
      and cm.role = 'editor'
  )
);

-- DELETE: Only team owners/admins can delete campaigns
create policy "campaigns delete"
on public.campaigns
for delete using (
  exists (
    select 1 from public.team_members tm
    where tm.team_id = campaigns.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  )
);

-- Apply similar RLS to contacts table (if it exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'contacts') then
    alter table public.contacts enable row level security;
    
    drop policy if exists "contacts tenant readers" on public.contacts;
    create policy "contacts tenant readers"
    on public.contacts
    for select
    using (
      exists (
        select 1 from public.team_members tm
        where tm.team_id = contacts.team_id
          and tm.user_id = auth.uid()
      )
      -- Or if contacts are linked via campaigns:
      or exists (
        select 1 from public.campaigns c
        join public.team_members tm on tm.team_id = c.team_id
        where tm.user_id = auth.uid()
        -- Add join condition based on your contacts schema
      )
    );
  end if;
end $$;

-- Apply RLS to scheduled_messages (if it exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'scheduled_messages') then
    alter table public.scheduled_messages enable row level security;
    
    drop policy if exists "scheduled_messages tenant readers" on public.scheduled_messages;
    create policy "scheduled_messages tenant readers"
    on public.scheduled_messages
    for select
    using (
      exists (
        select 1 from public.campaigns c
        join public.team_members tm on tm.team_id = c.team_id
        where c.id = scheduled_messages.campaign_id
        and tm.user_id = auth.uid()
      )
    );
  end if;
end $$;

-- Apply RLS to replies (if it exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'replies') then
    alter table public.replies enable row level security;
    
    drop policy if exists "replies tenant readers" on public.replies;
    create policy "replies tenant readers"
    on public.replies
    for select
    using (
      exists (
        select 1 from public.campaigns c
        join public.team_members tm on tm.team_id = c.team_id
        where c.id = replies.campaign_id
        and tm.user_id = auth.uid()
      )
    );
  end if;
end $$;















