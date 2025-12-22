-- Unified Organizations System Migration
-- This migration consolidates the org system with the requested structure

-- 1. Organizations & Membership

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists organization_members (
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('owner','admin','member')) default 'member',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  primary key (org_id, user_id)
);

-- 2. Add org_id to core tables

alter table campaigns add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table leads add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table email_replies add column if not exists org_id uuid references organizations(id) on delete cascade;

-- Create indexes
create index if not exists idx_org_members_org on organization_members(org_id);
create index if not exists idx_org_members_user on organization_members(user_id);
create index if not exists idx_campaigns_org on campaigns(org_id);
create index if not exists idx_leads_org on leads(org_id);
create index if not exists idx_email_replies_org on email_replies(org_id);

-- 3. Default org on sign-up

create or replace function public.create_default_org()
returns trigger language plpgsql security definer as $$
declare new_org uuid;
begin
  insert into organizations (name, owner_id) values (coalesce(new.raw_user_meta_data->>'company','My Organization'), new.id)
  returning id into new_org;

  insert into organization_members (org_id, user_id, role) values (new_org, new.id, 'owner');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_default_org();

-- 4) Row-Level Security (RLS)

-- Enable RLS
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table campaigns enable row level security;
alter table leads enable row level security;
alter table email_replies enable row level security;

-- Helpers

create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from organization_members
    where org_id = _org and user_id = auth.uid()
  );
$$;

-- Policies

drop policy if exists "orgs: member can view" on organizations;
create policy "orgs: member can view"
on organizations for select
to authenticated using (is_org_member(id));

drop policy if exists "members: self visibility" on organization_members;
create policy "members: self visibility"
on organization_members for select
to authenticated using (user_id = auth.uid() or is_org_member(org_id));

drop policy if exists "campaigns: org read" on campaigns;
create policy "campaigns: org read"
on campaigns for select
to authenticated using (is_org_member(org_id));

drop policy if exists "campaigns: org write" on campaigns;
create policy "campaigns: org write"
on campaigns for insert with check (is_org_member(org_id))
  , update using (is_org_member(org_id)) with check (is_org_member(org_id));

drop policy if exists "leads: org read" on leads;
create policy "leads: org read"
on leads for select to authenticated using (is_org_member(org_id));

drop policy if exists "leads: org write" on leads;
create policy "leads: org write"
on leads for insert with check (is_org_member(org_id))
  , update using (is_org_member(org_id)) with check (is_org_member(org_id));

drop policy if exists "replies: org read" on email_replies;
create policy "replies: org read"
on email_replies for select to authenticated using (is_org_member(org_id));

drop policy if exists "replies: org write" on email_replies;
create policy "replies: org write"
on email_replies for insert with check (is_org_member(org_id))
  , update using (is_org_member(org_id)) with check (is_org_member(org_id));

-- 5. Backfill existing data
-- Create default orgs for existing users
insert into organizations (name, owner_id)
select coalesce(p.raw_user_meta_data->>'company', 'My Organization'), u.id
from auth.users u
left join auth.users p on p.id = u.id
where not exists (select 1 from organizations o where o.owner_id = u.id)
on conflict do nothing;

-- Add owners as members
insert into organization_members (org_id, user_id, role)
select o.id, o.owner_id, 'owner' from organizations o
where not exists (select 1 from organization_members om where om.org_id = o.id and om.user_id = o.owner_id)
on conflict do nothing;

-- Backfill campaigns
update campaigns c set org_id = o.id
from organizations o
where o.owner_id = c.user_id and c.org_id is null;

-- Backfill leads  
update leads l set org_id = c.org_id
from campaigns c
where l.campaign_id = c.id and l.org_id is null;

-- For leads without campaign, use user's org
update leads l set org_id = o.id
from organizations o
where o.owner_id = l.user_id and l.org_id is null;

-- Backfill email_replies (link through leads or campaigns)
update email_replies er set org_id = l.org_id
from leads l
where er.lead_id = l.id and er.org_id is null;

-- For replies without lead, try campaign_logs -> campaign -> org
update email_replies er set org_id = c.org_id
from campaign_logs cl, campaigns c
where er.id = cl.reply_id and cl.campaign_id = c.id and er.org_id is null;

