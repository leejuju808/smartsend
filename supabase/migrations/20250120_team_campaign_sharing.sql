-- Team Campaign Sharing Enhancement
-- Add proper roles, invites, campaign ACL, and helper functions

-- 1) Update workspace_members table to use proper role constraints
alter table if exists public.workspace_members 
  drop constraint if exists workspace_members_role_check;

alter table if exists public.workspace_members 
  add constraint workspace_members_role_check 
  check (role in ('owner','admin','editor','viewer'));

-- 2) Add campaign_members table for per-campaign ACL
create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor','viewer')),
  created_at timestamptz default now(),
  primary key (campaign_id, user_id)
);

create index if not exists idx_campaign_members_campaign on public.campaign_members(campaign_id);
create index if not exists idx_campaign_members_user on public.campaign_members(user_id);

-- 3) Add workspace_invites table
create table if not exists public.workspace_invites (
  token uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','editor','viewer')),
  invited_by uuid not null references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_workspace_invites_workspace on public.workspace_invites(workspace_id);
create index if not exists idx_workspace_invites_email on public.workspace_invites(email);
create index if not exists idx_workspace_invites_token on public.workspace_invites(token);

-- 4) Helper functions for role checking
create or replace function public.is_workspace_member(_ws uuid)
returns boolean language sql stable security definer as $$
  select exists(
    select 1 from public.workspace_members wm
    where wm.workspace_id = _ws and wm.user_id = auth.uid()
  );
$$;

create or replace function public.has_ws_role(_ws uuid, _min text)
returns boolean language sql stable security definer as $$
  with ranks as (
    select unnest(array['viewer','editor','admin','owner']) as r, generate_series(1,4) as lvl
  ),
  me as (
    select wm.role from workspace_members wm
    where wm.workspace_id=_ws and wm.user_id=auth.uid()
  )
  select coalesce((select r1.lvl <= r2.lvl
    from ranks r1 join ranks r2 on r2.r = (select role from me limit 1)
    where r1.r = _min), false);
$$;

create or replace function public.has_campaign_role(_campaign_id uuid, _min text)
returns boolean language sql stable security definer as $$
  with ranks as (
    select unnest(array['viewer','editor']) as r, generate_series(1,2) as lvl
  ),
  me as (
    select cm.role from campaign_members cm
    where cm.campaign_id=_campaign_id and cm.user_id=auth.uid()
    union all
    select wm.role from campaigns c
    join workspace_members wm on wm.workspace_id = c.workspace_id
    where c.id=_campaign_id and wm.user_id=auth.uid()
    and not exists (select 1 from campaign_members cm2 where cm2.campaign_id=_campaign_id)
  )
  select coalesce((select r1.lvl <= r2.lvl
    from ranks r1 join ranks r2 on r2.r = (select role from me limit 1)
    where r1.r = _min), false);
$$;

-- 5) Enable RLS on new tables
alter table public.campaign_members enable row level security;
alter table public.workspace_invites enable row level security;

-- 6) Update RLS policies for enhanced role-based access

-- Workspaces: member can read; owner/admin can update
drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "ws read if member" on public.workspaces
for select using (public.is_workspace_member(id));

drop policy if exists "workspaces_update_owner" on public.workspaces;
create policy "ws update if admin+" on public.workspaces
for update using (public.has_ws_role(id,'admin'));

-- Members: visible to members; manage by admin+
drop policy if exists "workspace_members_select_self" on public.workspace_members;
drop policy if exists "workspace_members_mutate_owner" on public.workspace_members;

create policy "wm select" on public.workspace_members
for select using (public.is_workspace_member(workspace_id));

create policy "wm insert admin+" on public.workspace_members
for insert with check (public.has_ws_role(workspace_id,'admin'));

create policy "wm delete admin+" on public.workspace_members
for delete using (public.has_ws_role(workspace_id,'admin'));

create policy "wm update admin+" on public.workspace_members
for update using (public.has_ws_role(workspace_id,'admin'));

-- Campaigns: read for workspace members; write for editor+ (or campaign_members role)
drop policy if exists "campaigns_select_member" on public.campaigns;
drop policy if exists "campaigns_mutate_member" on public.campaigns;

create policy "campaign read" on public.campaigns
for select using (public.is_workspace_member(workspace_id));

create policy "campaign write" on public.campaigns
for insert with check (public.has_ws_role(workspace_id,'editor'))
, for update using (public.has_ws_role(workspace_id,'editor'))
, for delete using (public.has_ws_role(workspace_id,'admin'));

-- Campaign_members table: only editor+ can manage
create policy "campaign_members select" on public.campaign_members
for select using (true);

create policy "campaign_members write editor+" on public.campaign_members
for all using (true) with check (
  exists (select 1 from campaigns c where c.id=campaign_id and public.has_ws_role(c.workspace_id,'editor'))
);

-- Workspace invites: only admin+ can manage
create policy "workspace_invites select admin+" on public.workspace_invites
for select using (public.has_ws_role(workspace_id,'admin'));

create policy "workspace_invites insert admin+" on public.workspace_invites
for insert with check (public.has_ws_role(workspace_id,'admin'));

create policy "workspace_invites update admin+" on public.workspace_invites
for update using (public.has_ws_role(workspace_id,'admin'));

create policy "workspace_invites delete admin+" on public.workspace_invites
for delete using (public.has_ws_role(workspace_id,'admin'));

-- 7) Update existing RLS policies for other tables to use workspace membership

-- Leads / send_queue / send_logs / email_*: scoped by workspace
drop policy if exists "contacts_select_member" on public.contacts;
drop policy if exists "contacts_mutate_member" on public.contacts;

create policy "leads rw" on public.contacts
for select using (public.is_workspace_member(workspace_id))
, for insert with check (public.has_ws_role(workspace_id,'editor'))
, for update using (public.has_ws_role(workspace_id,'editor'));

-- Update campaign_contacts policies
drop policy if exists "campaign_contacts_member" on public.campaign_contacts;

create policy "queue rw" on public.campaign_contacts
for select using (public.is_workspace_member(workspace_id))
, for insert with check (public.has_ws_role(workspace_id,'editor'))
, for update using (public.has_ws_role(workspace_id,'editor'));

-- 8) Add RLS policies for other tables that might exist
do $$
begin
  -- send_queue table
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='send_queue') then
    alter table public.send_queue enable row level security;
    drop policy if exists "queue rw" on public.send_queue;
    create policy "queue rw" on public.send_queue
    for select using (public.is_workspace_member(workspace_id))
    , for insert with check (public.has_ws_role(workspace_id,'editor'))
    , for update using (public.has_ws_role(workspace_id,'editor'));
  end if;

  -- send_logs table
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='send_logs') then
    alter table public.send_logs enable row level security;
    drop policy if exists "logs r" on public.send_logs;
    create policy "logs r" on public.send_logs
    for select using (public.is_workspace_member(workspace_id));
  end if;

  -- email_replies table
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='email_replies') then
    alter table public.email_replies enable row level security;
    drop policy if exists "email_replies r" on public.email_replies;
    create policy "email_replies r" on public.email_replies
    for select using (public.is_workspace_member(workspace_id))
    , for update using (public.has_ws_role(workspace_id,'editor'));
  end if;

  -- email_events table
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='email_events') then
    alter table public.email_events enable row level security;
    drop policy if exists "email_events r" on public.email_events;
    create policy "email_events r" on public.email_events
    for select using (public.is_workspace_member(workspace_id));
  end if;
end $$;

-- 9) Backfill: ensure all existing workspace members have proper roles
update public.workspace_members 
set role = 'owner' 
where role = 'member' 
and exists (
  select 1 from public.workspaces w 
  where w.id = workspace_members.workspace_id 
  and w.owner_id = workspace_members.user_id
);

-- Set default role for other members
update public.workspace_members 
set role = 'editor' 
where role = 'member';

-- 10) Create function to bootstrap workspace owner
create or replace function public.bootstrap_workspace_owner()
returns trigger language plpgsql security definer as $$
begin
  -- Insert owner as workspace member
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  
  return new;
end;
$$;

-- Create trigger for workspace creation
drop trigger if exists bootstrap_workspace_owner_trigger on public.workspaces;
create trigger bootstrap_workspace_owner_trigger
  after insert on public.workspaces
  for each row execute function public.bootstrap_workspace_owner();