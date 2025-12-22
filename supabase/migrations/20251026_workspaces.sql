-- 1) Core tenant tables
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','member','editor','viewer')),
  token text not null unique, -- random string
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz -- nullable
);

-- 2) Tenant key on your data tables
alter table if exists public.campaigns
  add column if not exists workspace_id uuid references public.workspaces(id);

alter table if exists public.leads
  add column if not exists workspace_id uuid references public.workspaces(id);

alter table if exists public.campaign_logs
  add column if not exists workspace_id uuid references public.workspaces(id);

alter table if exists public.provider_accounts
  add column if not exists workspace_id uuid references public.workspaces(id);

-- 3) Helper: check membership
create or replace function public.is_workspace_member(p_ws uuid, p_uid uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_ws and user_id = p_uid
  );
$$;

-- 5) RLS policies
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

-- Users can see workspaces they belong to
create policy "ws: select my workspaces"
  on public.workspaces for select
  using (public.is_workspace_member(id, auth.uid()));

-- Only owners/admins can update workspace name
create policy "ws: update by owner/admin"
  on public.workspaces for update
  using (public.is_workspace_member(id, auth.uid())
         and exists (select 1 from public.workspace_members m where m.workspace_id = id and m.user_id = auth.uid() and m.role in ('owner','admin')));

-- Members listing within their workspace
create policy "wsm: select my members"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- Owner/admin can insert/remove members (normally via RPC after invite accept)
create policy "wsm: manage by owner/admin"
  on public.workspace_members for all
  using (public.is_workspace_member(workspace_id, auth.uid())
         and exists (select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin')))
  with check (true);

-- Invites: only visible/managed by owner/admin of that workspace
create policy "inv: manage by owner/admin"
  on public.workspace_invites for all
  using (public.is_workspace_member(workspace_id, auth.uid())
         and exists (select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin')))
  with check (true);

-- 6) Add workspace_id to profiles if not exists
alter table if exists public.profiles
  add column if not exists default_workspace_id uuid references public.workspaces(id);

-- 7) RLS for tenant data (campaigns, leads, logs, provider_accounts)
do $$ begin
  -- campaigns
  if not exists (select 1 from pg_policy where polname = 'camp: tenant read' and polrelid = 'public.campaigns'::regclass) then
    alter table public.campaigns enable row level security;
    create policy "camp: tenant read"  on public.campaigns for select using (public.is_workspace_member(workspace_id, auth.uid()));
    create policy "camp: tenant write" on public.campaigns for all
      using (public.is_workspace_member(workspace_id, auth.uid()))
      with check (public.is_workspace_member(workspace_id, auth.uid()));
  end if;

  -- leads
  if not exists (select 1 from pg_policy where polname = 'leads: tenant read' and polrelid = 'public.leads'::regclass) then
    alter table public.leads enable row level security;
    create policy "leads: tenant read"  on public.leads for select using (public.is_workspace_member(workspace_id, auth.uid()));
    create policy "leads: tenant write" on public.leads for all
      using (public.is_workspace_member(workspace_id, auth.uid()))
      with check (public.is_workspace_member(workspace_id, auth.uid()));
  end if;

  -- campaign_logs
  if not exists (select 1 from pg_policy where polname = 'logs: tenant read' and polrelid = 'public.campaign_logs'::regclass) then
    alter table public.campaign_logs enable row level security;
    create policy "logs: tenant read"  on public.campaign_logs for select using (public.is_workspace_member(workspace_id, auth.uid()));
    create policy "logs: tenant write" on public.campaign_logs for all
      using (public.is_workspace_member(workspace_id, auth.uid()))
      with check (public.is_workspace_member(workspace_id, auth.uid()));
  end if;

  -- provider_accounts
  if not exists (select 1 from pg_policy where polname = 'pa: tenant read' and polrelid = 'public.provider_accounts'::regclass) then
    alter table public.provider_accounts enable row level security;
    create policy "pa: tenant read"  on public.provider_accounts for select using (public.is_workspace_member(workspace_id, auth.uid()));
    create policy "pa: tenant write" on public.provider_accounts for all
      using (public.is_workspace_member(workspace_id, auth.uid()))
      with check (public.is_workspace_member(workspace_id, auth.uid()));
  end if;
end $$;

-- 8) RPC: create workspace (owner)
create or replace function public.create_workspace(p_name text)
returns uuid language plpgsql security definer as $$
declare
  v_ws uuid;
begin
  insert into public.workspaces (name, owner_id) values (p_name, auth.uid()) returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, auth.uid(), 'owner');
  update public.profiles set default_workspace_id = v_ws where user_id = auth.uid();
  return v_ws;
end; $$;
grant execute on function public.create_workspace(text) to authenticated;

-- 9) RPC: accept invite -> add as member, mark invite accepted
create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer as $$
declare
  v_inv public.workspace_invites%rowtype;
begin
  select * into v_inv from public.workspace_invites
  where token = p_token and accepted_at is null and expires_at > now()
  for update;

  if not found then
    raise exception 'Invalid or expired invite';
  end if;

  -- Add member if not exists
  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, auth.uid(), v_inv.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invites
     set accepted_at = now()
   where id = v_inv.id;

  return v_inv.workspace_id;
end; $$;
grant execute on function public.accept_invite(text) to authenticated;

-- 10) Backfill: create a personal workspace for each existing profile (idempotent)
do $$
declare r record; v_ws uuid;
begin
  for r in select p.user_id as uid, coalesce(p.default_workspace_id, null) as dw from public.profiles p loop
    if r.dw is null then
      insert into public.workspaces (name, owner_id) values ('Personal', r.uid) returning id into v_ws;
      insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, r.uid, 'owner')
      on conflict do nothing;
      update public.profiles set default_workspace_id = v_ws where user_id = r.uid;
      -- Backfill tenant keys for existing rows (optional, if data exists)
      update public.campaigns set workspace_id = v_ws where workspace_id is null;
      update public.leads set workspace_id = v_ws where workspace_id is null;
      update public.campaign_logs set workspace_id = v_ws where workspace_id is null;
      update public.provider_accounts set workspace_id = v_ws where workspace_id is null;
    end if;
  end loop;
end $$;
