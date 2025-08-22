-- Team invitations for token-based join flow

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','admin','member')) default 'member',
  token text not null unique,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists team_invitations_team_idx on public.team_invitations(team_id);
create index if not exists team_invitations_email_idx on public.team_invitations(lower(email));

alter table if exists public.team_invitations enable row level security;

drop policy if exists "team_invites_owner_manage" on public.team_invitations;
create policy "team_invites_owner_manage" on public.team_invitations
  for all using (
    exists (
      select 1 from public.team_members m
      join public.teams t on t.id = m.team_id
      where m.team_id = team_invitations.team_id
        and m.user_id = auth.uid()
        and (m.role in ('owner','admin') or t.owner_id = auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.team_members m
      join public.teams t on t.id = m.team_id
      where m.team_id = team_invitations.team_id
        and m.user_id = auth.uid()
        and (m.role in ('owner','admin') or t.owner_id = auth.uid())
    )
  );

