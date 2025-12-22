-- Teams, Memberships, Campaign Access
-- 0.1 Team
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- 0.2 Team members
create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','sender','viewer')),
  primary key (team_id, user_id),
  created_at timestamptz not null default now()
);

-- 0.3 Campaigns → add team_id (nullable for solo users)
alter table public.campaigns
  add column if not exists team_id uuid references public.teams(id) on delete set null;

-- 0.4 Campaign member overrides (optional per-campaign role)
create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','sender','viewer')),
  primary key (campaign_id, user_id),
  created_at timestamptz not null default now()
);

-- 0.5 Helpers: views to compute effective role
create or replace view public.v_campaign_access as
select
  c.id as campaign_id,
  u.id as user_id,
  coalesce(
    cm.role,
    case 
      when c.user_id = u.id then 'admin'  -- Campaign owner always has admin
      when c.team_id is not null and tm.role in ('owner','admin') then 'admin'
      when c.team_id is not null and tm.role = 'sender' then 'sender'
      when c.team_id is not null and tm.role = 'viewer' then 'viewer'
      else null  -- No access
    end
  ) as role
from public.campaigns c
cross join auth.users u
left join public.team_members tm on tm.team_id = c.team_id and tm.user_id = u.id
left join public.campaign_members cm on cm.campaign_id = c.id and cm.user_id = u.id
where coalesce(
    cm.role,
    case 
      when c.user_id = u.id then 'admin'
      when c.team_id is not null and tm.role in ('owner','admin') then 'admin'
      when c.team_id is not null and tm.role = 'sender' then 'sender'
      when c.team_id is not null and tm.role = 'viewer' then 'viewer'
      else null
    end
  ) is not null;  -- Only return rows where user has some access

-- Indexes
create index if not exists idx_campaigns_team on public.campaigns(team_id);
create index if not exists idx_campaign_members_campaign on public.campaign_members(campaign_id);
create index if not exists idx_team_members_team on public.team_members(team_id);
create index if not exists idx_team_members_user on public.team_members(user_id);

-- RLS wiring (campaigns + rows tied to them)
-- Ensure RLS on all
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.campaign_members enable row level security;

-- TEAM: owner or member sees their team
create policy "team read" on public.teams
for select using (
  exists (
    select 1 from public.team_members tm
    where tm.team_id = teams.id and tm.user_id = auth.uid()
  )
);

create policy "team mutate owner" on public.teams
for all using (exists (
  select 1 from public.team_members tm
  where tm.team_id = teams.id and tm.user_id = auth.uid() and tm.role in ('owner','admin')
))
with check (exists (
  select 1 from public.team_members tm
  where tm.team_id = teams.id and tm.user_id = auth.uid() and tm.role in ('owner','admin')
));

-- TEAM MEMBERS
create policy "team_members read" on public.team_members
for select using (team_id in (select team_id from public.team_members where user_id = auth.uid()));

create policy "team_members manage by admin" on public.team_members
for all using (exists (
  select 1 from public.team_members tm
  where tm.team_id = team_members.team_id and tm.user_id = auth.uid() and tm.role in ('owner','admin')
))
with check (exists (
  select 1 from public.team_members tm
  where tm.team_id = team_members.team_id and tm.user_id = auth.uid() and tm.role in ('owner','admin')
));

-- CAMPAIGN MEMBERS
create policy "campaign_members read" on public.campaign_members
for select using (campaign_id in (
  select campaign_id from public.v_campaign_access where user_id = auth.uid()
));

create policy "campaign_members manage admin" on public.campaign_members
for all using (exists (
  select 1 from public.v_campaign_access v
  where v.campaign_id = campaign_members.campaign_id and v.user_id = auth.uid() and v.role = 'admin'
))
with check (exists (
  select 1 from public.v_campaign_access v
  where v.campaign_id = campaign_members.campaign_id and v.user_id = auth.uid() and v.role = 'admin'
));

-- Extend read/write on child tables via campaign access
-- First, ensure campaign_leads table exists and has campaign_id
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'campaign_leads') then
    create table public.campaign_leads (
      id uuid primary key default gen_random_uuid(),
      campaign_id uuid not null references public.campaigns(id) on delete cascade,
      user_id uuid references auth.users(id) on delete cascade,
      email text,
      first_name text,
      company text,
      title text,
      status text,
      subject_token text,
      replied boolean not null default false,
      created_at timestamptz not null default now()
    );
  end if;
end $$;

-- READ any rows tied to campaigns where user has any role
drop policy if exists "leads read by campaign access" on public.campaign_leads;
create policy "leads read by campaign access" on public.campaign_leads
for select using (exists (
  select 1 from public.v_campaign_access v where v.campaign_id = campaign_leads.campaign_id and v.user_id = auth.uid()
));

-- WRITE only if role >= sender (e.g., update status on reply)
drop policy if exists "leads write by sender/admin" on public.campaign_leads;
create policy "leads write by sender/admin" on public.campaign_leads
for update using (exists (
  select 1 from public.v_campaign_access v where v.campaign_id = campaign_leads.campaign_id and v.user_id = auth.uid() and v.role in ('sender','admin')
))
with check (exists (
  select 1 from public.v_campaign_access v where v.campaign_id = campaign_leads.campaign_id and v.user_id = auth.uid() and v.role in ('sender','admin')
));

-- INSERT: also require sender/admin
drop policy if exists "leads insert by sender/admin" on public.campaign_leads;
create policy "leads insert by sender/admin" on public.campaign_leads
for insert with check (exists (
  select 1 from public.v_campaign_access v where v.campaign_id = campaign_leads.campaign_id and v.user_id = auth.uid() and v.role in ('sender','admin')
));

-- send_queue / send_logs mirror
-- Ensure send_queue exists
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'send_queue') then
    create table public.send_queue (
      id uuid primary key default gen_random_uuid(),
      campaign_id uuid references public.campaigns(id) on delete set null,
      user_id uuid references auth.users(id) on delete cascade,
      lead_id uuid,
      to_email text not null,
      subject text,
      body_html text,
      status text not null default 'pending' check (status in ('pending','sent','failed','retrying','cancelled')),
      scheduled_at timestamptz,
      sent_at timestamptz,
      error text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  end if;
end $$;

drop policy if exists "queue read by campaign access" on public.send_queue;
create policy "queue read by campaign access" on public.send_queue
for select using (exists (select 1 from public.v_campaign_access v where v.campaign_id = send_queue.campaign_id and v.user_id = auth.uid()));

drop policy if exists "queue write by sender/admin" on public.send_queue;
create policy "queue write by sender/admin" on public.send_queue
for update using (exists (select 1 from public.v_campaign_access v where v.campaign_id = send_queue.campaign_id and v.user_id = auth.uid() and v.role in ('sender','admin')))
with check (exists (select 1 from public.v_campaign_access v where v.campaign_id = send_queue.campaign_id and v.user_id = auth.uid() and v.role in ('sender','admin')));

-- Ensure send_logs exists
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'send_logs') then
    create table public.send_logs (
      id uuid primary key default gen_random_uuid(),
      campaign_id uuid not null,
      user_id uuid,
      lead_id uuid,
      queue_id uuid references public.send_queue(id) on delete cascade,
      provider_id text,
      sent_at timestamptz not null default now()
    );
  end if;
end $$;

drop policy if exists "logs read by campaign access" on public.send_logs;
create policy "logs read by campaign access" on public.send_logs
for select using (exists (select 1 from public.v_campaign_access v where v.campaign_id = send_logs.campaign_id and v.user_id = auth.uid()));

-- Update campaigns RLS to use v_campaign_access
drop policy if exists "campaigns are readable by owner" on public.campaigns;
drop policy if exists "campaigns are insertable by owner" on public.campaigns;
drop policy if exists "campaigns are updatable by owner" on public.campaigns;

-- READ: any user with access to the campaign
create policy "campaigns read by access" on public.campaigns
for select using (
  exists (
    select 1 from public.v_campaign_access v 
    where v.campaign_id = campaigns.id and v.user_id = auth.uid()
  )
  or auth.uid() = campaigns.user_id
);

-- INSERT: must be authenticated (we'll add team_id check later if needed)
create policy "campaigns insert authenticated" on public.campaigns
for insert with check (auth.uid() = user_id);

-- UPDATE: admin role or owner
create policy "campaigns update by admin" on public.campaigns
for update using (
  auth.uid() = campaigns.user_id
  or exists (
    select 1 from public.v_campaign_access v 
    where v.campaign_id = campaigns.id and v.user_id = auth.uid() and v.role = 'admin'
  )
)
with check (
  auth.uid() = campaigns.user_id
  or exists (
    select 1 from public.v_campaign_access v 
    where v.campaign_id = campaigns.id and v.user_id = auth.uid() and v.role = 'admin'
  )
);

