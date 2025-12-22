-- Block 169: Team Sharing - Team Invites Table
-- Creates team_invites table for invite system

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null,
  email text not null,
  role text not null default 'member'
    check (role in ('admin','member','viewer')),
  token text not null,
  redeemed boolean default false
);

create index if not exists idx_invites_email on public.team_invites(email);
create index if not exists idx_invites_token on public.team_invites(token);
create index if not exists idx_invites_account on public.team_invites(account_id);

-- Enable RLS
alter table public.team_invites enable row level security;

-- Users can read invites for their accounts (if they're owner/admin)
create policy "team_invites_read"
on public.team_invites
for select
using (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = team_invites.account_id
    and tm.user_id = auth.uid()
    and tm.role in ('owner','admin')
  )
);

-- Only owners/admins can create invites
create policy "team_invites_insert"
on public.team_invites
for insert
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = team_invites.account_id
    and tm.user_id = auth.uid()
    and tm.role in ('owner','admin')
  )
);

-- Service role can update invites (for redemption)
create policy "team_invites_update_service"
on public.team_invites
for update
to service_role
using (true)
with check (true);












