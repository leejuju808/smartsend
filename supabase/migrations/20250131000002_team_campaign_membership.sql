-- Step 1: Team + Campaign Membership & Roles
-- Creates team_members, campaign_members, invites, and audit_logs tables

-- Team (account) members
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  team_id uuid not null,                           -- tenant/account id
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer')),
  unique (team_id, user_id)
);

-- Indexes for performance
create index if not exists idx_team_members_team on public.team_members(team_id);
create index if not exists idx_team_members_user on public.team_members(user_id);

-- Campaign-level sharing (inherits team membership)
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor','viewer')), -- per-campaign override
  unique (campaign_id, user_id)
);

-- Indexes for performance
create index if not exists idx_campaign_members_campaign on public.campaign_members(campaign_id);
create index if not exists idx_campaign_members_user on public.campaign_members(user_id);

-- Optional: invite tokens for non-users yet
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  team_id uuid not null,
  campaign_id uuid,                -- nullable: team-wide invite
  email text not null,
  role text not null check (role in ('editor','viewer')),
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz
);

-- Indexes for invites
create index if not exists idx_invites_token on public.invites(token);
create index if not exists idx_invites_team on public.invites(team_id);
create index if not exists idx_invites_campaign on public.invites(campaign_id);

-- Lightweight audit
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  team_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,  -- "invite.create","share.add","share.remove"
  entity text not null,  -- "campaign","template","contact"
  entity_id uuid,
  meta jsonb
);

-- Indexes for audit logs
create index if not exists idx_audit_logs_team on public.audit_logs(team_id);
create index if not exists idx_audit_logs_user on public.audit_logs(user_id);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity, entity_id);

-- Ensure campaigns table has team_id column
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'team_id'
  ) then
    alter table public.campaigns add column team_id uuid;
    -- Set team_id from user_id for existing campaigns (assuming user_id maps to a team)
    -- This is a migration helper - you may need to adjust based on your team creation logic
    update public.campaigns 
    set team_id = (
      select team_id from public.team_members 
      where user_id = campaigns.user_id 
      limit 1
    )
    where team_id is null;
  end if;
end $$;

-- Add foreign key constraint if team_id column exists
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'campaigns' 
    and column_name = 'team_id'
  ) then
    -- Note: We don't add a foreign key here because team_id might reference a teams table
    -- that doesn't exist yet or uses a different structure. Adjust as needed.
    -- If you have a teams table, uncomment:
    -- alter table public.campaigns add constraint fk_campaigns_team 
    --   foreign key (team_id) references public.teams(id) on delete set null;
  end if;
end $$;

-- Helper function: get current user's team_id (or first team they're a member of)
create or replace function public.current_team_id()
returns uuid
language sql
stable
as $$
  select team_id 
  from public.team_members 
  where user_id = auth.uid() 
  limit 1;
$$;

-- Helper function: check if user is team member
create or replace function public.is_team_member(p_team_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = p_user_id
  );
$$;

-- Helper function: check if user can view campaign
create or replace function public.can_view_campaign(p_campaign_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id
    and (
      -- Team member check
      exists (
        select 1 from public.team_members tm
        where tm.team_id = c.team_id
        and tm.user_id = p_user_id
      )
      -- Campaign member check (inherits from team, but explicit campaign membership also works)
      or exists (
        select 1 from public.campaign_members cm
        where cm.campaign_id = p_campaign_id
        and cm.user_id = p_user_id
      )
    )
  );
$$;

-- Helper function: check if user can edit campaign
create or replace function public.can_edit_campaign(p_campaign_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id
    and (
      -- Team owner/admin can edit
      exists (
        select 1 from public.team_members tm
        where tm.team_id = c.team_id
        and tm.user_id = p_user_id
        and tm.role in ('owner','admin')
      )
      -- Campaign editor can edit
      or exists (
        select 1 from public.campaign_members cm
        where cm.campaign_id = p_campaign_id
        and cm.user_id = p_user_id
        and cm.role = 'editor'
      )
    )
  );
$$;

-- Enable RLS on new tables
alter table public.team_members enable row level security;
alter table public.campaign_members enable row level security;
alter table public.invites enable row level security;
alter table public.audit_logs enable row level security;

-- RLS policies for team_members
drop policy if exists "team_members_select" on public.team_members;
create policy "team_members_select" on public.team_members
  for select using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = team_members.team_id
      and tm.user_id = auth.uid()
    )
  );

-- RLS policies for campaign_members
drop policy if exists "campaign_members_select" on public.campaign_members;
create policy "campaign_members_select" on public.campaign_members
  for select using (
    public.can_view_campaign(campaign_id)
  );

-- RLS policies for invites (users can see invites for their teams/campaigns)
drop policy if exists "invites_select" on public.invites;
create policy "invites_select" on public.invites
  for select using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = invites.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
    )
  );

-- RLS policies for audit_logs (team members can view their team's audit logs)
drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select" on public.audit_logs
  for select using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = audit_logs.team_id
      and tm.user_id = auth.uid()
    )
  );















