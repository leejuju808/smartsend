-- Routing owner pools, rules, OOO, and assignment ledger
-- Idempotent migration creating routing infrastructure for inbound threads

-- A) Owner pools (per account)
create table if not exists public.owner_pools (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (account_id, name)
);

create index if not exists idx_owner_pools_account on public.owner_pools(account_id);

-- B) Pool members (weighted round robin stats)
create table if not exists public.owner_pool_members (
  pool_id uuid not null references public.owner_pools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  weight int not null default 1 check (weight >= 0),
  is_active boolean not null default true,
  last_assigned_at timestamptz,
  assigned_count int not null default 0,
  primary key (pool_id, user_id)
);

create index if not exists idx_owner_pool_members_active on public.owner_pool_members(pool_id, is_active);

-- C) Routing rules (priority order; first match wins)
create table if not exists public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  priority int not null default 100,
  active boolean not null default true,
  match_type text not null check (match_type in ('domain','email','subject_regex','campaign')),
  match_value text not null,
  action text not null check (action in ('assign_pool','assign_user')),
  pool_id uuid references public.owner_pools(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_routing_rules_account on public.routing_rules(account_id, active, priority);

-- D) Optional: per-user OOO (manual toggle)
create table if not exists public.user_ooo (
  user_id uuid primary key references auth.users(id) on delete cascade,
  return_at timestamptz not null,
  note text,
  updated_at timestamptz not null default now()
);

-- E) Assignment ledger (audit)
create table if not exists public.thread_assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  assigned_user_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('rule','round_robin','fallback_ooo','manual')),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_thread_assignments_thread on public.thread_assignments(thread_id, created_at desc);

-- F) Thread owner column if missing
alter table public.threads add column if not exists owner_id uuid references auth.users(id);

create index if not exists idx_threads_owner on public.threads(owner_id);

-- G) Helper: choose next round-robin user
create or replace function public.pick_owner_round_robin(p_pool uuid)
returns uuid
language sql
stable
as $$
  select m.user_id
  from public.owner_pool_members m
  where m.pool_id = p_pool
    and m.is_active = true
    and m.weight > 0
  order by (m.assigned_count::numeric / greatest(m.weight, 1)) asc,
           coalesce(m.last_assigned_at, 'epoch'::timestamptz) asc,
           m.user_id asc
  limit 1
$$;

grant execute on function public.pick_owner_round_robin(uuid) to service_role;

-- H) Helper: is user out of office now?
create or replace function public.is_user_ooo(p_user uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.user_ooo o
    where o.user_id = p_user
      and o.return_at > now()
  )
$$;

grant execute on function public.is_user_ooo(uuid) to service_role;

-- I) Resolve account_id for a thread quickly
create or replace view public.v_thread_account as
select t.id as thread_id, c.account_id, t.campaign_id
from public.threads t
join public.campaigns c on c.id = t.campaign_id;

grant select on public.v_thread_account to authenticated, service_role;

-- J) Update stats atomically
create or replace function public.bump_member_assignment(p_pool uuid, p_user uuid)
returns void
language plpgsql
as $$
begin
  update public.owner_pool_members
  set assigned_count = assigned_count + 1,
      last_assigned_at = now()
  where pool_id = p_pool
    and user_id = p_user;
end;
$$;

grant execute on function public.bump_member_assignment(uuid, uuid) to service_role;

create extension if not exists pg_net;

create or replace function public.on_inbound_message_route()
returns trigger
language plpgsql
as $$
declare
  v_is_inbound boolean;
  edge_base text := current_setting('app.supabase_edge_base', true);
  service_jwt text := current_setting('app.service_jwt', true);
begin
  v_is_inbound := (new.direction = 'inbound');
  if v_is_inbound and edge_base is not null and service_jwt is not null then
    perform net.http_post(
      url := edge_base || '/route-inbound',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || service_jwt
      ),
      body := jsonb_build_object('thread_id', new.thread_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inbound_message_route on public.messages;
create trigger trg_inbound_message_route
after insert on public.messages
for each row
execute function public.on_inbound_message_route();

-- L) RLS for account-scoped tables
alter table public.owner_pools enable row level security;
alter table public.owner_pool_members enable row level security;
alter table public.routing_rules enable row level security;
alter table public.user_ooo enable row level security;

drop policy if exists "Users view own owner pools" on public.owner_pools;
create policy "Users view own owner pools" on public.owner_pools
  for select using (
    exists (
      select 1
      from public.team_members tm
      where tm.account_id = owner_pools.account_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "Users manage own owner pools" on public.owner_pools;
create policy "Users manage own owner pools" on public.owner_pools
  for all using (
    exists (
      select 1
      from public.team_members tm
      where tm.account_id = owner_pools.account_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1
      from public.team_members tm
      where tm.account_id = owner_pools.account_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner','admin')
    )
  );

drop policy if exists "Users view pool members" on public.owner_pool_members;
create policy "Users view pool members" on public.owner_pool_members
  for select using (
    exists (
      select 1
      from public.owner_pools p
      join public.team_members tm on tm.account_id = p.account_id
      where p.id = owner_pool_members.pool_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "Users manage pool members" on public.owner_pool_members;
create policy "Users manage pool members" on public.owner_pool_members
  for all using (
    exists (
      select 1
      from public.owner_pools p
      join public.team_members tm on tm.account_id = p.account_id
      where p.id = owner_pool_members.pool_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1
      from public.owner_pools p
      join public.team_members tm on tm.account_id = p.account_id
      where p.id = owner_pool_members.pool_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner','admin')
    )
  );

drop policy if exists "Users view routing rules" on public.routing_rules;
create policy "Users view routing rules" on public.routing_rules
  for select using (
    exists (
      select 1
      from public.team_members tm
      where tm.account_id = routing_rules.account_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "Users manage routing rules" on public.routing_rules;
create policy "Users manage routing rules" on public.routing_rules
  for all using (
    exists (
      select 1
      from public.team_members tm
      where tm.account_id = routing_rules.account_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1
      from public.team_members tm
      where tm.account_id = routing_rules.account_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner','admin')
    )
  );

drop policy if exists "Users manage own OOO flag" on public.user_ooo;
create policy "Users manage own OOO flag" on public.user_ooo
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Grants for service role access
grant select, insert, update, delete on public.owner_pools to authenticated, service_role;
grant select, insert, update, delete on public.owner_pool_members to authenticated, service_role;
grant select, insert, update, delete on public.routing_rules to authenticated, service_role;
grant select, insert, update, delete on public.user_ooo to authenticated, service_role;
grant select, insert on public.thread_assignments to service_role;


