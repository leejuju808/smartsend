-- Team Campaign Sharing – Block 1 (idempotent)
-- Paste into Supabase SQL editor

-- Enum for roles
do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_role') then
    create type public.campaign_role as enum ('owner','editor','viewer');
  end if;
end$$;


-- Members table
create table if not exists public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.campaign_role not null default 'viewer',
  unique(campaign_id, user_id)
);
create index if not exists idx_campmembers_campaign on public.campaign_members(campaign_id);


-- Invites table
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  role public.campaign_role not null default 'viewer',
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted boolean not null default false,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  unique(campaign_id, email)
);


-- RLS for campaign_members
alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;


-- Basic policies (read where you’re a member)
create policy if not exists campaign_members_select on public.campaign_members
for select using (auth.uid() = user_id);


create policy if not exists campaign_invites_select on public.campaign_invites
for select using (auth.uid() = invited_by or auth.uid() = accepted_by);


-- Add role check helper
create or replace function public.fn_user_role(p_campaign_id uuid)
returns public.campaign_role
language sql stable
as $$
  select role from public.campaign_members where campaign_id=p_campaign_id and user_id=auth.uid();
$$;


