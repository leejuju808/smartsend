-- Connected mailboxes (one per user mailbox)

create table if not exists mailboxes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  provider text check (provider in ('gmail','outlook')) not null,
  email text not null,
  -- OAuth
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  -- Provider-specific cursors
  gmail_history_id text,           -- for Gmail users.history.list
  outlook_delta_link text,         -- for Graph delta
  -- Gmail watch metadata
  gmail_watch_expire_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (provider, email)
);

alter table mailboxes enable row level security;

create policy "members_read_mailboxes"
on mailboxes for select
using (public.is_team_member(team_id));

create policy "admins_manage_mailboxes"
on mailboxes for all
using (public.is_team_admin(team_id))
with check (public.is_team_admin(team_id));

