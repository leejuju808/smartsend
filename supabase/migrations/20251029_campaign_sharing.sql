-- Roles

create type if not exists public.campaign_role as enum ('owner','editor','viewer');


-- Memberships

create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.campaign_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);


-- Invitations

create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  role public.campaign_role not null default 'viewer',
  token uuid not null default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (token)
);


-- Link campaigns to an owner if you don't already have it
alter table public.campaigns add column if not exists owner_user_id uuid references auth.users(id);


-- ========== RLS ==========
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;
alter table public.leads enable row level security;
alter table public.send_queue enable row level security;
alter table public.campaign_logs enable row level security;


-- Helper: who is a member?
create or replace view public.v_campaign_access as
select cm.campaign_id, cm.user_id, cm.role
from public.campaign_members cm;


-- Policies: campaigns
drop policy if exists "campaigns_select" on public.campaigns;
create policy "campaigns_select" on public.campaigns
  for select using (
    exists (select 1 from public.v_campaign_access a where a.campaign_id = id and a.user_id = auth.uid())
  );

drop policy if exists "campaigns_insert" on public.campaigns;
create policy "campaigns_insert" on public.campaigns
  for insert with check (owner_user_id = auth.uid());

drop policy if exists "campaigns_update" on public.campaigns;
create policy "campaigns_update" on public.campaigns
  for update using (
    exists (
      select 1 from public.v_campaign_access a
      where a.campaign_id = id and a.user_id = auth.uid() and a.role in ('owner','editor')
    )
  );

drop policy if exists "campaigns_delete" on public.campaigns;
create policy "campaigns_delete" on public.campaigns
  for delete using (
    exists (
      select 1 from public.v_campaign_access a
      where a.campaign_id = id and a.user_id = auth.uid() and a.role = 'owner'
    )
  );


-- Members
drop policy if exists "members_rw" on public.campaign_members;
create policy "members_rw" on public.campaign_members
  for select using (
    exists (select 1 from public.v_campaign_access a where a.campaign_id = campaign_members.campaign_id and a.user_id = auth.uid())
  );
create policy "members_insert" on public.campaign_members
  for insert with check (
    exists (select 1 from public.v_campaign_access a where a.campaign_id = campaign_members.campaign_id and a.user_id = auth.uid() and a.role = 'owner')
  );
create policy "members_delete" on public.campaign_members
  for delete using (
    exists (select 1 from public.v_campaign_access a where a.campaign_id = campaign_members.campaign_id and a.user_id = auth.uid() and a.role = 'owner')
  );


-- Invites
drop policy if exists "invites_read" on public.campaign_invites;
create policy "invites_read" on public.campaign_invites
  for select using (
    exists (select 1 from public.v_campaign_access a where a.campaign_id = campaign_invites.campaign_id and a.user_id = auth.uid() and a.role in ('owner','editor'))
  );
create policy "invites_insert" on public.campaign_invites
  for insert with check (
    exists (select 1 from public.v_campaign_access a where a.campaign_id = campaign_invites.campaign_id and a.user_id = auth.uid() and a.role in ('owner','editor'))
  );
create policy "invites_update" on public.campaign_invites
  for update using (
    true
  );


-- Leads/Queue/Logs inherit campaign access
drop policy if exists "leads_rw" on public.leads;
create policy "leads_rw" on public.leads
  for select using (
    exists (select 1 from public.v_campaign_access a where a.campaign_id = leads.campaign_id and a.user_id = auth.uid())
  );
create policy "leads_mgmt" on public.leads
  for insert with check (
    exists (select 1 from public.v_campaign_access a where a.campaign_id = leads.campaign_id and a.user_id = auth.uid() and a.role in ('owner','editor'))
  );
create policy "leads_update" on public.leads
  for update using (
    exists (select 1 from public.v_campaign_access a where a.campaign_id = leads.campaign_id and a.user_id = auth.uid() and a.role in ('owner','editor'))
  );

drop policy if exists "queue_rw" on public.send_queue;
create policy "queue_rw" on public.send_queue
  for select using (
    exists (select 1 from public.v_campaign_access a where a.campaign_id = send_queue.campaign_id and a.user_id = auth.uid())
  );
create policy "queue_update" on public.send_queue
  for update using (
    exists (select 1 from public.v_campaign_access a where a.campaign_id = send_queue.campaign_id and a.user_id = auth.uid() and a.role in ('owner','editor'))
  );

drop policy if exists "logs_r" on public.campaign_logs;
create policy "logs_r" on public.campaign_logs
  for select using (
    exists (select 1 from public.v_campaign_access a where a.campaign_id = campaign_logs.campaign_id and a.user_id = auth.uid())
  );


-- Seed: ensure creator is member as owner (run in your API when creating a campaign)
-- insert into public.campaign_members (campaign_id, user_id, role) values (<id>, auth.uid(), 'owner');


