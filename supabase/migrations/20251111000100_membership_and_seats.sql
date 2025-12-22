-- Membership, invites, and seat enforcement

-- Ensure citext available for case-insensitive emails
create extension if not exists citext;

-- Role enum (idempotent)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'team_role') then
    create type public.team_role as enum ('owner','admin','editor','viewer');
  end if;
end $$;

-- Team members (account-level)
create table if not exists public.team_members (
  account_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.team_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (account_id, user_id)
);

create index if not exists idx_team_members_account on public.team_members(account_id);

-- Campaign members (campaign-level overrides)
create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.team_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create index if not exists idx_campaign_members_campaign on public.campaign_members(campaign_id);

-- Team invites with unique pending token per email
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null,
  email citext not null,
  role public.team_role not null default 'viewer',
  invited_by uuid references auth.users(id) on delete set null,
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists idx_team_invites_pending_email
  on public.team_invites(account_id, email)
  where accepted_at is null and revoked_at is null;

-- Seat usage cache table
create table if not exists public.account_seats (
  account_id uuid primary key,
  plan text not null,
  seats_purchased int not null,
  seats_in_use int not null default 0,
  updated_at timestamptz not null default now()
);

-- Recompute seats helper
create or replace function public.recompute_seats(p_account uuid)
returns void
language plpgsql
as $$
begin
  update public.account_seats s
  set seats_in_use = (
        select count(*) from public.team_members tm where tm.account_id = p_account
      ),
      updated_at = now()
  where s.account_id = p_account;
end
$$;

-- Seat availability assertion
create or replace function public.assert_seat_available(p_account uuid)
returns void
language plpgsql
as $$
declare
  v_purchased int;
  v_used int;
begin
  select seats_purchased, seats_in_use
    into v_purchased, v_used
  from public.account_seats
  where account_id = p_account
  for update;

  if v_purchased is null then
    raise exception 'Account % has no billing seat record', p_account
      using errcode = 'PT001';
  end if;

  if v_used >= v_purchased then
    raise exception 'No seats available (used % of %). Upgrade required.', v_used, v_purchased
      using errcode = 'PT002';
  end if;
end
$$;

-- Ensure campaigns track owning account
alter table public.campaigns
  add column if not exists account_id uuid;

-- Convenience view for access resolution
create or replace view public.v_campaign_access as
with base as (
  select
    c.id as campaign_id,
    c.account_id,
    tm.user_id,
    tm.role as team_role,
    cm.role as campaign_role
  from public.campaigns c
  join public.team_members tm on tm.account_id = c.account_id
  left join public.campaign_members cm
    on cm.campaign_id = c.id
   and cm.user_id = tm.user_id
)
select
  campaign_id,
  account_id,
  user_id,
  case
    when campaign_role is null then team_role
    when team_role is null then campaign_role
    when campaign_role <= team_role then campaign_role
    else team_role
  end as role
from base

union

select
  c.id as campaign_id,
  c.account_id,
  cm.user_id,
  cm.role
from public.campaigns c
join public.campaign_members cm on cm.campaign_id = c.id;

-- Helper: current authenticated user id
create or replace function public.uid()
returns uuid
language sql
stable
as $$
  select auth.uid()
$$;

-- Enable RLS on core tables
alter table public.team_members enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.leads enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;

-- team_members policies
drop policy if exists tm_select_self on public.team_members;
create policy tm_select_self on public.team_members
for select
using (
  user_id = public.uid()
  or exists (
    select 1
    from public.team_members x
    where x.account_id = team_members.account_id
      and x.user_id = public.uid()
      and x.role in ('owner','admin')
  )
);

-- campaigns policies
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns
for select
using (
  exists (
    select 1
    from public.v_campaign_access a
    where a.campaign_id = campaigns.id
      and a.user_id = public.uid()
  )
);

drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns
for insert
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = campaigns.account_id
      and tm.user_id = public.uid()
      and tm.role in ('owner','admin')
  )
);

-- campaign_members policies
drop policy if exists cm_select on public.campaign_members;
create policy cm_select on public.campaign_members
for select
using (
  user_id = public.uid()
  or exists (
    select 1
    from public.team_members tm
    join public.campaigns c
      on c.account_id = tm.account_id
     and c.id = campaign_members.campaign_id
    where tm.user_id = public.uid()
      and tm.role in ('owner','admin')
  )
);

drop policy if exists cm_modify on public.campaign_members;
create policy cm_modify on public.campaign_members
for all
using (
  exists (
    select 1
    from public.team_members tm
    join public.campaigns c
      on c.account_id = tm.account_id
     and c.id = campaign_members.campaign_id
    where tm.user_id = public.uid()
      and tm.role in ('owner','admin')
  )
)
with check (true);

-- leads policy
drop policy if exists leads_access on public.leads;
create policy leads_access on public.leads
for select
using (
  exists (
    select 1
    from public.v_campaign_access a
    where a.user_id = public.uid()
      and a.campaign_id = leads.campaign_id
  )
);

-- threads policy
drop policy if exists threads_access on public.threads;
create policy threads_access on public.threads
for select
using (
  exists (
    select 1
    from public.v_campaign_access a
    where a.user_id = public.uid()
      and a.campaign_id = threads.campaign_id
  )
);

-- messages policy
drop policy if exists messages_access on public.messages;
create policy messages_access on public.messages
for select
using (
  exists (
    select 1
    from public.threads t
    join public.v_campaign_access a
      on a.campaign_id = t.campaign_id
    where t.id = messages.thread_id
      and a.user_id = public.uid()
  )
);

-- Basic tasks fallback (only if missing)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid references public.threads(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  title text not null,
  priority text default 'normal',
  status text not null default 'open'
);



