-- Team Campaign Sharing - RLS + Invites
-- Adds workspace memberships, invites, and row-level security

-- 1) Core tables (only create if they don't exist)
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

-- Update role constraint if it doesn't match
do $$ 
begin
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'workspace_members_role_check'
  ) then
    alter table workspace_members drop constraint if exists workspace_members_role_check;
  end if;
  alter table workspace_members add constraint workspace_members_role_check 
    check (role in ('owner','admin','member'));
end $$;

create table if not exists workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role text not null,
  token text not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz
);

-- Add unique index on token if it doesn't exist
create unique index if not exists workspace_invites_token_idx on workspace_invites(token);

-- Update role constraint for invites if needed
do $$ 
begin
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'workspace_invites_role_check'
  ) then
    alter table workspace_invites drop constraint if exists workspace_invites_role_check;
  end if;
  alter table workspace_invites add constraint workspace_invites_role_check 
    check (role in ('admin','member'));
end $$;

-- 2) helper functions for RLS
create or replace function is_workspace_member(p_workspace uuid)
returns boolean language sql security definer as $$
  select exists(
    select 1 from workspace_members wm
    where wm.workspace_id = p_workspace and wm.user_id = auth.uid()
  );
$$;

create or replace function has_workspace_role(p_workspace uuid, p_roles text[])
returns boolean language sql security definer as $$
  select exists(
    select 1 from workspace_members wm
    where wm.workspace_id = p_workspace and wm.user_id = auth.uid()
      and wm.role = any(p_roles)
  );
$$;

-- 3) Ensure related tables have workspace_id (add if missing)
do $$ begin
  if not exists(select 1 from information_schema.columns where table_name='campaigns' and column_name='workspace_id') then
    alter table campaigns add column workspace_id uuid;
    create index if not exists campaigns_workspace_idx on campaigns(workspace_id);
  end if;

  if not exists(select 1 from information_schema.columns where table_name='leads' and column_name='workspace_id') then
    alter table leads add column workspace_id uuid;
    create index if not exists leads_workspace_idx on leads(workspace_id);
  end if;

  if not exists(select 1 from information_schema.columns where table_name='contacts' and column_name='workspace_id') then
    alter table contacts add column workspace_id uuid;
    create index if not exists contacts_workspace_idx on contacts(workspace_id);
  end if;

  if not exists(select 1 from information_schema.columns where table_name='campaign_messages' and column_name='workspace_id') then
    alter table campaign_messages add column workspace_id uuid;
    create index if not exists campaign_messages_workspace_idx on campaign_messages(workspace_id);
  end if;

  if not exists(select 1 from information_schema.columns where table_name='send_windows' and column_name='workspace_id') then
    alter table send_windows add column workspace_id uuid;
    create index if not exists send_windows_workspace_idx on send_windows(workspace_id);
  end if;

  if not exists(select 1 from information_schema.columns where table_name='send_limits' and column_name='workspace_id') then
    alter table send_limits add column workspace_id uuid;
    create index if not exists send_limits_workspace_idx on send_limits(workspace_id);
  end if;

  if not exists(select 1 from information_schema.columns where table_name='integrations_gmail' and column_name='workspace_id') then
    alter table integrations_gmail add column workspace_id uuid;
    create index if not exists integrations_gmail_workspace_idx on integrations_gmail(workspace_id);
  end if;

  if not exists(select 1 from information_schema.columns where table_name='logs' and column_name='workspace_id') then
    alter table logs add column workspace_id uuid;
    create index if not exists logs_workspace_idx on logs(workspace_id);
  end if;
end $$;

-- 4) RLS: enable & lock down (repeat pattern across key tables)
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table workspace_invites enable row level security;
alter table campaigns enable row level security;
alter table leads enable row level security;
alter table contacts enable row level security;
alter table campaign_messages enable row level security;
alter table send_windows enable row level security;
alter table send_limits enable row level security;
alter table integrations_gmail enable row level security;
alter table logs enable row level security;

-- Workspaces
drop policy if exists "ws owner or member can select" on workspaces;
create policy "ws owner or member can select"
on workspaces for select using (is_workspace_member(id));

drop policy if exists "ws owners can update" on workspaces;
create policy "ws owners can update"
on workspaces for update using (has_workspace_role(id, array['owner']));

-- Members
drop policy if exists "members list in my workspaces" on workspace_members;
create policy "members list in my workspaces"
on workspace_members for select using (is_workspace_member(workspace_id));

drop policy if exists "owners/admins manage members" on workspace_members;
create policy "owners/admins manage members"
on workspace_members for insert with check (has_workspace_role(workspace_id, array['owner','admin']));

drop policy if exists "owners/admins update members" on workspace_members;
create policy "owners/admins update members"
on workspace_members for update using (has_workspace_role(workspace_id, array['owner','admin']));

drop policy if exists "owners/admins delete members" on workspace_members;
create policy "owners/admins delete members"
on workspace_members for delete using (has_workspace_role(workspace_id, array['owner','admin']));

-- Invites (creator must be owner/admin)
drop policy if exists "invites visible to members" on workspace_invites;
create policy "invites visible to members"
on workspace_invites for select using (is_workspace_member(workspace_id));

drop policy if exists "create invites owner/admin" on workspace_invites;
create policy "create invites owner/admin"
on workspace_invites for insert with check (has_workspace_role(workspace_id, array['owner','admin']));

drop policy if exists "delete invites owner/admin" on workspace_invites;
create policy "delete invites owner/admin"
on workspace_invites for delete using (has_workspace_role(workspace_id, array['owner','admin']));

-- Campaigns / Leads / Messages / Settings / Logs — member read, owner/admin write
drop policy if exists "campaigns member read" on campaigns;
create policy "campaigns member read" on campaigns for select using (is_workspace_member(workspace_id));
drop policy if exists "campaigns owner/admin write" on campaigns;
create policy "campaigns owner/admin write" on campaigns for all using (has_workspace_role(workspace_id, array['owner','admin'])) with check (has_workspace_role(workspace_id, array['owner','admin']));

drop policy if exists "leads member read" on leads;
create policy "leads member read" on leads for select using (is_workspace_member(workspace_id));
drop policy if exists "leads owner/admin write" on leads;
create policy "leads owner/admin write" on leads for all using (has_workspace_role(workspace_id, array['owner','admin'])) with check (has_workspace_role(workspace_id, array['owner','admin']));

drop policy if exists "contacts member read" on contacts;
create policy "contacts member read" on contacts for select using (is_workspace_member(workspace_id));
drop policy if exists "contacts owner/admin write" on contacts;
create policy "contacts owner/admin write" on contacts for all using (has_workspace_role(workspace_id, array['owner','admin'])) with check (has_workspace_role(workspace_id, array['owner','admin']));

drop policy if exists "messages member read" on campaign_messages;
create policy "messages member read" on campaign_messages for select using (is_workspace_member(workspace_id));
drop policy if exists "messages owner/admin write" on campaign_messages;
create policy "messages owner/admin write" on campaign_messages for all using (has_workspace_role(workspace_id, array['owner','admin'])) with check (has_workspace_role(workspace_id, array['owner','admin']));

drop policy if exists "send_windows member read" on send_windows;
create policy "send_windows member read" on send_windows for select using (is_workspace_member(workspace_id));
drop policy if exists "send_windows owner/admin write" on send_windows;
create policy "send_windows owner/admin write" on send_windows for all using (has_workspace_role(workspace_id, array['owner','admin'])) with check (has_workspace_role(workspace_id, array['owner','admin']));

drop policy if exists "send_limits member read" on send_limits;
create policy "send_limits member read" on send_limits for select using (is_workspace_member(workspace_id));
drop policy if exists "send_limits owner/admin write" on send_limits;
create policy "send_limits owner/admin write" on send_limits for all using (has_workspace_role(workspace_id, array['owner','admin'])) with check (has_workspace_role(workspace_id, array['owner','admin']));

drop policy if exists "gmail member read" on integrations_gmail;
create policy "gmail member read" on integrations_gmail for select using (is_workspace_member(workspace_id));
drop policy if exists "gmail owner/admin write" on integrations_gmail;
create policy "gmail owner/admin write" on integrations_gmail for all using (has_workspace_role(workspace_id, array['owner','admin'])) with check (has_workspace_role(workspace_id, array['owner','admin']));

drop policy if exists "logs member read" on logs;
create policy "logs member read" on logs for select using (is_workspace_member(workspace_id));
drop policy if exists "logs owner/admin write" on logs;
create policy "logs owner/admin write" on logs for insert with check (has_workspace_role(workspace_id, array['owner','admin']));
