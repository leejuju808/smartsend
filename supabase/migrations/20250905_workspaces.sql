-- WORKSPACES and membership
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'member',
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_members_ws on public.workspace_members(workspace_id);
create index if not exists idx_workspace_members_user on public.workspace_members(user_id);

-- Add workspace_id to existing entities
alter table if exists public.contacts add column if not exists workspace_id uuid references public.workspaces(id);
alter table if exists public.campaigns add column if not exists workspace_id uuid references public.workspaces(id);
alter table if exists public.campaign_contacts add column if not exists workspace_id uuid references public.workspaces(id);

-- RLS policies (scoped by membership)
alter table if exists public.workspaces enable row level security;
alter table if exists public.workspace_members enable row level security;

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member" on public.workspaces
  for select using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspaces.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "workspace_members_select_self" on public.workspace_members;
create policy "workspace_members_select_self" on public.workspace_members
  for select using (user_id = auth.uid());

drop policy if exists "workspace_members_mutate_owner" on public.workspace_members;
create policy "workspace_members_mutate_owner" on public.workspace_members
  for all using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id and w.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id and w.owner_id = auth.uid()
    )
  );

-- Optional: scope contacts/campaigns via workspace membership
alter table if exists public.contacts enable row level security;
drop policy if exists "contacts_select_own" on public.contacts;
drop policy if exists "contacts_insert_own" on public.contacts;
drop policy if exists "contacts_update_own" on public.contacts;
create policy if not exists "contacts_select_member" on public.contacts
  for select using (
    exists (select 1 from public.workspace_members m where m.workspace_id = contacts.workspace_id and m.user_id = auth.uid())
  );
create policy if not exists "contacts_mutate_member" on public.contacts
  for all using (
    exists (select 1 from public.workspace_members m where m.workspace_id = contacts.workspace_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members m where m.workspace_id = contacts.workspace_id and m.user_id = auth.uid())
  );

alter table if exists public.campaigns enable row level security;
drop policy if exists "campaigns_select_own" on public.campaigns;
drop policy if exists "campaigns_insert_own" on public.campaigns;
drop policy if exists "campaigns_update_own" on public.campaigns;
create policy if not exists "campaigns_select_member" on public.campaigns
  for select using (
    exists (select 1 from public.workspace_members m where m.workspace_id = campaigns.workspace_id and m.user_id = auth.uid())
  );
create policy if not exists "campaigns_mutate_member" on public.campaigns
  for all using (
    exists (select 1 from public.workspace_members m where m.workspace_id = campaigns.workspace_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members m where m.workspace_id = campaigns.workspace_id and m.user_id = auth.uid())
  );

alter table if exists public.campaign_contacts enable row level security;
drop policy if exists "campaign_contacts_select_own" on public.campaign_contacts;
drop policy if exists "campaign_contacts_insert_own" on public.campaign_contacts;
drop policy if exists "campaign_contacts_update_own" on public.campaign_contacts;
drop policy if exists "campaign_contacts_delete_own" on public.campaign_contacts;
create policy if not exists "campaign_contacts_member" on public.campaign_contacts
  for all using (
    exists (select 1 from public.workspace_members m where m.workspace_id = campaign_contacts.workspace_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspace_members m where m.workspace_id = campaign_contacts.workspace_id and m.user_id = auth.uid())
  );

-- Backfill: create a personal workspace for any user with data but no workspace
do $$
declare
  u record;
  ws_id uuid;
begin
  for u in (
    select id, email from auth.users
  ) loop
    -- Create if user has no membership
    if not exists (select 1 from public.workspace_members m where m.user_id = u.id) then
      insert into public.workspaces(name, owner_id) values (coalesce(u.email, 'Personal') || ' Workspace', u.id) returning id into ws_id;
      insert into public.workspace_members(workspace_id, user_id, role) values (ws_id, u.id, 'owner');
    else
      select m.workspace_id into ws_id from public.workspace_members m where m.user_id = u.id limit 1;
    end if;

    -- Assign existing rows owned by user to their workspace
    update public.contacts set workspace_id = ws_id where user_id = u.id and workspace_id is null;
    update public.campaigns set workspace_id = ws_id where user_id = u.id and workspace_id is null;
    update public.campaign_contacts set workspace_id = ws_id where workspace_id is null and campaign_id in (
      select id from public.campaigns where user_id = u.id
    );
  end loop;
end $$;

