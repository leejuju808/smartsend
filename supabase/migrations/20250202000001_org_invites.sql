-- Org Invites Table

create table if not exists invites (
  token uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  email text not null,
  role text check (role in ('owner','admin','member')) default 'member',
  created_at timestamptz default now()
);

alter table invites enable row level security;

create policy "invites readable by org members"
on invites for select to authenticated using (is_org_member(org_id));

create index if not exists idx_invites_token on invites(token);
create index if not exists idx_invites_org on invites(org_id);

