-- Org Invites + Consume Function + Ownership Flag
-- This migration enhances org_invites with consumed flag, adds consume function, and adds owned_by flag to campaigns

-- A) Org invites (email-based, non-users welcome)
-- Update existing org_invites table to include consumed flag and viewer role

-- Add consumed column if it doesn't exist
alter table public.org_invites
  add column if not exists consumed boolean not null default false;

-- Update role check to include 'viewer'
alter table public.org_invites
  drop constraint if exists org_invites_role_check;

alter table public.org_invites
  add constraint org_invites_role_check check (role in ('admin','member','viewer'));

-- Add default expires_at if not set (for existing rows)
update public.org_invites
  set expires_at = created_at + interval '14 days'
  where expires_at is null;

alter table public.org_invites
  alter column expires_at set default (now() + interval '14 days');

-- Add created_by reference update (if needed)
alter table public.org_invites
  alter column created_by set not null;

-- Create index for email lookups (case-insensitive)
create index if not exists idx_org_invites_email on public.org_invites(lower(email));

-- Ensure RLS is enabled
alter table public.org_invites enable row level security;

-- Helper function to check if user can view org
create or replace function public.can_view_org(p_org_id uuid)
returns boolean
language sql stable
as $$
  select exists(
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid()
  );
$$;

-- Members of the org can view pending invites
drop policy if exists "org_invites.select.member" on public.org_invites;
create policy "org_invites.select.member"
on public.org_invites for select
using (public.can_view_org(org_id));

-- Only admins can create/delete invites
drop policy if exists "org_invites.insert.admin" on public.org_invites;
create policy "org_invites.insert.admin"
on public.org_invites for insert
with check (exists(
  select 1 from public.org_members m
  where m.org_id = org_invites.org_id and m.user_id = auth.uid() and m.role in ('admin', 'owner')
));

drop policy if exists "org_invites.delete.admin" on public.org_invites;
create policy "org_invites.delete.admin"
on public.org_invites for delete
using (exists(
  select 1 from public.org_members m
  where m.org_id = org_invites.org_id and m.user_id = auth.uid() and m.role in ('admin', 'owner')
));

-- B) Secure function to consume an invite
create or replace function public.consume_org_invite(p_token text, p_user uuid)
returns table(org_id uuid, role text)
language plpgsql
security definer
as $$
declare v record;
begin
  select * into v from public.org_invites
  where token = p_token and consumed = false and now() < expires_at
  limit 1;

  if v is null then
    raise exception 'invalid_or_expired';
  end if;

  update public.org_invites
     set consumed = true, accepted_by = p_user, accepted_at = now()
   where id = v.id;

  insert into public.org_members (org_id, user_id, role)
  values (v.org_id, p_user, v.role)
  on conflict (org_id, user_id) do update set role = excluded.role;

  return query select v.org_id, v.role;
end;
$$;

revoke all on function public.consume_org_invite(text,uuid) from public;
grant execute on function public.consume_org_invite(text,uuid) to authenticated;

-- C) Campaign ownership flag (user vs org)
alter table public.campaigns
  add column if not exists owned_by text not null default 'user' check (owned_by in ('user','org'));


-- D) Policies: allow org admins to delete/update org-owned campaigns
-- Update can_view_campaign and can_edit_campaign to work with owned_by flag
drop function if exists public.can_view_campaign(uuid, uuid);
create or replace function public.can_view_campaign(p_campaign uuid, p_user uuid default auth.uid())
returns boolean 
language sql stable 
as $$
  select
    exists(select 1 from public.campaigns c where c.id = p_campaign and c.user_id = p_user)
    or exists(select 1 from public.campaign_shares s where s.campaign_id = p_campaign and s.user_id = p_user)
    or exists(
      select 1 from public.campaigns c
      inner join public.org_members m on m.org_id = coalesce(c.org_id, c.owner_org_id)
      where c.id = p_campaign and m.user_id = p_user
    );
$$;

drop function if exists public.can_edit_campaign(uuid, uuid);
create or replace function public.can_edit_campaign(p_campaign uuid, p_user uuid default auth.uid())
returns boolean 
language sql stable 
as $$
  select
    exists(select 1 from public.campaigns c where c.id = p_campaign and c.user_id = p_user)
    or exists(select 1 from public.campaign_shares s where s.campaign_id = p_campaign and s.user_id = p_user and s.role in ('editor'))
    or exists(
      select 1 from public.campaigns c
      inner join public.org_members m on m.org_id = coalesce(c.org_id, c.owner_org_id)
      where c.id = p_campaign 
        and m.user_id = p_user 
        and m.role in ('member', 'admin', 'owner')
    );
$$;

drop policy if exists "campaigns.update.owner_or_editor" on public.campaigns;
drop policy if exists "campaigns.update.owner_or_editor_or_orgadmin" on public.campaigns;

create policy "campaigns.update.owner_or_editor_or_orgadmin"
on public.campaigns for update
using (
  public.can_edit_campaign(id)              -- owner/editor or org member (member/admin)
  or (owned_by = 'org' and exists(
      select 1 from public.org_members m 
      where m.org_id = coalesce(campaigns.org_id, campaigns.owner_org_id)
        and m.user_id = auth.uid() 
        and m.role in ('admin', 'owner')
  ))
)
with check (
  public.can_edit_campaign(id)
  or (owned_by = 'org' and exists(
      select 1 from public.org_members m 
      where m.org_id = coalesce(campaigns.org_id, campaigns.owner_org_id)
        and m.user_id = auth.uid() 
        and m.role in ('admin', 'owner')
  ))
);

drop policy if exists "campaigns.delete.owner_only" on public.campaigns;
drop policy if exists "campaigns.delete.owner_or_orgadmin" on public.campaigns;

create policy "campaigns.delete.owner_or_orgadmin"
on public.campaigns for delete
using (
  (owned_by = 'user' and user_id = auth.uid())
  or (owned_by = 'org' and exists(
      select 1 from public.org_members m 
      where m.org_id = coalesce(campaigns.org_id, campaigns.owner_org_id)
        and m.user_id = auth.uid() 
        and m.role in ('admin', 'owner')
  ))
);

-- Ensure profiles has current_org_id column
alter table public.profiles
  add column if not exists current_org_id uuid references public.organizations(id) on delete set null;

