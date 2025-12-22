-- 08_orgs_team_sharing.sql

-- Organizations
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  seats int not null default 3,
  stripe_sub_id text,
  created_at timestamptz default now()
);

-- Org membership
create table if not exists public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  joined_at timestamptz default now(),
  primary key (org_id, user_id)
);

-- Invites (email-based)
create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','member')),
  token text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz default now(),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz
);

-- Pooled monthly usage per org (for Team plan)
create table if not exists public.org_send_usage (
  org_id uuid references public.organizations(id) on delete cascade,
  period_key text not null,            -- 'YYYY-MM'
  sends int not null default 0,
  primary key (org_id, period_key),
  updated_at timestamptz default now()
);

create index if not exists idx_org_members_user on public.org_members (user_id);
create index if not exists idx_campaigns_org on public.campaigns (owner_org_id);

-- Add org ownership to campaigns (nullable -> still supports personal)
alter table public.campaigns
  add column if not exists owner_org_id uuid references public.organizations(id);

-- Team plan seat enforcement helper
create or replace function public.org_member_count(p_org uuid)
returns int language sql stable as $$
  select count(*)::int from public.org_members where org_id = p_org;
$$;

-- Plan limits already exist; add org-level override (Team pooled)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='plan_limits') then
    create table if not exists public.plan_limits (
      plan text primary key,
      monthly_send_limit int not null
    );
  end if;
end $$;

insert into public.plan_limits(plan, monthly_send_limit) values ('team', 25000)
on conflict (plan) do update set monthly_send_limit = excluded.monthly_send_limit;

-- Pooled quota RPC: if org & Team active -> use org pool, else fallback to user pool
create or replace function public.consume_send_quota_scoped(
  p_user uuid,
  p_org uuid,
  p_count int,
  p_now timestamptz default now()
)
returns table(ok boolean, remaining int, limit int, period_key text, scope text)
language plpgsql
security definer
as $$
declare
  v_key text := to_char(date_trunc('month', p_now), 'YYYY-MM');
  v_plan text;
  v_status text;
  v_limit int;
  v_curr int;
  v_seats int;
  v_members int;
begin
  -- read user plan/status
  select plan, plan_status into v_plan, v_status
  from public.profiles where id = p_user;

  if p_org is not null then
    -- ensure user is member
    if not exists (select 1 from public.org_members where org_id = p_org and user_id = p_user) then
      return query select false, 0, 0, v_key, 'forbidden';
      return;
    end if;

    -- seat check
    select seats into v_seats from public.organizations where id = p_org;
    select public.org_member_count(p_org) into v_members;
    if v_members > coalesce(v_seats, 1) then
      return query select false, 0, 0, v_key, 'seat_limit';
      return;
    end if;

    -- Team plan required for pooled quota
    if v_plan <> 'team' or v_status not in ('active','trialing') then
      -- fall back to user-level quota
      return query select * from public.consume_send_quota(p_user, p_count, p_now);
    end if;

    -- org pooled limit from plan_limits(team)
    select monthly_send_limit into v_limit from public.plan_limits where plan = 'team';
    if v_limit is null then v_limit := 25000; end if;

    insert into public.org_send_usage(org_id, period_key, sends)
      values (p_org, v_key, 0)
    on conflict (org_id, period_key) do nothing;

    select sends into v_curr from public.org_send_usage where org_id = p_org and period_key = v_key for update;

    if v_curr + p_count > v_limit then
      return query select false, greatest(v_limit - v_curr, 0), v_limit, v_key, 'org';
      return;
    end if;

    update public.org_send_usage
      set sends = sends + p_count, updated_at = now()
      where org_id = p_org and period_key = v_key;

    return query select true, (v_limit - (v_curr + p_count)), v_limit, v_key, 'org';
  else
    -- personal mode
    return query select ok, remaining, limit, period_key, 'user'
    from public.consume_send_quota(p_user, p_count, p_now);
  end if;
end $$;

grant execute on function public.consume_send_quota_scoped(uuid,uuid,int,timestamptz) to anon, authenticated, service_role;

-- RLS (example policies): campaigns readable by owner user OR org members
alter table public.campaigns enable row level security;

create policy if not exists "campaigns_select_team"
on public.campaigns for select
using (
  (owner_org_id is null and auth.uid() = coalesce(user_id, owner_id))
  or
  (owner_org_id is not null and exists (
    select 1 from public.org_members m
    where m.org_id = campaigns.owner_org_id
      and m.user_id = auth.uid()
  ))
);


