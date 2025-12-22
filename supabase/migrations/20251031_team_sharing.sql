-- 1) Roles

do $$ begin
  create type public.workspace_role as enum ('owner','admin','member','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.campaign_role as enum ('admin','sender','viewer');
exception when duplicate_object then null; end $$;

-- 2) Workspaces & membership (update if needed)
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Update workspace_members to use new enum and add invited_by
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null, -- maps to auth.users.id
  role public.workspace_role not null default 'member',
  invited_by uuid,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_ws_members_user on public.workspace_members(user_id);

-- 3) Campaign ownership + sharing
alter table if exists public.campaigns
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- Update campaign_members to use new enum (migrate existing if needed)
create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null,
  role public.campaign_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

-- Migrate existing roles if table exists with old enum
do $$
begin
  -- Convert old 'owner' to 'admin', 'editor' to 'sender', keep 'viewer'
  if exists (select 1 from information_schema.columns 
             where table_schema='public' and table_name='campaign_members' 
             and column_name='role' and data_type='text') then
    update public.campaign_members 
    set role = case 
      when role::text = 'owner' then 'admin'::public.campaign_role
      when role::text = 'editor' then 'sender'::public.campaign_role
      else role::public.campaign_role
    end
    where role::text in ('owner','editor');
  end if;
end $$;

create index if not exists idx_campaign_members_user on public.campaign_members(user_id);

-- 4) Optional: tag existing rows to a default workspace for the current dev
-- update public.campaigns set workspace_id = 'YOUR-DEV-WS-ID' where workspace_id is null;

-- 5) Invites
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'member',
  token text not null unique,
  accepted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_ws_invites_email on public.workspace_invites(email);

-- 6) Helper view: campaigns current user can access (workspace OR explicit share)
create or replace view public.v_accessible_campaigns as
select c.*
from public.campaigns c
where exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = c.workspace_id and wm.user_id = auth.uid()
)
or exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = c.id and cm.user_id = auth.uid()
);

-- 7) INDEXES you likely have; add if missing
create index if not exists idx_campaigns_ws on public.campaigns(workspace_id);

