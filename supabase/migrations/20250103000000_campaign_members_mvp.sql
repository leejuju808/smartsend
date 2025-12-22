-- Campaign Members MVP: per-campaign membership system
-- This migration creates the campaign_members table for per-campaign team access

-- Create campaign_members table
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','sender','viewer')),
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

-- Indexes
create index if not exists idx_cmembers_campaign on public.campaign_members(campaign_id);
create index if not exists idx_cmembers_user on public.campaign_members(user_id);

-- RLS
alter table public.campaign_members enable row level security;

-- Members can see their own campaign's membership rows
drop policy if exists "members can read campaign_members" on public.campaign_members;
create policy "members can read campaign_members"
on public.campaign_members
for select
using (exists (
  select 1 from public.campaign_members cm2
  where cm2.campaign_id = campaign_members.campaign_id
    and cm2.user_id = auth.uid()
));

-- Also allow read if user is the campaign creator (implicit owner)
drop policy if exists "owners can read campaign_members" on public.campaign_members;
create policy "owners can read campaign_members"
on public.campaign_members
for select
using (exists (
  select 1 from public.campaigns c
  where c.id = campaign_members.campaign_id
    and c.user_id = auth.uid()
));

-- Only owners can modify membership
drop policy if exists "owners can manage members" on public.campaign_members;
create policy "owners can manage members"
on public.campaign_members
for all using (
  exists (
    select 1 from public.campaigns c
    where c.id = campaign_members.campaign_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.campaigns c
    where c.id = campaign_members.campaign_id
      and c.user_id = auth.uid()
  )
);

