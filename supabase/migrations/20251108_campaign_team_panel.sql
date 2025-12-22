-- SQL — helper + pending invites (idempotent)

-- A) Resolve auth user by email (SECURITY DEFINER)
create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(p_email)
  limit 1
$$;

revoke all on function public.user_id_by_email(text) from public;


-- B) Pending invites (owner/editor can create; viewer can read)
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email citext not null,
  role text not null,
  invited_by uuid references auth.users(id) on delete set null,
  token text not null default encode(gen_random_bytes(18), 'base64'),
  accepted_at timestamptz
);

-- Ensure role constraint matches latest expectations
alter table public.campaign_invites
  drop constraint if exists campaign_invites_role_check;
alter table public.campaign_invites
  add constraint campaign_invites_role_check check (role in ('viewer','editor'));

-- Ensure invited_by column exists (legacy schemas may lack it)
alter table public.campaign_invites
  add column if not exists invited_by uuid references auth.users(id) on delete set null;

-- Ensure token column default is set for existing tables
alter table public.campaign_invites
  alter column token set default encode(gen_random_bytes(18), 'base64');

create index if not exists idx_invites_campaign on public.campaign_invites(campaign_id);
create index if not exists idx_invites_email on public.campaign_invites(email);

alter table public.campaign_invites enable row level security;

drop policy if exists "inv_select" on public.campaign_invites;
drop policy if exists "inv_write" on public.campaign_invites;
drop policy if exists "inv_delete" on public.campaign_invites;

create policy "inv_select" on public.campaign_invites
for select to authenticated
using ( public.is_campaign_viewer(campaign_id) );

create policy "inv_write" on public.campaign_invites
for insert to authenticated
with check ( public.is_campaign_editor(campaign_id) );

create policy "inv_delete" on public.campaign_invites
for delete to authenticated
using ( public.is_campaign_editor(campaign_id) or invited_by = auth.uid() );


-- Optional view to show member emails
create or replace view public.v_campaign_memberships as
select
  m.id,
  m.campaign_id,
  m.user_id,
  m.role,
  (select u.email from auth.users u where u.id = m.user_id) as email,
  m.created_at
from public.campaign_members m;

alter view public.v_campaign_memberships owner to postgres;



