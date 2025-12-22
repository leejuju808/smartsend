-- 09_workspaces.sql
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists workspaces_owner_idx on public.workspaces(owner_id);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);
create index if not exists workspace_members_idx on public.workspace_members(workspace_id, user_id);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','editor','viewer')),
  token text not null, -- random, single-use
  expires_at timestamptz not null,
  accepted_at timestamptz
);
create index if not exists workspace_invites_lookup on public.workspace_invites(token);

-- Denormalize workspace_id onto existing entities for easy RLS (if not already present)
alter table public.campaigns add column if not exists workspace_id uuid;
alter table public.campaign_recipients add column if not exists workspace_id uuid;
alter table public.email_logs add column if not exists workspace_id uuid;

-- Backfill triggers so new rows carry workspace_id based on parent
create or replace function public.set_workspace_id_campaign_recipients()
returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from public.campaigns where id = new.campaign_id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_set_workspace_on_recipients on public.campaign_recipients;
create trigger trg_set_workspace_on_recipients
before insert on public.campaign_recipients
for each row execute function public.set_workspace_id_campaign_recipients();

-- Email logs: inherit from recipient if linked
create or replace function public.set_workspace_id_email_logs()
returns trigger language plpgsql as $$
begin
  if new.workspace_id is null and new.campaign_recipient_id is not null then
    select workspace_id into new.workspace_id from public.campaign_recipients where id = new.campaign_recipient_id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_set_workspace_on_logs on public.email_logs;
create trigger trg_set_workspace_on_logs
before insert on public.email_logs
for each row execute function public.set_workspace_id_email_logs();

-- RLS
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.email_logs enable row level security;

-- Helper: is member of workspace
create or replace function public.is_member(p_ws uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.workspace_members
    where workspace_id = p_ws and user_id = auth.uid()
  );
$$;

-- Policies
create policy "members can read their workspace"
on public.workspaces for select
using (exists(select 1 from public.workspace_members m where m.workspace_id = id and m.user_id = auth.uid()));

create policy "owners can update workspace"
on public.workspaces for update
using (exists(select 1 from public.workspace_members m where m.workspace_id = id and m.user_id = auth.uid() and m.role in ('owner','admin')))
with check (true);

create policy "members read members"
on public.workspace_members for select
using (exists(select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid()));

create policy "owner/admin manage members"
on public.workspace_members for insert
with check (exists(select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin')));

create policy "owner/admin remove members"
on public.workspace_members for delete
using (exists(select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin')));

-- Invites: inviter visibility + token-based accept (handled via edge function)
create policy "inviter can manage invites"
on public.workspace_invites for all
using (exists(select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin')))
with check (exists(select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin')));

-- Entities access by workspace membership
create policy "members read campaigns" on public.campaigns for select using (public.is_member(workspace_id));
create policy "editor+ write campaigns" on public.campaigns for insert with check (exists(select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin','editor')));
create policy "editor+ update campaigns" on public.campaigns for update using (public.is_member(workspace_id)) with check (exists(select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin','editor')));

create policy "members read recipients" on public.campaign_recipients for select using (public.is_member(workspace_id));
create policy "editor+ write recipients" on public.campaign_recipients for insert with check (exists(select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin','editor')));
create policy "editor+ update recipients" on public.campaign_recipients for update using (public.is_member(workspace_id)) with check (exists(select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin','editor')));

create policy "members read logs" on public.email_logs for select using (public.is_member(workspace_id));