-- Team Collaboration System
-- Extends teams, team_members, and adds campaign_shares for team collaboration

-- 1. Extend teams table if missing
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade
);

-- 2. team_members table
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor','viewer')),
  unique(team_id, user_id)
);

-- 3. campaign_shares — per campaign visibility link
create table if not exists public.campaign_shares (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  team_id uuid not null references public.teams(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  permission text not null check (permission in ('view','edit'))
);

-- 4. Add team_id column to campaigns if not exists
alter table public.campaigns
  add column if not exists team_id uuid references public.teams(id) on delete set null;

-- 5. RLS policies for team collaboration
alter table public.campaigns enable row level security;
alter table public.campaign_shares enable row level security;
alter table public.team_members enable row level security;

-- Drop existing policies if they exist to avoid conflicts
drop policy if exists "team members can view shared campaigns" on public.campaigns;
drop policy if exists "team members with edit access can update" on public.campaigns;
drop policy if exists "owners/admins can manage shares" on public.campaign_shares;
drop policy if exists "members can read their team membership" on public.team_members;

create policy "team members can view shared campaigns"
  on public.campaigns for select
  using (
    team_id in (
      select team_id from public.team_members where user_id = auth.uid()
    )
    or id in (
      select campaign_id from public.campaign_shares
      where team_id in (select team_id from public.team_members where user_id = auth.uid())
    )
    or user_id = auth.uid() -- Campaign owner can always view
  );

create policy "team members with edit access can update"
  on public.campaigns for update
  using (
    user_id = auth.uid() -- Campaign owner can always edit
    or id in (
      select campaign_id from public.campaign_shares
      where team_id in (select team_id from public.team_members where user_id = auth.uid())
      and permission = 'edit'
    )
  )
  with check (
    user_id = auth.uid() -- Campaign owner can always edit
    or id in (
      select campaign_id from public.campaign_shares
      where team_id in (select team_id from public.team_members where user_id = auth.uid())
      and permission = 'edit'
    )
  );

create policy "owners/admins can manage shares"
  on public.campaign_shares
  using (
    team_id in (
      select team_id from public.team_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  ) with check (
    team_id in (
      select team_id from public.team_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

create policy "members can read their team membership"
  on public.team_members for select
  using (user_id = auth.uid() or team_id in (select team_id from public.team_members where user_id = auth.uid()));

-- Indexes for performance
create index if not exists idx_team_members_team_id on public.team_members(team_id);
create index if not exists idx_team_members_user_id on public.team_members(user_id);
create index if not exists idx_campaign_shares_team_id on public.campaign_shares(team_id);
create index if not exists idx_campaign_shares_campaign_id on public.campaign_shares(campaign_id);
create index if not exists idx_campaigns_team_id on public.campaigns(team_id);

-- 6. RPC — Invite a user to a team by email
create or replace function public.invite_to_team(p_team_id uuid, p_email text, p_role text)
returns void language plpgsql security definer as $$
declare v_user uuid;
begin
  -- Validate role
  if p_role not in ('admin','editor','viewer') then
    raise exception 'Invalid role. Must be admin, editor, or viewer';
  end if;

  -- Check if user exists
  select id into v_user from auth.users where email = p_email;
  
  if v_user is not null then
    -- User exists, add to team_members
    insert into public.team_members (team_id, user_id, role)
    values (p_team_id, v_user, p_role)
    on conflict (team_id, user_id) do update set role = excluded.role;
  else
    -- User doesn't exist, add to pending_invites
    insert into public.pending_invites (team_id, email, role) 
    values (p_team_id, p_email, p_role)
    on conflict (team_id, email) do update set role = excluded.role;
  end if;
end$$;

-- Grant execute permission to authenticated users
grant execute on function public.invite_to_team(uuid, text, text) to authenticated;

-- 7. Optional table for pending invites
create table if not exists public.pending_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','editor','viewer')),
  accepted boolean not null default false,
  unique(team_id, email)
);

-- 8. When user signs up, auto-accept any pending invites
create or replace function public.accept_pending_invites()
returns trigger language plpgsql security definer as $$
begin
  -- Update pending invites to accepted
  update public.pending_invites
    set accepted = true
    where email = new.email and accepted = false;
  
  -- Add user to team_members for all pending invites
  insert into public.team_members (team_id, user_id, role)
    select team_id, new.id, role
    from public.pending_invites
    where email = new.email and accepted = true
    on conflict (team_id, user_id) do nothing;
  
  return new;
end$$;

drop trigger if exists trg_accept_pending_invites on auth.users;
create trigger trg_accept_pending_invites
after insert on auth.users
for each row execute function public.accept_pending_invites();

-- RLS for pending_invites
alter table public.pending_invites enable row level security;

create policy "team admins can view pending invites"
  on public.pending_invites for select
  using (
    team_id in (
      select team_id from public.team_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

create policy "team admins can manage pending invites"
  on public.pending_invites for all
  using (
    team_id in (
      select team_id from public.team_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  )
  with check (
    team_id in (
      select team_id from public.team_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

